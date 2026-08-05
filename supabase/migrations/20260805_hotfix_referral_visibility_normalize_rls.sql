-- Hotfix: referral visibility / accept / ask / views (self-contained, idempotent)
-- Paste entire file in Supabase → SQL Editor (production). Safe to re-run.
--
-- Console evidence this addresses:
--   - Cards visible but Ask INSERT + accept_referral_request fail (can_view false)
--   - 403 on referral_questions / referral_views
--   - P0001 NOT_ALLOWED on accept
-- Root cause: leftover SELECT using (true) ORs with can_view → everyone sees cards,
-- while Ask/Accept/Views still require can_view. Weak normalize ("D.E. SHAW" ≠
-- "DE Shaw") also keeps can_view false until punctuation is stripped.
--
-- Coordinates with 20260805_hotfix_upsert_accepted_conversation_context.sql:
-- does NOT redefine upsert_accepted_conversation (leave that hotfix alone).

-- =============================================================================
-- 1) Strong company normalization (punctuation-insensitive)
-- =============================================================================

create or replace function public.normalize_company_name(p_company text)
returns text
language sql
immutable
as $$
  -- Letters+digits only, lowercased. "D.E. SHAW" / "DE Shaw" / "D E Shaw" → "deshaw"
  select nullif(
    lower(regexp_replace(coalesce(p_company, ''), '[^a-zA-Z0-9]+', '', 'g')),
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

drop trigger if exists referral_requests_normalize_company on public.referral_requests;
create trigger referral_requests_normalize_company
  before insert or update of company, status on public.referral_requests
  for each row
  execute function public.referral_requests_normalize_company();

-- Ensure normalized column exists (older DBs)
alter table public.referral_requests
  add column if not exists target_company_normalized text;

alter table public.referral_requests
  add column if not exists visibility_tier int default 1;

alter table public.referral_requests
  add column if not exists opened_to_all_at timestamptz;

alter table public.referral_requests
  add column if not exists accepted_at timestamptz;

alter table public.referral_requests
  add column if not exists referred_at timestamptz;

alter table public.referral_requests
  add column if not exists context text;

update public.referral_requests
set target_company_normalized = public.normalize_company_name(company)
where company is not null
  and (
    target_company_normalized is null
    or target_company_normalized is distinct from public.normalize_company_name(company)
  );

-- =============================================================================
-- 2) Age tier + can_view_referral (full recreate)
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

  -- Current students NEVER see anyone else's referral
  if coalesce(v.status, 'student') <> 'graduate' then
    return false;
  end if;

  if r.status <> 'open' then
    return false;
  end if;

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

  -- Tier at READ TIME from created_at
  tier := public.referral_age_tier(r.created_at);

  -- Tier 1 (0–48h): current company match only
  if viewer_company is not null and target is not null and viewer_company = target then
    return true;
  end if;

  -- Tier 2 (48h–5d): + past companies
  if tier >= 2 then
    if target is not null and exists (
      select 1
      from unnest(coalesce(v.past_companies, '{}'::text[])) as pc(name)
      where public.normalize_company_name(pc.name) = target
    ) then
      return true;
    end if;
  end if;

  -- Tier 3 (after 5 days): all graduates
  if tier >= 3 then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.can_view_referral(uuid, uuid) from public;
grant execute on function public.can_view_referral(uuid, uuid) to authenticated;

-- Diagnostic helper for accept RPC (no PII: no names/emails/raw company strings)
create or replace function public.referral_accept_denial_reason(
  p_request_id uuid,
  p_viewer_id uuid
)
returns text
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
  past_match boolean := false;
begin
  if p_viewer_id is null then
    return 'NOT_ALLOWED: You must be logged in.';
  end if;

  select * into r from public.referral_requests where id = p_request_id;
  if not found then
    return 'REQUEST_NOT_FOUND: Referral request not found.';
  end if;

  if r.student_id = p_viewer_id then
    return 'NOT_ALLOWED: You cannot accept your own referral request.';
  end if;

  select * into v from public.profiles where id = p_viewer_id;
  if not found then
    return 'NOT_ALLOWED: Profile not found.';
  end if;

  if coalesce(v.status, 'student') <> 'graduate' then
    return 'NOT_ALLOWED: Only graduates can accept referral requests.';
  end if;

  if r.status is distinct from 'open' or r.accepted_by is not null then
    return 'REFERRAL_ALREADY_TAKEN: Someone else has already taken this.';
  end if;

  if r.deadline is not null and r.deadline < current_date then
    return 'NOT_ALLOWED: This referral request has expired.';
  end if;
  if r.deadline is null and r.created_at < now() - interval '30 days' then
    return 'NOT_ALLOWED: This referral request has expired.';
  end if;

  target := coalesce(
    r.target_company_normalized,
    public.normalize_company_name(r.company)
  );
  viewer_company := public.normalize_company_name(v.company);
  tier := public.referral_age_tier(r.created_at);

  if target is not null and exists (
    select 1
    from unnest(coalesce(v.past_companies, '{}'::text[])) as pc(name)
    where public.normalize_company_name(pc.name) = target
  ) then
    past_match := true;
  end if;

  if viewer_company is not null and target is not null and viewer_company = target then
    -- Should have passed can_view; generic fallback
    return 'NOT_ALLOWED: You cannot accept this referral request.';
  end if;

  if tier < 2 then
    return 'NOT_ALLOWED: Company mismatch — this ask is still limited to graduates at the target company (first 48h).';
  end if;

  if past_match then
    return 'NOT_ALLOWED: You cannot accept this referral request.';
  end if;

  if tier < 3 then
    return 'NOT_ALLOWED: Company mismatch — this ask is still limited to current/past company matches (opens to all graduates after 5 days).';
  end if;

  return 'NOT_ALLOWED: You cannot accept this referral request.';
end;
$$;

revoke all on function public.referral_accept_denial_reason(uuid, uuid) from public;
grant execute on function public.referral_accept_denial_reason(uuid, uuid) to authenticated;

-- =============================================================================
-- 3) DROP ALL leftover SELECT policies on referral_requests, keep only can_view
-- =============================================================================

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'referral_requests'
      and cmd = 'SELECT'
  loop
    execute format(
      'drop policy if exists %I on public.referral_requests',
      pol.policyname
    );
  end loop;
end $$;

-- Named drops (idempotent even if DO block already removed them)
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
-- 4) referral_requests UPDATE — graduate accept: USING + WITH CHECK
-- =============================================================================

drop policy if exists "Users can update referral requests" on public.referral_requests;
drop policy if exists "Poster can update own referral requests" on public.referral_requests;
drop policy if exists "Graduates can accept open referral requests" on public.referral_requests;
drop policy if exists "Acceptor can update accepted referral" on public.referral_requests;

create policy "Poster can update own referral requests"
  on public.referral_requests
  for update
  to authenticated
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

-- WITH CHECK keeps can_view: after accept, accepted_by = auth.uid() short-circuits true
create policy "Graduates can accept open referral requests"
  on public.referral_requests
  for update
  to authenticated
  using (
    status = 'open'
    and accepted_by is null
    and auth.uid() is distinct from student_id
    and public.can_view_referral(id, auth.uid())
  )
  with check (
    status = 'accepted'
    and accepted_by = auth.uid()
    and auth.uid() is distinct from student_id
    and public.can_view_referral(id, auth.uid())
  );

create policy "Acceptor can update accepted referral"
  on public.referral_requests
  for update
  to authenticated
  using (auth.uid() = accepted_by)
  with check (auth.uid() = accepted_by);

-- =============================================================================
-- 5) referral_questions INSERT — asker must pass can_view
-- =============================================================================

alter table public.referral_questions enable row level security;

drop policy if exists "Viewers can ask referral questions" on public.referral_questions;
create policy "Viewers can ask referral questions"
  on public.referral_questions
  for insert
  to authenticated
  with check (
    asker_id = auth.uid()
    and public.can_view_referral(request_id, auth.uid())
    and not exists (
      select 1
      from public.referral_requests rr
      where rr.id = request_id
        and rr.student_id = auth.uid()
    )
  );

-- =============================================================================
-- 6) referral_views — graduates who can_view can record (and upsert-update) views
-- =============================================================================

create table if not exists public.referral_views (
  request_id uuid not null references public.referral_requests(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, viewer_id)
);

alter table public.referral_views enable row level security;

drop policy if exists "Users record own referral views" on public.referral_views;
create policy "Users record own referral views"
  on public.referral_views
  for insert
  to authenticated
  with check (
    viewer_id = auth.uid()
    and public.can_view_referral(request_id, auth.uid())
  );

-- Needed for client upsert(onConflict) after first view
drop policy if exists "Users update own referral views" on public.referral_views;
create policy "Users update own referral views"
  on public.referral_views
  for update
  to authenticated
  using (viewer_id = auth.uid())
  with check (viewer_id = auth.uid());

drop policy if exists "Poster and viewer can read referral views" on public.referral_views;
create policy "Poster and viewer can read referral views"
  on public.referral_views
  for select
  to authenticated
  using (
    viewer_id = auth.uid()
    or exists (
      select 1
      from public.referral_requests rr
      where rr.id = request_id
        and rr.student_id = auth.uid()
    )
  );

-- =============================================================================
-- 7) accept_referral_request — clearer WHY on can_view failure; no upsert redefine
-- =============================================================================

create or replace function public.accept_referral_request(p_request_id uuid)
returns public.referral_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.referral_requests%rowtype;
  updated public.referral_requests%rowtype;
  acceptor uuid := auth.uid();
  acceptor_name text;
  denial text;
begin
  if acceptor is null then
    raise exception 'NOT_ALLOWED: You must be logged in.';
  end if;

  select * into r
  from public.referral_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND: Referral request not found.';
  end if;

  if r.student_id = acceptor then
    raise exception 'NOT_ALLOWED: You cannot accept your own referral request.';
  end if;

  if r.status is distinct from 'open' or r.accepted_by is not null then
    raise exception 'REFERRAL_ALREADY_TAKEN: Someone else has already taken this.';
  end if;

  if not public.can_view_referral(r.id, acceptor) then
    denial := public.referral_accept_denial_reason(r.id, acceptor);
    raise exception '%', denial;
  end if;

  update public.referral_requests
  set
    status = 'accepted',
    accepted_by = acceptor,
    accepted_at = coalesce(accepted_at, now())
  where id = r.id
    and status = 'open'
    and accepted_by is null
  returning * into updated;

  if not found then
    raise exception 'REFERRAL_ALREADY_TAKEN: Someone else has already taken this.';
  end if;

  -- Uses existing upsert overload. Do NOT redefine upsert_accepted_conversation here.
  perform public.upsert_accepted_conversation(
    updated.student_id,
    updated.accepted_by,
    'referral'
  );

  select coalesce(nullif(trim(full_name), ''), 'Someone')
    into acceptor_name
  from public.profiles
  where id = acceptor;

  insert into public.notifications (user_id, type, title, body, link, payload)
  values (
    updated.student_id,
    'referral_accepted',
    acceptor_name || ' accepted your referral request',
    'They accepted your request for ' || updated.role || ' at ' || updated.company || '.',
    '/messages?with=' || acceptor::text,
    jsonb_build_object(
      'request_id', updated.id,
      'accepted_by', acceptor
    )
  );

  return updated;
end;
$$;

revoke all on function public.accept_referral_request(uuid) from public;
grant execute on function public.accept_referral_request(uuid) to authenticated;

-- =============================================================================
-- 8) graduates_at_company — keep in sync with stronger normalize
-- =============================================================================

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
