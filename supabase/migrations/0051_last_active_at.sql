-- Track the last time any member of an organization actually opened the app
-- (session hydration on web, foreground on mobile). This powers the 30-day
-- inactivity gate on the public /api/public/lead-submit endpoint, which
-- blocks Solo-plan leads when the org has gone dark.

alter table organizations
  add column if not exists last_active_at timestamptz;

-- Seed every existing org to now() so the gate doesn't blanket-block on ship.
-- Every current org gets a fresh 30-day grace period from migration time.
update organizations
  set last_active_at = now()
  where last_active_at is null;

create index if not exists idx_organizations_last_active_at
  on organizations(last_active_at desc);
