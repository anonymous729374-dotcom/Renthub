-- Server-derived unread count for the authenticated participant.
-- Read timestamps remain stored per participant on public.inquiries.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.inquiries') IS NULL
     OR to_regclass('public.inquiry_messages') IS NULL
     OR to_regclass('public.apartments') IS NULL THEN
    RAISE EXCEPTION 'Apply the existing RentHub inquiry conversation migrations first';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='inquiries' AND column_name='renter_last_read_at'
     ) OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='inquiries' AND column_name='lister_last_read_at'
     ) THEN
    RAISE EXCEPTION 'Inquiry read-state columns are missing; apply the existing read-state migration first';
  END IF;

  IF to_regprocedure('public.current_user_is_active()') IS NULL
     OR to_regprocedure('public.current_user_can_list()') IS NULL THEN
    RAISE EXCEPTION 'RentHub trusted authorization helpers are missing';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_unread_inquiry_message_count()
RETURNS BIGINT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
  SELECT count(*)::BIGINT
  FROM public.inquiry_messages AS m
  JOIN public.inquiries AS i ON i.id=m.inquiry_id
  JOIN public.apartments AS a ON a.id=i.apartment_id
  WHERE auth.uid() IS NOT NULL
    AND public.current_user_is_active()
    AND m.sender_id <> auth.uid()
    AND (
      (
        i.renter_id=auth.uid()
        AND (i.renter_last_read_at IS NULL OR m.created_at > i.renter_last_read_at)
      )
      OR (
        a.owner_id=auth.uid()
        AND public.current_user_can_list()
        AND (i.lister_last_read_at IS NULL OR m.created_at > i.lister_last_read_at)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_unread_inquiry_message_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_unread_inquiry_message_count() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
