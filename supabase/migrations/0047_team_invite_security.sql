-- Only org owners can read pending invites directly via Supabase.
drop policy if exists "pending_invites_select_member" on pending_invites;
drop policy if exists "pending_invites_select_owner" on pending_invites;

create policy "pending_invites_select_owner"
on pending_invites for select
to authenticated
using (is_org_owner(org_id));

-- Atomically accept a token invite, ensuring only one user can claim it
-- and enforcing seat limits at acceptance time.
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
    raise exception 'This account is already connected to a SnapQuote workspace.';
  end if;

  select plan
  into v_plan
  from organizations
  where id = v_invite.org_id;

  v_seat_limit :=
    case
      when v_plan = 'SOLO' then 1
      when v_plan = 'TEAM' then 2
      else 5
    end;

  select count(*)
  into v_member_count
  from organization_members
  where org_id = v_invite.org_id;

  if v_member_count >= v_seat_limit then
    raise exception 'This workspace has reached its team member limit. Ask the owner to upgrade or free up a seat.';
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
