-- Cohortly: referral/opportunity progress stages + Fix 1 company duplicate cap
-- Run in Supabase → SQL Editor (production). Safe to re-run.
--
-- Fix 1: 30-day duplicate only blocks same student + same NORMALIZED company
--         while status = 'open' (closed/expired/in_progress do not block).
-- Fix 2: referral stages open → in_progress → submitted → closed
--         opportunity stages pending → reviewing → shortlisted → closed
--
-- Upsert policy: does NOT redefine upsert_accepted_conversation.
-- All callers use the canonical 6-arg form with explicit ::text / ::uuid casts.
-- If you must recreate upsert, DROP all overloads first (see
-- 20260805_hotfix_upsert_accepted_conversation_unique.sql).
--
-- Guard note: status backfills disable BEFORE UPDATE guards (auth.uid() is null
-- in SQL Editor). If this file already failed mid-run on opportunity backfill,
-- run 20260805_hotfix_opportunity_progress_stages_guard.sql instead — do not
-- re-paste this whole file.

-- =============================================================================
-- FIX 1 — enforce_referral_request_caps (normalized company, open only)
-- =============================================================================

create or replace function public.enforce_referral_request_caps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  open_count int;
  recent_same_company int;
  new_norm text;
  company_label text;
begin
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.status = 'open' and old.status is distinct from 'open') then
    select count(*) into open_count
    from public.referral_requests
    where student_id = new.student_id
      and status = 'open'
      and id is distinct from new.id;

    if open_count >= 3 then
      raise exception 'REFERRAL_OPEN_LIMIT: You can have at most 3 open referral requests at a time.';
    end if;
  end if;

  -- Only block another OPEN request for the same normalized company within 30 days.
  -- Closed / expired / in_progress / submitted must not block a new company ask.
  if tg_op = 'INSERT' and new.status = 'open' then
    new_norm := coalesce(
      new.target_company_normalized,
      public.normalize_company_name(new.company)
    );
    company_label := coalesce(nullif(trim(new.company), ''), 'this company');

    if new_norm is not null then
      select count(*) into recent_same_company
      from public.referral_requests
      where student_id = new.student_id
        and status = 'open'
        and coalesce(
              target_company_normalized,
              public.normalize_company_name(company)
            ) = new_norm
        and created_at >= now() - interval '30 days'
        and id is distinct from new.id;

      if recent_same_company > 0 then
        raise exception
          'REFERRAL_COMPANY_LIMIT: You already have an open request for %.',
          company_label;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists referral_request_caps on public.referral_requests;
create trigger referral_request_caps
  before insert or update of status on public.referral_requests
  for each row
  execute function public.enforce_referral_request_caps();

-- =============================================================================
-- FIX 2a — referral_requests: columns + status migration
-- =============================================================================

alter table public.referral_requests
  add column if not exists helper_id uuid references public.profiles(id);

alter table public.referral_requests
  add column if not exists stage_updated_at timestamptz;

alter table public.referral_requests
  add column if not exists outcome text;

alter table public.referral_requests
  add column if not exists outcome_note text;

alter table public.referral_requests
  add column if not exists helper_nudged_at timestamptz;

-- Backfill helper_id / stages with accept-column guard disabled (SQL Editor
-- has auth.uid() = null; same pattern as referral_normalize_backfill_guard).
alter table public.referral_requests
  disable trigger referral_requests_guard_accept_columns;

-- Backfill helper_id from accepted_by (accepted_by remains the synonym column)
update public.referral_requests
set helper_id = accepted_by
where accepted_by is not null
  and helper_id is distinct from accepted_by;

update public.referral_requests
set stage_updated_at = coalesce(accepted_at, referred_at, created_at, now())
where stage_updated_at is null;

-- Widen / replace status check: accepted → in_progress
alter table public.referral_requests
  drop constraint if exists referral_requests_status_check;

-- Allow both old and new during migration update
alter table public.referral_requests
  add constraint referral_requests_status_check
  check (status in (
    'open', 'accepted', 'in_progress', 'submitted', 'closed', 'expired'
  ));

update public.referral_requests
set
  status = 'in_progress',
  helper_id = coalesce(helper_id, accepted_by),
  stage_updated_at = coalesce(stage_updated_at, accepted_at, now())
where status = 'accepted';

-- Rows already marked referred → submitted
update public.referral_requests
set
  status = 'submitted',
  stage_updated_at = coalesce(referred_at, stage_updated_at, now())
where referred_at is not null
  and status = 'in_progress';

alter table public.referral_requests
  enable trigger referral_requests_guard_accept_columns;

alter table public.referral_requests
  drop constraint if exists referral_requests_status_check;

alter table public.referral_requests
  add constraint referral_requests_status_check
  check (status in ('open', 'in_progress', 'submitted', 'closed', 'expired'));

alter table public.referral_requests
  drop constraint if exists referral_requests_outcome_check;

alter table public.referral_requests
  add constraint referral_requests_outcome_check
  check (
    outcome is null
    or outcome in ('referred', 'not_referred', 'no_response', 'withdrawn')
  );

comment on column public.referral_requests.helper_id is
  'Graduate helping with this request. Synonym of accepted_by (kept in sync).';
comment on column public.referral_requests.accepted_by is
  'Legacy synonym of helper_id — kept for FK/RLS compatibility.';
comment on column public.referral_requests.outcome is
  'Completion outcome set when closed: referred | not_referred | no_response | withdrawn';

-- Keep helper_id ↔ accepted_by in sync + stage_updated_at on status change
create or replace function public.referral_requests_sync_helper_and_stage()
returns trigger
language plpgsql
as $$
begin
  -- Prefer whichever side changed
  if tg_op = 'UPDATE' then
    if new.helper_id is distinct from old.helper_id
       and new.accepted_by is not distinct from old.accepted_by then
      new.accepted_by := new.helper_id;
    elsif new.accepted_by is distinct from old.accepted_by then
      new.helper_id := new.accepted_by;
    end if;
  else
    new.helper_id := coalesce(new.helper_id, new.accepted_by);
    new.accepted_by := coalesce(new.accepted_by, new.helper_id);
  end if;

  new.target_company_normalized := public.normalize_company_name(new.company);

  if new.status in ('in_progress', 'submitted')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.accepted_at := coalesce(new.accepted_at, now());
  end if;

  if tg_op = 'INSERT' then
    new.stage_updated_at := coalesce(new.stage_updated_at, now());
  elsif old.status is distinct from new.status
        or old.outcome is distinct from new.outcome
        or old.referred_at is distinct from new.referred_at then
    new.stage_updated_at := now();
  end if;

  if new.status = 'submitted' and new.referred_at is null then
    new.referred_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists referral_requests_normalize_company on public.referral_requests;
drop trigger if exists referral_requests_sync_helper_and_stage on public.referral_requests;
create trigger referral_requests_sync_helper_and_stage
  before insert or update of company, status, accepted_by, helper_id, outcome, referred_at
  on public.referral_requests
  for each row
  execute function public.referral_requests_sync_helper_and_stage();

-- Guard: poster / helper column rules for new stages
create or replace function public.referral_requests_guard_accept_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Pure normalize / stage timestamp sync from triggers is fine
  if tg_op = 'UPDATE'
     and new.student_id is not distinct from old.student_id
     and new.company is not distinct from old.company
     and new.role is not distinct from old.role
     and new.resume_url is not distinct from old.resume_url
     and new.job_link is not distinct from old.job_link
     and new.deadline is not distinct from old.deadline
     and new.context is not distinct from old.context
     and new.status is not distinct from old.status
     and new.accepted_by is not distinct from old.accepted_by
     and new.helper_id is not distinct from old.helper_id
     and new.outcome is not distinct from old.outcome
     and new.outcome_note is not distinct from old.outcome_note
     and new.referred_at is not distinct from old.referred_at then
    return new;
  end if;

  -- Poster may edit open requests and close / set outcome on active ones
  if auth.uid() = new.student_id and auth.uid() = old.student_id then
    return new;
  end if;

  -- Helper claiming an open request → in_progress
  if old.status = 'open'
     and old.accepted_by is null
     and old.helper_id is null
     and new.status = 'in_progress'
     and new.accepted_by = auth.uid()
     and coalesce(new.helper_id, new.accepted_by) = auth.uid() then
    return new;
  end if;

  -- Helper advancing their own request
  if coalesce(old.accepted_by, old.helper_id) = auth.uid()
     and coalesce(new.accepted_by, new.helper_id) = auth.uid() then
    return new;
  end if;

  raise exception 'NOT_ALLOWED: You cannot change these referral fields.';
end;
$$;

-- Policies for help stages
drop policy if exists "Users can update referral requests" on public.referral_requests;
drop policy if exists "Poster can update own referral requests" on public.referral_requests;
drop policy if exists "Graduates can accept open referral requests" on public.referral_requests;
drop policy if exists "Graduates can help with open referral requests" on public.referral_requests;
drop policy if exists "Acceptor can update accepted referral" on public.referral_requests;
drop policy if exists "Helper can update in-progress referral" on public.referral_requests;

create policy "Poster can update own referral requests"
  on public.referral_requests
  for update
  to authenticated
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

create policy "Graduates can help with open referral requests"
  on public.referral_requests
  for update
  to authenticated
  using (
    status = 'open'
    and accepted_by is null
    and helper_id is null
    and auth.uid() is distinct from student_id
    and public.can_view_referral(id, auth.uid())
  )
  with check (
    status = 'in_progress'
    and accepted_by = auth.uid()
    and coalesce(helper_id, accepted_by) = auth.uid()
    and auth.uid() is distinct from student_id
    and public.can_view_referral(id, auth.uid())
  );

create policy "Helper can update in-progress referral"
  on public.referral_requests
  for update
  to authenticated
  using (auth.uid() = coalesce(accepted_by, helper_id))
  with check (auth.uid() = coalesce(accepted_by, helper_id));

-- Unlock chat when helper starts (in_progress)
create or replace function public.unlock_conversation_on_referral_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  helper uuid;
begin
  helper := coalesce(new.helper_id, new.accepted_by);
  if new.status in ('in_progress', 'submitted')
     and (tg_op = 'INSERT'
          or old.status is distinct from new.status
          or coalesce(old.helper_id, old.accepted_by)
               is distinct from helper)
     and helper is not null
     and new.student_id is not null then
    perform public.upsert_accepted_conversation(
      new.student_id,
      helper,
      'referral'::text,
      'open'::text,
      null::uuid,
      null::uuid
    );
  end if;
  return new;
end;
$$;

drop trigger if exists referral_unlock_conversation on public.referral_requests;
create trigger referral_unlock_conversation
  after insert or update of status, accepted_by, helper_id on public.referral_requests
  for each row
  execute function public.unlock_conversation_on_referral_accept();

-- Notify poster when someone starts helping
create or replace function public.notify_referral_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  helper uuid;
  helper_name text;
begin
  helper := coalesce(new.helper_id, new.accepted_by);
  if new.status = 'in_progress'
     and (tg_op = 'INSERT' or old.status is distinct from 'in_progress')
     and helper is not null then
    select coalesce(nullif(trim(full_name), ''), 'Someone')
      into helper_name
    from public.profiles
    where id = helper;

    insert into public.notifications (user_id, type, title, body, link, payload)
    values (
      new.student_id,
      'referral_helping',
      helper_name || ' is helping with your referral',
      'They''re helping with your request for ' || new.role || ' at ' || new.company || '.',
      '/messages?with=' || helper::text,
      jsonb_build_object(
        'request_id', new.id,
        'accepted_by', helper,
        'helper_id', helper
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists referral_accepted_notify on public.referral_requests;
create trigger referral_accepted_notify
  after insert or update of status, accepted_by, helper_id on public.referral_requests
  for each row
  execute function public.notify_referral_accepted();

-- help_with_referral_request (replaces accept semantics); keep accept_referral_request alias
create or replace function public.help_with_referral_request(p_request_id uuid)
returns public.referral_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.referral_requests%rowtype;
  updated public.referral_requests%rowtype;
  helper uuid := auth.uid();
  denial text;
begin
  if helper is null then
    raise exception 'NOT_ALLOWED: You must be logged in.';
  end if;

  select * into r
  from public.referral_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND: Referral request not found.';
  end if;

  if r.student_id = helper then
    raise exception 'NOT_ALLOWED: You cannot help with your own referral request.';
  end if;

  if r.status is distinct from 'open'
     or r.accepted_by is not null
     or r.helper_id is not null then
    raise exception 'REFERRAL_ALREADY_TAKEN: Someone else has already taken this.';
  end if;

  if not public.can_view_referral(r.id, helper) then
    begin
      denial := public.referral_accept_denial_reason(r.id, helper);
    exception when undefined_function then
      denial := 'NOT_ALLOWED: You cannot help with this referral request.';
    end;
    raise exception '%', coalesce(denial, 'NOT_ALLOWED: You cannot help with this referral request.');
  end if;

  update public.referral_requests
  set
    status = 'in_progress',
    accepted_by = helper,
    helper_id = helper,
    accepted_at = coalesce(accepted_at, now()),
    stage_updated_at = now()
  where id = r.id
    and status = 'open'
    and accepted_by is null
    and helper_id is null
  returning * into updated;

  if not found then
    raise exception 'REFERRAL_ALREADY_TAKEN: Someone else has already taken this.';
  end if;

  perform public.upsert_accepted_conversation(
    updated.student_id,
    coalesce(updated.helper_id, updated.accepted_by),
    'referral'::text,
    'open'::text,
    null::uuid,
    null::uuid
  );

  return updated;
end;
$$;

revoke all on function public.help_with_referral_request(uuid) from public;
grant execute on function public.help_with_referral_request(uuid) to authenticated;

-- Compat alias: old name still works
create or replace function public.accept_referral_request(p_request_id uuid)
returns public.referral_requests
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.help_with_referral_request(p_request_id);
end;
$$;

revoke all on function public.accept_referral_request(uuid) from public;
grant execute on function public.accept_referral_request(uuid) to authenticated;

-- Helper / poster stage transitions via RPC
create or replace function public.update_referral_stage(
  p_request_id uuid,
  p_new_status text,
  p_outcome text default null,
  p_outcome_note text default null
)
returns public.referral_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.referral_requests%rowtype;
  updated public.referral_requests%rowtype;
  actor uuid := auth.uid();
  helper uuid;
begin
  if actor is null then
    raise exception 'NOT_ALLOWED: You must be logged in.';
  end if;

  if p_new_status not in ('submitted', 'closed', 'in_progress') then
    raise exception 'NOT_ALLOWED: Invalid referral stage.';
  end if;

  if p_outcome is not null
     and p_outcome not in ('referred', 'not_referred', 'no_response', 'withdrawn') then
    raise exception 'NOT_ALLOWED: Invalid outcome.';
  end if;

  select * into r
  from public.referral_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND: Referral request not found.';
  end if;

  helper := coalesce(r.helper_id, r.accepted_by);

  if actor is distinct from r.student_id and actor is distinct from helper then
    raise exception 'NOT_ALLOWED: Only the poster or helper can update this stage.';
  end if;

  if p_new_status = 'submitted' then
    if actor is distinct from helper then
      raise exception 'NOT_ALLOWED: Only the helper can mark submitted.';
    end if;
    if r.status not in ('in_progress', 'submitted') then
      raise exception 'NOT_ALLOWED: Request must be in progress to submit.';
    end if;
    update public.referral_requests
    set
      status = 'submitted',
      referred_at = coalesce(referred_at, now()),
      stage_updated_at = now()
    where id = r.id
    returning * into updated;

  elsif p_new_status = 'closed' then
    update public.referral_requests
    set
      status = 'closed',
      outcome = coalesce(
        p_outcome,
        case
          when actor = helper and p_outcome is null then 'not_referred'
          else outcome
        end
      ),
      outcome_note = coalesce(p_outcome_note, outcome_note),
      stage_updated_at = now()
    where id = r.id
    returning * into updated;

    -- Optional note to poster when helper couldn't refer
    if actor = helper
       and p_outcome_note is not null
       and nullif(trim(p_outcome_note), '') is not null then
      insert into public.notifications (user_id, type, title, body, link, payload)
      values (
        r.student_id,
        'referral_not_referred',
        'Update on ' || r.company,
        left(trim(p_outcome_note), 280),
        '/referrals',
        jsonb_build_object('request_id', r.id, 'outcome', 'not_referred')
      );
    end if;

  else
    -- in_progress reopen not supported via this path
    raise exception 'NOT_ALLOWED: Cannot set that stage.';
  end if;

  return updated;
end;
$$;

revoke all on function public.update_referral_stage(uuid, text, text, text) from public;
grant execute on function public.update_referral_stage(uuid, text, text, text) to authenticated;

-- Nudge helper once after 7 days in_progress with no stage change
create or replace function public.nudge_stale_referral_helpers()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  nudged int := 0;
  helper uuid;
begin
  for r in
    select *
    from public.referral_requests
    where status = 'in_progress'
      and helper_nudged_at is null
      and coalesce(stage_updated_at, accepted_at, created_at) <= now() - interval '7 days'
  loop
    helper := coalesce(r.helper_id, r.accepted_by);
    if helper is null then
      continue;
    end if;

    insert into public.notifications (user_id, type, title, body, link, payload)
    values (
      helper,
      'referral_nudge',
      'Any update on ' || r.company || '?',
      'You started helping with a referral request 7+ days ago. Mark submitted or close it if you couldn''t refer.',
      '/referrals',
      jsonb_build_object('request_id', r.id, 'company', r.company)
    );

    update public.referral_requests
    set helper_nudged_at = now()
    where id = r.id;

    nudged := nudged + 1;
  end loop;

  return nudged;
end;
$$;

revoke all on function public.nudge_stale_referral_helpers() from public;
grant execute on function public.nudge_stale_referral_helpers() to authenticated;

-- can_view: helper still sees after open; non-open board cards stay private
-- (recreate only the status gate bits via replace of existing function body pieces
--  — full can_view is large; patch accepted → in_progress/submitted helper path)

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

  -- Poster always
  if r.student_id = p_viewer_id then
    return true;
  end if;

  -- Helper always
  if coalesce(r.accepted_by, r.helper_id) = p_viewer_id then
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
  if lower(coalesce(v.status, 'student')) <> 'graduate' then
    return false;
  end if;

  -- Auto-expire open asks
  if r.status = 'open' then
    if (r.deadline is not null and r.deadline < current_date)
       or (r.deadline is null and r.created_at < now() - interval '30 days') then
      update public.referral_requests
      set status = 'expired', stage_updated_at = now()
      where id = r.id and status = 'open';
      return false;
    end if;
  end if;

  -- Non-open requests are not on the help board for other graduates
  if r.status is distinct from 'open' then
    return false;
  end if;

  target := coalesce(
    r.target_company_normalized,
    public.normalize_company_name(r.company)
  );
  viewer_company := public.normalize_company_name(v.company);
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

-- =============================================================================
-- FIX 2b — opportunity_applications progress stages
-- =============================================================================

alter table public.opportunity_applications
  add column if not exists outcome text;

alter table public.opportunity_applications
  add column if not exists stage_updated_at timestamptz;

alter table public.opportunity_applications
  drop constraint if exists opportunity_applications_status_check;

-- Find and drop any inline check from create table
do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'opportunity_applications'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%';
  if cname is not null then
    execute format('alter table public.opportunity_applications drop constraint %I', cname);
  end if;
end;
$$;

alter table public.opportunity_applications
  add constraint opportunity_applications_status_check
  check (status in (
    'pending', 'accepted', 'declined', 'withdrawn',
    'reviewing', 'shortlisted', 'closed'
  ));

-- Disable guard during remap: SQL Editor auth.uid() is null → old guard raises
-- NOT_ALLOWED: Not permitted. (see hotfix_opportunity_progress_stages_guard)
alter table public.opportunity_applications
  disable trigger opportunity_applications_guard_update;

update public.opportunity_applications
set
  status = 'reviewing',
  stage_updated_at = coalesce(stage_updated_at, now())
where status = 'accepted';

update public.opportunity_applications
set
  status = 'closed',
  outcome = coalesce(outcome, 'not_selected'),
  stage_updated_at = coalesce(stage_updated_at, now())
where status = 'declined';

update public.opportunity_applications
set stage_updated_at = coalesce(stage_updated_at, created_at, now())
where stage_updated_at is null;

alter table public.opportunity_applications
  enable trigger opportunity_applications_guard_update;

alter table public.opportunity_applications
  drop constraint if exists opportunity_applications_status_check;

alter table public.opportunity_applications
  add constraint opportunity_applications_status_check
  check (status in ('pending', 'reviewing', 'shortlisted', 'closed', 'withdrawn'));

alter table public.opportunity_applications
  drop constraint if exists opportunity_applications_outcome_check;

alter table public.opportunity_applications
  add constraint opportunity_applications_outcome_check
  check (
    outcome is null
    or outcome in ('moved_forward', 'not_selected', 'withdrawn')
  );

create or replace function public.opportunity_applications_touch_stage()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.stage_updated_at := coalesce(new.stage_updated_at, now());
  elsif old.status is distinct from new.status
        or old.outcome is distinct from new.outcome then
    new.stage_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists opportunity_applications_touch_stage on public.opportunity_applications;
create trigger opportunity_applications_touch_stage
  before insert or update of status, outcome on public.opportunity_applications
  for each row
  execute function public.opportunity_applications_touch_stage();

-- Unlock + notify on reviewing (was accepted)
create or replace function public.opportunity_application_after_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  poster uuid;
  existing public.conversations%rowtype;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select posted_by into poster
  from public.opportunities
  where id = new.opportunity_id;

  if poster is null then
    return new;
  end if;

  select *
    into existing
  from public.conversations c
  where least(c.initiator_id, c.recipient_id) = least(new.applicant_id, poster)
    and greatest(c.initiator_id, c.recipient_id) = greatest(new.applicant_id, poster)
  limit 1;

  if new.status in ('reviewing', 'shortlisted')
     and old.status is distinct from new.status then
    perform public.upsert_accepted_conversation(
      new.applicant_id,
      poster,
      'opportunity_application'::text,
      'open'::text,
      null::uuid,
      null::uuid
    );

    if old.status = 'pending' and new.status = 'reviewing' then
      insert into public.notifications (user_id, type, title, body, link, payload)
      values (
        new.applicant_id,
        'opportunity_application_reviewing',
        'Your application is being reviewed',
        'You can chat with the poster now.',
        '/messages?with=' || poster::text,
        jsonb_build_object(
          'opportunity_id', new.opportunity_id,
          'application_id', new.id
        )
      );
    end if;
  elsif new.status = 'closed'
        and coalesce(new.outcome, 'not_selected') = 'not_selected' then
    -- Silent beyond status for "Not a fit" — no noisy push required.
    -- Keep pending conversation declined if it never opened.
    if found and existing.status = 'pending' then
      update public.conversations
      set
        status = 'declined',
        updated_at = now()
      where id = existing.id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists opportunity_application_after_status
  on public.opportunity_applications;
create trigger opportunity_application_after_status
  after update of status on public.opportunity_applications
  for each row
  execute function public.opportunity_application_after_status();

-- Drop old 2-arg overload if present, keep single 3-arg with default
drop function if exists public.decide_opportunity_application(uuid, text);
drop function if exists public.decide_opportunity_application(uuid, text, text);

create or replace function public.decide_opportunity_application(
  p_application_id uuid,
  p_new_status text,
  p_outcome text default null
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
  next_status text;
  next_outcome text;
begin
  if actor is null then
    raise exception 'NOT_ALLOWED: You must be logged in.';
  end if;

  next_status := case p_new_status
    when 'accepted' then 'reviewing'
    when 'declined' then 'closed'
    else p_new_status
  end;

  if next_status not in ('reviewing', 'shortlisted', 'closed') then
    raise exception 'NOT_ALLOWED: Poster may set reviewing, shortlisted, or closed.';
  end if;

  next_outcome := case
    when next_status = 'closed' then coalesce(p_outcome, 'not_selected')
    when next_status = 'shortlisted' then coalesce(p_outcome, 'moved_forward')
    else p_outcome
  end;

  if next_outcome is not null
     and next_outcome not in ('moved_forward', 'not_selected', 'withdrawn') then
    raise exception 'NOT_ALLOWED: Invalid application outcome.';
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

  if next_status = 'reviewing' then
    if app.status is distinct from 'pending' then
      if app.status in ('reviewing', 'shortlisted', 'closed') then
        raise exception 'APPLICATION_ALREADY_DECIDED: This application was already decided.';
      end if;
      raise exception 'NOT_ALLOWED: Only pending applications can move to reviewing.';
    end if;
  elsif next_status = 'shortlisted' then
    if app.status not in ('reviewing', 'shortlisted') then
      raise exception 'NOT_ALLOWED: Only reviewing applications can be shortlisted.';
    end if;
  elsif next_status = 'closed' then
    if app.status not in ('pending', 'reviewing', 'shortlisted') then
      raise exception 'NOT_ALLOWED: This application cannot be closed.';
    end if;
  end if;

  update public.opportunity_applications
  set
    status = next_status,
    outcome = case
      when next_status = 'closed' then next_outcome
      when next_status = 'shortlisted' then coalesce(next_outcome, outcome)
      else outcome
    end,
    stage_updated_at = now()
  where id = app.id
  returning * into updated;

  if not found then
    raise exception 'APPLICATION_ALREADY_DECIDED: This application was already decided.';
  end if;

  return updated;
end;
$$;

revoke all on function public.decide_opportunity_application(uuid, text, text) from public;
grant execute on function public.decide_opportunity_application(uuid, text, text) to authenticated;

-- Guard update for application status transitions
create or replace function public.opportunity_applications_guard_update()
returns trigger
language plpgsql
as $$
declare
  poster uuid;
begin
  select posted_by into poster
  from public.opportunities
  where id = new.opportunity_id;

  if auth.uid() = new.applicant_id then
    if new.status = 'withdrawn'
       and old.status in ('pending', 'reviewing', 'shortlisted')
       and new.applicant_id = old.applicant_id then
      new.outcome := coalesce(new.outcome, 'withdrawn');
      return new;
    end if;
    raise exception 'NOT_ALLOWED: Applicants may only withdraw.';
  end if;

  if auth.uid() = poster then
    if old.status = 'pending' and new.status in ('reviewing', 'closed') then
      return new;
    end if;
    if old.status = 'reviewing' and new.status in ('shortlisted', 'closed') then
      return new;
    end if;
    if old.status = 'shortlisted' and new.status = 'closed' then
      return new;
    end if;
    if old.status = new.status and old.outcome is distinct from new.outcome then
      return new;
    end if;
    raise exception 'NOT_ALLOWED: Invalid application status transition.';
  end if;

  raise exception 'NOT_ALLOWED: You cannot update this application.';
end;
$$;
