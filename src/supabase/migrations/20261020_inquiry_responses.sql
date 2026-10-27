-- Additive, data-preserving support for landlord responses to existing inquiries.
ALTER TABLE public.inquiries
    ADD COLUMN IF NOT EXISTS response_message TEXT,
    ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

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

-- Preserve the original owner, apartment and thread structure when users edit comments.
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
