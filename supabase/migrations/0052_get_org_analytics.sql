-- Single shared analytics RPC consumed by both the web and mobile clients.
-- Before this migration, each client re-implemented the aggregation in
-- JavaScript, which produced parallel bugs and two different numbers for
-- the same org depending on which platform you looked at. Moving the math
-- into Postgres makes the database the single source of truth.
--
-- == Conventions (both clients rely on these) ==================================
-- * p_start_date / p_end_date are timestamptz. Both inclusive. If
--   p_start_date is NULL the function treats the query as "all time" for
--   the org and computes the spine from the org's earliest event.
-- * p_timezone controls day bucketing. All per-day series keys are ISO
--   date strings in that timezone. Callers should pass the user's tz on
--   mobile; web passes 'UTC'.
-- * "Estimates sent" is defined as quotes with status IN
--   ('SENT','VIEWED','ACCEPTED','EXPIRED') — drafts are never counted.
-- * "Average estimate value" further requires price > 0 so unset/zero
--   prices don't drag the mean down.
-- * Acceptance rate is SENT-DAY aligned: "of the estimates sent on day X,
--   what percent were eventually accepted". Numerator and denominator use
--   the same sent_at filter, so the headline rate equals
--   sum(daily_num) / sum(daily_den).
-- * Average response time uses the FIRST sent quote per lead — multiple
--   quotes to the same lead don't inflate the denominator.
-- * Service breakdown: a lead with multiple services counts once toward
--   each of its services (preserves the prior behaviour in both clients).
-- ============================================================================

-- Supporting indexes for the common filter shapes.
create index if not exists idx_leads_org_ai_status_submitted_at
  on leads(org_id, ai_status, submitted_at desc);

create index if not exists idx_quotes_org_status_sent_at
  on quotes(org_id, status, sent_at desc);

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
  -- Explicit org membership gate. SECURITY INVOKER + the RLS policies on
  -- leads/quotes would already block cross-org reads, but an explicit
  -- is_org_member() check means callers who pass the wrong org_id get a
  -- clean 42501 error instead of silently empty results.
  if not is_org_member(p_org_id) then
    raise exception 'Not authorized for org %', p_org_id
      using errcode = '42501';
  end if;

  -- If no start was supplied, default to the org's earliest event so the
  -- "all time" view on mobile still gets a proper zero-filled spine. If
  -- the org has no data at all, fall back to the last 30 days so the
  -- spine isn't empty.
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

  -- Accepted: quotes with status='ACCEPTED' whose sent_at is in the
  -- window. Keeping the sent_at filter (not accepted_at) is what keeps
  -- the headline acceptance rate reconcilable with the per-day series.
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

  -- First-quote-per-lead response time.
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

grant execute on function get_org_analytics(uuid, timestamptz, timestamptz, text)
  to authenticated;
