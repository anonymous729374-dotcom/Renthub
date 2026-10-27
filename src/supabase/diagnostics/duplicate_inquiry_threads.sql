-- Read-only review before applying 20261031_merge_duplicate_inquiry_threads.sql.
-- Result set 1: inquiry rows in duplicate renter/listing groups, including
-- legacy first-message/response values and their message counts.
WITH duplicate_pairs AS (
  SELECT apartment_id, renter_id
  FROM public.inquiries
  GROUP BY apartment_id, renter_id
  HAVING count(*) > 1
)
SELECT i.id AS inquiry_id,
       i.apartment_id,
       i.renter_id,
       i.created_at,
       i.status,
       i.message AS legacy_initial_message,
       i.response_message AS legacy_first_response,
       i.responded_at,
       count(m.id) AS stored_message_count
FROM public.inquiries AS i
JOIN duplicate_pairs AS d
  ON d.apartment_id = i.apartment_id AND d.renter_id = i.renter_id
LEFT JOIN public.inquiry_messages AS m ON m.inquiry_id = i.id
GROUP BY i.id, i.apartment_id, i.renter_id, i.created_at, i.status, i.message,
         i.response_message, i.responded_at
ORDER BY i.apartment_id, i.renter_id, i.created_at, i.id;

-- Result set 2: every stored message for those duplicate groups, in timestamp
-- order. No body-based deduplication is performed by the migration.
WITH duplicate_pairs AS (
  SELECT apartment_id, renter_id
  FROM public.inquiries
  GROUP BY apartment_id, renter_id
  HAVING count(*) > 1
)
SELECT i.apartment_id,
       i.renter_id,
       i.id AS source_inquiry_id,
       m.id AS message_id,
       m.sender_id,
       m.body,
       m.created_at
FROM public.inquiries AS i
JOIN duplicate_pairs AS d
  ON d.apartment_id = i.apartment_id AND d.renter_id = i.renter_id
LEFT JOIN public.inquiry_messages AS m ON m.inquiry_id = i.id
ORDER BY i.apartment_id, i.renter_id, m.created_at NULLS FIRST, m.id;
