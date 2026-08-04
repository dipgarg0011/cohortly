-- Hotfix: resume after 20260804_fix_opportunity_apply_and_referral_visibility.sql
-- failed mid-script with:
--   ERROR: 42P13: cannot change return type of existing function
--   Hint: Use DROP FUNCTION referral_reach_stats(uuid) first.
--
-- Use this when the first half of that migration already applied (policies /
-- earlier functions OK) and only referral_reach_stats + trailing policies remain.
-- Safe to re-run: DROP FUNCTION IF EXISTS + DROP POLICY IF EXISTS throughout.
--
-- One-liner if you only need to unblock before re-pasting the full migration:
--   DROP FUNCTION IF EXISTS public.referral_reach_stats(uuid);

-- OUT/return row type changed vs older 4-column signature; CREATE OR REPLACE cannot alter it.
-- No CASCADE: nothing depends on this function as a hard object dependency.
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
    r.created_at + interval '5 days',
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

-- DROP leftover permissive SELECT (Postgres ORs policies — must not keep using(true))
drop policy if exists "Authenticated users can view referral requests"
  on public.referral_requests;
drop policy if exists "View referral requests via can_view_referral"
  on public.referral_requests;

create policy "View referral requests via can_view_referral"
  on public.referral_requests
  for select
  to authenticated
  using (public.can_view_referral(id, auth.uid()));

-- =============================================================================
-- PART 5) Mentorship audit — mentors must not SELECT unmatched (or any) rows
-- =============================================================================
-- Design: mentors read via list_my_matched_asks() only (masks student_id).
-- Drop table SELECT for mentors if reintroduced by an older migration order.
-- No using(true) should exist; drop it if present.

drop policy if exists "Authenticated users can view mentorship requests"
  on public.mentorship_requests;
drop policy if exists "Anyone can view mentorship requests"
  on public.mentorship_requests;
drop policy if exists "Matched mentors can view mentorship requests"
  on public.mentorship_requests;

-- Ensure student-only SELECT remains
drop policy if exists "Students can view own mentorship requests"
  on public.mentorship_requests;
create policy "Students can view own mentorship requests"
  on public.mentorship_requests
  for select
  to authenticated
  using (auth.uid() = student_id);

-- Sync visibility_tier columns for open asks
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
