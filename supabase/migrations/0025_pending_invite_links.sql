-- Support token-based team invite links.
alter table pending_invites
  alter column email drop not null;

alter table pending_invites
  add column if not exists token text,
  add column if not exists expires_at timestamptz,
  add column if not exists used_at timestamptz;

create unique index if not exists idx_pending_invites_token
  on pending_invites(token)
  where token is not null;
