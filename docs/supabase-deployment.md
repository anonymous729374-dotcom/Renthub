# Supabase deployment checklist

Apply SQL manually in the Supabase SQL Editor as the project owner. Never put a service-role key or database password in Angular configuration. Review each script before running it, especially migrations that consolidate historic conversation rows.

## Existing project with `apartments`, `comments`, `favourites`, and `inquiries`

The following order matches migration dependencies. Run each file once, in order:

1. `src/supabase/migrations/20261023_persistent_roles_first_admin.sql` — adds trusted profiles/roles and final role-aware application policies while preserving application rows. This file does not promote a hard-coded account.
2. `src/supabase/migrations/20261026_comments_rls_no_recursion.sql` — replaces comments policies with the non-recursive policy set.
3. `src/supabase/migrations/20261027_inquiry_conversations.sql` — creates message history and safely backfills existing inquiry/response data.
4. `src/supabase/migrations/20261027_inquiry_updated_at_on_message.sql` — keeps conversation ordering current after a message.
5. `src/supabase/migrations/20261028_dedicated_listing_chat.sql` — installs participant-scoped chat policies and read-state RPC.
6. `src/supabase/migrations/20261029_refresh_inquiry_participant_names_rpc.sql` — aligns participant-name RPC signature and refreshes PostgREST's schema cache.
7. `src/supabase/migrations/20261030_messages_rpc_cache_and_thread_uniqueness.sql` — verifies the read RPC and adds the one-thread-per-renter/listing index when existing data permits. If duplicates exist, this migration preserves them and reports that the index was not added.
8. Review existing duplicate threads using `src/supabase/diagnostics/duplicate_inquiry_threads.sql`. Then run `src/supabase/migrations/20261031_merge_duplicate_inquiry_threads.sql` only after reviewing the output and confirming the intended consolidation. It moves and verifies every message before removing duplicate inquiry rows, in one transaction; it is data-changing.
9. `src/supabase/migrations/20261101_unread_inquiry_message_count.sql` — installs the participant-scoped unread count RPC.
10. `src/supabase/migrations/20261102_location_aware_apartment_search.sql` — installs server-side apartment search.
11. `src/supabase/migrations/20261103_apartment_and_comment_display_names.sql` — installs the scoped display-name RPC.
12. `src/supabase/migrations/20261104_enable_message_realtime.sql` — adds chat messages to the Supabase Realtime publication for prompt unread updates.

Do not apply the legacy `20261020`, `20261021`, or `20261022` scripts on this existing schema path: they target earlier schema generations and overlap the consolidated `20261023` migration. For a new Supabase project, apply `src/supabase/schema.sql` first, then migrations `20261102`, `20261103`, and `20261104` in order. The base schema contains the role, comment, conversation, unread-count, and apartment display-name objects; location search and Realtime publication remain separate. The display-name migration is repeatable and refreshes PostgREST's schema cache.

After migration, verify the role policies and RPCs using the SQL checks in the main README. Also verify that `public.inquiry_messages` appears in the `supabase_realtime` publication. Do not consider deployment complete until the deployed database has been checked; local files cannot prove the remote Supabase state.

## Initial administrator

1. In Supabase Authentication, verify the intended account's UUID and email.
2. Open `src/supabase/operations/promote_initial_admin.sql`, replace both placeholders with those verified values, inspect the resulting script, and run it in SQL Editor as the trusted project owner.
3. Verify the matching `auth.users` and `public.profiles` row. Expected profile values are `role = 'admin'`, `lister_status = 'approved'`, and `is_suspended = false` unless suspension has been intentionally set separately.

Keep this operator-specific promotion script and the account identifiers out of public issue reports and public deployment documentation. Promotion is a trusted database-owner operation; public signup and client metadata cannot grant these privileges.

## Vercel and GitHub

The repository's `vercel.json` selects Angular, builds with `npm run build`, publishes `dist/renthub/browser`, and rewrites non-file paths to Angular's CSR entry document. Real generated files are served before the fallback rewrite. Vercel deployment therefore uses static/CSR delivery; it does not execute `dist/renthub/server/server.mjs` or the Express middleware. Security headers for this deployment are defined in `vercel.json`.

To connect it, push the repository to GitHub, import that repository in Vercel, and leave the root directory at the folder containing `vercel.json`. After Vercel assigns a domain, add the production and preview redirect URLs in Supabase Auth and test deep-link refreshes. The Supabase URL and publishable/anon key currently configured in `src/environments/environment.ts` are public browser settings; confirm they point to the intended project before the first deployment. No Supabase service-role or Vercel secret is required by the frontend build.
