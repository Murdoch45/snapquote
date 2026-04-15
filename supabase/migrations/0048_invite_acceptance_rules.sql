-- Align invite acceptance with current seat counts and reject expired or
-- existing-account email invite flows consistently.

create or replace function handle_auth_user_pending_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from pending_invites
  where status = 'PENDING'
    and expires_at is not null
    and expires_at <= now();

  insert into organization_members (org_id, user_id, role)
  select pi.org_id, new.id, pi.role
  from pending_invites pi
  join organizations o on o.id = pi.org_id
  where lower(pi.email) = lower(new.email)
    and pi.status = 'PENDING'
    and (pi.expires_at is null or pi.expires_at > now())
    and (
      select count(*)
      from organization_members om
      where om.org_id = pi.org_id
    ) <
      case
        when o.plan = 'SOLO' then 1
        when o.plan = 'TEAM' then 2
        else 4
      end
  on conflict (org_id, user_id) do nothing;

  update pending_invites
  set status = 'ACCEPTED'
  where lower(email) = lower(new.email)
    and status = 'PENDING'
    and (expires_at is null or expires_at > now())
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
    and (pi.expires_at is null or pi.expires_at > now())
    and o.id = pi.org_id
    and (
      select count(*)
      from organization_members om
      where om.org_id = pi.org_id
    ) >=
      case
        when o.plan = 'SOLO' then 1
        when o.plan = 'TEAM' then 2
        else 4
      end;

  return new;
end;
$$;

create or replace function accept_invite_token(
  p_token text,
  p_user_id uuid,
  p_user_email text default null
)
returns table(org_id uuid, role member_role)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite pending_invites%rowtype;
  v_plan org_plan;
  v_member_count integer;
  v_seat_limit integer;
begin
  select *
  into v_invite
  from pending_invites
  where token = p_token
  for update;

  if not found or v_invite.status <> 'PENDING' or v_invite.used_at is not null then
    raise exception 'This invite link is no longer valid.';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    delete from pending_invites
    where id = v_invite.id;

    raise exception 'This invite link has expired.';
  end if;

  perform 1
  from organizations
  where id = v_invite.org_id
  for update;

  if exists (
    select 1
    from organization_members
    where user_id = p_user_id
    limit 1
  ) then
    raise exception 'This email already has a SnapQuote account. Use a different email address to join this organization.';
  end if;

  select plan
  into v_plan
  from organizations
  where id = v_invite.org_id;

  v_seat_limit :=
    case
      when v_plan = 'SOLO' then 1
      when v_plan = 'TEAM' then 2
      else 4
    end;

  select count(*)
  into v_member_count
  from organization_members
  where org_id = v_invite.org_id;

  if v_member_count >= v_seat_limit then
    raise exception 'This workspace is already full. Ask the owner to upgrade or free up a seat before you accept this invite.';
  end if;

  insert into organization_members (org_id, user_id, role)
  values (v_invite.org_id, p_user_id, v_invite.role);

  update pending_invites
  set email = case
        when coalesce(trim(p_user_email), '') = '' then null
        else lower(trim(p_user_email))
      end,
      status = 'ACCEPTED',
      used_at = now()
  where id = v_invite.id;

  return query
  select v_invite.org_id, v_invite.role;
end;
$$;
