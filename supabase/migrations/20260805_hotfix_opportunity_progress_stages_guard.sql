-- Hotfix: finish opportunity progress-stage backfill after guard blocked prior migration
-- Run this in Supabase → SQL Editor (production) if
--   20260805_referral_opportunity_progress_stages.sql failed with:
--   P0001 NOT_ALLOWED: Not permitted.
--   CONTEXT: opportunity_applications_guard_update() … at RAISE
--
-- Cause: SQL Editor runs with auth.uid() = null; the old guard rejects non-poster /
-- non-applicant updates. Status remaps (accepted→reviewing, declined→closed) never
-- applied; everything after that UPDATE in Fix 2b also did not apply.
--
-- Assumes Fix 1 + Fix 2a (referral stages) already applied before the failure.
-- Idempotent. Safe after partial failure.
-- Does NOT redefine upsert_accepted_conversation.

-- =============================================================================
-- 1) Columns + transitional status check (idempotent if prior paste got this far)
-- =============================================================================

alter table public.opportunity_applications
  add column if not exists outcome text;

alter table public.opportunity_applications
  add column if not exists stage_updated_at timestamptz;

alter table public.opportunity_applications
  drop constraint if exists opportunity_applications_status_check;

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

-- =============================================================================
-- 2) Disable guard → status backfill → re-enable
-- =============================================================================

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

-- =============================================================================
-- 3) Final constraints
-- =============================================================================

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

-- =============================================================================
-- 4) Stage touch + after-status (reviewing unlock) + decide RPC + new guard
-- =============================================================================

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

drop trigger if exists opportunity_applications_guard_update
  on public.opportunity_applications;
create trigger opportunity_applications_guard_update
  before update on public.opportunity_applications
  for each row
  execute function public.opportunity_applications_guard_update();
