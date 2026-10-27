
-- ============================================================
-- RentHub: Supabase Database Schema
-- ============================================================

-- 0. PERSISTENT ROLES AND LISTER APPROVAL
-- Role/approval values are server-owned profile columns, never Auth user metadata.
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL DEFAULT '',
    full_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','lister','admin')),
    lister_status TEXT NOT NULL DEFAULT 'none' CHECK (lister_status IN ('none','pending','approved','rejected')),
    is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    INSERT INTO public.profiles (id,email,full_name,role,lister_status,is_suspended)
    VALUES (
        NEW.id,
        COALESCE(NEW.email,''),
        COALESCE(NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), ''), ''),
        'user','none',FALSE
    ) ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_profile_for_new_user ON auth.users;
CREATE TRIGGER trg_create_profile_for_new_user
AFTER INSERT ON auth.users FOR EACH ROW
EXECUTE FUNCTION public.create_profile_for_new_user();

INSERT INTO public.profiles (id,email,full_name,role,lister_status,is_suspended)
SELECT id,COALESCE(email,''),COALESCE(NULLIF(BTRIM(raw_user_meta_data ->> 'full_name'), ''), ''),'user','none',FALSE
FROM auth.users ON CONFLICT (id) DO NOTHING;

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

-- Security-definer helper avoids recursive profile RLS inside apartment policies.
CREATE OR REPLACE FUNCTION public.current_user_can_list()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT COALESCE((SELECT NOT p.is_suspended AND (p.role='admin' OR (p.role='lister' AND p.lister_status='approved')) FROM public.profiles p WHERE p.id=auth.uid()),FALSE);
$$;
REVOKE ALL ON FUNCTION public.current_user_can_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_list() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT COALESCE((SELECT p.role='admin' AND NOT p.is_suspended FROM public.profiles p WHERE p.id=auth.uid()),FALSE);
$$;
CREATE OR REPLACE FUNCTION public.current_user_is_active()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT COALESCE((SELECT NOT p.is_suspended FROM public.profiles p WHERE p.id=auth.uid()),FALSE);
$$;
REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_is_active() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated,anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_active() TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_for_lister_approval()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT public.current_user_is_active() THEN RAISE EXCEPTION 'Active authentication required'; END IF;
    UPDATE public.profiles SET lister_status='pending' WHERE id=auth.uid() AND role='user' AND lister_status IN ('none','rejected');
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
REVOKE ALL ON FUNCTION public.apply_for_lister_approval() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_review_lister_application(UUID,BOOLEAN) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_set_user_suspended(UUID,BOOLEAN) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_for_lister_approval() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_lister_application(UUID,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_suspended(UUID,BOOLEAN) TO authenticated;

-- 1. APARTMENTS
-- Stores property listings created by landlords.

CREATE TABLE IF NOT EXISTS public.apartments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    owner_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,

    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100),
    postal_code VARCHAR(20),

    monthly_rent NUMERIC(12, 2) NOT NULL
        CHECK (monthly_rent > 0),

    bedrooms INTEGER NOT NULL DEFAULT 1
        CHECK (bedrooms >= 0),

    bathrooms NUMERIC(3, 1) NOT NULL DEFAULT 1
        CHECK (bathrooms > 0),

    area_sqft INTEGER
        CHECK (area_sqft IS NULL OR area_sqft > 0),

    is_furnished BOOLEAN NOT NULL DEFAULT FALSE,

    vegetarian_preference VARCHAR(20)
        CHECK (
            vegetarian_preference IS NULL
            OR vegetarian_preference IN (
                'vegetarian',
                'non-vegetarian',
                'no-preference'
            )
        ),

    amenities TEXT[] NOT NULL DEFAULT '{}',
    photos TEXT[] NOT NULL DEFAULT '{}',

    status VARCHAR(20) NOT NULL DEFAULT 'published'
        CHECK (status IN ('draft', 'published', 'rented')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. FAVOURITES
-- Each user can favourite an apartment only once.

CREATE TABLE IF NOT EXISTS public.favourites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,

    apartment_id UUID NOT NULL
        REFERENCES public.apartments(id) ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_user_apartment_favourite
        UNIQUE (user_id, apartment_id)
);

-- 3. INQUIRIES
-- A renter can contact the owner of an apartment.

CREATE TABLE IF NOT EXISTS public.inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    apartment_id UUID NOT NULL
        REFERENCES public.apartments(id) ON DELETE CASCADE,

    renter_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,

    message TEXT NOT NULL
        CHECK (CHAR_LENGTH(TRIM(message)) BETWEEN 1 AND 3000),

    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'responded', 'closed')),

    response_message TEXT,
    responded_at TIMESTAMPTZ,
    renter_last_read_at TIMESTAMPTZ,
    lister_last_read_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3a. INQUIRY CONVERSATION MESSAGES
-- Each inquiry remains the thread; messages are append-only history rows.
CREATE TABLE IF NOT EXISTS public.inquiry_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquiry_id UUID NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (CHAR_LENGTH(TRIM(body)) BETWEEN 1 AND 3000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inquiry_messages_thread_time
    ON public.inquiry_messages(inquiry_id, created_at, id);

-- Keep server-paginated conversation ordering aligned with its newest message.
CREATE OR REPLACE FUNCTION public.touch_inquiry_on_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.inquiries SET updated_at = clock_timestamp() WHERE id = NEW.inquiry_id;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_inquiry_on_message_insert() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_touch_inquiry_on_message_insert ON public.inquiry_messages;
CREATE TRIGGER trg_touch_inquiry_on_message_insert
AFTER INSERT ON public.inquiry_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_inquiry_on_message_insert();

-- 4. COMMENTS AND REPLIES
-- A NULL parent_comment_id identifies a top-level comment.
-- A non-NULL parent_comment_id identifies a reply.

CREATE TABLE IF NOT EXISTS public.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    apartment_id UUID NOT NULL
        REFERENCES public.apartments(id) ON DELETE CASCADE,

    user_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,

    parent_comment_id UUID
        REFERENCES public.comments(id) ON DELETE CASCADE,

    comment_text TEXT NOT NULL
        CHECK (CHAR_LENGTH(TRIM(comment_text)) BETWEEN 1 AND 2000),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_apartments_city
    ON public.apartments(city);

CREATE INDEX IF NOT EXISTS idx_apartments_rent
    ON public.apartments(monthly_rent);

CREATE INDEX IF NOT EXISTS idx_apartments_owner
    ON public.apartments(owner_id);

CREATE INDEX IF NOT EXISTS idx_apartments_status_created
    ON public.apartments(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_favourites_user
    ON public.favourites(user_id);

CREATE INDEX IF NOT EXISTS idx_favourites_apartment
    ON public.favourites(apartment_id);

CREATE INDEX IF NOT EXISTS idx_inquiries_renter
    ON public.inquiries(renter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inquiries_apartment
    ON public.inquiries(apartment_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiries_one_conversation_per_renter_listing
    ON public.inquiries(apartment_id, renter_id);

CREATE INDEX IF NOT EXISTS idx_comments_apartment
    ON public.comments(apartment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_parent
    ON public.comments(parent_comment_id, created_at);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apartments_updated_at
    ON public.apartments;

CREATE TRIGGER trg_apartments_updated_at
BEFORE UPDATE ON public.apartments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_inquiries_updated_at
    ON public.inquiries;

CREATE TRIGGER trg_inquiries_updated_at
BEFORE UPDATE ON public.inquiries
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Keep renter-submitted inquiry data immutable. The legacy response fields are
-- retained for compatibility; full conversation history lives in inquiry_messages.
CREATE OR REPLACE FUNCTION public.protect_inquiry_response()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
    IF NEW.status = 'responded' AND NEW.response_message IS NULL THEN
        RAISE EXCEPTION 'A response is required before marking an inquiry responded';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_inquiry_response ON public.inquiries;
CREATE TRIGGER trg_protect_inquiry_response
BEFORE UPDATE ON public.inquiries
FOR EACH ROW EXECUTE FUNCTION public.protect_inquiry_response();

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

CREATE OR REPLACE FUNCTION public.mark_inquiry_conversation_read(p_inquiry_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
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
$$;
REVOKE ALL ON FUNCTION public.mark_inquiry_conversation_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_inquiry_conversation_read(UUID) TO authenticated;

-- Return only the caller's unread message count. The persisted read watermarks
-- remain on each inquiry and the function does not expose message content.
CREATE OR REPLACE FUNCTION public.get_unread_inquiry_message_count()
RETURNS BIGINT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
    SELECT count(*)::BIGINT
    FROM public.inquiry_messages AS m
    JOIN public.inquiries AS i ON i.id = m.inquiry_id
    JOIN public.apartments AS a ON a.id = i.apartment_id
    WHERE auth.uid() IS NOT NULL
      AND public.current_user_is_active()
      AND m.sender_id <> auth.uid()
      AND (
          (i.renter_id = auth.uid()
              AND (i.renter_last_read_at IS NULL OR m.created_at > i.renter_last_read_at))
          OR
          (a.owner_id = auth.uid() AND public.current_user_can_list()
              AND (i.lister_last_read_at IS NULL OR m.created_at > i.lister_last_read_at))
      );
$$;
REVOKE ALL ON FUNCTION public.get_unread_inquiry_message_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_unread_inquiry_message_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.record_initial_inquiry_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
BEGIN
    INSERT INTO public.inquiry_messages(inquiry_id, sender_id, body, created_at)
    VALUES (NEW.id, NEW.renter_id, NEW.message, NEW.created_at);
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_initial_inquiry_message() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_record_initial_inquiry_message ON public.inquiries;
CREATE TRIGGER trg_record_initial_inquiry_message
AFTER INSERT ON public.inquiries
FOR EACH ROW EXECUTE FUNCTION public.record_initial_inquiry_message();

CREATE OR REPLACE FUNCTION public.sync_first_lister_reply_to_inquiry()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
BEGIN
    UPDATE public.inquiries AS i
    SET response_message = COALESCE(i.response_message, NEW.body),
        responded_at = COALESCE(i.responded_at, NEW.created_at),
        status = CASE WHEN i.status = 'closed' THEN i.status ELSE 'responded' END
    FROM public.apartments AS a
    WHERE i.id = NEW.inquiry_id
      AND a.id = i.apartment_id
      AND a.owner_id = NEW.sender_id;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_first_lister_reply_to_inquiry() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_sync_first_lister_reply_to_inquiry ON public.inquiry_messages;
CREATE TRIGGER trg_sync_first_lister_reply_to_inquiry
AFTER INSERT ON public.inquiry_messages
FOR EACH ROW EXECUTE FUNCTION public.sync_first_lister_reply_to_inquiry();

CREATE OR REPLACE FUNCTION public.protect_comment_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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

DROP TRIGGER IF EXISTS trg_comments_updated_at
    ON public.comments;

CREATE TRIGGER trg_comments_updated_at
BEFORE UPDATE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.apartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favourites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inquiry_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.inquiry_messages TO authenticated;
GRANT INSERT (inquiry_id, sender_id, body) ON TABLE public.inquiry_messages TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;
REVOKE UPDATE ON TABLE public.inquiries FROM PUBLIC, anon, authenticated;

-- APARTMENTS

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
FOR SELECT TO authenticated USING (id = (SELECT auth.uid()) OR public.current_user_is_admin());

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
FOR UPDATE TO authenticated
USING (id = (SELECT auth.uid()) AND public.current_user_is_active())
WITH CHECK (id = (SELECT auth.uid()) AND public.current_user_is_active());

DROP POLICY IF EXISTS "Anyone can view published apartments"
    ON public.apartments;

CREATE POLICY "Anyone can view published apartments"
ON public.apartments
FOR SELECT
TO anon, authenticated
USING (
    status = 'published'
    OR owner_id = (SELECT auth.uid())
    OR public.current_user_is_admin()
);

DROP POLICY IF EXISTS "Authenticated users can create apartments"
    ON public.apartments;

CREATE POLICY "Authenticated users can create apartments"
ON public.apartments
FOR INSERT
TO authenticated
WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND public.current_user_can_list()
);

DROP POLICY IF EXISTS "Owners can update their apartments"
    ON public.apartments;

CREATE POLICY "Owners can update their apartments"
ON public.apartments
FOR UPDATE
TO authenticated
USING (
    (owner_id = (SELECT auth.uid()) AND public.current_user_can_list())
    OR public.current_user_is_admin()
)
WITH CHECK (
    (owner_id = (SELECT auth.uid()) AND public.current_user_can_list())
    OR public.current_user_is_admin()
);

DROP POLICY IF EXISTS "Owners can delete their apartments"
    ON public.apartments;

CREATE POLICY "Owners can delete their apartments"
ON public.apartments
FOR DELETE
TO authenticated
USING (
    (owner_id = (SELECT auth.uid()) AND public.current_user_can_list())
    OR public.current_user_is_admin()
);

-- FAVOURITES

DROP POLICY IF EXISTS "Users can view their own favourites"
    ON public.favourites;

CREATE POLICY "Users can view their own favourites"
ON public.favourites
FOR SELECT
TO authenticated
USING (
    user_id = (SELECT auth.uid()) AND public.current_user_is_active()
);

DROP POLICY IF EXISTS "Users can add their own favourites"
    ON public.favourites;

CREATE POLICY "Users can add their own favourites"
ON public.favourites
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = (SELECT auth.uid()) AND public.current_user_is_active()
);

DROP POLICY IF EXISTS "Users can remove their own favourites"
    ON public.favourites;

CREATE POLICY "Users can remove their own favourites"
ON public.favourites
FOR DELETE
TO authenticated
USING (
    user_id = (SELECT auth.uid()) AND public.current_user_is_active()
);

-- INQUIRIES

DROP POLICY IF EXISTS "Renters and owners can view inquiries"
    ON public.inquiries;

CREATE POLICY "Renters and owners can view inquiries"
ON public.inquiries
FOR SELECT
TO authenticated
USING (
    (renter_id = (SELECT auth.uid()) AND public.current_user_is_active())
    OR EXISTS (
        SELECT 1
        FROM public.apartments a
        WHERE a.id = inquiries.apartment_id
          AND a.owner_id = (SELECT auth.uid())
          AND public.current_user_can_list()
    )
    OR public.current_user_is_admin()
);

DROP POLICY IF EXISTS "Renters can create inquiries"
    ON public.inquiries;

CREATE POLICY "Renters can create inquiries"
ON public.inquiries
FOR INSERT
TO authenticated
WITH CHECK (
    renter_id = (SELECT auth.uid())
    AND public.current_user_is_active()
    AND EXISTS (
        SELECT 1
        FROM public.apartments a
        WHERE a.id = inquiries.apartment_id
          AND a.status = 'published'
          AND a.owner_id <> (SELECT auth.uid())
    )
);

DROP POLICY IF EXISTS "Owners can update inquiry status"
    ON public.inquiries;

CREATE POLICY "Owners can update inquiry status"
ON public.inquiries
FOR UPDATE
TO authenticated
USING (
    public.current_user_is_admin() OR (
      public.current_user_can_list() AND EXISTS (
        SELECT 1
        FROM public.apartments a
        WHERE a.id = inquiries.apartment_id
          AND a.owner_id = (SELECT auth.uid())
      )
    )
)
WITH CHECK (
    public.current_user_is_admin() OR (
      public.current_user_can_list() AND EXISTS (
        SELECT 1
        FROM public.apartments a
        WHERE a.id = inquiries.apartment_id
          AND a.owner_id = (SELECT auth.uid())
      )
    )
);

DROP POLICY IF EXISTS renthub_inquiry_messages_read ON public.inquiry_messages;
CREATE POLICY renthub_inquiry_messages_read
ON public.inquiry_messages FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.inquiries AS i
        JOIN public.apartments AS a ON a.id = i.apartment_id
        WHERE i.id = inquiry_messages.inquiry_id
          AND (
              (i.renter_id = auth.uid() AND public.current_user_is_active())
              OR (a.owner_id = auth.uid() AND public.current_user_can_list())
          )
    )
);

DROP POLICY IF EXISTS renthub_inquiry_messages_insert ON public.inquiry_messages;
CREATE POLICY renthub_inquiry_messages_insert
ON public.inquiry_messages FOR INSERT TO authenticated
WITH CHECK (
    sender_id = auth.uid()
    AND public.current_user_is_active()
    AND EXISTS (
        SELECT 1 FROM public.inquiries AS i
        JOIN public.apartments AS a ON a.id = i.apartment_id
        WHERE i.id = inquiry_messages.inquiry_id
          AND (
              i.renter_id = auth.uid()
              OR (a.owner_id = auth.uid() AND public.current_user_can_list())
          )
    )
);

-- COMMENTS AND REPLIES

-- Parent validation runs with a fixed search_path and bypasses comments RLS;
-- otherwise selecting the parent from comments INSERT policy recurses.
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

-- Ensure a stale policy cannot OR-bypass the policies defined below.
DO $$
DECLARE existing_policy RECORD;
BEGIN
    FOR existing_policy IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'comments'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.comments', existing_policy.policyname);
    END LOOP;
END;
$$;

CREATE POLICY "Users can view comments on visible apartments"
ON public.comments
FOR SELECT
TO anon, authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.apartments a
        WHERE a.id = comments.apartment_id
          AND (
              a.status = 'published'
              OR a.owner_id = (SELECT auth.uid())
              OR public.current_user_is_admin()
          )
    )
);

CREATE POLICY "Authenticated users can create comments"
ON public.comments
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.current_user_is_active()
    AND EXISTS (
        SELECT 1
        FROM public.apartments a
        WHERE a.id = comments.apartment_id
          AND a.status = 'published'
    )
    AND (
        parent_comment_id IS NULL
        OR public.comment_parent_is_valid(parent_comment_id, apartment_id)
    )
);

CREATE POLICY "Users can update their own comments"
ON public.comments
FOR UPDATE
TO authenticated
USING (
    (user_id = (SELECT auth.uid()) AND public.current_user_is_active())
    OR public.current_user_is_admin()
)
WITH CHECK (
    (user_id = (SELECT auth.uid()) AND public.current_user_is_active())
    OR public.current_user_is_admin()
);

CREATE POLICY "Users can delete their own comments"
ON public.comments
FOR DELETE
TO authenticated
USING (
    (user_id = (SELECT auth.uid()) AND public.current_user_is_active())
    OR public.current_user_is_admin()
);

-- ============================================================
-- END OF RENTHUB SCHEMA
-- ============================================================

-- Location-aware progressive apartment search is installed separately by
-- migrations/20261102_location_aware_apartment_search.sql. Apply that migration
-- after this base schema; the Angular location filter calls its SECURITY INVOKER RPC.
