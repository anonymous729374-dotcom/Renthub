-- RentHub: break recursive RLS evaluation while preserving comment rows.
-- Replaces only public.comments policies. Does not alter the table or its data.
BEGIN;

-- Read parent rows under this narrowly scoped definer function. The empty
-- search_path and fully-qualified names prevent object-shadowing attacks.
-- row_security=off makes an unexpected non-bypass owner fail closed instead
-- of recursively evaluating comments policies.
CREATE OR REPLACE FUNCTION public.comment_parent_is_valid(
    p_parent_comment_id UUID,
    p_apartment_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
    SELECT COALESCE(
        auth.uid() IS NOT NULL
        AND public.current_user_is_active()
        AND EXISTS (
            SELECT 1
            FROM public.apartments AS apartment
            WHERE apartment.id = p_apartment_id
              AND apartment.status = 'published'
        )
        AND EXISTS (
            SELECT 1
            FROM public.comments AS parent
            WHERE parent.id = p_parent_comment_id
              AND parent.apartment_id = p_apartment_id
              AND parent.parent_comment_id IS NULL
        ),
        FALSE
    );
$$;

REVOKE ALL ON FUNCTION public.comment_parent_is_valid(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comment_parent_is_valid(UUID, UUID) TO authenticated;

-- Remove the known schema/migration policy names and any stale policy that
-- may still contain the recursive predicate. This is scoped to comments only.
DO $$
DECLARE
    existing_policy RECORD;
BEGIN
    FOR existing_policy IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'comments'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.comments', existing_policy.policyname);
    END LOOP;
END;
$$;

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY renthub_comments_read
ON public.comments
FOR SELECT
TO anon, authenticated
USING (
    public.current_user_is_admin()
    OR EXISTS (
        SELECT 1
        FROM public.apartments AS a
        WHERE a.id = comments.apartment_id
          AND (a.status = 'published' OR a.owner_id = auth.uid())
    )
);

CREATE POLICY renthub_comments_insert
ON public.comments
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND public.current_user_is_active()
    AND EXISTS (
        SELECT 1
        FROM public.apartments AS a
        WHERE a.id = comments.apartment_id
          AND a.status = 'published'
    )
    AND (
        parent_comment_id IS NULL
        OR public.comment_parent_is_valid(parent_comment_id, apartment_id)
    )
);

CREATE POLICY renthub_comments_update
ON public.comments
FOR UPDATE
TO authenticated
USING (
    (user_id = auth.uid() AND public.current_user_is_active())
    OR public.current_user_is_admin()
)
WITH CHECK (
    (user_id = auth.uid() AND public.current_user_is_active())
    OR public.current_user_is_admin()
);

CREATE POLICY renthub_comments_delete
ON public.comments
FOR DELETE
TO authenticated
USING (
    (user_id = auth.uid() AND public.current_user_is_active())
    OR public.current_user_is_admin()
);

NOTIFY pgrst, 'reload schema';
COMMIT;
