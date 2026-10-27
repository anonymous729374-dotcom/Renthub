-- MANUAL, DESTRUCTIVE RESET. Never run automatically from RentHub.
-- The current schema has no demo marker on inquiries. This script therefore
-- deletes EVERY inquiry/conversation row and EVERY inquiry_messages row across
-- all users. Before proceeding, confirm those rows are all disposable test data.
-- It preserves apartments, auth.users, profiles, role/approval data, favourites,
-- comments, and comment replies. response_message/responded_at are columns on
-- inquiries, so deleting the inquiry rows also clears that legacy conversation data.
--
-- Review the row counts printed first. Then change the confirmation value below
-- from FALSE to TRUE and execute this script manually in SQL Editor.
-- If the value remains FALSE, the script raises an exception and deletes nothing.

SELECT (SELECT count(*) FROM public.inquiries) AS inquiry_rows_that_would_be_deleted,
       (SELECT count(*) FROM public.inquiry_messages) AS chat_message_rows_that_would_be_deleted;

BEGIN;

CREATE TEMP TABLE renthub_reset_confirmation (
  confirmed BOOLEAN NOT NULL
) ON COMMIT DROP;
INSERT INTO renthub_reset_confirmation(confirmed) VALUES (FALSE);

DO $$
DECLARE unexpected_fks TEXT;
BEGIN
  IF to_regclass('public.inquiries') IS NULL
     OR to_regclass('public.inquiry_messages') IS NULL THEN
    RAISE EXCEPTION 'Expected inquiries and inquiry_messages tables were not found';
  END IF;

  SELECT string_agg(format('%I.%I constraint %I', n.nspname, rel.relname, c.conname), ', ')
    INTO unexpected_fks
  FROM pg_constraint AS c
  JOIN pg_class AS rel ON rel.oid=c.conrelid
  JOIN pg_namespace AS n ON n.oid=rel.relnamespace
  WHERE c.contype='f'
    AND c.confrelid='public.inquiries'::regclass
    AND c.conrelid <> 'public.inquiry_messages'::regclass;

  IF unexpected_fks IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected foreign keys reference inquiries (%). Review them before reset.', unexpected_fks;
  END IF;

  SELECT string_agg(format('%I.%I constraint %I', n.nspname, rel.relname, c.conname), ', ')
    INTO unexpected_fks
  FROM pg_constraint AS c
  JOIN pg_class AS rel ON rel.oid=c.conrelid
  JOIN pg_namespace AS n ON n.oid=rel.relnamespace
  WHERE c.contype='f'
    AND c.confrelid='public.inquiry_messages'::regclass;

  IF unexpected_fks IS NOT NULL THEN
    RAISE EXCEPTION 'Other tables reference inquiry_messages (%). Review them before reset.', unexpected_fks;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_temp.renthub_reset_confirmation WHERE confirmed) THEN
    RAISE EXCEPTION 'Reset not confirmed. Review the script and explicitly set confirmed=TRUE before execution.';
  END IF;
END;
$$;

LOCK TABLE public.inquiries, public.inquiry_messages IN ACCESS EXCLUSIVE MODE;

-- Delete child message rows first, then parent conversation rows. The
-- transaction rolls back both deletes if either statement fails.
WITH deleted AS (
  DELETE FROM public.inquiry_messages
  RETURNING id
)
SELECT count(*) AS deleted_chat_messages FROM deleted;

WITH deleted AS (
  DELETE FROM public.inquiries
  RETURNING id
)
SELECT count(*) AS deleted_inquiries FROM deleted;

-- Post-delete verification; both values must be zero before COMMIT.
SELECT (SELECT count(*) FROM public.inquiries) AS remaining_inquiries,
       (SELECT count(*) FROM public.inquiry_messages) AS remaining_chat_messages;

COMMIT;
