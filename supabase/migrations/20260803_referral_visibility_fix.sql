-- Cohortly: fix referral tier visibility (run after 20260803_referral_tiered_visibility.sql)
-- Run in Supabase → SQL Editor
--
-- Fixes:
-- 1) referral_age_tier must be STABLE (was IMMUTABLE + now() — broken)
-- 2) If zero graduates currently work at the target company, open to ALL
--    graduates immediately (do not hide the ask for 5 days)
-- 3) can_view_referral computes tier without writing during RLS SELECT
-- 4) Stronger company normalization (trim + collapse whitespace)
-- 5) Askers keep access to requests they already questioned

-- =============================================================================
-- Stronger normalize helper
-- =============================================================================

create or replace function public.normalize_company_name(p_company text)
returns text
language sql
immutable
as $$
  select nullif(
    lower(trim(regexp_replace(coalesce(p_company, ''), '\s+', ' ', 'g'))),
    ''
  );
$$;

create or replace function public.referral_requests_normalize_company()
returns trigger
language plpgsql
as $$
begin
  new.target_company_normalized := public.normalize_company_name(new.company);
  if new.status = 'accepted'
     and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    new.accepted_at := coalesce(new.accepted_at, now());
  end if;
  return new;
end;
$$;

-- Re-normalize existing rows
update public.referral_requests
set target_company_normalized = public.normalize_company_name(company)
where company is not null;

-- =============================================================================
-- Tier from age — STABLE (uses now())
-- =============================================================================

create or replace function public.referral_age_tier(p_created_at timestamptz)
returns int
language sql
stable
as $$
  select case
    when p_created_at is null then 1
    when now() < p_created_at + interval '48 hours' then 1
    when now() < p_created_at + interval '5 days' then 2
    else 3
  end;
$$;

-- Effective tier for visibility: age tier, OR 3 if nobody at company
create or replace function public.referral_effective_tier(
  p_created_at timestamptz,
  p_target_company text,
  p_poster_id uuid
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  age_tier int;
  match_count bigint;
  target text;
begin
  age_tier := public.referral_age_tier(p_created_at);
  target := public.normalize_company_name(p_target_company);

  if target is null then
    return greatest(age_tier, 3);
  end if;

  select count(*) into match_count
  from public.profiles p
  where p.status = 'graduate'
    and p.id is distinct from p_poster_id
    and public.normalize_company_name(p.company) = target;

  -- Nobody at this company on Cohortly → don't hide the ask for days
  if coalesce(match_count, 0) = 0 then
    return 3;
  end if;

  return age_tier;
end;
$$;

revoke all on function public.referral_effective_tier(timestamptz, text, uuid) from public;
grant execute on function public.referral_effective_tier(timestamptz, text, uuid) to authenticated;

-- Sync columns without being required for RLS decisions
create or replace function public.sync_referral_visibility(p_request_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.referral_requests%rowtype;
  tier int;
begin
  select * into r from public.referral_requests where id = p_request_id;
  if not found then
    return 1;
  end if;

  if r.status = 'open' then
    if (r.deadline is not null and r.deadline < current_date)
       or (r.deadline is null and r.created_at < now() - interval '30 days') then
      update public.referral_requests
      set status = 'expired'
      where id = r.id
        and status = 'open';
      return coalesce(r.visibility_tier, 1);
    end if;
  end if;

  tier := public.referral_effective_tier(
    r.created_at,
    coalesce(r.target_company_normalized, r.company),
    r.student_id
  );

  update public.referral_requests
  set
    visibility_tier = tier,
    opened_to_all_at = case
      when tier >= 3 then coalesce(opened_to_all_at, least(now(), r.created_at + interval '5 days'))
      else opened_to_all_at
    end
  where id = r.id
    and (
      visibility_tier is distinct from tier
      or (tier >= 3 and opened_to_all_at is null)
    );

  return tier;
end;
$$;

-- Pure visibility check — no writes (safe inside RLS)
create or replace function public.can_view_referral(
  p_request_id uuid,
  p_viewer_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.referral_requests%rowtype;
  v public.profiles%rowtype;
  tier int;
  viewer_company text;
  target text;
begin
  if p_request_id is null or p_viewer_id is null then
    return false;
  end if;

  select * into r from public.referral_requests where id = p_request_id;
  if not found then
    return false;
  end if;

  -- Poster always sees own
  if r.student_id = p_viewer_id then
    return true;
  end if;

  -- Acceptor always sees
  if r.accepted_by = p_viewer_id then
    return true;
  end if;

  -- Anyone who already asked a question keeps access
  if exists (
    select 1
    from public.referral_questions q
    where q.request_id = r.id
      and q.asker_id = p_viewer_id
  ) then
    return true;
  end if;

  select * into v from public.profiles where id = p_viewer_id;
  if not found then
    return false;
  end if;

  -- Students never see others' asks
  if coalesce(v.status, 'student') <> 'graduate' then
    return false;
  end if;

  -- Help board: only open asks
  if r.status <> 'open' then
    return false;
  end if;

  -- Skip expired-by-deadline without mutating here
  if r.deadline is not null and r.deadline < current_date then
    return false;
  end if;
  if r.deadline is null and r.created_at < now() - interval '30 days' then
    return false;
  end if;

  target := coalesce(
    r.target_company_normalized,
    public.normalize_company_name(r.company)
  );
  viewer_company := public.normalize_company_name(v.company);

  tier := public.referral_effective_tier(
    r.created_at,
    target,
    r.student_id
  );

  -- Tier 1+: current company match
  if viewer_company is not null and viewer_company = target then
    return true;
  end if;

  -- Tier 2+: past companies
  if tier >= 2 then
    if exists (
      select 1
      from unnest(coalesce(v.past_companies, '{}'::text[])) as pc(name)
      where public.normalize_company_name(pc.name) = target
    ) then
      return true;
    end if;
  end if;

  -- Tier 3: all graduates
  if tier >= 3 then
    return true;
  end if;

  return false;
end;
$$;

-- Reach stats for UI (syncs tier columns for display)
-- OUT/return row type changed vs older 4-column signature; CREATE OR REPLACE cannot alter it.
drop function if exists public.referral_reach_stats(uuid);

create or replace function public.referral_reach_stats(p_request_id uuid)
returns table (
  tier int,
  opens_to_all_at timestamptz,
  matching_graduate_count bigint,
  past_company_graduate_count bigint,
  age_tier int,
  open_to_all_now boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.referral_requests%rowtype;
  t int;
  a int;
  target text;
  match_count bigint;
begin
  select * into r from public.referral_requests where id = p_request_id;
  if not found then
    return;
  end if;

  t := public.sync_referral_visibility(r.id);
  a := public.referral_age_tier(r.created_at);
  target := coalesce(
    r.target_company_normalized,
    public.normalize_company_name(r.company)
  );

  select count(*) into match_count
  from public.profiles p
  where p.status = 'graduate'
    and p.id is distinct from r.student_id
    and public.normalize_company_name(p.company) = target;

  return query
  select
    t,
    case
      when t >= 3 and coalesce(match_count, 0) = 0 then now()
      when t >= 3 then coalesce(r.opened_to_all_at, r.created_at + interval '5 days')
      else r.created_at + interval '5 days'
    end,
    coalesce(match_count, 0),
    (
      select count(*)::bigint
      from public.profiles p
      where p.status = 'graduate'
        and p.id is distinct from r.student_id
        and exists (
          select 1
          from unnest(coalesce(p.past_companies, '{}'::text[])) as pc(name)
          where public.normalize_company_name(pc.name) = target
        )
    ),
    a,
    (t >= 3);
end;
$$;

revoke all on function public.referral_reach_stats(uuid) from public;
grant execute on function public.referral_reach_stats(uuid) to authenticated;

-- graduates_at_company uses same normalize
create or replace function public.graduates_at_company(p_company text)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::bigint
  from public.profiles p
  where p.status = 'graduate'
    and public.normalize_company_name(p.company) =
      public.normalize_company_name(p_company);
$$;

-- Sync all open requests once after deploy
do $$
declare
  rid uuid;
begin
  for rid in
    select id from public.referral_requests where status = 'open'
  loop
    perform public.sync_referral_visibility(rid);
  end loop;
end;
$$;
