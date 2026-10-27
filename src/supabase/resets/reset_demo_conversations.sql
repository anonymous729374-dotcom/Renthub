-- RentHub demo conversation reset (manual and explicit).
-- This script deletes ONLY inquiry IDs manually entered in the temp table below.
-- Deleting an inquiry cascades to its inquiry_messages because of the existing
-- inquiry_messages.inquiry_id ON DELETE CASCADE foreign key.
-- It does not touch apartments, profiles, auth users, roles, favourites, comments,
-- or comment replies. An empty ID list deletes nothing.
BEGIN;

CREATE TEMP TABLE renthub_demo_conversation_ids (
  inquiry_id UUID PRIMARY KEY
) ON COMMIT DROP;

-- First inspect candidate conversations in Messages and copy ONLY demo inquiry
-- UUIDs here. Example syntax (replace with a verified UUID):
-- INSERT INTO renthub_demo_conversation_ids(inquiry_id) VALUES ('00000000-0000-0000-0000-000000000000');

-- Preview the selected rows before deletion.
SELECT i.id AS inquiry_id, i.apartment_id, i.renter_id, i.created_at,
       count(m.id) AS message_count
FROM public.inquiries AS i
JOIN pg_temp.renthub_demo_conversation_ids AS selected ON selected.inquiry_id=i.id
LEFT JOIN public.inquiry_messages AS m ON m.inquiry_id=i.id
GROUP BY i.id, i.apartment_id, i.renter_id, i.created_at
ORDER BY i.created_at;

-- Delete only the explicitly selected conversations. Associated chat messages
-- are removed by the inquiry_messages foreign key cascade.
DELETE FROM public.inquiries AS i
USING pg_temp.renthub_demo_conversation_ids AS selected
WHERE i.id=selected.inquiry_id
RETURNING i.id AS deleted_inquiry_id, i.apartment_id, i.renter_id;

COMMIT;
