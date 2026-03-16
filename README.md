# SnapQuote MVP

SnapQuote is an AI-assisted quoting and lead intake platform for outdoor service contractors. This project is a responsive web app built with Next.js App Router, TypeScript, TailwindCSS + shadcn-style UI components, Supabase, OpenAI, Twilio, and Resend.

## Stack

- Next.js (App Router) + TypeScript
- TailwindCSS + reusable UI components in `components/ui`
- Supabase (Postgres, Auth, Storage, Realtime)
- OpenAI Responses API (`gpt-4.1-mini` default)
- Twilio (SMS notifications)
- Resend (email notifications)
- Recharts (analytics charts)
- Zod (validation)

## Features Implemented

- Public contractor request page at `/{contractorSlug}`
- Lead submission with address/services/description/photos/contact validation
- AI estimate generation (range + suggested price + draft message) on lead creation
- Contractor dashboard (`/app`) with leads, quotes, customers, analytics, team, settings
- Manual quote approval and send flow only (AI never auto-sends)
- Public quote page at `/q/[publicId]` with viewed + accept lifecycle
- Team invite/remove (owner only) with plan seat enforcement
- Monthly quote usage enforcement with warning/upgrade messaging
- Supabase RLS-based multi-tenant org isolation

## Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

RESEND_API_KEY=
RESEND_FROM_EMAIL=

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Notes:
- Twilio and Resend are optional. If missing, notifications no-op.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is required for the public address field because leads must be submitted from a Google Places selection.

## Supabase Setup

1. Create a new Supabase project.
2. Enable Email auth in Supabase Auth.
3. Apply migration:
   - Use Supabase SQL editor and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), or
   - Use CLI:
     ```bash
     npx supabase link --project-ref <project-ref>
     npx supabase db push
     ```
4. Confirm storage bucket `lead-photos` exists (migration inserts it).
5. Ensure RLS is enabled (migration handles this).
6. In Auth settings, set Site URL to `http://localhost:3000` for local.

## Install & Run

```bash
npm install
npm run dev
```

If PowerShell script policy blocks `npm`, use:

```bash
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:3000`.

## Auth / Onboarding Flow

- Sign up at `/signup` with business name.
- The app creates:
  - organization (default plan `SOLO`)
  - owner membership
  - contractor profile
  - unique public slug (`business-name-xxxx`)
- Dashboard available at `/app`.

## Public + Quote API Endpoints

- `POST /api/public/lead-submit`
- `GET /api/public/quote/[publicId]`
- `POST /api/public/quote/[publicId]/viewed`
- `POST /api/public/quote/[publicId]/accept`
- `POST /api/app/quote/send`
- `POST /api/app/team/invite`
- `POST /api/app/team/remove`
- `POST /api/app/settings/update`

## Usage Limits

- SOLO: 50 quotes/month (+5 grace)
- TEAM: 150 quotes/month (+5 grace)
- BUSINESS: unlimited

Behavior:
- Warning banner at `>= 90%` of plan limit.
- Send quote blocked when over `limit + grace`.

## Optional Seed Data

Run:

```bash
npx tsx scripts/seed.ts
```

Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Testing & Quality

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Project Structure

```text
app/
  (public)/
  app/
  api/
components/
  ui/
lib/
  ai/
  auth/
  supabase/
supabase/migrations/0001_init.sql
scripts/seed.ts
tests/
```

## MVP Notes / TODO

- Lot-size/parcel data is stubbed in schema (`leads.parcel_lot_size_sqft`) for future integration.
- Notification bell/feed UI is lightweight in MVP; can be extended with persistent notification table.
- Realtime is implemented for leads list with polling fallback.
