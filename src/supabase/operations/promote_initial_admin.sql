-- Operator-run initial admin promotion. Review the target Auth identity first,
-- replace BOTH placeholders below, then run this file as the trusted project
-- owner in Supabase SQL Editor. Never run it from the application/browser.
-- The matching UUID + email guard prevents promotion of the wrong account.
BEGIN;

DO $$
DECLARE
  target_user_id UUID := '00000000-0000-0000-0000-000000000000';
  target_email TEXT := 'REPLACE_WITH_VERIFIED_AUTH_EMAIL';
  affected INTEGER;
BEGIN
  IF target_user_id = '00000000-0000-0000-0000-000000000000'::UUID
     OR target_email = 'REPLACE_WITH_VERIFIED_AUTH_EMAIL' THEN
    RAISE EXCEPTION 'Replace both initial-admin placeholders after verifying the Supabase Auth user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = target_user_id AND lower(email) = lower(target_email)
  ) THEN
    RAISE EXCEPTION 'Initial admin promotion stopped: the verified Auth UUID/email pair was not found';
  END IF;

  UPDATE public.profiles
  SET role = 'admin', lister_status = 'approved'
  WHERE id = target_user_id AND lower(email) = lower(target_email);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'Initial admin promotion stopped: expected exactly one matching profile';
  END IF;
END;
$$;

COMMIT;
