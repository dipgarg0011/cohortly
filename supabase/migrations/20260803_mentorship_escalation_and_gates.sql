-- Cohortly: mentorship escalation (no silent expiry) + turn-based follow-up gates
-- Run AFTER:
--   20260803_mentorship_request_match.sql
--   20260803_mentorship_anonymous_answers.sql
--   20260803_connection_requests.sql
--   20260803_referral_tiered_visibility.sql (notifications + referral questions)
--
-- Run in Supabase → SQL Editor. Confirm success before any frontend work.

-- =============================================================================
-- A1) mentorship_requests — escalation + resolution columns
-- =============================================================================

alter table public.mentorship_requests
  add column if not exists reach_stage int not null default 1,
  add column if not exists last_escalated_at timestamptz,
  add column if not exists nudge_count int not null default 0,
  add column if not exists resolution text,
  add column if not exists is_public_after_expiry boolean not null default true,
  add column if not exists awaiting_resolution_at timestamptz;

alter table public.mentorship_requests
  drop constraint if exists mentorship_requests_reach_stage_check;
alter table public.mentorship_requests
  add constraint mentorship_requests_reach_stage_check
  check (reach_stage between 1 and 4);

alter table public.mentorship_requests
  drop constraint if exists mentorship_requests_resolution_check;
alter table public.mentorship_requests
  add constraint mentorship_requests_resolution_check
  check (
    resolution is null
    or resolution in (
      'answered',
      'accepted',
      'no_match',
      'withdrawn',
      'archived_unanswered',
      'posted_public',
      'reposted',
      'moved_referrals',
      'watching'
    )
  );

-- Allow awaiting_resolution while student chooses convert options
do $$
begin
  alter table public.mentorship_requests
    drop constraint if exists mentorship_requests_status_check;
exception when undefined_object then null;
end $$;

alter table public.mentorship_requests
  drop constraint if exists mentorship_requests_status_check;

alter table public.mentorship_requests
  add constraint mentorship_requests_status_check
  check (
    status in (
      'open',
      'matched',
      'closed',
      'expired',
      'awaiting_resolution'
    )
  );

create index if not exists mentorship_requests_reach_stage_idx
  on public.mentorship_requests (reach_stage, status)
  where status = 'open';

create index if not exists mentorship_requests_public_pool_idx
  on public.mentorship_requests (created_at desc)
  where status = 'open' and reach_stage >= 4;

-- =============================================================================
-- A2) request_matches — reminder + auto_expired
-- =============================================================================

alter table public.request_matches
  add column if not exists reminded_at timestamptz,
  add column if not exists auto_expired boolean not null default false;

-- =============================================================================
-- A3) Stage from age (READ TIME — STABLE, uses now())
-- =============================================================================

create or replace function public.mentorship_computed_stage(p_created_at timestamptz)
returns int
language sql
stable
as $$
  select case
    when p_created_at is null then 1
    when now() < p_created_at + interval '3 days' then 1
    when now() < p_created_at + interval '6 days' then 2
    when now() < p_created_at + interval '9 days' then 3
    else 4
  end;
$$;

-- =============================================================================
-- Helper: insert matches for a stage threshold (skip already-matched mentors)
-- =============================================================================

create or replace function public.mentorship_add_matches_for_stage(
  p_request public.mentorship_requests,
  p_stage int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted int := 0;
  r record;
  v_open int;
  v_max int;
  c_top_n constant int := 12;
  v_student_dept text;
begin
  select nullif(trim(department), '') into v_student_dept
  from public.profiles
  where id = p_request.student_id;

  for r in
    with scored as (
      select
        ma.mentor_id,
        ma.max_open_requests,
        p.department as mentor_dept,
        scored.score,
        scored.reasons
      from public.mentor_availability ma
      join public.profiles p on p.id = ma.mentor_id
      cross join lateral public.score_mentor_for_request(
        p_request,
        ma.mentor_id,
        p.skills,
        p.department,
        p.company,
        coalesce(p.role_title, p.current_job),
        coalesce(ma.bio_note, p.bio),
        ma.topics,
        ma.session_lengths
      ) as scored(score, reasons)
      where ma.is_available = true
        and ma.mentor_id is distinct from p_request.student_id
        and not exists (
          select 1
          from public.request_matches rm
          where rm.request_id = p_request.id
            and rm.mentor_id = ma.mentor_id
        )
    )
    select *
    from scored s
    where
      case p_stage
        when 1 then s.score > 30
        when 2 then s.score >= 15
        when 3 then (
          v_student_dept is not null
          and nullif(trim(s.mentor_dept), '') is not null
          and lower(trim(s.mentor_dept)) = lower(v_student_dept)
        )
        when 4 then true
        else false
      end
    order by s.score desc nulls last
    limit c_top_n
  loop
    select count(*)::int into v_open
    from public.request_matches rm
    where rm.mentor_id = r.mentor_id
      and rm.status = 'pending';

    v_max := greatest(coalesce(r.max_open_requests, 3), 1);
    if v_open >= v_max and p_stage < 4 then
      continue;
    end if;

    insert into public.request_matches (
      request_id,
      mentor_id,
      match_score,
      match_reasons,
      status
    )
    values (
      p_request.id,
      r.mentor_id,
      coalesce(r.score, 0),
      coalesce(r.reasons, '{}'),
      'pending'
    )
    on conflict (request_id, mentor_id) do nothing;

    if found then
      inserted := inserted + 1;

      if to_regprocedure('public.create_notification(uuid,text,text,text,text,jsonb)') is not null
         or exists (
           select 1 from pg_proc where proname = 'create_notification'
         ) then
        begin
          insert into public.notifications (user_id, type, title, body, link, payload)
          values (
            r.mentor_id,
            'mentorship_match',
            'New mentorship ask for you',
            left(coalesce(p_request.title, 'A student needs help'), 120),
            '/mentors',
            jsonb_build_object(
              'request_id', p_request.id,
              'stage', p_stage
            )
          );
        exception when others then
          null;
        end;
      else
        insert into public.notifications (user_id, type, title, body, link, payload)
        values (
          r.mentor_id,
          'mentorship_match',
          'New mentorship ask for you',
          left(coalesce(p_request.title, 'A student needs help'), 120),
          '/mentors',
          jsonb_build_object(
            'request_id', p_request.id,
            'stage', p_stage
          )
        );
      end if;
    end if;
  end loop;

  return inserted;
end;
$$;

-- =============================================================================
-- A3) escalate_request — widen one computed stage at a time (idempotent)
-- =============================================================================

create or replace function public.escalate_request(p_request_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.mentorship_requests%rowtype;
  desired int;
  stage int;
  total_inserted int := 0;
  n int;
begin
  select * into req
  from public.mentorship_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND: Mentorship request not found.';
  end if;

  if req.status not in ('open', 'awaiting_resolution') then
    return 0;
  end if;

  if req.resolution is not null
     and req.resolution in ('withdrawn', 'archived_unanswered', 'answered', 'accepted') then
    return 0;
  end if;

  desired := public.mentorship_computed_stage(req.created_at);

  -- Advance stored stage up to desired, creating matches per stage
  stage := greatest(coalesce(req.reach_stage, 1), 1);
  while stage <= desired loop
    if stage > coalesce(req.reach_stage, 0) or stage = 1 then
      n := public.mentorship_add_matches_for_stage(req, stage);
      total_inserted := total_inserted + n;
    end if;
    stage := stage + 1;
  end loop;

  update public.mentorship_requests
  set
    reach_stage = greatest(coalesce(reach_stage, 1), desired),
    last_escalated_at = case
      when desired > coalesce(req.reach_stage, 1) then now()
      else coalesce(last_escalated_at, case when total_inserted > 0 then now() else last_escalated_at end)
    end
  where id = req.id;

  return total_inserted;
end;
$$;

revoke all on function public.escalate_request(uuid) from public;
grant execute on function public.escalate_request(uuid) to authenticated;

-- Replace initial router to use stage-1 escalation (>30)
create or replace function public.route_mentorship_request(p_request_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.escalate_request(p_request_id);
end;
$$;

-- Batch helper: escalate every open request (call from app / dashboard load)
create or replace function public.escalate_open_mentorship_requests()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  total int := 0;
begin
  for r in
    select id
    from public.mentorship_requests
    where status = 'open'
      and (resolution is null or resolution = 'watching')
  loop
    total := total + public.escalate_request(r.id);
  end loop;
  return total;
end;
$$;

revoke all on function public.escalate_open_mentorship_requests() from public;
grant execute on function public.escalate_open_mentorship_requests() to authenticated;

-- =============================================================================
-- A4) nudge_unresponsive_matches — ONE reminder ever per mentor/request
-- =============================================================================

create or replace function public.nudge_unresponsive_matches()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  nudged int := 0;
begin
  for r in
    select
      rm.id as match_id,
      rm.mentor_id,
      rm.request_id,
      mr.title
    from public.request_matches rm
    join public.mentorship_requests mr on mr.id = rm.request_id
    where rm.status = 'pending'
      and rm.reminded_at is null
      and rm.created_at <= now() - interval '48 hours'
      and mr.status = 'open'
  loop
    update public.request_matches
    set reminded_at = now()
    where id = r.match_id
      and reminded_at is null;

    if found then
      nudged := nudged + 1;

      insert into public.notifications (user_id, type, title, body, link, payload)
      values (
        r.mentor_id,
        'mentorship_nudge',
        'A student is still waiting',
        left(coalesce(r.title, 'Mentorship ask'), 120) || ' — gentle reminder',
        '/mentors',
        jsonb_build_object(
          'request_id', r.request_id,
          'match_id', r.match_id
        )
      );

      update public.mentorship_requests
      set nudge_count = coalesce(nudge_count, 0) + 1
      where id = r.request_id;
    end if;
  end loop;

  return nudged;
end;
$$;

revoke all on function public.nudge_unresponsive_matches() from public;
grant execute on function public.nudge_unresponsive_matches() to authenticated;

-- =============================================================================
-- A5) Expiry rules — day 14 + stage 4 only; never if unseen; else extend
-- =============================================================================

create or replace function public.apply_mentorship_expiry_rules()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.mentorship_requests%rowtype;
  touched int := 0;
  v_stage int;
  v_seen int;
  v_answered int;
begin
  for req in
    select *
    from public.mentorship_requests
    where status in ('open', 'awaiting_resolution')
  loop
    v_stage := public.mentorship_computed_stage(req.created_at);
    perform public.escalate_request(req.id);

    select count(*)::int into v_seen
    from public.request_matches
    where request_id = req.id;

    select count(*)::int into v_answered
    from public.request_matches
    where request_id = req.id
      and status in ('answered', 'accepted');

    -- Auto-archive if student ignored resolution screen for 7+ days
    if req.status = 'awaiting_resolution'
       and req.awaiting_resolution_at is not null
       and req.awaiting_resolution_at <= now() - interval '7 days'
       and coalesce(req.resolution, '') not in (
         'posted_public', 'reposted', 'moved_referrals', 'watching',
         'answered', 'accepted', 'withdrawn'
       ) then
      update public.mentorship_requests
      set
        status = 'expired',
        resolution = 'archived_unanswered'
      where id = req.id;
      touched := touched + 1;
      continue;
    end if;

    -- Before day 14: nothing to expire
    if now() < req.created_at + interval '14 days' then
      continue;
    end if;

    -- NEVER expire a request no mentor has ever seen — extend + keep escalating
    if v_seen = 0 then
      update public.mentorship_requests
      set expires_at = greatest(expires_at, now() + interval '3 days')
      where id = req.id;
      touched := touched + 1;
      continue;
    end if;

    -- Already has an answer/accept — mark resolution if needed
    if v_answered > 0 then
      update public.mentorship_requests
      set
        resolution = coalesce(resolution, 'answered'),
        status = case when status = 'open' then 'matched' else status end
      where id = req.id
        and (resolution is null or status = 'open');
      continue;
    end if;

    -- Day 14 but not yet stage 4 → extend, do not expire
    if v_stage < 4 then
      update public.mentorship_requests
      set expires_at = greatest(expires_at, now() + interval '3 days')
      where id = req.id;
      touched := touched + 1;
      continue;
    end if;

    -- Day 14 + stage 4 + seen + unanswered → resolution screen (not silent archive)
    if req.status = 'open' then
      update public.mentorship_requests
      set
        status = 'awaiting_resolution',
        awaiting_resolution_at = coalesce(awaiting_resolution_at, now()),
        expires_at = greatest(expires_at, now() + interval '7 days')
      where id = req.id;
      touched := touched + 1;

      insert into public.notifications (user_id, type, title, body, link, payload)
      values (
        req.student_id,
        'mentorship_resolution',
        'Still unanswered — here''s what you can do',
        left(coalesce(req.title, 'Your mentorship ask'), 120),
        '/mentors',
        jsonb_build_object('request_id', req.id)
      );
    end if;
  end loop;

  return touched;
end;
$$;

revoke all on function public.apply_mentorship_expiry_rules() from public;
grant execute on function public.apply_mentorship_expiry_rules() to authenticated;

-- Student resolution actions
create or replace function public.resolve_mentorship_request(
  p_request_id uuid,
  p_action text
)
returns public.mentorship_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.mentorship_requests%rowtype;
begin
  select * into req
  from public.mentorship_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND: Mentorship request not found.';
  end if;

  if auth.uid() is distinct from req.student_id then
    raise exception 'NOT_ALLOWED: Only the asker can resolve this request.';
  end if;

  if p_action = 'post_public' then
    update public.mentorship_requests
    set
      is_public_after_expiry = true,
      reach_stage = 4,
      resolution = 'posted_public',
      status = 'open',
      awaiting_resolution_at = null
    where id = req.id
    returning * into req;

  elsif p_action = 'watch' then
    update public.mentorship_requests
    set
      resolution = 'watching',
      status = 'awaiting_resolution',
      awaiting_resolution_at = coalesce(awaiting_resolution_at, now())
    where id = req.id
    returning * into req;

    insert into public.mentorship_watches (
      student_id, request_id, tags, department, active
    )
    select
      req.student_id,
      req.id,
      req.tags,
      p.department,
      true
    from public.profiles p
    where p.id = req.student_id
    on conflict (student_id, request_id) do update
      set active = true,
          tags = excluded.tags,
          department = excluded.department;

  elsif p_action = 'withdraw' then
    update public.mentorship_requests
    set
      resolution = 'withdrawn',
      status = 'closed',
      awaiting_resolution_at = null
    where id = req.id
    returning * into req;

  elsif p_action = 'archive' then
    update public.mentorship_requests
    set
      resolution = 'archived_unanswered',
      status = 'expired',
      awaiting_resolution_at = null
    where id = req.id
    returning * into req;

  else
    raise exception 'INVALID_ACTION: Unknown resolution action.';
  end if;

  return req;
end;
$$;

-- =============================================================================
-- Standing watches — notify when a matching graduate joins / becomes available
-- =============================================================================

create table if not exists public.mentorship_watches (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null references public.mentorship_requests(id) on delete cascade,
  tags text[] not null default '{}',
  department text,
  active boolean not null default true,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (student_id, request_id)
);

create index if not exists mentorship_watches_active_idx
  on public.mentorship_watches (active, created_at desc)
  where active = true;

alter table public.mentorship_watches enable row level security;

drop policy if exists "Students manage own watches" on public.mentorship_watches;
create policy "Students manage own watches"
  on public.mentorship_watches
  for all
  to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

revoke all on function public.resolve_mentorship_request(uuid, text) from public;
grant execute on function public.resolve_mentorship_request(uuid, text) to authenticated;

-- When mentor_availability becomes available, check watches
create or replace function public.notify_mentorship_watches_for_mentor(p_mentor_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
  mentor public.profiles%rowtype;
  n int := 0;
  overlap int;
begin
  select * into mentor from public.profiles where id = p_mentor_id;
  if not found then
    return 0;
  end if;

  for w in
    select *
    from public.mentorship_watches
    where active = true
      and student_id is distinct from p_mentor_id
      and (last_notified_at is null or last_notified_at <= now() - interval '7 days')
  loop
    select count(*)::int into overlap
    from unnest(coalesce(w.tags, '{}')) t
    where lower(t) in (
      select lower(x) from unnest(coalesce(mentor.skills, '{}')) x
    );

    if overlap > 0
       or (
         w.department is not null
         and mentor.department is not null
         and lower(trim(w.department)) = lower(trim(mentor.department))
       ) then
      insert into public.notifications (user_id, type, title, body, link, payload)
      values (
        w.student_id,
        'mentorship_watch_match',
        'Someone relevant just joined',
        'A graduate matching your unanswered ask is now available — want to re-send?',
        '/mentors',
        jsonb_build_object(
          'request_id', w.request_id,
          'mentor_id', p_mentor_id
        )
      );

      update public.mentorship_watches
      set last_notified_at = now()
      where id = w.id;

      n := n + 1;
    end if;
  end loop;

  return n;
end;
$$;

create or replace function public.mentor_availability_watch_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_available = true
     and (tg_op = 'INSERT' or old.is_available is distinct from true) then
    perform public.notify_mentorship_watches_for_mentor(new.mentor_id);
  end if;
  return new;
end;
$$;

drop trigger if exists mentor_availability_watch_notify on public.mentor_availability;
create trigger mentor_availability_watch_notify
  after insert or update of is_available on public.mentor_availability
  for each row
  execute function public.mentor_availability_watch_notify();

-- =============================================================================
-- B6) conversations — gate columns
-- =============================================================================

alter table public.conversations
  add column if not exists gate_mode text not null default 'open',
  add column if not exists turn_holder uuid references public.profiles(id),
  add column if not exists reply_count_by_recipient int not null default 0,
  add column if not exists gate_lifted_at timestamptz,
  -- Required for turn enforcement (who is under the gate). Mentor = the other party.
  add column if not exists gate_student_id uuid references public.profiles(id);

alter table public.conversations
  drop constraint if exists conversations_gate_mode_check;
alter table public.conversations
  add constraint conversations_gate_mode_check
  check (gate_mode in ('locked', 'turn_based', 'open'));

-- Existing accepted chats stay fully open
update public.conversations
set gate_mode = 'open'
where status = 'accepted'
  and gate_mode is distinct from 'open';

update public.conversations
set gate_mode = 'locked'
where status = 'pending'
  and gate_mode is distinct from 'locked';

-- Optional system flag for inline thread notices
alter table public.messages
  add column if not exists is_system boolean not null default false;

-- =============================================================================
-- B7/B8) upsert that NEVER tightens gates + turn_based unlock helper
-- =============================================================================

create or replace function public.gate_rank(p_mode text)
returns int
language sql
immutable
as $$
  select case p_mode
    when 'locked' then 0
    when 'turn_based' then 1
    when 'open' then 2
    else 2
  end;
$$;

create or replace function public.upsert_accepted_conversation(
  p_user_a uuid,
  p_user_b uuid,
  p_reason text,
  p_desired_gate text default 'open',
  p_gate_student uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conv_id uuid;
  existing public.conversations%rowtype;
  desired text := coalesce(nullif(p_desired_gate, ''), 'open');
  new_mode text;
  v_student uuid;
begin
  if p_user_a is null or p_user_b is null or p_user_a = p_user_b then
    return null;
  end if;

  if desired not in ('locked', 'turn_based', 'open') then
    desired := 'open';
  end if;

  v_student := coalesce(p_gate_student, case when desired = 'turn_based' then p_user_a else null end);

  select *
    into existing
  from public.conversations c
  where least(c.initiator_id, c.recipient_id) = least(p_user_a, p_user_b)
    and greatest(c.initiator_id, c.recipient_id) = greatest(p_user_a, p_user_b)
  limit 1;

  if found then
    -- declined/blocked: do not reopen status for messaging; leave as-is
    if existing.status in ('declined', 'blocked') then
      return existing.id;
    end if;

    -- Never tighten gate_mode (open must never regress)
    if public.gate_rank(existing.gate_mode) >= public.gate_rank(desired) then
      new_mode := existing.gate_mode;
    else
      new_mode := desired;
    end if;

    -- Already accepted via connection request (open) → stay open
    if existing.status = 'accepted'
       and coalesce(existing.gate_mode, 'open') = 'open' then
      new_mode := 'open';
    end if;

    update public.conversations
    set
      status = 'accepted',
      unlock_reason = coalesce(p_reason, unlock_reason),
      intro_message_sent = true,
      gate_mode = new_mode,
      gate_student_id = case
        when new_mode = 'turn_based' then coalesce(gate_student_id, v_student)
        else gate_student_id
      end,
      turn_holder = case
        when new_mode = 'turn_based'
             and existing.gate_mode is distinct from 'turn_based'
          then coalesce(gate_student_id, v_student)
        when new_mode = 'open' then null
        else turn_holder
      end,
      reply_count_by_recipient = case
        when new_mode = 'turn_based'
             and existing.gate_mode is distinct from 'turn_based'
          then 0
        else reply_count_by_recipient
      end,
      gate_lifted_at = case
        when new_mode = 'open' and existing.gate_mode is distinct from 'open'
          then coalesce(gate_lifted_at, now())
        else gate_lifted_at
      end,
      updated_at = now()
    where id = existing.id
    returning id into conv_id;
  else
    insert into public.conversations (
      initiator_id,
      recipient_id,
      status,
      unlock_reason,
      intro_message_sent,
      gate_mode,
      gate_student_id,
      turn_holder,
      reply_count_by_recipient
    )
    values (
      p_user_a,
      p_user_b,
      'accepted',
      p_reason,
      true,
      desired,
      case when desired = 'turn_based' then v_student else null end,
      case when desired = 'turn_based' then v_student else null end,
      0
    )
    returning id into conv_id;
  end if;

  return conv_id;
end;
$$;

-- Keep 3-arg calls working (full open unlock)
create or replace function public.upsert_accepted_conversation(
  p_user_a uuid,
  p_user_b uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.upsert_accepted_conversation(
    p_user_a, p_user_b, p_reason, 'open', null
  );
end;
$$;

-- Mentorship text answer → turn_based (student holds turn), never tighten open
create or replace function public.unlock_turn_based_on_mentorship_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
begin
  select student_id into v_student
  from public.mentorship_requests
  where id = new.request_id;

  if v_student is not null then
    perform public.upsert_accepted_conversation(
      v_student,
      new.mentor_id,
      'mentorship',
      'turn_based',
      v_student
    );
  end if;

  return new;
end;
$$;

-- Replace answer-after-insert unlock with turn_based + auto-withdraw other matches
create or replace function public.request_answers_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  other record;
begin
  update public.request_matches
  set status = 'answered'
  where id = new.match_id
    and mentor_id = new.mentor_id
    and status in ('pending', 'accepted', 'answered');

  update public.mentorship_requests
  set
    revealed_at = coalesce(revealed_at, now()),
    status = case when status = 'open' then 'matched' else status end,
    resolution = coalesce(resolution, 'answered')
  where id = new.request_id;

  update public.mentor_availability
  set answers_given = answers_given + 1
  where mentor_id = new.mentor_id;

  select student_id into v_student
  from public.mentorship_requests
  where id = new.request_id;

  if v_student is not null then
    perform public.upsert_accepted_conversation(
      v_student,
      new.mentor_id,
      'mentorship',
      'turn_based',
      v_student
    );
  end if;

  -- Auto-withdraw other pending matches politely
  for other in
    select id, mentor_id
    from public.request_matches
    where request_id = new.request_id
      and id is distinct from new.match_id
      and status = 'pending'
  loop
    update public.request_matches
    set
      status = 'expired',
      auto_expired = true,
      responded_at = coalesce(responded_at, now())
    where id = other.id;

    insert into public.notifications (user_id, type, title, body, link, payload)
    values (
      other.mentor_id,
      'mentorship_auto_withdraw',
      'This was answered — no action needed',
      'Another graduate already helped on this ask.',
      '/mentors',
      jsonb_build_object(
        'request_id', new.request_id,
        'match_id', other.id
      )
    );
  end loop;

  return new;
end;
$$;

-- Referral question → turn_based with poster (student) as turn holder
create or replace function public.unlock_on_referral_question()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  poster uuid;
begin
  select student_id into poster
  from public.referral_requests
  where id = new.request_id;

  if poster is not null then
    perform public.upsert_accepted_conversation(
      new.asker_id,
      poster,
      'referral_question',
      'turn_based',
      poster
    );
  end if;

  return new;
end;
$$;

-- Status-change path for answered: also turn_based + withdraw others
create or replace function public.request_matches_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_anonymous boolean;
  other record;
begin
  if new.status = 'accepted'
     and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    new.responded_at := coalesce(new.responded_at, now());

    update public.mentorship_requests
    set
      status = 'matched',
      revealed_at = coalesce(revealed_at, now()),
      resolution = coalesce(resolution, 'accepted')
    where id = new.request_id
      and status in ('open', 'matched', 'awaiting_resolution');

    update public.request_matches
    set status = 'expired',
        auto_expired = true,
        responded_at = coalesce(responded_at, now())
    where request_id = new.request_id
      and id <> new.id
      and status = 'pending';

    select student_id, is_anonymous
      into v_student, v_anonymous
    from public.mentorship_requests
    where id = new.request_id;

    -- Full accept → open chat (not turn_based)
    if v_student is not null then
      perform public.upsert_accepted_conversation(
        v_student,
        new.mentor_id,
        'mentorship',
        'open',
        null
      );
    end if;

  elsif new.status = 'answered'
        and (tg_op = 'INSERT' or old.status is distinct from 'answered') then
    new.responded_at := coalesce(new.responded_at, now());

    update public.mentorship_requests
    set
      revealed_at = coalesce(revealed_at, now()),
      status = case when status = 'open' then 'matched' else status end,
      resolution = coalesce(resolution, 'answered')
    where id = new.request_id;

    select student_id into v_student
    from public.mentorship_requests
    where id = new.request_id;

    if v_student is not null then
      perform public.upsert_accepted_conversation(
        v_student,
        new.mentor_id,
        'mentorship',
        'turn_based',
        v_student
      );
    end if;

    for other in
      select id, mentor_id
      from public.request_matches
      where request_id = new.request_id
        and id <> new.id
        and status = 'pending'
    loop
      update public.request_matches
      set
        status = 'expired',
        auto_expired = true,
        responded_at = coalesce(responded_at, now())
      where id = other.id;

      insert into public.notifications (user_id, type, title, body, link, payload)
      values (
        other.mentor_id,
        'mentorship_auto_withdraw',
        'This was answered — no action needed',
        'Another graduate already helped on this ask.',
        '/mentors',
        jsonb_build_object('request_id', new.request_id, 'match_id', other.id)
      );
    end loop;

  elsif new.status in ('declined', 'referred', 'expired')
        and old.status is distinct from new.status then
    new.responded_at := coalesce(new.responded_at, now());
  end if;

  return new;
end;
$$;

-- =============================================================================
-- B8) can_send_message — locked / turn_based / open (+ status precedence)
-- =============================================================================

create or replace function public.can_send_message(
  p_sender uuid,
  p_receiver uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  conv public.conversations%rowtype;
  v_student uuid;
begin
  if p_sender is null or p_receiver is null then
    return false;
  end if;

  if p_sender = p_receiver then
    return false;
  end if;

  select *
    into conv
  from public.conversations c
  where least(c.initiator_id, c.recipient_id) = least(p_sender, p_receiver)
    and greatest(c.initiator_id, c.recipient_id) = greatest(p_sender, p_receiver)
  limit 1;

  -- No conversation yet → first intro allowed (creates pending/locked)
  if not found then
    return true;
  end if;

  -- declined / blocked ALWAYS wins
  if conv.status in ('declined', 'blocked') then
    return false;
  end if;

  -- pending OR gate_mode locked → one intro from initiator only
  if conv.status = 'pending' or coalesce(conv.gate_mode, 'open') = 'locked' then
    if conv.status = 'accepted' and conv.gate_mode = 'locked' then
      -- shouldn't happen often; treat as locked intro rules if intro not sent
      null;
    end if;
    if conv.status = 'pending' then
      if conv.initiator_id = p_sender and conv.intro_message_sent = false then
        return true;
      end if;
      return false;
    end if;
  end if;

  if conv.status <> 'accepted' then
    return false;
  end if;

  -- open → allow
  if coalesce(conv.gate_mode, 'open') = 'open' then
    return true;
  end if;

  -- turn_based → mentor always; student only when they hold the turn
  if conv.gate_mode = 'turn_based' then
    v_student := conv.gate_student_id;
    if v_student is null then
      -- Fail safe: if misconfigured, do not block accepted chats forever
      return true;
    end if;

    -- Mentor (non-student) may always send
    if p_sender is distinct from v_student then
      return true;
    end if;

    -- Student only when turn_holder is the student
    return conv.turn_holder is not distinct from v_student;
  end if;

  return false;
end;
$$;

revoke all on function public.can_send_message(uuid, uuid) from public;
grant execute on function public.can_send_message(uuid, uuid) to authenticated;

-- Enforce 500-char limit for student messages while turn-gated
create or replace function public.enforce_turn_based_message_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv public.conversations%rowtype;
begin
  if coalesce(new.is_system, false) then
    return new;
  end if;

  select *
    into conv
  from public.conversations c
  where least(c.initiator_id, c.recipient_id) = least(new.sender_id, new.receiver_id)
    and greatest(c.initiator_id, c.recipient_id) = greatest(new.sender_id, new.receiver_id)
  limit 1;

  if found
     and conv.gate_mode = 'turn_based'
     and conv.gate_student_id is not distinct from new.sender_id
     and char_length(coalesce(new.content, '')) > 500 then
    raise exception 'TURN_GATE_LIMIT: Follow-up messages are limited to 500 characters while the chat is gated.';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_turn_based_limits on public.messages;
create trigger messages_turn_based_limits
  before insert on public.messages
  for each row
  execute function public.enforce_turn_based_message_limits();

-- =============================================================================
-- B9) Turn flip on message insert (count exchanges, not raw mentor spam)
-- =============================================================================

create or replace function public.messages_turn_based_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv public.conversations%rowtype;
  v_student uuid;
  v_mentor uuid;
  new_count int;
begin
  if coalesce(new.is_system, false) then
    return new;
  end if;

  select *
    into conv
  from public.conversations c
  where least(c.initiator_id, c.recipient_id) = least(new.sender_id, new.receiver_id)
    and greatest(c.initiator_id, c.recipient_id) = greatest(new.sender_id, new.receiver_id)
  limit 1
  for update;

  if not found then
    return new;
  end if;

  if conv.gate_mode is distinct from 'turn_based' or conv.status is distinct from 'accepted' then
    return new;
  end if;

  v_student := conv.gate_student_id;
  if v_student is null then
    return new;
  end if;

  v_mentor := case
    when conv.initiator_id = v_student then conv.recipient_id
    else conv.initiator_id
  end;

  if new.sender_id = v_student then
    -- Student spoke → mentor holds the turn
    update public.conversations
    set
      turn_holder = v_mentor,
      updated_at = now()
    where id = conv.id;

  elsif new.sender_id = v_mentor then
    -- Only count when mentor is replying to a student turn
    -- (turn_holder currently mentor means student already spoke)
    if conv.turn_holder is not distinct from v_mentor then
      new_count := coalesce(conv.reply_count_by_recipient, 0) + 1;

      if new_count >= 2 then
        update public.conversations
        set
          reply_count_by_recipient = new_count,
          gate_mode = 'open',
          turn_holder = null,
          gate_lifted_at = now(),
          updated_at = now()
        where id = conv.id;

        -- Inline system line in the thread
        insert into public.messages (
          sender_id,
          receiver_id,
          content,
          read,
          conversation_id,
          is_system
        )
        values (
          v_mentor,
          v_student,
          'You can now chat freely.',
          false,
          conv.id,
          true
        );
      else
        update public.conversations
        set
          reply_count_by_recipient = new_count,
          turn_holder = v_student,
          updated_at = now()
        where id = conv.id;
      end if;
    end if;
    -- Consecutive mentor messages while turn_holder already = student: no increment
  end if;

  return new;
end;
$$;

drop trigger if exists messages_turn_based_after_insert on public.messages;
create trigger messages_turn_based_after_insert
  after insert on public.messages
  for each row
  execute function public.messages_turn_based_after_insert();

-- =============================================================================
-- Mentor waiting nudge (student holds turn > 3 days) — ONE only
-- =============================================================================

alter table public.conversations
  add column if not exists turn_nudge_sent_at timestamptz;

create or replace function public.nudge_turn_waiting_mentors()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
  v_mentor uuid;
begin
  for r in
    select *
    from public.conversations c
    where c.status = 'accepted'
      and c.gate_mode = 'turn_based'
      and c.gate_student_id is not null
      and c.turn_holder is not null
      and c.turn_holder is distinct from c.gate_student_id  -- waiting on mentor
      and c.turn_nudge_sent_at is null
      and c.updated_at <= now() - interval '3 days'
  loop
    v_mentor := case
      when r.initiator_id = r.gate_student_id then r.recipient_id
      else r.initiator_id
    end;

    update public.conversations
    set turn_nudge_sent_at = now()
    where id = r.id
      and turn_nudge_sent_at is null;

    if found then
      n := n + 1;
      insert into public.notifications (user_id, type, title, body, link, payload)
      values (
        v_mentor,
        'turn_wait_nudge',
        'A student is waiting on your reply',
        'They sent a follow-up — one reply unlocks freer chat.',
        '/messages',
        jsonb_build_object('conversation_id', r.id)
      );
    end if;
  end loop;

  return n;
end;
$$;

revoke all on function public.nudge_turn_waiting_mentors() from public;
grant execute on function public.nudge_turn_waiting_mentors() to authenticated;

-- =============================================================================
-- Read helpers for UI transparency
-- =============================================================================

create or replace function public.get_mentorship_request_live_state(p_request_id uuid)
returns table (
  request_id uuid,
  computed_stage int,
  stored_stage int,
  match_count int,
  pending_count int,
  unanswered_pending int,
  has_answer boolean,
  age_days numeric,
  status text,
  resolution text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.mentorship_requests%rowtype;
begin
  select * into req from public.mentorship_requests where id = p_request_id;
  if not found then
    return;
  end if;

  -- Escalate at read time
  perform public.escalate_request(p_request_id);
  select * into req from public.mentorship_requests where id = p_request_id;

  return query
  select
    req.id,
    public.mentorship_computed_stage(req.created_at),
    req.reach_stage,
    (select count(*)::int from public.request_matches rm where rm.request_id = req.id),
    (select count(*)::int from public.request_matches rm where rm.request_id = req.id and rm.status = 'pending'),
    (select count(*)::int from public.request_matches rm where rm.request_id = req.id and rm.status = 'pending' and rm.reminded_at is null),
    exists (
      select 1 from public.request_matches rm
      where rm.request_id = req.id and rm.status in ('answered', 'accepted')
    ),
    extract(epoch from (now() - req.created_at)) / 86400.0,
    req.status,
    req.resolution;
end;
$$;

revoke all on function public.get_mentorship_request_live_state(uuid) from public;
grant execute on function public.get_mentorship_request_live_state(uuid) to authenticated;

-- Preview match count before posting (honest expectations)
create or replace function public.preview_mentorship_matches(
  p_tags text[],
  p_title text default null,
  p_description text default null
)
returns table (
  match_count int,
  top_score numeric,
  suggested_tags text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  fake public.mentorship_requests%rowtype;
  cnt int := 0;
  top numeric := 0;
  alts text[] := '{}';
begin
  fake.id := gen_random_uuid();
  fake.student_id := auth.uid();
  fake.title := coalesce(nullif(trim(p_title), ''), 'Preview ask');
  fake.description := coalesce(nullif(trim(p_description), ''), 'Preview description for matching.');
  fake.tags := coalesce(p_tags, '{}');
  fake.urgency := 'flexible';
  fake.preferred_duration := 30;
  fake.status := 'open';
  fake.created_at := now();
  fake.expires_at := now() + interval '14 days';

  select count(*)::int, coalesce(max(s.score), 0)
    into cnt, top
  from public.mentor_availability ma
  join public.profiles p on p.id = ma.mentor_id
  cross join lateral public.score_mentor_for_request(
    fake,
    ma.mentor_id,
    p.skills,
    p.department,
    p.company,
    coalesce(p.role_title, p.current_job),
    coalesce(ma.bio_note, p.bio),
    ma.topics,
    ma.session_lengths
  ) as s(score, reasons)
  where ma.is_available = true
    and ma.mentor_id is distinct from auth.uid()
    and s.score > 30;

  select coalesce((
    select array_agg(topic order by freq desc)
    from (
      select topic, count(*)::int as freq
      from public.mentor_availability ma
      cross join lateral unnest(coalesce(ma.topics, '{}')) as topic
      where ma.is_available = true
        and lower(topic) not in (
          select lower(x) from unnest(coalesce(p_tags, '{}')) x
        )
      group by topic
      order by freq desc
      limit 3
    ) s
  ), '{}'::text[]) into alts;

  match_count := cnt;
  top_score := top;
  suggested_tags := alts;
  return next;
end;
$$;

revoke all on function public.preview_mentorship_matches(text[], text, text) from public;
grant execute on function public.preview_mentorship_matches(text[], text, text) to authenticated;

-- =============================================================================
-- Done
-- After running: reply that SQL succeeded. Do not start frontend until confirmed.
-- =============================================================================
