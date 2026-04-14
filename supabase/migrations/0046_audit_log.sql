-- Audit log for sensitive operations.
-- Captures: account deletion, plan changes, team member removal,
-- settings changes, and any other operation worth a paper trail.
-- Append-only — no UPDATE or DELETE policies. Inserts are service-role
-- only (RLS enabled, no policies for inserts means only service_role
-- bypasses RLS). Members can read their org's audit history.

create table if not exists public.audit_log (
  id          uuid        default gen_random_uuid() primary key,
  org_id      uuid        not null references public.organizations(id) on delete cascade,
  actor_user_id uuid      references auth.users(id) on delete set null,
  actor_email text,
  action      text        not null,
  target_type text,
  target_id   text,
  metadata    jsonb       default '{}'::jsonb,
  ip_address  text,
  created_at  timestamptz not null default now()
);

create index if not exists audit_log_org_created_idx
  on public.audit_log (org_id, created_at desc);

create index if not exists audit_log_org_action_idx
  on public.audit_log (org_id, action);

alter table public.audit_log enable row level security;

-- Members can read their own org's audit log.
create policy "Members can read own org audit log"
  on public.audit_log for select
  using (
    org_id in (
      select om.org_id from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

-- Optional: also allow trial expiration tracking on organizations so
-- the trial-expired cron can mark notified orgs without re-sending.
alter table public.organizations
  add column if not exists trial_ended_notified_at timestamptz;

-- Trial-expired trial-ended-notified-at index for cron lookup.
create index if not exists organizations_trial_ended_notified_idx
  on public.organizations (trial_ended_notified_at)
  where trial_ended_notified_at is null;

-- Contractor email verification: store hash + target + expiry on the
-- profile so we can verify out-of-band before treating the email as
-- confirmed. The email_verified column tracks the current state.
alter table public.contractor_profile
  add column if not exists email_verified boolean not null default false,
  add column if not exists email_verification_token_hash text,
  add column if not exists email_verification_target text,
  add column if not exists email_verification_expires_at timestamptz;
