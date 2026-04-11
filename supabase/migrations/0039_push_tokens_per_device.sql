-- Move expo push tokens off contractor_profile (one row per org → one device
-- per org silently overwrote tokens for every other team member) and onto a
-- per-(user, device) table so multi-seat orgs actually fan notifications out
-- to every member who opened the app on every device.

create table if not exists push_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  org_id uuid not null references organizations(id) on delete cascade,
  expo_push_token text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

create index if not exists idx_push_tokens_org_id on push_tokens(org_id);
create index if not exists idx_push_tokens_token on push_tokens(expo_push_token);

alter table push_tokens enable row level security;

create policy "push_tokens_select_own"
on push_tokens for select
to authenticated
using (auth.uid() = user_id);

create policy "push_tokens_insert_own"
on push_tokens for insert
to authenticated
with check (auth.uid() = user_id);

create policy "push_tokens_update_own"
on push_tokens for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "push_tokens_delete_own"
on push_tokens for delete
to authenticated
using (auth.uid() = user_id);

-- Drop the legacy single-token-per-org column. The mobile app will re-register
-- on next launch and write into push_tokens.
alter table contractor_profile drop column if exists expo_push_token;
