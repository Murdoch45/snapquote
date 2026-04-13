-- Persistent notifications feed
-- Each row represents one in-app notification delivered to an org.
-- Max 50 per org (enforced by trigger), 7-day TTL (enforced by cron).

create table if not exists public.notifications (
  id          uuid        default gen_random_uuid() primary key,
  org_id      uuid        not null references public.organizations(id) on delete cascade,
  user_id     uuid        references auth.users(id) on delete set null,
  type        text        not null,
  title       text        not null,
  body        text        not null,
  screen      text,
  screen_params jsonb     default '{}'::jsonb,
  read        boolean     not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_org_created_idx
  on public.notifications (org_id, created_at desc);

create index if not exists notifications_org_unread_idx
  on public.notifications (org_id) where read = false;

-- RLS ------------------------------------------------------------------

alter table public.notifications enable row level security;

create policy "Members can read own org notifications"
  on public.notifications for select
  using (
    org_id in (
      select om.org_id from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

create policy "Members can update own org notifications"
  on public.notifications for update
  using (
    org_id in (
      select om.org_id from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

-- Auto-prune: keep at most 50 notifications per org --------------------

create or replace function public.prune_org_notifications()
returns trigger as $$
begin
  delete from public.notifications
  where id in (
    select id from public.notifications
    where org_id = NEW.org_id
    order by created_at desc
    offset 50
  );
  return null;
end;
$$ language plpgsql;

create trigger trg_prune_org_notifications
  after insert on public.notifications
  for each row
  execute function public.prune_org_notifications();

-- Enable Realtime so clients can subscribe to INSERT / UPDATE ----------

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when others then
  null;
end
$$;
