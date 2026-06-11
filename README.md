# Agency Desk

Production-minded MVP CRM and project manager for marketing agencies. Built with Next.js App Router, TypeScript, Tailwind, Supabase Auth/Postgres, and cookie-based Supabase SSR.

## Included

- Email magic-link authentication and agency-scoped RLS
- Client workspaces with default/custom task lists, tasks, comments, dossier, onboarding, and activity
- My Work task queue with filters
- Recurring task rules and a protected daily cron route
- Creative Master with generated ad names, launch-date alerts, and creator assignments
- Tokenized onboarding and external creator portals isolated from the agency dashboard

## Setup

1. Create a Supabase project.
2. Run [`supabase/setup.sql`](supabase/setup.sql) once in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` and fill in the values.
4. Set the Supabase Auth site URL to `NEXT_PUBLIC_APP_URL` and allow `/auth/callback`.
5. Install and start:

```bash
npm install
npm run dev
```

The service-role key is only imported by `server-only` modules used for cron and validated public-token flows. Never prefix it with `NEXT_PUBLIC_`.

`setup.sql` is intentionally destructive for clean setup: it deletes and recreates only Agency Desk tables/functions in the `public` schema. It does not delete Supabase Auth users.

## Signup And Team Invitations

The first magic-link login automatically creates an agency and makes the user its owner. No manual SQL bootstrap is required.

Owners and admins create teammate invitations from Settings and share the generated invite link. The invitee requests their secure magic link from that page. Invited users can also use the normal login page with the invited email; either path joins the existing agency instead of creating a new one.

Internal reads use the signed-in SSR client and RLS. Internal mutations use server actions and recheck `agency_id`. Public portal mutations use the service-role client only after validating the supplied token and its owner.

## Recurring Task Cron

`GET /api/cron/recurring-tasks` requires:

```text
Authorization: Bearer <CRON_SECRET>
```

The route generates at most one due instance per rule per run and advances `next_run_at`; it does not pre-generate future years. `vercel.json` schedules it daily at 06:00 UTC.

## Verification

```bash
npm run lint
npm run build
```
