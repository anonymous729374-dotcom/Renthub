-- Ensure the existing read RPC exists at the exact UUID signature used by
-- Angular, refresh PostgREST's schema cache, and enforce one inquiry thread per
-- renter/listing when existing data permits. No conversations are merged or
-- deleted. An already-installed function is left untouched.
BEGIN;

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS renter_last_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lister_last_read_at TIMESTAMPTZ;

DO $$
BEGIN
  IF to_regprocedure('public.mark_inquiry_conversation_read(uuid)') IS NULL THEN
    EXECUTE $create_function$
      CREATE FUNCTION public.mark_inquiry_conversation_read(p_inquiry_id UUID)
      RETURNS TIMESTAMPTZ
      LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = '' SET row_security = off AS $function_body$
      DECLARE read_time TIMESTAMPTZ := clock_timestamp();
      BEGIN
        IF auth.uid() IS NULL OR NOT public.current_user_is_active() THEN
          RAISE EXCEPTION 'Active authentication required';
        END IF;

        UPDATE public.inquiries AS i
        SET renter_last_read_at = read_time
        WHERE i.id = p_inquiry_id AND i.renter_id = auth.uid();
        IF FOUND THEN RETURN read_time; END IF;

        UPDATE public.inquiries AS i
        SET lister_last_read_at = read_time
        FROM public.apartments AS a
        WHERE i.id = p_inquiry_id AND a.id = i.apartment_id
          AND a.owner_id = auth.uid() AND public.current_user_can_list();
        IF FOUND THEN RETURN read_time; END IF;

        RAISE EXCEPTION 'Conversation not found or the current user is not a participant';
      END;
      $function_body$
    $create_function$;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_inquiry_conversation_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_inquiry_conversation_read(UUID) TO authenticated;

DO $$
DECLARE duplicate_pairs TEXT;
BEGIN
  SELECT string_agg(
           format('apartment_id=%s renter_id=%s threads=%s', apartment_id, renter_id, thread_count),
           E'\n'
         )
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
    RAISE NOTICE
      'Existing duplicate renter/listing inquiry rows require manual review; they were preserved and the unique index was not added:%',
      E'\n' || duplicate_pairs;
  ELSE
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiries_one_conversation_per_renter_listing ON public.inquiries(apartment_id, renter_id)';
  END IF;
END;
$$;

-- Refresh the API cache whether the function pre-existed or was installed above.
NOTIFY pgrst, 'reload schema';
COMMIT;
