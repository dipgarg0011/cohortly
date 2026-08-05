-- Recovery: ensure referral_requests columns + stages the app SELECT expects
-- =============================================================================
-- Run this ONE file in Supabase → SQL Editor (production) if /referrals shows:
--   "Couldn't load referral requests…"
--
-- Typical cause: partial run of
--   20260805_referral_opportunity_progress_stages.sql
-- then only
--   20260805_hotfix_opportunity_progress_stages_guard.sql
-- (that hotfix finishes opportunity_applications only — NOT referral_requests).
--
-- Self-contained + idempotent. Does NOT depend on prior partial runs.
-- Does NOT redefine upsert_accepted_conversation.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Helpers used by triggers / RPCs (safe if already present)
-- -----------------------------------------------------------------------------

create or replace function public.normalize_company_name(p_company text)
returns text
language sql
immutable
as $$
  select nullif(
    lower(regexp_replace(coalesce(p_company, ''), '[^a-zA-Z0-9]+', '', 'g')),
    ''
  );
$$;

-- -----------------------------------------------------------------------------
-- 1) Columns required by REFERRAL_SELECT (lib/referrals.ts)
-- -----------------------------------------------------------------------------

alter table public.referral_requests
  add column if not exists accepted_by uuid references public.profiles(id);

alter table public.referral_requests
  add column if not exists helper_id uuid references public.profiles(id);

alter table public.referral_requests
  add column if not exists target_company_normalized text;

alter table public.referral_requests
  add column if not exists visibility_tier int default 1;

alter table public.referral_requests
  add column if not exists opened_to_all_at timestamptz;

alter table public.referral_requests
  add column if not exists context text;

alter table public.referral_requests
  add column if not exists accepted_at timestamptz;

alter table public.referral_requests
  add column if not exists referred_at timestamptz;

alter table public.referral_requests
  add column if not exists stage_updated_at timestamptz;

alter table public.referral_requests
  add column if not exists outcome text;

alter table public.referral_requests
  add column if not exists outcome_note text;

alter table public.referral_requests
  add column if not exists helper_nudged_at timestamptz;

comment on column public.referral_requests.helper_id is
  'Graduate helping with this request. Synonym of accepted_by (kept in sync).';
comment on column public.referral_requests.accepted_by is
  'Legacy synonym of helper_id — kept for FK/RLS compatibility.';
comment on column public.referral_requests.outcome is
  'Completion outcome set when closed: referred | not_referred | no_response | withdrawn';

-- -----------------------------------------------------------------------------
-- 2) Related tables the Referrals page also queries
-- -----------------------------------------------------------------------------

create table if not exists public.referral_dismissals (
  request_id uuid not null references public.referral_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

alter table public.referral_dismissals enable row level security;

drop policy if exists "Users manage own referral dismissals" on public.referral_dismissals;
create policy "Users manage own referral dismissals"
  on public.referral_dismissals
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

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
  with check (viewer_id = auth.uid());

drop policy if exists "Poster and viewer can read referral views" on public.referral_views;
create policy "Poster and viewer can read referral views"
  on public.referral_views
  for select
  to authenticated
  using (
    viewer_id = auth.uid()
    or exists (
      select 1 from public.referral_requests r
      where r.id = request_id and r.student_id = auth.uid()
    )
  );

create table if not exists public.referral_questions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.referral_requests(id) on delete cascade,
  asker_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.referral_questions enable row level security;

-- -----------------------------------------------------------------------------
-- 3) Status / outcome checks + backfill (guard-safe for SQL Editor)
-- -----------------------------------------------------------------------------

-- Drop any status check (named or inline)
alter table public.referral_requests
  drop constraint if exists referral_requests_status_check;

do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'referral_requests'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%';
  if cname is not null then
    execute format('alter table public.referral_requests drop constraint %I', cname);
  end if;
end;
$$;

-- Transitional: allow old + new while remapping
alter table public.referral_requests
  add constraint referral_requests_status_check
  check (status in (
    'open', 'accepted', 'in_progress', 'submitted', 'closed', 'expired'
  ));

-- Disable accept-column guard if present (auth.uid() is null in SQL Editor)
do $$
begin
  alter table public.referral_requests
    disable trigger referral_requests_guard_accept_columns;
exception
  when undefined_object then null;
end;
$$;

update public.referral_requests
set helper_id = accepted_by
where accepted_by is not null
  and helper_id is distinct from accepted_by;

update public.referral_requests
set stage_updated_at = coalesce(accepted_at, referred_at, created_at, now())
where stage_updated_at is null;

update public.referral_requests
set
  status = 'in_progress',
  helper_id = coalesce(helper_id, accepted_by),
  stage_updated_at = coalesce(stage_updated_at, accepted_at, now())
where status = 'accepted';

update public.referral_requests
set
  status = 'submitted',
  stage_updated_at = coalesce(referred_at, stage_updated_at, now())
where referred_at is not null
  and status = 'in_progress';

update public.referral_requests
set target_company_normalized = public.normalize_company_name(company)
where target_company_normalized is null
  and company is not null;

do $$
begin
  alter table public.referral_requests
    enable trigger referral_requests_guard_accept_columns;
exception
  when undefined_object then null;
end;
$$;

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

-- -----------------------------------------------------------------------------
-- 4) Sync helper_id ↔ accepted_by + stage timestamps
-- -----------------------------------------------------------------------------

create or replace function public.referral_requests_sync_helper_and_stage()
returns trigger
language plpgsql
as $$
begin
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

-- -----------------------------------------------------------------------------
-- 5) Guard + update policies for progress stages
-- -----------------------------------------------------------------------------

create or replace function public.referral_requests_guard_accept_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

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

  if auth.uid() = new.student_id and auth.uid() = old.student_id then
    return new;
  end if;

  if old.status = 'open'
     and old.accepted_by is null
     and old.helper_id is null
     and new.status = 'in_progress'
     and new.accepted_by = auth.uid()
     and coalesce(new.helper_id, new.accepted_by) = auth.uid() then
    return new;
  end if;

  if coalesce(old.accepted_by, old.helper_id) = auth.uid()
     and coalesce(new.accepted_by, new.helper_id) = auth.uid() then
    return new;
  end if;

  raise exception 'NOT_ALLOWED: You cannot change these referral fields.';
end;
$$;

drop trigger if exists referral_requests_guard_accept_columns on public.referral_requests;
create trigger referral_requests_guard_accept_columns
  before update on public.referral_requests
  for each row
  execute function public.referral_requests_guard_accept_columns();

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
  )
  with check (
    status = 'in_progress'
    and accepted_by = auth.uid()
    and coalesce(helper_id, accepted_by) = auth.uid()
    and auth.uid() is distinct from student_id
  );

create policy "Helper can update in-progress referral"
  on public.referral_requests
  for update
  to authenticated
  using (auth.uid() = coalesce(accepted_by, helper_id))
  with check (auth.uid() = coalesce(accepted_by, helper_id));

-- -----------------------------------------------------------------------------
-- 6) Minimum RPCs the board calls
-- -----------------------------------------------------------------------------

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

  -- Prefer can_view when present; otherwise allow (board was already visible)
  begin
    if not public.can_view_referral(r.id, helper) then
      raise exception 'NOT_ALLOWED: You cannot help with this referral request.';
    end if;
  exception
    when undefined_function then null;
  end;

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

  begin
    perform public.upsert_accepted_conversation(
      updated.student_id,
      coalesce(updated.helper_id, updated.accepted_by),
      'referral'::text,
      'open'::text,
      null::uuid,
      null::uuid
    );
  exception
    when undefined_function then null;
  end;

  return updated;
end;
$$;

revoke all on function public.help_with_referral_request(uuid) from public;
grant execute on function public.help_with_referral_request(uuid) to authenticated;

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

  else
    raise exception 'NOT_ALLOWED: Cannot set that stage.';
  end if;

  return updated;
end;
$$;

revoke all on function public.update_referral_stage(uuid, text, text, text) from public;
grant execute on function public.update_referral_stage(uuid, text, text, text) to authenticated;

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

-- Notify PostgREST to reload schema (best-effort; no-op if extension absent)
notify pgrst, 'reload schema';
