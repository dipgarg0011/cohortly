-- Cohortly: fix referral accept company match + opportunity decide path
-- Run in Supabase → SQL Editor (production). Safe to re-run.
--
-- Coordinates with 20260805_hotfix_upsert_accepted_conversation_context.sql:
-- does NOT redefine upsert_accepted_conversation (leave that hotfix alone).
--
-- Fixes:
-- 1) normalize_company_name strips punctuation so "D.E. Shaw" ≡ "DE Shaw"
-- 2) referral_requests UPDATE policies: graduate who passes can_view_referral
--    can accept (USING + WITH CHECK); leftover permissive SELECT dropped
-- 3) accept_referral_request keeps clear NOT_ALLOWED when can_view fails
-- 4) decide_opportunity_application SECURITY DEFINER RPC for poster accept/decline

-- =============================================================================
-- 1) Stronger company normalization (punctuation-insensitive)
-- =============================================================================

create or replace function public.normalize_company_name(p_company text)
returns text
language sql
immutable
as $$
  -- Letters+digits only, lowercased. "D.E. Shaw" / "DE Shaw" / "D E Shaw" → "deshaw"
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

update public.referral_requests
set target_company_normalized = public.normalize_company_name(company)
where company is not null
  and (
    target_company_normalized is null
    or target_company_normalized is distinct from public.normalize_company_name(company)
  );

-- =============================================================================
-- 2) referral_requests UPDATE — graduate accept: USING + WITH CHECK
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

-- Graduate who can_view_referral may accept an open request.
-- WITH CHECK also requires can_view_referral: after accept, accepted_by = auth.uid()
-- short-circuits can_view_referral to true before the status<>open gate.
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

-- Drop leftover permissive SELECT (OR'd with can_view → everyone sees everything)
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
-- 3) accept_referral_request — SECURITY DEFINER; clear NOT_ALLOWED on can_view
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
    raise exception 'NOT_ALLOWED: You cannot accept this referral request.';
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

  -- Uses existing upsert overload (3-arg → 6-arg wrapper). Do not redefine upsert here.
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
-- 4) decide_opportunity_application — poster accept/decline via SECURITY DEFINER
-- =============================================================================

create or replace function public.decide_opportunity_application(
  p_application_id uuid,
  p_new_status text
)
returns public.opportunity_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  app public.opportunity_applications%rowtype;
  poster uuid;
  actor uuid := auth.uid();
  updated public.opportunity_applications%rowtype;
begin
  if actor is null then
    raise exception 'NOT_ALLOWED: You must be logged in.';
  end if;

  if p_new_status not in ('accepted', 'declined') then
    raise exception 'NOT_ALLOWED: Poster may only accept or decline.';
  end if;

  select * into app
  from public.opportunity_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND: Application not found.';
  end if;

  select posted_by into poster
  from public.opportunities
  where id = app.opportunity_id;

  if poster is null or poster is distinct from actor then
    raise exception 'NOT_ALLOWED: Only the poster can decide this application.';
  end if;

  if app.status is distinct from 'pending' then
    if app.status in ('accepted', 'declined') then
      raise exception 'APPLICATION_ALREADY_DECIDED: This application was already decided.';
    end if;
    raise exception 'NOT_ALLOWED: Only pending applications can be decided.';
  end if;

  update public.opportunity_applications
  set status = p_new_status
  where id = app.id
    and status = 'pending'
  returning * into updated;

  if not found then
    raise exception 'APPLICATION_ALREADY_DECIDED: This application was already decided.';
  end if;

  return updated;
end;
$$;

revoke all on function public.decide_opportunity_application(uuid, text) from public;
grant execute on function public.decide_opportunity_application(uuid, text) to authenticated;
