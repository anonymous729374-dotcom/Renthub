-- Progressive, location-aware apartment search. This function is SECURITY
-- INVOKER so apartment RLS remains the authority for visible records.

CREATE OR REPLACE FUNCTION public.normalize_apartment_search_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(lower(coalesce(p_value, '')), '[^[:alnum:]]+', ' ', 'g'),
      '[[:space:]]+', ' ', 'g'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.normalize_apartment_search_text(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_apartment_search_text(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.search_apartments_location_aware(
  p_search text,
  p_location text,
  p_city text,
  p_min_rent numeric,
  p_max_rent numeric,
  p_bedrooms integer,
  p_furnished boolean,
  p_amenities text[],
  p_sort_by text,
  p_page integer,
  p_page_size integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
WITH params AS (
  SELECT
    public.normalize_apartment_search_text(p_search) AS search_norm,
    public.normalize_apartment_search_text(p_location) AS location_norm,
    public.normalize_apartment_search_text(p_city) AS city_filter_norm,
    COALESCE(
      (
        SELECT array_agg(public.normalize_apartment_search_text(part.value) ORDER BY part.ordinality)
        FROM regexp_split_to_table(COALESCE(p_location, ''), '[,;/|]+')
          WITH ORDINALITY AS part(value, ordinality)
        WHERE public.normalize_apartment_search_text(part.value) <> ''
      ),
      ARRAY[]::text[]
    ) AS location_parts,
    EXISTS (
      SELECT 1
      FROM public.apartments AS known
      WHERE known.status = 'published'
        AND public.normalize_apartment_search_text(known.city) <> ''
        AND position(
          ' ' || public.normalize_apartment_search_text(known.city) || ' '
          IN ' ' || public.normalize_apartment_search_text(p_location) || ' '
        ) > 0
    ) AS query_has_known_city,
    EXISTS (
      SELECT 1
      FROM public.apartments AS known
      WHERE known.status = 'published'
        AND public.normalize_apartment_search_text(known.state) <> ''
        AND position(
          ' ' || public.normalize_apartment_search_text(known.state) || ' '
          IN ' ' || public.normalize_apartment_search_text(p_location) || ' '
        ) > 0
    ) AS query_has_known_state,
    GREATEST(1, COALESCE(p_page, 1)) AS page_number,
    LEAST(100, GREATEST(1, COALESCE(p_page_size, 9))) AS page_size
),
base AS (
  SELECT
    a AS listing,
    public.normalize_apartment_search_text(a.address) AS address_norm,
    public.normalize_apartment_search_text(a.city) AS city_norm,
    public.normalize_apartment_search_text(a.state) AS state_norm,
    public.normalize_apartment_search_text(a.postal_code) AS postal_norm,
    params.search_norm,
    params.location_norm,
    params.location_parts,
    params.query_has_known_city,
    params.query_has_known_state
  FROM public.apartments AS a
  CROSS JOIN params
  WHERE a.status = 'published'
    AND (p_min_rent IS NULL OR a.monthly_rent >= p_min_rent)
    AND (p_max_rent IS NULL OR a.monthly_rent <= p_max_rent)
    AND (p_bedrooms IS NULL OR a.bedrooms >= p_bedrooms)
    AND (p_furnished IS NULL OR a.is_furnished = p_furnished)
    AND (
      p_amenities IS NULL OR cardinality(p_amenities) = 0
      OR a.amenities @> p_amenities
    )
    AND (
      params.city_filter_norm = ''
      OR position(params.city_filter_norm IN public.normalize_apartment_search_text(a.city)) > 0
    )
    AND (
      params.search_norm = ''
      OR position(params.search_norm IN public.normalize_apartment_search_text(a.title)) > 0
      OR position(params.search_norm IN public.normalize_apartment_search_text(a.description)) > 0
      OR position(params.search_norm IN public.normalize_apartment_search_text(a.address)) > 0
      OR position(params.search_norm IN public.normalize_apartment_search_text(a.city)) > 0
      OR position(params.search_norm IN public.normalize_apartment_search_text(a.state)) > 0
      OR position(params.search_norm IN public.normalize_apartment_search_text(a.postal_code)) > 0
      OR EXISTS (
        SELECT 1 FROM unnest(a.amenities) AS amenity(value)
        WHERE position(params.search_norm IN public.normalize_apartment_search_text(amenity.value)) > 0
      )
    )
),
scored AS (
  SELECT
    base.listing,
    CASE
      WHEN base.location_norm = '' THEN 0
      WHEN base.location_norm IN (base.address_norm, base.city_norm, base.state_norm, base.postal_norm) THEN 100
      WHEN position(
        base.location_norm IN concat_ws(' ', base.address_norm, base.city_norm, base.state_norm, base.postal_norm)
      ) > 0 THEN 95
      WHEN base.city_norm <> '' AND position(' ' || base.city_norm || ' ' IN ' ' || base.location_norm || ' ') > 0
        AND base.address_norm <> '' AND position(base.address_norm IN base.location_norm) > 0 THEN 92
      WHEN cardinality(base.location_parts) > 0 AND NOT EXISTS (
        SELECT 1
        FROM unnest(base.location_parts) AS component(value)
        WHERE position(
          component.value IN concat_ws(' ', base.address_norm, base.city_norm, base.state_norm, base.postal_norm)
        ) = 0
      ) THEN 90
      WHEN base.city_norm <> '' AND position(' ' || base.city_norm || ' ' IN ' ' || base.location_norm || ' ') > 0
        AND base.state_norm <> '' AND position(' ' || base.state_norm || ' ' IN ' ' || base.location_norm || ' ') > 0 THEN 85
      WHEN base.city_norm <> '' AND position(' ' || base.city_norm || ' ' IN ' ' || base.location_norm || ' ') > 0 THEN 70
      WHEN NOT base.query_has_known_city
        AND base.state_norm <> '' AND position(' ' || base.state_norm || ' ' IN ' ' || base.location_norm || ' ') > 0 THEN 60
      WHEN NOT base.query_has_known_city AND NOT base.query_has_known_state
        AND base.postal_norm <> '' AND position(base.postal_norm IN base.location_norm) > 0 THEN 55
      ELSE 0
    END AS relevance
  FROM base
),
eligible AS (
  SELECT scored.listing, scored.relevance
  FROM scored
  WHERE scored.relevance > 0
),
page_rows AS (
  SELECT
    to_jsonb(eligible.listing) AS item,
    row_number() OVER (
      ORDER BY
        eligible.relevance DESC,
        CASE WHEN p_sort_by = 'rent-asc' THEN (eligible.listing).monthly_rent END ASC NULLS LAST,
        CASE WHEN p_sort_by = 'rent-desc' THEN (eligible.listing).monthly_rent END DESC NULLS LAST,
        CASE WHEN p_sort_by NOT IN ('rent-asc', 'rent-desc') THEN (eligible.listing).created_at END DESC NULLS LAST,
        (eligible.listing).id ASC
    ) AS ordinal
  FROM eligible
  ORDER BY
    eligible.relevance DESC,
    CASE WHEN p_sort_by = 'rent-asc' THEN (eligible.listing).monthly_rent END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'rent-desc' THEN (eligible.listing).monthly_rent END DESC NULLS LAST,
    CASE WHEN p_sort_by NOT IN ('rent-asc', 'rent-desc') THEN (eligible.listing).created_at END DESC NULLS LAST,
    (eligible.listing).id ASC
  LIMIT (SELECT page_size FROM params)
  OFFSET ((SELECT page_number - 1 FROM params) * (SELECT page_size FROM params))
)
SELECT jsonb_build_object(
  'items', COALESCE((SELECT jsonb_agg(page_rows.item ORDER BY page_rows.ordinal) FROM page_rows), '[]'::jsonb),
  'total', (SELECT count(*) FROM eligible)
);
$$;

REVOKE ALL ON FUNCTION public.search_apartments_location_aware(
  text, text, text, numeric, numeric, integer, boolean, text[], text, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_apartments_location_aware(
  text, text, text, numeric, numeric, integer, boolean, text[], text, integer, integer
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
