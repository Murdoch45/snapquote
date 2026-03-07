-- SnapQuote MVP initial schema
create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'org_plan') then
    create type org_plan as enum ('SOLO', 'TEAM', 'BUSINESS');
  end if;
  if not exists (select 1 from pg_type where typname = 'member_role') then
    create type member_role as enum ('OWNER', 'MEMBER');
  end if;
  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type lead_status as enum ('NEW', 'QUOTED', 'ACCEPTED', 'ARCHIVED');
  end if;
  if not exists (select 1 from pg_type where typname = 'quote_status') then
    create type quote_status as enum ('SENT', 'VIEWED', 'ACCEPTED', 'EXPIRED');
  end if;
  if not exists (select 1 from pg_type where typname = 'quote_event_type') then
    create type quote_event_type as enum ('SENT', 'VIEWED', 'ACCEPTED');
  end if;
  if not exists (select 1 from pg_type where typname = 'invite_status') then
    create type invite_status as enum ('PENDING', 'ACCEPTED', 'REVOKED');
  end if;
end
$$;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  plan org_plan not null default 'SOLO',
  created_at timestamptz not null default now()
);

create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'MEMBER',
  created_at timestamptz not null default now(),
  unique(org_id, user_id)
);

create table if not exists contractor_profile (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references organizations(id) on delete cascade,
  business_name text not null,
  public_slug text not null unique,
  phone text,
  email text,
  notification_lead_sms boolean not null default true,
  notification_lead_email boolean not null default false,
  notification_accept_sms boolean not null default true,
  notification_accept_email boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contractor_slug_snapshot text not null,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  address_full text not null,
  address_place_id text,
  lat double precision,
  lng double precision,
  parcel_lot_size_sqft numeric,
  services text[] not null,
  description text,
  status lead_status not null default 'NEW',
  submitted_at timestamptz not null default now(),
  ai_job_summary text,
  ai_estimate_low numeric,
  ai_estimate_high numeric,
  ai_suggested_price numeric,
  ai_draft_message text,
  ai_generated_at timestamptz
);

create table if not exists lead_photos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  lead_id uuid not null unique references leads(id) on delete cascade,
  public_id text not null unique,
  price numeric not null,
  message text not null,
  status quote_status not null default 'SENT',
  sent_at timestamptz not null default now(),
  viewed_at timestamptz,
  accepted_at timestamptz
);

create table if not exists quote_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  event_type quote_event_type not null,
  created_at timestamptz not null default now()
);

create table if not exists org_usage_monthly (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  month date not null,
  quotes_sent_count integer not null default 0,
  grace_used boolean not null default false,
  created_at timestamptz not null default now(),
  unique(org_id, month)
);

create table if not exists pending_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role member_role not null default 'MEMBER',
  status invite_status not null default 'PENDING',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_organization_members_user_id on organization_members(user_id);
create index if not exists idx_contractor_profile_public_slug on contractor_profile(public_slug);
create index if not exists idx_leads_org_submitted_at on leads(org_id, submitted_at desc);
create index if not exists idx_lead_photos_org_id on lead_photos(org_id);
create index if not exists idx_quotes_org_sent_at on quotes(org_id, sent_at desc);
create index if not exists idx_quotes_public_id on quotes(public_id);
create index if not exists idx_customers_org on customers(org_id);
create index if not exists idx_pending_invites_org on pending_invites(org_id);
create index if not exists idx_pending_invites_email on pending_invites(lower(email));

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_contractor_profile on contractor_profile;
create trigger set_updated_at_contractor_profile
before update on contractor_profile
for each row
execute procedure set_updated_at();

drop trigger if exists set_updated_at_customers on customers;
create trigger set_updated_at_customers
before update on customers
for each row
execute procedure set_updated_at();

drop trigger if exists set_updated_at_pending_invites on pending_invites;
create trigger set_updated_at_pending_invites
before update on pending_invites
for each row
execute procedure set_updated_at();

create or replace function is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from organization_members om
    where om.org_id = target_org_id
      and om.user_id = auth.uid()
  );
$$;

create or replace function is_org_owner(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from organization_members om
    where om.org_id = target_org_id
      and om.user_id = auth.uid()
      and om.role = 'OWNER'
  );
$$;

create or replace function storage_org_id_from_path(path text)
returns uuid
language sql
immutable
as $$
  select nullif(split_part(path, '/', 1), '')::uuid;
$$;

-- Invite auto-attach: when a user account is created and email matches pending invite.
create or replace function handle_auth_user_pending_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into organization_members (org_id, user_id, role)
  select pi.org_id, new.id, pi.role
  from pending_invites pi
  join organizations o on o.id = pi.org_id
  where lower(pi.email) = lower(new.email)
    and pi.status = 'PENDING'
    and (
      select count(*)
      from organization_members om
      where om.org_id = pi.org_id
    ) <
    case
      when o.plan = 'SOLO' then 1
      when o.plan = 'TEAM' then 5
      else 10
    end
  on conflict (org_id, user_id) do nothing;

  update pending_invites
  set status = 'ACCEPTED'
  where lower(email) = lower(new.email)
    and status = 'PENDING'
    and exists (
      select 1
      from organization_members om
      where om.org_id = pending_invites.org_id
        and om.user_id = new.id
    );

  update pending_invites pi
  set status = 'REVOKED'
  from organizations o
  where lower(pi.email) = lower(new.email)
    and pi.status = 'PENDING'
    and o.id = pi.org_id
    and (
      select count(*)
      from organization_members om
      where om.org_id = pi.org_id
    ) >=
    case
      when o.plan = 'SOLO' then 1
      when o.plan = 'TEAM' then 5
      else 10
    end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_attach_invites on auth.users;
create trigger on_auth_user_created_attach_invites
after insert on auth.users
for each row execute procedure handle_auth_user_pending_invites();

alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table contractor_profile enable row level security;
alter table leads enable row level security;
alter table lead_photos enable row level security;
alter table quotes enable row level security;
alter table quote_events enable row level security;
alter table customers enable row level security;
alter table org_usage_monthly enable row level security;
alter table pending_invites enable row level security;

drop policy if exists "organizations_select_member" on organizations;
create policy "organizations_select_member"
on organizations for select
to authenticated
using (is_org_member(id));

drop policy if exists "organizations_update_owner" on organizations;
create policy "organizations_update_owner"
on organizations for update
to authenticated
using (is_org_owner(id))
with check (is_org_owner(id));

drop policy if exists "organizations_insert_authenticated" on organizations;
create policy "organizations_insert_authenticated"
on organizations for insert
to authenticated
with check (true);

drop policy if exists "org_members_select_member" on organization_members;
create policy "org_members_select_member"
on organization_members for select
to authenticated
using (is_org_member(org_id));

drop policy if exists "org_members_insert_owner" on organization_members;
create policy "org_members_insert_owner"
on organization_members for insert
to authenticated
with check (is_org_owner(org_id));

drop policy if exists "org_members_delete_owner" on organization_members;
create policy "org_members_delete_owner"
on organization_members for delete
to authenticated
using (is_org_owner(org_id));

drop policy if exists "contractor_profile_select_member" on contractor_profile;
create policy "contractor_profile_select_member"
on contractor_profile for select
to authenticated
using (is_org_member(org_id));

drop policy if exists "contractor_profile_insert_owner" on contractor_profile;
create policy "contractor_profile_insert_owner"
on contractor_profile for insert
to authenticated
with check (is_org_owner(org_id));

drop policy if exists "contractor_profile_update_member" on contractor_profile;
create policy "contractor_profile_update_member"
on contractor_profile for update
to authenticated
using (is_org_member(org_id))
with check (is_org_member(org_id));

drop policy if exists "leads_member_crud" on leads;
create policy "leads_member_crud"
on leads
for all
to authenticated
using (is_org_member(org_id))
with check (is_org_member(org_id));

drop policy if exists "lead_photos_member_crud" on lead_photos;
create policy "lead_photos_member_crud"
on lead_photos
for all
to authenticated
using (is_org_member(org_id))
with check (is_org_member(org_id));

drop policy if exists "quotes_member_crud" on quotes;
create policy "quotes_member_crud"
on quotes
for all
to authenticated
using (is_org_member(org_id))
with check (is_org_member(org_id));

drop policy if exists "quote_events_member_crud" on quote_events;
create policy "quote_events_member_crud"
on quote_events
for all
to authenticated
using (is_org_member(org_id))
with check (is_org_member(org_id));

drop policy if exists "customers_member_crud" on customers;
create policy "customers_member_crud"
on customers
for all
to authenticated
using (is_org_member(org_id))
with check (is_org_member(org_id));

drop policy if exists "usage_member_crud" on org_usage_monthly;
create policy "usage_member_crud"
on org_usage_monthly
for all
to authenticated
using (is_org_member(org_id))
with check (is_org_member(org_id));

drop policy if exists "pending_invites_select_member" on pending_invites;
create policy "pending_invites_select_member"
on pending_invites for select
to authenticated
using (is_org_member(org_id));

drop policy if exists "pending_invites_insert_owner" on pending_invites;
create policy "pending_invites_insert_owner"
on pending_invites for insert
to authenticated
with check (is_org_owner(org_id));

drop policy if exists "pending_invites_update_owner" on pending_invites;
create policy "pending_invites_update_owner"
on pending_invites for update
to authenticated
using (is_org_owner(org_id))
with check (is_org_owner(org_id));

drop policy if exists "pending_invites_delete_owner" on pending_invites;
create policy "pending_invites_delete_owner"
on pending_invites for delete
to authenticated
using (is_org_owner(org_id));

-- Storage bucket for lead photos
insert into storage.buckets (id, name, public)
values ('lead-photos', 'lead-photos', false)
on conflict (id) do nothing;

drop policy if exists "lead_photos_select_member" on storage.objects;
create policy "lead_photos_select_member"
on storage.objects for select
to authenticated
using (
  bucket_id = 'lead-photos'
  and is_org_member(storage_org_id_from_path(name))
);

drop policy if exists "lead_photos_insert_member" on storage.objects;
create policy "lead_photos_insert_member"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'lead-photos'
  and is_org_member(storage_org_id_from_path(name))
);

drop policy if exists "lead_photos_update_member" on storage.objects;
create policy "lead_photos_update_member"
on storage.objects for update
to authenticated
using (
  bucket_id = 'lead-photos'
  and is_org_member(storage_org_id_from_path(name))
)
with check (
  bucket_id = 'lead-photos'
  and is_org_member(storage_org_id_from_path(name))
);

drop policy if exists "lead_photos_delete_member" on storage.objects;
create policy "lead_photos_delete_member"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'lead-photos'
  and is_org_member(storage_org_id_from_path(name))
);
