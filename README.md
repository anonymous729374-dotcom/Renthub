# RentHub

RentHub is a standalone Angular 22 apartment marketplace. Visitors can search published listings, filter and sort results, view property details, save favourites, ask questions, and read or post comments. Authenticated users can create listings, preview them before submission, edit their own listings, and review their inquiries.

## Features

- Supabase email/password signup, login, session restoration, logout, self-editable profiles, and protected routes.
- Every public signup starts as a Normal User / Renter. Users may request Apartment Lister approval from Profile. Admin is assigned only through a trusted database-owner process.
- Published apartment discovery with city, rent, bedrooms, furnished, amenity, sorting, and pagination filters.
- Responsive listing cards, featured results, empty/loading/error states, image fallbacks, and favourite actions.
- Apartment details with photos, rental preferences, amenities, inquiry form, comments, and one-level replies.
- Authenticated listing creation, validation, photo URL entry, preview-and-submit workflow, owner listing dashboard, and owner-only edit/delete controls.
- Favourites, renter inquiry history with landlord replies, and a landlord inbox for responding to inquiries, all backed by Supabase.

## Stack and architecture

- Angular 22 standalone components, lazy routes, Angular SSR, and client hydration.
- Reactive forms for authentication and apartment submission; template forms for inquiry/comment interactions.
- `ApartmentService` delegates persistence to the `ApartmentRepository` abstraction and its Supabase implementation.
- Feature folders live under `src/app/features`; cross-cutting auth/config lives under `src/app/core`; reusable UI lives under `src/app/shared`.
- Supabase Row Level Security derives owners, renters, and commenters from `auth.uid()`.

## Prerequisites and local setup

1. Install Node.js compatible with Angular 22 and npm 11.
2. From this directory, install dependencies: `npm install`.
3. Configure `src/environments/environment.ts` with the Supabase project URL and publishable/anon key. Never use a service-role key or database password in the frontend. A safe template is provided in `src/environments/environment.example.ts`.
4. Apply the database setup using the ordered instructions in [Supabase deployment](docs/supabase-deployment.md). The general migrations no longer contain a specific administrator's identity. Promote the first admin separately using the reviewed operator template at `src/supabase/operations/promote_initial_admin.sql`.
5. Start the app with `npm start`, then open `http://localhost:4200/`.

Email confirmation settings are controlled by Supabase Auth. Signup follows the actual Auth response: a returned session is initialized and the user is signed in; a returned user without a session is not treated as authenticated and receives guidance to sign in when ready (confirm email first only if that Supabase setting is enabled). RentHub does not automatically retry signup or resend confirmation emails.

## Commands

```bash
npm start                 # Angular development server
npm run build             # production browser and SSR build
npm test -- --watch=false # Vitest unit tests through Angular CLI
```

There is no lint script currently configured in `package.json`; TypeScript/template validation is performed by the Angular build.

## Database and security

Application roles are persisted in `public.profiles`; they are not read from user-editable Auth metadata. An `auth.users` trigger creates each account as `role='user'`, `lister_status='none'`. Lister requests enter `pending` and can be approved/rejected only by admins through a restricted database function. Profile RLS and column grants prevent browser clients from changing roles, approval status, or suspension. Apartment writes require an approved lister (or admin); listers are restricted to their own apartments, while active admins can manage all apartments. Inquiry, favourite, comment, and admin policies are enforced by RLS. The existing-project migration replaces policies on the RentHub application tables with these role-aware policies so an older permissive policy cannot OR-bypass them; review this if you have custom policies on these tables.

`20261026_comments_rls_no_recursion.sql` changes policies on `public.comments` only. It removes any existing comments policies and recreates the four RentHub read/insert/update/delete rules. Reply-parent validation uses `public.comment_parent_is_valid(...)`, a `SECURITY DEFINER` helper with an empty search path and `row_security=off`; it can only be executed by authenticated users and returns true only for an active user, a published apartment, and a top-level parent in that same apartment. It does not alter the comments table or its rows. On SQL Editor, run the entire migration after the role migration. It is repeatable. If you maintain custom comments policies, review/re-add their intended behavior carefully after applying.

To verify the deployed definitions, run:

```sql
SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'comments'
ORDER BY cmd, policyname;

SELECT p.proname, p.prosecdef, p.proconfig, p.proacl
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'comment_parent_is_valid';
```

Expect four `renthub_comments_*` policies and a `SECURITY DEFINER` function with `search_path=""` and `row_security=off`. For a SQL Editor smoke test, replace the four UUID placeholders and run this as one transaction. It sets the authenticated role/JWT claims so RLS is exercised, creates a top-level comment and reply, asserts that forged ownership and cross-apartment replies are denied, checks private-apartment comments are not visible to a non-owner, then rolls the test rows back:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '<TEST_USER_UUID>', true);
SELECT set_config('request.jwt.claims', '{"sub":"<TEST_USER_UUID>","role":"authenticated"}', true);

-- Reading published apartment comments should return visible rows.
SELECT id, apartment_id, user_id, parent_comment_id, comment_text, created_at
FROM public.comments
WHERE apartment_id = '<PUBLISHED_APARTMENT_UUID>'::uuid
ORDER BY created_at;

DO $$
DECLARE
    v_parent UUID;
    v_affected INTEGER;
BEGIN
    INSERT INTO public.comments (apartment_id, user_id, parent_comment_id, comment_text)
    VALUES ('<PUBLISHED_APARTMENT_UUID>'::uuid, auth.uid(), NULL, 'RLS smoke test parent')
    RETURNING id INTO v_parent;

    INSERT INTO public.comments (apartment_id, user_id, parent_comment_id, comment_text)
    VALUES ('<PUBLISHED_APARTMENT_UUID>'::uuid, auth.uid(), v_parent, 'RLS smoke test reply');

    BEGIN
        INSERT INTO public.comments (apartment_id, user_id, parent_comment_id, comment_text)
        VALUES ('<PUBLISHED_APARTMENT_UUID>'::uuid, '<OTHER_USER_UUID>'::uuid, NULL, 'forged author');
        RAISE EXCEPTION 'FAIL: forged comment owner was accepted';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'PASS: forged comment owner denied';
    END;

    BEGIN
        INSERT INTO public.comments (apartment_id, user_id, parent_comment_id, comment_text)
        VALUES ('<OTHER_PUBLISHED_APARTMENT_UUID>'::uuid, auth.uid(), v_parent, 'cross-apartment reply');
        RAISE EXCEPTION 'FAIL: cross-apartment reply was accepted';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'PASS: cross-apartment reply denied';
    END;

    UPDATE public.comments
    SET comment_text = 'unauthorized edit attempt'
    WHERE id = '<OTHER_USERS_COMMENT_UUID>'::uuid;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 0 THEN RAISE EXCEPTION 'FAIL: another user comment was updated'; END IF;

    DELETE FROM public.comments
    WHERE id = '<OTHER_USERS_COMMENT_UUID>'::uuid;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 0 THEN RAISE EXCEPTION 'FAIL: another user comment was deleted'; END IF;
END;
$$;

-- Use a private apartment owned by someone else; expected visible count is 0.
SELECT count(*) AS expected_zero
FROM public.comments
WHERE apartment_id = '<PRIVATE_OTHER_OWNED_APARTMENT_UUID>'::uuid;

ROLLBACK;
```

The supplied user must be an active test account with a profile; both apartment IDs for inserts must be published. The private apartment must belong to another account. SQL Editor's normal owner role bypasses RLS, so the `SET LOCAL ROLE` and JWT claims are essential; rollback ensures the smoke-test comments are not retained.

To promote the first administrator, verify that account's UUID and email in Supabase Authentication, replace both placeholders in `src/supabase/operations/promote_initial_admin.sql`, and run it in Supabase SQL Editor as the trusted project owner. The script checks the exact pair and aborts transactionally if it does not match. It does not expose an admin endpoint or use Auth metadata. Do not run it from the browser or with a service-role key.

Verify the persisted assignment in SQL Editor:

```sql
SELECT u.id, lower(u.email) AS email, p.role, p.lister_status, p.is_suspended
FROM auth.users AS u
JOIN public.profiles AS p ON p.id = u.id
WHERE u.id = '<VERIFIED_AUTH_USER_UUID>'
  AND lower(u.email) = lower('<VERIFIED_AUTH_EMAIL>');
```

Expected values are `role=admin`, `lister_status=approved`, and `is_suspended=false`. Then sign out/in in RentHub and verify the Admin link, `/admin`, and its user/listing data load. Verify deployed RLS policies with `SELECT tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename IN ('profiles','apartments','favourites','inquiries','comments') ORDER BY tablename,policyname;`. Do not consider the account provisioned until this query and the authenticated app checks succeed.

Never expose a service-role key in the client. Account suspension is enforced at the RentHub profile/RLS layer; it does not invoke Supabase Auth's separate ban API.

## Main workflows

- Browse `/` and use the filters, sort controls, pagination, and favourite buttons.
- Open a card to view details, save the apartment, send an inquiry, or participate in comments and replies.
- Sign up normally as a renter. Use **Become a Lister** in the shared header or **Profile** to submit an application and wait for an administrator to approve it; pending requests remain visibly marked in the header.
- Approved listers choose **List an Apartment** to complete the validated form. Normal users and pending applicants are redirected to Profile; RLS also blocks unauthorized listing writes.
- Admins use **Admin** in the same shared header/layout to review applications, view/suspend/reactivate users, and view/edit/remove all listings.
- Use **My listings** to find published listings, drafts, and rented properties; editing and deletion are limited to their owner by both the UI and RLS.
- Use **Preview** to store the current form snapshot in browser session storage, review it, return to edit, or confirm one final submission.
- Owners can use **Edit listing** on their own details page. The database remains authoritative if a stale or unauthorized URL is used.
- Signed-in renters can use **My inquiries** to see their messages, statuses, and landlord responses. Owners see inquiries for their listings on the same page and can send or update a response.

## Tests

The test suite uses standalone Angular testing APIs and in-memory fakes; it does not require Supabase credentials. It covers the root navigation boundary, auth session restoration and renter-only signup metadata, renter/lister/admin route authorization, apartment-service repository delegation, home-page page reset on filter changes, and apartment-form validation/preview behavior.

## Manual renter/lister/admin verification

After applying the schema/migrations and configuring Supabase email confirmation as desired:

1. Create a renter account; confirm email if required and sign in. Confirm the profile role is Normal User / Renter.
2. Verify renter navigation (Home, Favourites, My Inquiries, Profile), save a published listing, submit an inquiry, and add a comment.
3. Visit `/apartments/new` as that renter; it should route to Profile. Submit a lister application and verify listing access remains blocked while pending.
4. Bootstrap an admin using the trusted SQL step above; approve the pending application from **Admin**. The lister signs in again and should now create/publish a listing.
5. Sign in as the renter, open the lister's listing, and submit an inquiry.
6. Sign in as the lister; Received Inquiries should show only owned-listing inquiries. Respond, then sign in as the renter and verify response/status.
7. As admin, edit/remove a listing, reject another application, and suspend/reactivate a non-admin account. Verify suspended access is blocked by app guards and RLS.
8. Attempt cross-owner listing edits and private inquiry reads using direct URLs/API requests; RLS should deny them. Confirm all roles use the same shared header/layout.

## Deployment

The repository includes `vercel.json` for GitHub-connected Vercel deployment. Vercel builds the Angular app and publishes `dist/renthub/browser`; the SPA rewrite serves Angular's client-rendered shell for deep links, while prerendered static files remain available. The current Vercel setup is static/CSR delivery, so the generated Node SSR server bundle is not hosted. This preserves the application's browser-side Supabase workflows and role guards.

Before the first production deployment:

1. Push the repository to GitHub and import it into Vercel with the project root set to this directory. Keep the detected Angular framework, build command `npm run build`, and output directory `dist/renthub/browser`.
2. Check that the public Supabase URL and publishable/anon key in `src/environments/environment.ts` belong to the intended production project. These values are expected to be present in browser bundles; never substitute a service-role key or database password.
3. Apply and verify the required SQL setup using [docs/supabase-deployment.md](docs/supabase-deployment.md).
4. In Supabase Auth URL configuration, set the Vercel production origin as the Site URL and add the production and preview callback URLs required by the app's password/email-confirmation flow. Update these after Vercel assigns the final domain.
5. After deployment, directly open and refresh `/`, `/apartments/<id>`, `/login`, `/profile`, and `/messages`; verify static assets load, protected routes wait for auth initialization, and browser console/network logs contain no CSP, CORS, or Supabase errors.

No deployment was performed from this workspace. The repository URL, deployed URL, and demo credentials were not supplied, so they are intentionally not invented here:

- GitHub repository: **[provide repository URL]**
- Deployed application: **[provide verified deployment URL]**
- Demo credentials: **[provide only if safe and available]**

## Known limitations

- Photos are accepted as public URLs; Supabase Storage upload is not implemented.
- Apartment ratings are not implemented; comments are discussion only and no rating control is displayed.
- RentHub suspension blocks protected application/API actions through RLS but does not use Supabase Auth's separate account-ban feature.
- Live end-to-end verification requires a configured Supabase project, migrations, a trusted admin bootstrap, and confirmed test accounts.
