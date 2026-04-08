CODEX MASTER PROMPT — BUILD SNAPQUOTE (MVP SaaS, Web App, Next.js + Supabase)

You are Codex acting as a senior full-stack engineer. Build a complete working MVP of “SnapQuote”, an AI-powered quoting + lead intake platform for outdoor service contractors. Output production-quality code, modular files, and clear setup instructions.

IMPORTANT:
- Build a RESPONSIVE WEB APP (no native mobile app).
- Keep UI modern, sleek, minimal, professional (Stripe/Linear vibe).
- Use TailwindCSS + shadcn/ui components.
- Use Next.js (App Router) + TypeScript.
- Use Supabase for Postgres DB, Auth, Storage, Realtime.
- Use OpenAI API for AI estimate generation and quote draft text.
- Support SMS via Telnyx (optional per contractor settings).
- Support Email notifications + quote delivery (optional per contractor settings) using Resend (preferred) OR Supabase email if you decide; pick one and implement.
- Customer-facing pages must be minimal and fast.
- AI NEVER sends quotes automatically. AI suggests; contractor must approve & send.
- Customer does NOT see AI estimate until contractor sends quote link.

Deliver:
1) A fully functioning Next.js codebase
2) Supabase SQL schema + RLS policies
3) Setup docs (README) with environment variables and run steps
4) Seed data script (optional but helpful)
5) Ensure all main flows work end-to-end locally

──────────────────────────────────────────────────────────────────────────────
PRODUCT SUMMARY (WHAT YOU’RE BUILDING)

SnapQuote lets contractors share a public link like:
  https://snapquote.com/{contractorSlug}

Customers fill a simple request form:
- Address (autocomplete)
- Services (multi-select): Landscaping, Lawn Care, Fence, Roofing, Pressure Washing
- Description
- Photos (optional but encouraged; limit 5)
- (Initially collect customer name + phone/email? YES: collect minimal contact on inquiry form)
  Required: customerName + (phone OR email)

After submission:
- Lead is created in DB
- Photos uploaded to Supabase Storage
- Property geo (lat/lng) stored
- AI runs immediately and generates:
  - job summary
  - estimate range (low/high)
  - suggested price
  - draft quote message
- Contractor is notified (SMS/email depending on settings)
- Customer receives instant acknowledgment (SMS/email depending on what they provided)

Contractor workflow:
- Receives SMS/email with link to lead detail page (authenticated)
- Opens lead detail, sees:
  - submitted timestamp + “X minutes ago”
  - customer info
  - address + map preview
  - services selected
  - description
  - photos
  - AI estimate range + suggested price + draft message
- Contractor can adjust final price using:
  - a slider bounded by AI low/high (with ability to extend +/- some %)
  - AND a manual price input
- Contractor can edit the message
- Contractor clicks “Send Quote”
- System creates a Quote record and sends the customer a link:
    https://snapquote.com/q/{quotePublicId}
- Customer opens quote page (no login), sees minimal:
  - contractor business name
  - job title/services + address
  - final price
  - “Accept Quote” button
- On accept:
  - Mark quote accepted
  - Capture acceptance timestamp
  - Notify contractor (SMS/email)
  - Customer sees confirmation message: “Accepted — contractor will contact you shortly.”

Dashboard:
- Must be mobile-first and fast
- Sidebar nav:
  Dashboard
  Leads
  Quotes
  Customers
  Analytics
  Team
  Settings

Analytics (same for all plans; no feature gating):
- Core metrics:
  total leads
  quotes sent
  quotes accepted
  acceptance rate
  avg quote value
  avg response time (lead submitted → quote sent)
- Simple charts:
  leads over time (last 30 days)
  quotes over time
  acceptance rate over time
  services breakdown pie/bar
Keep charts lightweight (use a simple chart lib like recharts).

Plans:
- Solo: 1 user, 50 quotes/month
- Team: up to 5 users, 150 quotes/month
- Business: up to 10 users, unlimited quotes
All features identical; only user count + monthly quote limit differ.
Enforce:
- user invite limit per org plan
- monthly quote sending limit per org plan (soft warning at 90%; optional grace buffer of +5 quotes beyond limit for Solo/Team)
- If limit exceeded beyond grace: disable “Send Quote” and show upgrade CTA (Stripe billing is later; for now just show message).

Notifications:
- Contractor settings:
  - lead notifications: sms on/off, email on/off
  - acceptance notifications: sms on/off, email on/off
- In-dashboard notifications:
  - show a small non-modal toast + a notification bell feed (do NOT block UI with modal popups)
- SMS via Telnyx
- Email via Resend

Slug:
- On signup, auto-generate unique slug like:
    {slugifiedBusinessName}-{random4}
- Contractor can customize slug if available (must be unique).
Public request page uses:
    /{slug}
(no /c prefix visible to customers)

Security / Auth:
- Supabase Auth for users
- Multi-tenant org architecture:
  Organization → Users
- Roles: OWNER, MEMBER
  OWNER: can manage plan settings, invite/remove users, edit org settings
  MEMBER: can view leads/quotes/customers/analytics, can send quotes
- Use Supabase Row Level Security (RLS) to ensure users can only see data belonging to their org.
- Customer public pages must not expose internal data.

──────────────────────────────────────────────────────────────────────────────
TECHNICAL REQUIREMENTS

Frontend:
- Next.js App Router (app/)
- TypeScript
- TailwindCSS
- shadcn/ui (buttons, cards, inputs, dialogs, toasts)
- Responsive layout
- Use server components where useful, but keep forms interactive with client components.

Backend:
- Next.js Route Handlers (app/api/*)
- Use Supabase JS client (server-side with service role key in server routes only)
- AI jobs can run in route handler at submission time (synchronous) for MVP, but structure code so it can be moved to background later.

Storage:
- Supabase Storage bucket for lead photos:
  bucket: lead-photos
  path: {orgId}/{leadId}/{uuid}.jpg

Maps:
- Use Google Places Autocomplete on customer form
- Use Geocoding to store lat/lng
- Show a simple map preview in lead detail (static map image OK)
- Lot size / parcel data: stub the field in schema but don’t require a paid property API for MVP. Add TODO notes.

AI:
- Use OpenAI responses:
  Input includes:
   - services selected
   - address (city/state from google)
   - customer description
   - photo URLs (signed URLs from storage)
  Output JSON:
   {
     "jobSummary": "...",
     "estimateLow": number,
     "estimateHigh": number,
     "suggestedPrice": number,
     "draftMessage": "..."
   }
- Always return range + suggested price.
- Make prompts robust and safe; include instructions:
  - be conservative
  - if insufficient info, widen range
  - if cannot estimate, produce wide range and flag “needs review” in summary text
- Store AI output in DB on the lead record.

Customer messaging:
- On lead submission:
  - Send acknowledgment (SMS if phone provided; else email)
- On quote sent:
  - Send quote link (same channel preference; if both provided, prefer SMS)
- On quote accepted:
  - Optional thank you screen; contractor notified

──────────────────────────────────────────────────────────────────────────────
DATABASE SCHEMA (SUPABASE POSTGRES)

Create SQL migration file(s) in /supabase/migrations/0001_init.sql.

Tables (minimum):

organizations:
- id (uuid pk)
- name (text)
- slug (text unique, nullable)  // org slug is not used publicly; contractor slug is used
- plan (text enum: SOLO, TEAM, BUSINESS)
- created_at

organization_members:
- id (uuid pk)
- org_id (uuid fk organizations)
- user_id (uuid fk auth.users)
- role (text enum: OWNER, MEMBER)
- created_at
Unique(org_id, user_id)

contractor_profile:
- id (uuid pk)
- org_id (uuid fk organizations unique)
- business_name (text)
- public_slug (text unique)  // used for /{slug}
- phone (text nullable)
- email (text nullable)
- notification_lead_sms (bool default true)
- notification_lead_email (bool default false)
- notification_accept_sms (bool default true)
- notification_accept_email (bool default false)
- created_at
- updated_at

leads:
- id (uuid pk)
- org_id (uuid fk organizations)
- contractor_slug_snapshot (text) // for reference
- customer_name (text)
- customer_phone (text nullable)
- customer_email (text nullable)
- address_full (text)
- address_place_id (text nullable)
- lat (double precision nullable)
- lng (double precision nullable)
- services (text[] not null) // multi-select
- description (text nullable)
- status (text enum: NEW, QUOTED, ACCEPTED, ARCHIVED) default NEW
- submitted_at (timestamptz default now())
- ai_job_summary (text nullable)
- ai_estimate_low (numeric nullable)
- ai_estimate_high (numeric nullable)
- ai_suggested_price (numeric nullable)
- ai_draft_message (text nullable)
- ai_generated_at (timestamptz nullable)

lead_photos:
- id (uuid pk)
- lead_id (uuid fk leads on delete cascade)
- org_id (uuid fk organizations)
- storage_path (text)
- public_url (text) // or store path and generate signed url
- created_at

quotes:
- id (uuid pk)
- org_id (uuid fk organizations)
- lead_id (uuid fk leads unique)
- public_id (text unique) // short id for /q/{public_id}
- price (numeric not null)
- message (text not null)
- status (text enum: SENT, VIEWED, ACCEPTED, EXPIRED) default SENT
- sent_at (timestamptz default now())
- viewed_at (timestamptz nullable)
- accepted_at (timestamptz nullable)

quote_events (optional but helpful for analytics):
- id
- org_id
- quote_id
- event_type (SENT, VIEWED, ACCEPTED)
- created_at

customers (simple):
- id (uuid pk)
- org_id
- name
- phone
- email
- created_at
- updated_at

Settings / usage:
org_usage_monthly:
- id
- org_id
- month (date, first day of month)
- quotes_sent_count (int default 0)
- grace_used (bool default false)
Unique(org_id, month)

RLS:
- organizations: members can select org row if they’re in organization_members
- organization_members: members can select rows for their org; only OWNER can insert/delete/invite
- contractor_profile/leads/lead_photos/quotes/customers/org_usage_monthly: members can CRUD only where org_id matches their membership.

Provide RLS policies using auth.uid().

──────────────────────────────────────────────────────────────────────────────
APP PAGES / ROUTES (NEXT.JS)

Public:
- /{contractorSlug}                 -> customer request form page (public)
- /q/[publicId]                     -> quote page (public)
- / (marketing homepage, minimal)
- /login, /signup                   -> auth pages

Authenticated app:
- /app                              -> dashboard home
- /app/leads                         -> lead list
- /app/leads/[id]                    -> lead detail + send quote
- /app/quotes                        -> quote list
- /app/customers                     -> customers list
- /app/analytics                     -> charts + metrics
- /app/team                          -> invite/remove members (OWNER)
- /app/settings                      -> business info, slug, notifications, plan display

API routes (app/api):
- POST /api/public/lead-submit       -> customer submits lead (public)
- GET  /api/public/quote/[publicId]  -> fetch quote public data
- POST /api/public/quote/[publicId]/viewed -> mark viewed
- POST /api/public/quote/[publicId]/accept -> accept quote
- POST /api/app/quote/send           -> send quote (auth)
- POST /api/app/team/invite          -> invite (auth OWNER)
- POST /api/app/team/remove          -> remove (auth OWNER)
- POST /api/app/settings/update      -> update contractor profile/slug/notifications

Note: Keep public endpoints locked down and only return minimal data.

──────────────────────────────────────────────────────────────────────────────
QUOTE LIMIT ENFORCEMENT

Implement a function:
- getMonthlyUsage(orgId)
- incrementUsageOnQuoteSend(orgId)

Logic:
- Solo: limit 50 + grace 5
- Team: limit 150 + grace 5
- Business: unlimited

Behavior:
- At >= 90% usage: show warning banner in app
- At > limit+grace: disable “Send Quote” and show “Upgrade to continue”
(No Stripe implementation needed now.)

──────────────────────────────────────────────────────────────────────────────
UI REQUIREMENTS

Design:
- Minimal, modern, sleek
- Primary: Electric Blue (#2563EB)
- Accent: Cyan (#06B6D4)
- Neutrals: Gray/Black (#111827, #F9FAFB)
- Use Inter font

Dashboard:
- Sidebar navigation
- Lead list cards show:
  - service(s)
  - address
  - submitted time (relative)
  - photo count badge
  - AI estimate range (if ready)
- No disruptive modal popups
- Use toast notifications for “New lead received” while on dashboard (non-blocking)

Lead detail:
- Top: title + submitted time (“Submitted 4 minutes ago”)
- Sections: Customer, Property, Services, Description, Photos, AI Estimate
- AI Estimate shows:
  - range low/high
  - suggested price
  - job summary
  - draft message
- Price controls:
  - slider + numeric input
  - default to suggested price
- “Send Quote” button
- “Preview customer quote page” optional

Quote page (public):
- Minimal:
  - contractor name
  - services summary + address
  - price (large)
  - accept button
  - “Quote valid for 7 days”
- On load, call /viewed endpoint once (idempotent) to mark viewed.

Customer request form page:
- Title: {Business Name} — Request a Quote
- Fields:
  - Address autocomplete (required)
  - Services multi-select (checkboxes) (required)
  - Description (optional)
  - Photo upload (up to 5) (optional but show “Add photos for more accurate estimate”)
  - Customer name (required)
  - Phone (optional)
  - Email (optional)
  - Require at least one of phone/email
- Submit button: “Get My Quote”
- After submit:
  - show confirmation: “Request sent — you’ll receive your quote shortly.”

──────────────────────────────────────────────────────────────────────────────
AI IMPLEMENTATION DETAILS

Create /lib/ai/estimate.ts with:
- buildPrompt(lead, photosSignedUrls)
- callOpenAI(prompt)
- parse/validate JSON output (zod)
- fallback logic if parsing fails: store wide range and basic message

OpenAI prompt guidance:
- Provide range + suggested price
- Be conservative; widen range if unclear
- Use service types + typical pricing heuristics (very rough; DO NOT claim certainty)
- No mention of SnapQuote to the customer. Draft message signs as contractor business name.

──────────────────────────────────────────────────────────────────────────────
NOTIFICATIONS

Implement /lib/notify.ts:
- sendSms(to, body) via Telnyx (if env configured)
- sendEmail(to, subject, html/text) via Resend (if env configured)
- pick channel:
  - For customer messages: if phone present -> SMS else email
  - For contractor messages: based on settings toggles

Contractor receives on lead creation:
- “New quote request: {services} at {address}. Open: {app lead link}”
Contractor receives on quote accepted:
- “Quote accepted: {services} at {address}. View: {app quote link}”

Customer receives on lead submit:
- “We received your request. You’ll get your estimate shortly. — {Business}”
Customer receives on quote sent:
- “{Business} sent your estimate. View: {quote link}”

──────────────────────────────────────────────────────────────────────────────
TEAM (INVITES)

For MVP, implement team invites via email “magic link”:
- OWNER enters email to invite
- Create a pending invite row OR use Supabase Admin invite API if available
- Invited user signs up / logs in, gets attached to org as MEMBER
Keep it simple but functional.

Enforce user count by plan:
- Solo max 1 member
- Team max 5
- Business max 10

──────────────────────────────────────────────────────────────────────────────
FILES / PROJECT STRUCTURE

Use this structure (suggested):

/app
  /(public)
    page.tsx
    login/page.tsx
    signup/page.tsx
    [contractorSlug]/page.tsx
    q/[publicId]/page.tsx
  /app
    layout.tsx
    page.tsx
    leads/page.tsx
    leads/[id]/page.tsx
    quotes/page.tsx
    customers/page.tsx
    analytics/page.tsx
    team/page.tsx
    settings/page.tsx
  /api
    public/lead-submit/route.ts
    public/quote/[publicId]/route.ts
    public/quote/[publicId]/viewed/route.ts
    public/quote/[publicId]/accept/route.ts
    app/quote/send/route.ts
    app/team/invite/route.ts
    app/team/remove/route.ts
    app/settings/update/route.ts

/lib
  supabase/
    server.ts
    client.ts
    admin.ts
  auth/
    requireAuth.ts
    requireRole.ts
  ai/
    estimate.ts
  notify.ts
  usage.ts
  utils.ts
  validations.ts

/components
  ui/ (shadcn)
  LeadCard.tsx
  LeadList.tsx
  PriceSlider.tsx
  PhotoUploader.tsx
  Sidebar.tsx
  TopBar.tsx
  Charts.tsx
  UpgradeBanner.tsx

/supabase/migrations/0001_init.sql

README.md with setup instructions.

──────────────────────────────────────────────────────────────────────────────
SETUP INSTRUCTIONS (README MUST INCLUDE)

- How to create Supabase project
- Apply migrations
- Configure Auth (email)
- Create storage bucket “lead-photos”
- Configure RLS
- Environment variables (.env.local):

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

OPENAI_API_KEY=

GOOGLE_MAPS_API_KEY=

TELNYX_API_KEY=

RESEND_API_KEY=
RESEND_FROM_EMAIL=

NEXT_PUBLIC_APP_URL=http://localhost:3000

Also include how to run:
npm install
npm run dev

──────────────────────────────────────────────────────────────────────────────
ACCEPTANCE CRITERIA (MUST WORK)

1) Contractor can sign up, create org, get auto slug, access /app dashboard
2) Contractor can customize slug (if available)
3) Public request form at /{slug} creates lead with photos, validates phone/email
4) AI estimate runs and stores range/suggested/message on lead
5) Contractor sees lead in /app/leads and can open /app/leads/[id]
6) Contractor can adjust price via slider/input and edit message
7) Contractor can send quote → customer receives link
8) Public quote page loads, marks viewed, can accept quote
9) Contractor receives acceptance notification (if enabled)
10) Analytics page shows metrics + charts (simple but real)
11) Team page allows owner to invite member; enforce plan user limits
12) Quote sending enforces monthly quote limits + warning banners

──────────────────────────────────────────────────────────────────────────────
IMPLEMENTATION NOTES

- Use zod for validation.
- Use date-fns for relative time formatting.
- Use recharts for analytics charts.
- Use Supabase Realtime to update leads list automatically when new lead arrives (non-blocking). If Realtime is too complex, poll every 10s as fallback.
- Keep public pages fast, minimal.
- Ensure no “Request Changes” button on quote page; only “Accept Quote”.
- Keep contractor branding minimal: show business name only.

Now build the entire project, generating all files, SQL migration, and README.