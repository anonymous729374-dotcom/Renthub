-- Dedicated participant-only apartment messaging over existing inquiry threads.
-- Preserves inquiry rows and all inquiry_messages; stops safely if historic
-- duplicate renter/listing threads exist so they can be reviewed first.
BEGIN;

DO $$
DECLARE duplicate_pairs TEXT;
BEGIN
  IF to_regclass('public.inquiries') IS NULL OR to_regclass('public.inquiry_messages') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261027_inquiry_conversations.sql first; inquiries and inquiry_messages are required';
  END IF;
  SELECT string_agg(format('%s / %s (%s threads)', apartment_id, renter_id, thread_count), E'\n')
    INTO duplicate_pairs
  FROM (
    SELECT apartment_id, renter_id, count(*) AS thread_count
    FROM public.inquiries
    GROUP BY apartment_id, renter_id
    HAVING count(*) > 1
    ORDER BY apartment_id, renter_id
    LIMIT 20
  ) AS duplicates;
  IF duplicate_pairs IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate renter/listing inquiries must be reviewed before enforcing one conversation per pair:%', E'\n' || duplicate_pairs;
  END IF;
END;
$$;

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS renter_last_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lister_last_read_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiries_one_conversation_per_renter_listing
  ON public.inquiries(apartment_id, renter_id);

-- Clients now append messages only; the trigger keeps legacy status/response
-- columns synchronized. This also prevents clients changing read timestamps.
REVOKE UPDATE ON TABLE public.inquiries FROM PUBLIC, anon, authenticated;

-- Replace any earlier broader inquiry_messages policies with participant-only
-- policies. Admins do not receive blanket access to private conversations.
DO $$ DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='inquiry_messages'
  LOOP EXECUTE format('DROP POLICY %I ON public.inquiry_messages',p.policyname); END LOOP;
END;
$$;

CREATE POLICY renthub_inquiry_messages_read
ON public.inquiry_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.inquiries AS i
    JOIN public.apartments AS a ON a.id=i.apartment_id
    WHERE i.id=inquiry_messages.inquiry_id
      AND (
        (i.renter_id=auth.uid() AND public.current_user_is_active())
        OR (a.owner_id=auth.uid() AND public.current_user_can_list())
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
    JOIN public.apartments AS a ON a.id=i.apartment_id
    WHERE i.id=inquiry_messages.inquiry_id
      AND (
        i.renter_id=auth.uid()
        OR (a.owner_id=auth.uid() AND public.current_user_can_list())
      )
  )
);

-- Return only the two participant names for conversations the caller belongs
-- to. This exposes no profile search/list endpoint and never returns email.
CREATE OR REPLACE FUNCTION public.get_inquiry_participant_names(p_inquiry_ids UUID[])
RETURNS TABLE(inquiry_id UUID, user_id UUID, display_name TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
  WITH permitted AS (
    SELECT i.id, i.renter_id, a.owner_id
    FROM public.inquiries AS i
    JOIN public.apartments AS a ON a.id=i.apartment_id
    WHERE auth.uid() IS NOT NULL
      AND i.id=ANY(COALESCE(p_inquiry_ids, ARRAY[]::UUID[]))
      AND (
        (i.renter_id=auth.uid() AND public.current_user_is_active())
        OR (a.owner_id=auth.uid() AND public.current_user_can_list())
      )
  ), participants AS (
    SELECT id AS inquiry_id, renter_id AS user_id FROM permitted
    UNION
    SELECT id AS inquiry_id, owner_id AS user_id FROM permitted
  )
  SELECT participants.inquiry_id, profiles.id,
         NULLIF(BTRIM(profiles.full_name), '')
  FROM participants
  JOIN public.profiles AS profiles ON profiles.id=participants.user_id;
$$;
REVOKE ALL ON FUNCTION public.get_inquiry_participant_names(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inquiry_participant_names(UUID[]) TO authenticated;

-- Only an active renter or approved owner-lister can advance their own read
-- watermark. No direct client UPDATE privilege is needed on inquiries.
CREATE OR REPLACE FUNCTION public.mark_inquiry_conversation_read(p_inquiry_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
DECLARE read_time TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_active() THEN
    RAISE EXCEPTION 'Active authentication required';
  END IF;

  UPDATE public.inquiries AS i
  SET renter_last_read_at=read_time
  WHERE i.id=p_inquiry_id AND i.renter_id=auth.uid();
  IF FOUND THEN RETURN read_time; END IF;

  UPDATE public.inquiries AS i
  SET lister_last_read_at=read_time
  FROM public.apartments AS a
  WHERE i.id=p_inquiry_id AND a.id=i.apartment_id
    AND a.owner_id=auth.uid() AND public.current_user_can_list();
  IF FOUND THEN RETURN read_time; END IF;

  RAISE EXCEPTION 'Conversation not found or the current user is not a participant';
END;
$$;
REVOKE ALL ON FUNCTION public.mark_inquiry_conversation_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_inquiry_conversation_read(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
