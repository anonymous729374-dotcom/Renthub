-- Repair/refresh the exact RPC used by the RentHub Messages page.
-- This is the existing UUID[] signature, replaced in place (no overload added).
BEGIN;

CREATE OR REPLACE FUNCTION public.get_inquiry_participant_names(p_inquiry_ids UUID[])
RETURNS TABLE(inquiry_id UUID, user_id UUID, display_name TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
    WITH permitted AS (
        SELECT i.id, i.renter_id, a.owner_id
        FROM public.inquiries AS i
        JOIN public.apartments AS a ON a.id = i.apartment_id
        WHERE auth.uid() IS NOT NULL
          AND i.id = ANY(COALESCE(p_inquiry_ids, ARRAY[]::UUID[]))
          AND (
              (i.renter_id = auth.uid() AND public.current_user_is_active())
              OR (a.owner_id = auth.uid() AND public.current_user_can_list())
          )
    ), participants AS (
        SELECT id AS inquiry_id, renter_id AS user_id FROM permitted
        UNION
        SELECT id AS inquiry_id, owner_id AS user_id FROM permitted
    )
    SELECT participants.inquiry_id, profiles.id, NULLIF(BTRIM(profiles.full_name), '')
    FROM participants
    JOIN public.profiles AS profiles ON profiles.id = participants.user_id;
$$;

REVOKE ALL ON FUNCTION public.get_inquiry_participant_names(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inquiry_participant_names(UUID[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
