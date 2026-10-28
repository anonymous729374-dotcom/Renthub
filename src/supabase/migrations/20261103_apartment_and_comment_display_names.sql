-- Exposes display names only for a specific apartment's owner and commenters.
-- It never returns profile email, role, suspension, or unrelated profile data.
CREATE OR REPLACE FUNCTION public.get_apartment_display_names(p_apartment_id UUID)
RETURNS TABLE(user_id UUID, display_name TEXT, is_lister BOOLEAN)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH permitted_apartment AS (
    SELECT a.id, a.owner_id
    FROM public.apartments AS a
    WHERE a.id = p_apartment_id
      AND (
        a.status = 'published'
        OR a.owner_id = auth.uid()
        OR public.current_user_is_admin()
      )
  ),
  people AS (
    SELECT pa.owner_id AS user_id, pa.owner_id
    FROM permitted_apartment AS pa
    UNION
    SELECT c.user_id, pa.owner_id
    FROM permitted_apartment AS pa
    JOIN public.comments AS c ON c.apartment_id = pa.id
  )
  SELECT people.user_id,
         COALESCE(
           NULLIF(BTRIM(profiles.full_name), ''),
           CASE WHEN people.user_id = people.owner_id THEN 'Lister' ELSE 'RentHub member' END
         ) AS display_name,
         people.user_id = people.owner_id AS is_lister
  FROM people
  LEFT JOIN public.profiles AS profiles ON profiles.id = people.user_id;
$$;

REVOKE ALL ON FUNCTION public.get_apartment_display_names(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_apartment_display_names(UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
