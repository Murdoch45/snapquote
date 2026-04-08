## SnapQuote MVP Build Plan (Next.js + Supabase)

### Summary
- Build a greenfield Next.js App Router + TypeScript web app with TailwindCSS and shadcn/ui, using Supabase for Auth/Postgres/Storage/Realtime.
- Implement full lead intake → AI estimate suggestion → contractor approval/send → customer accept flow, with multi-tenant org security via RLS.
- Implement notifications with Telnyx (SMS) and Resend (email), with graceful no-op when env vars are missing.
- Locked decisions: `Email+Password` auth, OpenAI model default `gpt-4.1-mini`, and backend-enforced `7-day` quote expiry.

### Key Implementation Changes
1. Bootstrap app structure under `/app`, `/lib`, `/components`, and SQL migration at `/supabase/migrations/0001_init.sql`; add shared types and zod schemas for request/response and DB enums.
2. Implement Supabase schema with enums, required tables, indexes, `updated_at` triggers, and RLS helper functions (`is_org_member`, `is_org_owner`) using `auth.uid()`; add policies for all tenant tables plus owner-only team management writes.
3. Add auth + tenancy onboarding: signup/login pages, authenticated app layout guard, first-time org creation flow that creates organization, owner membership, contractor profile, and auto-generated unique public slug (`slugified-name-rand4`).
4. Build public lead form at `/{contractorSlug}` with Google Places autocomplete, services multi-select, photo upload (max 5), and phone/email-at-least-one validation; submit to `POST /api/public/lead-submit` as multipart; store photos in `lead-photos/{orgId}/{leadId}/{uuid}.jpg`.
5. In lead submission route, create lead + customer + photo records, run synchronous AI estimate generation (`/lib/ai/estimate.ts`) with strict JSON zod parsing and fallback wide-range output on failure, then notify contractor and acknowledge customer.
6. Build contractor app pages (`/app`, `/app/leads`, `/app/leads/[id]`, `/app/quotes`, `/app/customers`, `/app/analytics`, `/app/team`, `/app/settings`) with sidebar/topbar, responsive cards/tables, toasts, and non-blocking notification feed; add Realtime subscription for new leads with 10s polling fallback.
7. Implement lead detail quote composer with price slider + numeric input; slider defaults to AI suggestion and supports bounded extension of `±25%` beyond AI range; contractor edits message and sends quote manually only.
8. Implement quote lifecycle APIs and pages: public quote fetch/view/accept endpoints, idempotent viewed tracking, accept endpoint enforcing 7-day validity, lead/quote status transitions, and contractor acceptance notifications.
9. Implement usage enforcement in `/lib/usage.ts` (`SOLO 50+5`, `TEAM 150+5`, `BUSINESS unlimited`), monthly upsert/increment logic, warning threshold at `>=90%`, and send-quote hard block at `> limit+grace` with upgrade CTA banner.
10. Implement team invites for owners with Supabase Admin invite email plus pending invite row for org binding on acceptance; enforce plan member caps (`1/5/10`) on invite and on final membership attachment.
11. Implement settings update API for business name, slug uniqueness checks, and notification toggles; OWNER-only for plan/team management, MEMBER allowed for quote operations and read access.
12. Add analytics queries for last 30 days: total leads, quotes sent, quotes accepted, acceptance rate, avg quote value, avg response time, and chart series (leads over time, quotes over time, acceptance rate over time, services breakdown) using Recharts.
13. Add README with full setup (Supabase project, auth config, migration apply, storage bucket creation, env vars, local run), plus optional seed script for demo org/leads/quotes/customers.

### Public APIs / Interfaces
- `POST /api/public/lead-submit`: multipart form with contractor slug, customer info, address/place/lat/lng, services[], description, photos[]; returns `{ leadId, received: true }`.
- `GET /api/public/quote/[publicId]`: minimal public payload `{ businessName, services, address, price, message, status, sentAt, expiresAt }`.
- `POST /api/public/quote/[publicId]/viewed`: idempotent status/view timestamp update; returns `{ viewed: true }`.
- `POST /api/public/quote/[publicId]/accept`: enforces non-expired and not already accepted; returns `{ accepted: true, acceptedAt }`.
- `POST /api/app/quote/send`: auth required, usage checked, creates quote + event + lead status update, dispatches customer notification.
- `POST /api/app/team/invite`: OWNER only, plan-cap checked, creates pending invite + sends Supabase invite email.
- `POST /api/app/team/remove`: OWNER only, removes member (with owner safety checks).
- `POST /api/app/settings/update`: updates contractor profile, slug (unique), and notification toggles.

### Test Plan
1. Unit tests for zod validation, slug generation uniqueness retries, usage limit math, quote expiry logic, and AI output parser fallback.
2. Integration tests for API handlers with mocked OpenAI/Telnyx/Resend and Supabase test DB: lead submit, quote send, view/accept, invite, settings update, and RLS-protected access.
3. Manual E2E pass for all 12 acceptance criteria: signup→org, slug edit, public lead submit with photos, AI data persisted, lead list/detail visibility, quote compose/send, public quote view/accept, contractor notification, analytics metrics/charts, team invite flow, and monthly limit warning/block behavior.
4. Quality checks: `npm run lint`, `npm run typecheck`, and production build before completion.

### Assumptions and Defaults
- PowerShell on this machine blocks `npm` scripts via policy, so README will instruct `npm.cmd` equivalents on Windows when needed.
- Resend is the implemented email provider; Supabase email sending is not used for app notifications.
- Customer channel preference is `SMS first if phone exists, else email`; contractor notifications follow per-setting toggles.
- `lead-photos` bucket is private; app stores storage paths and generates signed URLs for internal AI/image display where needed.
- Google Maps key is optional in local dev; if absent, address autocomplete degrades to plain text entry and lat/lng can remain null.
- No Stripe billing implementation in MVP; upgrade messaging is UI-only when quote send is blocked by plan limits.
