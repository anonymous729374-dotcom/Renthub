-- Three-role authorization. Additive: preserves profiles, listings, inquiries and comments.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user',
    ADD COLUMN IF NOT EXISTS lister_status TEXT NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_role_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user','lister','admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_lister_status_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_lister_status_check CHECK (lister_status IN ('none','pending','approved','rejected'));
  END IF;
END $$;

UPDATE public.profiles p SET
  email = COALESCE(u.email, ''),
  role = 'user',
  lister_status = CASE WHEN p.is_lister THEN 'pending' ELSE 'none' END
FROM auth.users u WHERE u.id = p.id AND p.role = 'user';

-- Retire the earlier self-approval endpoint; applications now require admin review.
DROP FUNCTION IF EXISTS public.enable_lister_capability();

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id,email,full_name,role,lister_status,is_suspended)
  VALUES (NEW.id,COALESCE(NEW.email,''),COALESCE(NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'),''),''),'user','none',FALSE)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.profiles SET email=COALESCE(NEW.email,'') WHERE id=NEW.id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_profile_email ON auth.users;
CREATE TRIGGER trg_sync_profile_email AFTER UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT p.role='admin' AND NOT p.is_suspended FROM public.profiles p WHERE p.id=auth.uid()),FALSE);
$$;
CREATE OR REPLACE FUNCTION public.current_user_is_active()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT NOT p.is_suspended FROM public.profiles p WHERE p.id=auth.uid()),FALSE);
$$;
CREATE OR REPLACE FUNCTION public.current_user_can_list()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT NOT p.is_suspended AND (p.role='admin' OR (p.role='lister' AND p.lister_status='approved')) FROM public.profiles p WHERE p.id=auth.uid()),FALSE);
$$;
REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.current_user_is_active() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.current_user_can_list() FROM PUBLIC,anon;
-- Public listing/comment SELECT policies evaluate this helper for anon requests too;
-- auth.uid() is NULL there, so it safely returns false.
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated,anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_list() TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_for_lister_approval()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_active() THEN RAISE EXCEPTION 'Active authentication required'; END IF;
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
  UPDATE public.profiles SET role=CASE WHEN p_approve THEN 'lister' ELSE 'user' END,
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
REVOKE ALL ON FUNCTION public.apply_for_lister_approval() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_review_lister_application(UUID,BOOLEAN) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_set_user_suspended(UUID,BOOLEAN) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_for_lister_approval() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_lister_application(UUID,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_suspended(UUID,BOOLEAN) TO authenticated;

-- Browser clients can edit only the display name. Role/status/suspension are RPC-controlled.
GRANT SELECT ON public.profiles TO authenticated;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view own profile or admin views all" ON public.profiles
FOR SELECT TO authenticated USING (id=auth.uid() OR public.current_user_is_admin());
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile name" ON public.profiles;
CREATE POLICY "Users can update own profile name" ON public.profiles
FOR UPDATE TO authenticated USING (id=auth.uid())
WITH CHECK (id=auth.uid());

-- Lister/admin authorization is based on protected DB rows, never client role values.
DROP POLICY IF EXISTS "Authenticated users can create apartments" ON public.apartments;
CREATE POLICY "Authorized listers and admins can create apartments" ON public.apartments
FOR INSERT TO authenticated WITH CHECK (owner_id=auth.uid() AND public.current_user_can_list());
DROP POLICY IF EXISTS "Owners can update their apartments" ON public.apartments;
CREATE POLICY "Owners or admins can update apartments" ON public.apartments
FOR UPDATE TO authenticated USING ((owner_id=auth.uid() AND public.current_user_can_list()) OR public.current_user_is_admin())
WITH CHECK ((owner_id=auth.uid() AND public.current_user_can_list()) OR public.current_user_is_admin());
DROP POLICY IF EXISTS "Owners can delete their apartments" ON public.apartments;
CREATE POLICY "Owners or admins can delete apartments" ON public.apartments
FOR DELETE TO authenticated USING ((owner_id=auth.uid() AND public.current_user_can_list()) OR public.current_user_is_admin());
DROP POLICY IF EXISTS "Anyone can view published apartments" ON public.apartments;
CREATE POLICY "Public published and authorized private apartment view" ON public.apartments
FOR SELECT TO anon,authenticated USING (status='published' OR owner_id=auth.uid() OR public.current_user_is_admin());

DROP POLICY IF EXISTS "Renters and owners can view inquiries" ON public.inquiries;
CREATE POLICY "Renters owners and admins can view inquiries" ON public.inquiries
FOR SELECT TO authenticated USING (
  (renter_id=auth.uid() AND public.current_user_is_active()) OR
  (public.current_user_can_list() AND EXISTS(SELECT 1 FROM public.apartments a WHERE a.id=apartment_id AND a.owner_id=auth.uid())) OR
  public.current_user_is_admin()
);
DROP POLICY IF EXISTS "Renters can create inquiries" ON public.inquiries;
CREATE POLICY "Active renters can create inquiries" ON public.inquiries
FOR INSERT TO authenticated WITH CHECK (
  renter_id=auth.uid() AND public.current_user_is_active() AND
  EXISTS(SELECT 1 FROM public.apartments a WHERE a.id=apartment_id AND a.status='published' AND a.owner_id<>auth.uid())
);
DROP POLICY IF EXISTS "Owners can update inquiry status" ON public.inquiries;
CREATE POLICY "Owners or admins can respond to inquiries" ON public.inquiries
FOR UPDATE TO authenticated USING (
  public.current_user_is_admin() OR
  (public.current_user_can_list() AND EXISTS(SELECT 1 FROM public.apartments a WHERE a.id=apartment_id AND a.owner_id=auth.uid()))
) WITH CHECK (
  public.current_user_is_admin() OR
  (public.current_user_can_list() AND EXISTS(SELECT 1 FROM public.apartments a WHERE a.id=apartment_id AND a.owner_id=auth.uid()))
);

DROP POLICY IF EXISTS "Users can view comments on visible apartments" ON public.comments;
CREATE POLICY "Users and admins can view visible comments" ON public.comments
FOR SELECT TO anon,authenticated USING (
  public.current_user_is_admin() OR EXISTS(SELECT 1 FROM public.apartments a WHERE a.id=apartment_id AND (a.status='published' OR a.owner_id=auth.uid()))
);
DROP POLICY IF EXISTS "Authenticated users can create comments" ON public.comments;
CREATE POLICY "Active users can create comments" ON public.comments
FOR INSERT TO authenticated WITH CHECK (
  user_id=auth.uid() AND public.current_user_is_active() AND
  EXISTS(SELECT 1 FROM public.apartments a WHERE a.id=apartment_id AND a.status='published') AND
  (parent_comment_id IS NULL OR EXISTS(SELECT 1 FROM public.comments parent WHERE parent.id=parent_comment_id AND parent.apartment_id=apartment_id AND parent.parent_comment_id IS NULL))
);
DROP POLICY IF EXISTS "Users can update their own comments" ON public.comments;
CREATE POLICY "Owners or admins can update comments" ON public.comments
FOR UPDATE TO authenticated USING ((user_id=auth.uid() AND public.current_user_is_active()) OR public.current_user_is_admin())
WITH CHECK ((user_id=auth.uid() AND public.current_user_is_active()) OR public.current_user_is_admin());
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.comments;
CREATE POLICY "Owners or admins can delete comments" ON public.comments
FOR DELETE TO authenticated USING ((user_id=auth.uid() AND public.current_user_is_active()) OR public.current_user_is_admin());

-- Trusted bootstrap: run manually in Supabase SQL Editor as project owner after confirming the account UUID.
-- UPDATE public.profiles SET role='admin', lister_status='approved' WHERE id='<verified-auth-user-uuid>';
