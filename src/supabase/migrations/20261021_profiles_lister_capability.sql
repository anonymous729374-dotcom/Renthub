-- Add profiles and an opt-in lister capability without granting admin privileges.
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT '',
    is_lister BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.profiles (id, full_name, is_lister)
SELECT id, COALESCE(NULLIF(BTRIM(raw_user_meta_data ->> 'full_name'), ''), ''), FALSE
FROM auth.users ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, is_lister)
    VALUES (
        NEW.id,
        COALESCE(NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), ''), ''),
        FALSE
    ) ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_profile_for_new_user ON auth.users;
CREATE TRIGGER trg_create_profile_for_new_user
AFTER INSERT ON auth.users FOR EACH ROW
EXECUTE FUNCTION public.create_profile_for_new_user();

CREATE OR REPLACE FUNCTION public.set_profile_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_profile_updated_at();

CREATE OR REPLACE FUNCTION public.current_user_can_list()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT COALESCE((SELECT p.is_lister FROM public.profiles p WHERE p.id = auth.uid()), FALSE);
$$;
REVOKE ALL ON FUNCTION public.current_user_can_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_list() TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.profiles TO authenticated;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
FOR UPDATE TO authenticated USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()));

-- Existing accounts start as renters and can opt into lister tools in Profile.
DROP POLICY IF EXISTS "Authenticated users can create apartments" ON public.apartments;
CREATE POLICY "Authenticated users can create apartments" ON public.apartments
FOR INSERT TO authenticated WITH CHECK (
    owner_id = (SELECT auth.uid()) AND public.current_user_can_list()
);
DROP POLICY IF EXISTS "Owners can update their apartments" ON public.apartments;
CREATE POLICY "Owners can update their apartments" ON public.apartments
FOR UPDATE TO authenticated USING (
    owner_id = (SELECT auth.uid()) AND public.current_user_can_list()
) WITH CHECK (
    owner_id = (SELECT auth.uid()) AND public.current_user_can_list()
);
DROP POLICY IF EXISTS "Owners can delete their apartments" ON public.apartments;
CREATE POLICY "Owners can delete their apartments" ON public.apartments
FOR DELETE TO authenticated USING (
    owner_id = (SELECT auth.uid()) AND public.current_user_can_list()
);
