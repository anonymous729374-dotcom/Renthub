-- Keep conversation ordering aligned with the latest message without changing
-- message history or granting callers direct permission to update inquiries.
CREATE OR REPLACE FUNCTION public.touch_inquiry_on_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.inquiries
  SET updated_at = clock_timestamp()
  WHERE id = NEW.inquiry_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_inquiry_on_message_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_touch_inquiry_on_message_insert ON public.inquiry_messages;
CREATE TRIGGER trg_touch_inquiry_on_message_insert
AFTER INSERT ON public.inquiry_messages
FOR EACH ROW
EXECUTE FUNCTION public.touch_inquiry_on_message_insert();

NOTIFY pgrst, 'reload schema';
