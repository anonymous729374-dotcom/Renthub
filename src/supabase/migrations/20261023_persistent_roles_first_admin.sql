-- RentHub persistent roles and authorization bootstrap.
-- Standalone for an existing project whose public app tables are:
-- apartments, comments, favourites, and inquiries. This changes policies and
-- adds profile/auth functions, but does not delete or rewrite application rows.
-- Run as the trusted Supabase project owner in SQL Editor, never from the app.

BEGIN;

-- Keep the existing RentHub inquiry-response feature compatible whether or not
-- its earlier additive migration has already been applied.
ALTER TABLE public.inquiries
    ADD COLUMN IF NOT EXISTS response_message TEXT,
    ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.protect_inquiry_response()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF NEW.apartment_id IS DISTINCT FROM OLD.apartment_id
       OR NEW.renter_id IS DISTINCT FROM OLD.renter_id
       OR NEW.message IS DISTINCT FROM OLD.message
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Inquiry identity and renter message are immutable';
    END IF;
    IF NEW.response_message IS NOT NULL
       AND CHAR_LENGTH(TRIM(NEW.response_message)) NOT BETWEEN 2 AND 3000 THEN
        RAISE EXCEPTION 'Response must contain between 2 and 3000 characters';
    END IF;
    IF NEW.status='responded' AND NEW.response_message IS NULL THEN
        RAISE EXCEPTION 'A response is required before marking an inquiry responded';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_inquiry_response ON public.inquiries;
CREATE TRIGGER trg_protect_inquiry_response
BEFORE UPDATE ON public.inquiries
FOR EACH ROW EXECUTE FUNCTION public.protect_inquiry_response();

CREATE OR REPLACE FUNCTION public.protect_comment_update()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF NEW.apartment_id IS DISTINCT FROM OLD.apartment_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.parent_comment_id IS DISTINCT FROM OLD.parent_comment_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Comment ownership, apartment, parent, and creation time are immutable';
    END IF;
    IF CHAR_LENGTH(TRIM(NEW.comment_text)) NOT BETWEEN 1 AND 2000 THEN
        RAISE EXCEPTION 'Comment must contain between 1 and 2000 characters';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_comment_update ON public.comments;
CREATE TRIGGER trg_protect_comment_update
BEFORE UPDATE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.protect_comment_update();

-- Retire the earlier opt-in/self-promotion RPC if a partial legacy migration
-- created it. New authorization never reads the old is_lister flag.
DROP FUNCTION IF EXISTS public.enable_lister_capability();

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL DEFAULT '',
    full_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user',
    lister_status TEXT NOT NULL DEFAULT 'none',
    is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT profiles_role_check CHECK (role IN ('user','lister','admin')),
    CONSTRAINT profiles_lister_status_check CHECK (lister_status IN ('none','pending','approved','rejected'))
);

-- Bring forward a pre-existing profile table from an earlier RentHub migration,
-- without assuming that the optional legacy is_lister column is present.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user',
    ADD COLUMN IF NOT EXISTS lister_status TEXT NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_role_check'
    ) THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
            CHECK (role IN ('user','lister','admin'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_lister_status_check'
    ) THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_lister_status_check
            CHECK (lister_status IN ('none','pending','approved','rejected'));
    END IF;
END $$;

-- Auth metadata is used only for a display name. Role and approval values are
-- always assigned by this protected database table and its trusted functions.
INSERT INTO public.profiles (id,email,full_name,role,lister_status,is_suspended)
SELECT u.id, COALESCE(u.email,''),
       COALESCE(NULLIF(BTRIM(u.raw_user_meta_data ->> 'full_name'),''),''),
       'user','none',FALSE
FROM auth.users AS u
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles AS p
SET email = COALESCE(u.email,''),
    full_name = CASE WHEN p.full_name = ''
        THEN COALESCE(NULLIF(BTRIM(u.raw_user_meta_data ->> 'full_name'),''),'')
        ELSE p.full_name END
FROM auth.users AS u
WHERE u.id = p.id;

-- If the older optional lister flag exists, do not silently approve it.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='profiles' AND column_name='is_lister'
    ) THEN
        EXECUTE 'UPDATE public.profiles SET lister_status=''pending'' WHERE is_lister IS TRUE AND role=''user'' AND lister_status=''none''';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id,email,full_name,role,lister_status,is_suspended)
    VALUES (
        NEW.id,
        COALESCE(NEW.email,''),
        COALESCE(NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'),''),''),
        'user','none',FALSE
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_profile_for_new_user ON auth.users;
CREATE TRIGGER trg_create_profile_for_new_user
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_new_user();

CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.profiles SET email=COALESCE(NEW.email,'') WHERE id=NEW.id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_email ON auth.users;
CREATE TRIGGER trg_sync_profile_email
AFTER UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

CREATE OR REPLACE FUNCTION public.set_profile_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_profile_updated_at();

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT COALESCE((
        SELECT p.role='admin' AND NOT p.is_suspended
        FROM public.profiles AS p WHERE p.id=auth.uid()
    ),FALSE);
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_active()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT COALESCE((
        SELECT NOT p.is_suspended FROM public.profiles AS p WHERE p.id=auth.uid()
    ),FALSE);
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_list()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT COALESCE((
        SELECT NOT p.is_suspended AND (
            p.role='admin' OR (p.role='lister' AND p.lister_status='approved')
        )
        FROM public.profiles AS p WHERE p.id=auth.uid()
    ),FALSE);
$$;

CREATE OR REPLACE FUNCTION public.apply_for_lister_approval()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT public.current_user_is_active() THEN
        RAISE EXCEPTION 'Active authentication required';
    END IF;
    UPDATE public.profiles SET lister_status='pending'
    WHERE id=auth.uid() AND role='user' AND lister_status IN ('none','rejected');
    IF NOT FOUND THEN RAISE EXCEPTION 'This account cannot submit a lister application'; END IF;
    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_lister_application(p_user_id UUID,p_approve BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NOT public.current_user_is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
    UPDATE public.profiles
    SET role=CASE WHEN p_approve THEN 'lister' ELSE 'user' END,
        lister_status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END
    WHERE id=p_user_id AND role='user' AND lister_status='pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'No pending lister application for that account'; END IF;
    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_suspended(p_user_id UUID,p_suspended BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NOT public.current_user_is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
    IF p_user_id=auth.uid() THEN RAISE EXCEPTION 'Administrators cannot suspend their own account'; END IF;
    UPDATE public.profiles SET is_suspended=p_suspended WHERE id=p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.current_user_is_active() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.current_user_can_list() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.apply_for_lister_approval() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_review_lister_application(UUID,BOOLEAN) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_set_user_suspended(UUID,BOOLEAN) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated,anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_for_lister_approval() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_lister_application(UUID,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_suspended(UUID,BOOLEAN) TO authenticated;

-- Role columns are not client-writable. Profile creation is via the auth trigger;
-- role changes are exclusively via trusted SQL bootstrap or checked RPCs above.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.profiles FROM anon,authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name) ON TABLE public.profiles TO authenticated;

-- Replace all existing policies on the four RentHub tables so an older
-- permissive policy cannot OR-bypass the role checks installed below.
DO $$ DECLARE pol RECORD;
BEGIN
    FOR pol IN
        SELECT schemaname,tablename,policyname
        FROM pg_policies
        WHERE schemaname='public'
          AND tablename IN ('profiles','apartments','favourites','inquiries','comments')
    LOOP
        EXECUTE format('DROP POLICY %I ON %I.%I',pol.policyname,pol.schemaname,pol.tablename);
    END LOOP;
END $$;

ALTER TABLE public.apartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favourites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY renthub_profile_read ON public.profiles
FOR SELECT TO authenticated
USING (id=auth.uid() OR public.current_user_is_admin());
CREATE POLICY renthub_profile_update_name ON public.profiles
FOR UPDATE TO authenticated
USING (id=auth.uid() AND public.current_user_is_active())
WITH CHECK (id=auth.uid() AND public.current_user_is_active());

CREATE POLICY renthub_apartments_read ON public.apartments
FOR SELECT TO anon,authenticated
USING (status='published' OR owner_id=auth.uid() OR public.current_user_is_admin());
CREATE POLICY renthub_apartments_insert ON public.apartments
FOR INSERT TO authenticated
WITH CHECK (owner_id=auth.uid() AND public.current_user_can_list());
CREATE POLICY renthub_apartments_update ON public.apartments
FOR UPDATE TO authenticated
USING ((owner_id=auth.uid() AND public.current_user_can_list()) OR public.current_user_is_admin())
WITH CHECK ((owner_id=auth.uid() AND public.current_user_can_list()) OR public.current_user_is_admin());
CREATE POLICY renthub_apartments_delete ON public.apartments
FOR DELETE TO authenticated
USING ((owner_id=auth.uid() AND public.current_user_can_list()) OR public.current_user_is_admin());

CREATE POLICY renthub_favourites_read ON public.favourites
FOR SELECT TO authenticated USING (user_id=auth.uid() AND public.current_user_is_active());
CREATE POLICY renthub_favourites_insert ON public.favourites
FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid() AND public.current_user_is_active());
CREATE POLICY renthub_favourites_delete ON public.favourites
FOR DELETE TO authenticated USING (user_id=auth.uid() AND public.current_user_is_active());

CREATE POLICY renthub_inquiries_read ON public.inquiries
FOR SELECT TO authenticated USING (
    (renter_id=auth.uid() AND public.current_user_is_active()) OR
    (public.current_user_is_admin()) OR
    (public.current_user_can_list() AND EXISTS (
        SELECT 1 FROM public.apartments AS a
        WHERE a.id=inquiries.apartment_id AND a.owner_id=auth.uid()
    ))
);
CREATE POLICY renthub_inquiries_insert ON public.inquiries
FOR INSERT TO authenticated WITH CHECK (
    renter_id=auth.uid() AND public.current_user_is_active() AND EXISTS (
        SELECT 1 FROM public.apartments AS a
        WHERE a.id=inquiries.apartment_id AND a.status='published' AND a.owner_id<>auth.uid()
    )
);
CREATE POLICY renthub_inquiries_update ON public.inquiries
FOR UPDATE TO authenticated
USING (public.current_user_is_admin() OR (
    public.current_user_can_list() AND EXISTS (
        SELECT 1 FROM public.apartments AS a
        WHERE a.id=inquiries.apartment_id AND a.owner_id=auth.uid()
    )
))
WITH CHECK (public.current_user_is_admin() OR (
    public.current_user_can_list() AND EXISTS (
        SELECT 1 FROM public.apartments AS a
        WHERE a.id=inquiries.apartment_id AND a.owner_id=auth.uid()
    )
));

CREATE POLICY renthub_comments_read ON public.comments
FOR SELECT TO anon,authenticated USING (
    public.current_user_is_admin() OR EXISTS (
        SELECT 1 FROM public.apartments AS a
        WHERE a.id=comments.apartment_id AND (a.status='published' OR a.owner_id=auth.uid())
    )
);
CREATE POLICY renthub_comments_insert ON public.comments
FOR INSERT TO authenticated WITH CHECK (
    user_id=auth.uid() AND public.current_user_is_active() AND EXISTS (
        SELECT 1 FROM public.apartments AS a
        WHERE a.id=comments.apartment_id AND a.status='published'
    ) AND (
        parent_comment_id IS NULL OR EXISTS (
            SELECT 1 FROM public.comments AS parent
            WHERE parent.id=comments.parent_comment_id
              AND parent.apartment_id=comments.apartment_id
              AND parent.parent_comment_id IS NULL
        )
    )
);
CREATE POLICY renthub_comments_update ON public.comments
FOR UPDATE TO authenticated
USING ((user_id=auth.uid() AND public.current_user_is_active()) OR public.current_user_is_admin())
WITH CHECK ((user_id=auth.uid() AND public.current_user_is_active()) OR public.current_user_is_admin());
CREATE POLICY renthub_comments_delete ON public.comments
FOR DELETE TO authenticated
USING ((user_id=auth.uid() AND public.current_user_is_active()) OR public.current_user_is_admin());

NOTIFY pgrst, 'reload schema';
COMMIT;
