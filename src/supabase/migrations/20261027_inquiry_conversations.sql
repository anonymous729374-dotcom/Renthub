-- Add persistent, append-only message history to existing RentHub inquiries.
-- Existing inquiry rows and single responses are preserved and copied into the
-- history with deterministic UUIDs so this migration can be safely rerun.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.inquiries') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inquiries' AND column_name='response_message')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inquiries' AND column_name='responded_at')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inquiries' AND column_name='renter_id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inquiries' AND column_name='message')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inquiries' AND column_name='apartment_id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inquiries' AND column_name='updated_at')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='apartments' AND column_name='owner_id') THEN
    RAISE EXCEPTION 'RentHub inquiry schema is missing expected columns; no conversation migration was applied';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.inquiry_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 3000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inquiry_messages_thread_time
  ON public.inquiry_messages(inquiry_id, created_at, id);

-- Fail clearly instead of truncating any legacy response that does not fit the
-- existing response validation rule.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.inquiries
    WHERE response_message IS NOT NULL
      AND char_length(btrim(response_message)) NOT BETWEEN 2 AND 3000
  ) THEN
    RAISE EXCEPTION 'A legacy response is outside the supported 2-3000 character range; review it before applying this migration';
  END IF;
END;
$$;

-- Backfill initial renter messages. Deterministic IDs make reruns idempotent.
WITH rows_to_copy AS (
  SELECT i.*, md5(i.id::text || ':renthub:legacy-initial') AS hash
  FROM public.inquiries AS i
), formatted AS (
  SELECT *, substr(hash,1,8)||'-'||substr(hash,9,4)||'-'||substr(hash,13,4)||'-'||substr(hash,17,4)||'-'||substr(hash,21,12) AS message_id
  FROM rows_to_copy
)
INSERT INTO public.inquiry_messages(id,inquiry_id,sender_id,body,created_at)
SELECT message_id::uuid,id,renter_id,message,created_at FROM formatted
ON CONFLICT (id) DO NOTHING;

-- Backfill the one response currently retained on each inquiry, attributing it
-- to that apartment's owner and preserving its original response timestamp.
WITH rows_to_copy AS (
  SELECT i.id AS inquiry_id, a.owner_id AS sender_id, i.response_message AS body,
         coalesce(i.responded_at,i.updated_at,i.created_at) AS created_at,
         md5(i.id::text || ':renthub:legacy-response') AS hash
  FROM public.inquiries AS i
  JOIN public.apartments AS a ON a.id=i.apartment_id
  WHERE i.response_message IS NOT NULL
), formatted AS (
  SELECT *, substr(hash,1,8)||'-'||substr(hash,9,4)||'-'||substr(hash,13,4)||'-'||substr(hash,17,4)||'-'||substr(hash,21,12) AS message_id
  FROM rows_to_copy
)
INSERT INTO public.inquiry_messages(id,inquiry_id,sender_id,body,created_at)
SELECT message_id::uuid,inquiry_id,sender_id,body,created_at FROM formatted
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.inquiry_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inquiry_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.inquiry_messages TO authenticated;
GRANT INSERT (inquiry_id,sender_id,body) ON TABLE public.inquiry_messages TO authenticated;

-- Clear any policies left by an interrupted/manual attempt, then install the
-- complete participant rules. Admins retain the existing explicit read access.
DO $$ DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='inquiry_messages'
  LOOP EXECUTE format('DROP POLICY %I ON public.inquiry_messages',p.policyname); END LOOP;
END;
$$;

CREATE POLICY renthub_inquiry_messages_read
ON public.inquiry_messages FOR SELECT TO authenticated
USING (
  public.current_user_is_admin()
  OR EXISTS (
    SELECT 1 FROM public.inquiries AS i
    WHERE i.id=inquiry_messages.inquiry_id
      AND (
        (i.renter_id=auth.uid() AND public.current_user_is_active())
        OR (public.current_user_can_list() AND EXISTS (
          SELECT 1 FROM public.apartments AS a
          WHERE a.id=i.apartment_id AND a.owner_id=auth.uid()
        ))
      )
  )
);

CREATE POLICY renthub_inquiry_messages_insert
ON public.inquiry_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id=auth.uid()
  AND public.current_user_is_active()
  AND EXISTS (
    SELECT 1 FROM public.inquiries AS i
    WHERE i.id=inquiry_messages.inquiry_id
      AND (
        i.renter_id=auth.uid()
        OR (public.current_user_can_list() AND EXISTS (
          SELECT 1 FROM public.apartments AS a
          WHERE a.id=i.apartment_id AND a.owner_id=auth.uid()
        ))
      )
  )
);

-- Create the first conversation message atomically when a renter creates an
-- inquiry. A fixed search_path and revoked direct execution keep this helper
-- limited to its trigger use.
CREATE OR REPLACE FUNCTION public.record_initial_inquiry_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
BEGIN
  INSERT INTO public.inquiry_messages(inquiry_id,sender_id,body,created_at)
  VALUES (NEW.id,NEW.renter_id,NEW.message,NEW.created_at);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_initial_inquiry_message() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_record_initial_inquiry_message ON public.inquiries;
CREATE TRIGGER trg_record_initial_inquiry_message
AFTER INSERT ON public.inquiries
FOR EACH ROW EXECUTE FUNCTION public.record_initial_inquiry_message();

-- Keep the legacy status/first-response fields compatible with existing UI or
-- integrations without replacing any saved history. Later owner messages are
-- appended only to inquiry_messages.
CREATE OR REPLACE FUNCTION public.sync_first_lister_reply_to_inquiry()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
BEGIN
  UPDATE public.inquiries AS i
  SET response_message=coalesce(i.response_message,NEW.body),
      responded_at=coalesce(i.responded_at,NEW.created_at),
      status=CASE WHEN i.status='closed' THEN i.status ELSE 'responded' END
  FROM public.apartments AS a
  WHERE i.id=NEW.inquiry_id
    AND a.id=i.apartment_id
    AND a.owner_id=NEW.sender_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_first_lister_reply_to_inquiry() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_sync_first_lister_reply_to_inquiry ON public.inquiry_messages;
CREATE TRIGGER trg_sync_first_lister_reply_to_inquiry
AFTER INSERT ON public.inquiry_messages
FOR EACH ROW EXECUTE FUNCTION public.sync_first_lister_reply_to_inquiry();

NOTIFY pgrst, 'reload schema';
COMMIT;
