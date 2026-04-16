-- Allow the service role to invoke get_org_analytics without an
-- authenticated user present. The web data layer wraps RPC calls in
-- Next.js unstable_cache (5-minute TTL), and unstable_cache closures are
-- not allowed to read cookies/headers — so the wrapper has to invoke the
-- RPC via the service-role admin client instead of the cookie-backed
-- authenticated client.
--
-- Security model:
--   * User-invoked calls (auth.uid() IS NOT NULL) still require an
--     explicit is_org_member(p_org_id) match. Unchanged.
--   * Service-role calls (auth.uid() IS NULL) skip the check. The only
--     code path that invokes the RPC with the service role is our
--     server-side cached wrapper, which has already run requireAuth()
--     to confirm the user is a member of the org_id it passes in.
--
-- Everything else about the function is identical to 0052.
create or replace function get_org_analytics(
  p_org_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_timezone text default 'UTC'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_start         timestamptz := p_start_date;
  v_end           timestamptz := coalesce(p_end_date, now());
  v_total_leads   int;
  v_quotes_sent   int;
  v_quotes_accepted int;
  v_avg_quote_value numeric;
  v_avg_response_minutes numeric;
  v_acceptance_rate numeric;
  v_leads_per_day jsonb;
  v_quotes_per_day jsonb;
  v_acceptance_rate_per_day jsonb;
  v_services_breakdown jsonb;
begin
  -- Membership gate: user-invoked calls must be a member of the org.
  -- Service-role calls (auth.uid() IS NULL) are trusted — see header.
  if auth.uid() is not null and not is_org_member(p_org_id) then
    raise exception 'Not authorized for org %', p_org_id
      using errcode = '42501';
  end if;

  -- If no start was supplied, default to the org's earliest event so the
  -- "all time" view still gets a proper zero-filled spine. Falls back to
  -- the last 30 days for brand-new orgs with no data at all.
  if v_start is null then
    select least(
      (select min(submitted_at) from leads
        where org_id = p_org_id and ai_status = 'ready'),
      (select min(sent_at) from quotes
        where org_id = p_org_id
          and status in ('SENT','VIEWED','ACCEPTED','EXPIRED'))
    ) into v_start;
  end if;

  if v_start is null then
    v_start := v_end - interval '30 days';
  end if;

  -- ---------------------------------------------------------------- totals
  select count(*)
    into v_total_leads
    from leads
   where org_id = p_org_id
     and ai_status = 'ready'
     and submitted_at >= v_start
     and submitted_at <= v_end;

  select count(*),
         coalesce(
           avg(price) filter (where price is not null and price > 0),
           0
         )
    into v_quotes_sent, v_avg_quote_value
    from quotes
   where org_id = p_org_id
     and status in ('SENT','VIEWED','ACCEPTED','EXPIRED')
     and sent_at >= v_start
     and sent_at <= v_end;

  select count(*)
    into v_quotes_accepted
    from quotes
   where org_id = p_org_id
     and status = 'ACCEPTED'
     and sent_at >= v_start
     and sent_at <= v_end;

  v_acceptance_rate := case
    when v_quotes_sent = 0 then 0
    else round((v_quotes_accepted::numeric / v_quotes_sent) * 100, 1)
  end;

  select avg(delta_minutes)
    into v_avg_response_minutes
    from (
      select extract(
               epoch from (min(q.sent_at) - l.submitted_at)
             ) / 60.0 as delta_minutes
        from quotes q
        join leads l on l.id = q.lead_id
       where q.org_id = p_org_id
         and q.status in ('SENT','VIEWED','ACCEPTED','EXPIRED')
         and q.sent_at >= v_start
         and q.sent_at <= v_end
       group by q.lead_id, l.submitted_at
      having min(q.sent_at) >= l.submitted_at
    ) t;

  -- ----------------------------------------------------- per-day spine
  with day_spine as (
    select gs::date as day
      from generate_series(
             (v_start at time zone p_timezone)::date,
             (v_end   at time zone p_timezone)::date,
             '1 day'::interval
           ) gs
  ),
  leads_bucketed as (
    select (submitted_at at time zone p_timezone)::date as day,
           count(*) as c
      from leads
     where org_id = p_org_id
       and ai_status = 'ready'
       and submitted_at >= v_start
       and submitted_at <= v_end
     group by 1
  ),
  quotes_bucketed as (
    select (sent_at at time zone p_timezone)::date as day,
           count(*) as sent,
           count(*) filter (where status = 'ACCEPTED') as accepted
      from quotes
     where org_id = p_org_id
       and status in ('SENT','VIEWED','ACCEPTED','EXPIRED')
       and sent_at >= v_start
       and sent_at <= v_end
     group by 1
  ),
  joined as (
    select d.day,
           coalesce(lb.c, 0)       as lead_count,
           coalesce(qb.sent, 0)    as quote_count,
           coalesce(qb.accepted, 0) as accepted_count
      from day_spine d
      left join leads_bucketed  lb on lb.day = d.day
      left join quotes_bucketed qb on qb.day = d.day
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD'),
        'count', lead_count
      ) order by day
    ), '[]'::jsonb),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD'),
        'count', quote_count
      ) order by day
    ), '[]'::jsonb),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD'),
        'rate', case
                  when quote_count = 0 then 0
                  else round((accepted_count::numeric / quote_count) * 100, 1)
                end
      ) order by day
    ), '[]'::jsonb)
  into v_leads_per_day, v_quotes_per_day, v_acceptance_rate_per_day
  from joined;

  -- --------------------------------------------------- service breakdown
  with exploded as (
    select unnest(services) as service
      from leads
     where org_id = p_org_id
       and ai_status = 'ready'
       and submitted_at >= v_start
       and submitted_at <= v_end
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('name', service, 'value', c)
      order by c desc, service asc
    ),
    '[]'::jsonb
  )
    into v_services_breakdown
    from (
      select service, count(*) as c
        from exploded
       where service is not null
       group by service
    ) s;

  -- --------------------------------------------------- assemble response
  return jsonb_build_object(
    'totals', jsonb_build_object(
      'totalLeads',         v_total_leads,
      'quotesSent',         v_quotes_sent,
      'quotesAccepted',     v_quotes_accepted,
      'acceptanceRate',     v_acceptance_rate,
      'avgQuoteValue',      round(coalesce(v_avg_quote_value, 0), 2),
      'avgResponseMinutes', case
                              when v_avg_response_minutes is null then null
                              else round(v_avg_response_minutes, 1)
                            end
    ),
    'leadsOverTime',          v_leads_per_day,
    'quotesOverTime',         v_quotes_per_day,
    'acceptanceRateOverTime', v_acceptance_rate_per_day,
    'servicesBreakdown',      v_services_breakdown
  );
end;
$$;
