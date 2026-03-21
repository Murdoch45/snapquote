create extension if not exists pg_cron with schema extensions;

create or replace function public.reset_due_solo_monthly_credits()
returns void
language sql
security definer
set search_path = public
as $$
  update organizations
  set monthly_credits = 5,
      credits_reset_at = now() + interval '1 month'
  where plan = 'SOLO'
    and extract(day from timezone('UTC', created_at)) = extract(day from timezone('UTC', now()))
    and (credits_reset_at is null or credits_reset_at <= now());
$$;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'reset_solo_monthly_credits_daily'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end
$$;

select cron.schedule(
  'reset_solo_monthly_credits_daily',
  '0 0 * * *',
  $$select public.reset_due_solo_monthly_credits();$$
);
