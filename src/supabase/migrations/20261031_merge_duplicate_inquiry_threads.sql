-- Merge duplicate inquiries for the same apartment/renter into the earliest
-- inquiry row. Every inquiry_messages row keeps its id, sender, body, and time;
-- only its inquiry_id is redirected. No message is deduplicated by its text.
-- Run duplicate_inquiry_threads.sql first to review the affected records.
BEGIN;

DO $$
DECLARE unsupported_fks TEXT;
BEGIN
  IF to_regclass('public.inquiries') IS NULL
     OR to_regclass('public.inquiry_messages') IS NULL
     OR to_regclass('public.apartments') IS NULL THEN
    RAISE EXCEPTION 'Expected RentHub inquiries, inquiry_messages, and apartments tables were not found';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='inquiries' AND column_name='response_message'
     ) OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='inquiries' AND column_name='responded_at'
     ) THEN
    RAISE EXCEPTION 'Expected inquiry response columns are missing; apply the existing inquiry response migration first';
  END IF;

  SELECT string_agg(format('%I.%I constraint %I', n.nspname, rel.relname, c.conname), ', ')
    INTO unsupported_fks
  FROM pg_constraint AS c
  JOIN pg_class AS rel ON rel.oid=c.conrelid
  JOIN pg_namespace AS n ON n.oid=rel.relnamespace
  WHERE c.contype='f'
    AND c.confrelid='public.inquiries'::regclass
    AND c.conrelid <> 'public.inquiry_messages'::regclass;

  IF unsupported_fks IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected foreign keys reference inquiries (%). Review and migrate those references before merging.', unsupported_fks;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inquiries AS i
    JOIN public.apartments AS a ON a.id=i.apartment_id
    WHERE i.response_message IS NOT NULL AND a.owner_id IS NULL
  ) THEN
    RAISE EXCEPTION 'A legacy response has no apartment owner to preserve as sender; no rows were changed';
  END IF;
END;
$$;

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS renter_last_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lister_last_read_at TIMESTAMPTZ;

LOCK TABLE public.inquiries, public.inquiry_messages IN ACCESS EXCLUSIVE MODE;

-- Restore any legacy first messages/responses not yet represented in history.
-- The deterministic IDs and exact-value check make this safe to rerun.
WITH rows_to_copy AS (
  SELECT i.*, md5(i.id::text || ':renthub:legacy-initial') AS hash
  FROM public.inquiries AS i
  WHERE NOT EXISTS (
    SELECT 1 FROM public.inquiry_messages AS m
    WHERE m.inquiry_id=i.id AND m.sender_id=i.renter_id
      AND m.body=i.message AND m.created_at=i.created_at
  )
), formatted AS (
  SELECT *, substr(hash,1,8)||'-'||substr(hash,9,4)||'-'||substr(hash,13,4)||'-'||substr(hash,17,4)||'-'||substr(hash,21,12) AS message_id
  FROM rows_to_copy
)
INSERT INTO public.inquiry_messages(id,inquiry_id,sender_id,body,created_at)
SELECT message_id::uuid,id,renter_id,message,created_at FROM formatted
ON CONFLICT (id) DO NOTHING;

WITH rows_to_copy AS (
  SELECT i.id AS inquiry_id, a.owner_id AS sender_id, i.response_message AS body,
         coalesce(i.responded_at,i.updated_at,i.created_at) AS created_at,
         md5(i.id::text || ':renthub:legacy-response') AS hash
  FROM public.inquiries AS i
  JOIN public.apartments AS a ON a.id=i.apartment_id
  WHERE i.response_message IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.inquiry_messages AS m
      WHERE m.inquiry_id=i.id AND m.sender_id=a.owner_id
        AND m.body=i.response_message
        AND m.created_at=coalesce(i.responded_at,i.updated_at,i.created_at)
    )
), formatted AS (
  SELECT *, substr(hash,1,8)||'-'||substr(hash,9,4)||'-'||substr(hash,13,4)||'-'||substr(hash,17,4)||'-'||substr(hash,21,12) AS message_id
  FROM rows_to_copy
)
INSERT INTO public.inquiry_messages(id,inquiry_id,sender_id,body,created_at)
SELECT message_id::uuid,inquiry_id,sender_id,body,created_at FROM formatted
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE renthub_inquiry_merge_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT id AS source_id,
         first_value(id) OVER (
           PARTITION BY apartment_id,renter_id ORDER BY created_at,id
         ) AS canonical_id,
         count(*) OVER (PARTITION BY apartment_id,renter_id) AS pair_count
  FROM public.inquiries
)
SELECT source_id,canonical_id FROM ranked WHERE pair_count > 1;

CREATE UNIQUE INDEX ON renthub_inquiry_merge_map(source_id);

CREATE TEMP TABLE renthub_inquiry_expected_messages ON COMMIT DROP AS
SELECT merge_map.canonical_id,count(messages.id)::BIGINT AS message_count
FROM renthub_inquiry_merge_map AS merge_map
LEFT JOIN public.inquiry_messages AS messages ON messages.inquiry_id=merge_map.source_id
GROUP BY merge_map.canonical_id;

CREATE TEMP TABLE renthub_inquiry_message_snapshot ON COMMIT DROP AS
SELECT merge_map.canonical_id,
       messages.id AS message_id,
       messages.sender_id,
       messages.body,
       messages.created_at
FROM renthub_inquiry_merge_map AS merge_map
JOIN public.inquiry_messages AS messages ON messages.inquiry_id=merge_map.source_id;

-- Move every history row without changing its primary key, sender, body, or time.
UPDATE public.inquiry_messages AS m
SET inquiry_id=merge_map.canonical_id
FROM renthub_inquiry_merge_map AS merge_map
WHERE m.inquiry_id=merge_map.source_id
  AND merge_map.source_id <> merge_map.canonical_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM renthub_inquiry_expected_messages AS expected
    WHERE expected.message_count <> (
      SELECT count(*) FROM public.inquiry_messages AS m
      WHERE m.inquiry_id=expected.canonical_id
    )
  ) THEN
    RAISE EXCEPTION 'Message-count verification failed after moving histories; transaction rolled back';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM renthub_inquiry_merge_map AS merge_map
    JOIN public.inquiry_messages AS m ON m.inquiry_id=merge_map.source_id
    WHERE merge_map.source_id <> merge_map.canonical_id
  ) THEN
    RAISE EXCEPTION 'Some messages remain attached to duplicate inquiry rows; transaction rolled back';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM renthub_inquiry_message_snapshot AS snapshot
    LEFT JOIN public.inquiry_messages AS message ON message.id=snapshot.message_id
    WHERE message.id IS NULL
       OR message.inquiry_id IS DISTINCT FROM snapshot.canonical_id
       OR message.sender_id IS DISTINCT FROM snapshot.sender_id
       OR message.body IS DISTINCT FROM snapshot.body
       OR message.created_at IS DISTINCT FROM snapshot.created_at
  ) THEN
    RAISE EXCEPTION 'Message identity/content/timestamp verification failed; transaction rolled back';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM renthub_inquiry_merge_map AS merge_map
    JOIN public.inquiries AS source ON source.id=merge_map.source_id
    JOIN public.apartments AS a ON a.id=source.apartment_id
    WHERE source.message IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.inquiry_messages AS m
        WHERE m.inquiry_id=merge_map.canonical_id
          AND m.sender_id=source.renter_id
          AND m.body=source.message AND m.created_at=source.created_at
      )
  ) THEN
    RAISE EXCEPTION 'An inquiry initial message was not verified in the canonical history; transaction rolled back';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM renthub_inquiry_merge_map AS merge_map
    JOIN public.inquiries AS source ON source.id=merge_map.source_id
    JOIN public.apartments AS a ON a.id=source.apartment_id
    WHERE source.response_message IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.inquiry_messages AS m
        WHERE m.inquiry_id=merge_map.canonical_id
          AND m.sender_id=a.owner_id
          AND m.body=source.response_message
          AND m.created_at=coalesce(source.responded_at,source.updated_at,source.created_at)
      )
  ) THEN
    RAISE EXCEPTION 'A legacy lister response was not verified in the canonical history; transaction rolled back';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM renthub_inquiry_merge_map AS merge_map
    JOIN public.inquiries AS source ON source.id=merge_map.source_id
    JOIN public.apartments AS a ON a.id=source.apartment_id
    WHERE source.status='responded'
      AND source.response_message IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.inquiry_messages AS m
        WHERE m.inquiry_id=merge_map.canonical_id AND m.sender_id=a.owner_id
      )
  ) THEN
    RAISE EXCEPTION 'A responded inquiry has no saved lister message to preserve; transaction rolled back';
  END IF;
END;
$$;

-- Keep the earliest actual lister reply in the legacy compatibility columns;
-- all replies remain individually available in inquiry_messages.
WITH group_state AS (
  SELECT merge_map.canonical_id,
         bool_or(source.status='closed') AS any_closed,
         bool_and(source.renter_last_read_at IS NOT NULL) AS all_renter_read,
         min(source.renter_last_read_at) AS earliest_renter_read,
         bool_and(source.lister_last_read_at IS NOT NULL) AS all_lister_read,
         min(source.lister_last_read_at) AS earliest_lister_read
  FROM renthub_inquiry_merge_map AS merge_map
  JOIN public.inquiries AS source ON source.id=merge_map.source_id
  GROUP BY merge_map.canonical_id
), first_lister_reply AS (
  SELECT DISTINCT ON (merge_map.canonical_id)
         merge_map.canonical_id,m.body,m.created_at
  FROM renthub_inquiry_merge_map AS merge_map
  JOIN public.inquiry_messages AS m ON m.inquiry_id=merge_map.canonical_id
  JOIN public.apartments AS a ON a.id=(
    SELECT i.apartment_id FROM public.inquiries AS i WHERE i.id=merge_map.canonical_id
  )
  WHERE m.sender_id=a.owner_id
  ORDER BY merge_map.canonical_id,m.created_at,m.id
), first_legacy_response AS (
  SELECT DISTINCT ON (merge_map.canonical_id)
         merge_map.canonical_id,source.response_message,source.responded_at
  FROM renthub_inquiry_merge_map AS merge_map
  JOIN public.inquiries AS source ON source.id=merge_map.source_id
  WHERE source.response_message IS NOT NULL
  ORDER BY merge_map.canonical_id,
           coalesce(source.responded_at,source.updated_at,source.created_at),source.id
)
UPDATE public.inquiries AS canonical
SET response_message=coalesce(first_lister_reply.body,first_legacy_response.response_message),
    responded_at=coalesce(first_lister_reply.created_at,first_legacy_response.responded_at),
    status=CASE
      WHEN group_state.any_closed THEN 'closed'
      WHEN coalesce(first_lister_reply.body,first_legacy_response.response_message) IS NOT NULL THEN 'responded'
      ELSE 'pending'
    END,
    renter_last_read_at=CASE WHEN group_state.all_renter_read THEN group_state.earliest_renter_read ELSE NULL END,
    lister_last_read_at=CASE WHEN group_state.all_lister_read THEN group_state.earliest_lister_read ELSE NULL END
FROM group_state
LEFT JOIN first_lister_reply ON first_lister_reply.canonical_id=group_state.canonical_id
LEFT JOIN first_legacy_response ON first_legacy_response.canonical_id=group_state.canonical_id
WHERE canonical.id=group_state.canonical_id;

DO $$
DECLARE duplicate_rows BIGINT;
BEGIN
  DELETE FROM public.inquiries AS source
  USING renthub_inquiry_merge_map AS merge_map
  WHERE source.id=merge_map.source_id
    AND merge_map.source_id <> merge_map.canonical_id;
  GET DIAGNOSTICS duplicate_rows = ROW_COUNT;

  IF EXISTS (
    SELECT 1 FROM public.inquiries
    GROUP BY apartment_id,renter_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate inquiry verification failed; transaction rolled back';
  END IF;

  RAISE NOTICE 'Merged % duplicate inquiry rows after verifying and preserving their messages',duplicate_rows;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiries_one_conversation_per_renter_listing
  ON public.inquiries(apartment_id,renter_id);

COMMIT;
