-- Enable INSERT events for the existing authenticated-participant Realtime
-- subscription. RLS on public.inquiry_messages continues to govern visibility.
DO $$
BEGIN
  IF to_regclass('public.inquiry_messages') IS NULL THEN
    RAISE EXCEPTION 'Apply the RentHub inquiry conversation migrations first';
  END IF;
  IF to_regprocedure('public.get_unread_inquiry_message_count()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261101_unread_inquiry_message_count.sql first';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'inquiry_messages'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      RAISE EXCEPTION 'The supabase_realtime publication is missing in this Supabase project';
    END IF;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inquiry_messages;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
