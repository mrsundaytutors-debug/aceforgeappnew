# Aceforge Student Success System

Next.js 14 (App Router, TypeScript) + Tailwind + Supabase (Postgres, Auth, private Storage, RLS).

## Status (read this first)
Written but **not yet installed, built or run**. Expect to fix small type or query errors on first `npm run typecheck`.
Built: login and password reset, role routing, student dashboard/check-in, tasks and screenshot upload, wallet, rewards and redemption,
staff dashboard, attendance (sessions, verify, absent/excused), review queue, prize approval.
Admin screens (under Manage): students, tutors, classes, daily tasks, rewards catalog, points adjustment, point settings, audit log.
Reports (filters, charts, class comparison, missed tasks, improving students, print) and CSV downloads (attendance, tasks, points, redemptions), class leaderboards with an on/off switch.
Student detail page (attendance, streaks, tasks, points, rewards), linked from the student list, reports, attendance and review screens.
Not built yet: students' own profile/settings page, profile photos, tests, demo seed data.

## Setup
1. Create a Supabase project. In the SQL editor run `supabase/migrations/001_schema.sql`, then `002_hardening.sql`, then `003_reports_leaderboards.sql`, then `004_streak_by_session.sql`, then `005_wallet_view_security.sql`.
2. Copy `.env.example` to `.env.local` and fill in the project URL, anon key and service-role key. The service-role key is used only in server actions that create or reset logins, after an admin check. Never prefix it with `NEXT_PUBLIC_`.
3. `npm install && npm run dev`.
4. First admin: in Supabase Auth, add one user (email + password). Then run in the SQL editor:
   `insert into profiles(id, role, full_name) values ('<that user uuid>', 'admin', 'Academy Owner');`
5. Log in as the admin, open Manage, add classes first, then tutors, students, rewards and tasks.
6. In Supabase Auth settings, set the site URL and password-reset redirect.

## How it stays safe
- Every page and action calls `requireUser(roles)`; RLS enforces the same rules in the database.
- Students cannot write attendance, ledger, redemptions or review fields. All point and stock changes go through SECURITY DEFINER functions with idempotency keys.
- `check_in_code` is hidden from students by column privileges; staff read it through `session_code()`.
- Screenshots live in a private bucket, shown to staff via 60-second signed URLs.

## Deploy
Push to GitHub, import into Vercel, add the two environment variables.

## Tests and demo data
- `npm test` runs 15 app-side unit tests (CSV escaping, date ranges) with plain Node 22.6+, no extra packages. `npm run test:vitest` runs the 21 tests in `tests/` (CSV, date ranges, streaks) once `npm install` has added vitest. All 36 passed when run here (the vitest ones through a small stand-in, since vitest could not be installed offline).
- `npm run test:db` runs `supabase/tests/01_workflows.test.sql` (pgTAP) against the local Supabase stack (`supabase start` first). 57 checks cover check-in, verification, points, review, redemption, privacy between students and classes, streaks and adjustments. **Written but not yet run by the author.** Run them before trusting the database rules.
- `supabase/demo/seed_demo.sql` loads two demo classes, 6 students, a tutor, an admin, two weeks of attendance, tasks, points and rewards. Password for all demo logins: `DemoPass#2026`. Today's class code: `DEMO1234`. `supabase/demo/remove_demo.sql` deletes it all. Use a test project, never your live one.
