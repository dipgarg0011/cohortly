-- Cohortly: conversation context enrichment (Step 1 — SQL only)
-- =============================================================================
-- Adds conversations.context_type / context_id / context_snapshot, wires EVERY
-- unlock path to populate them, backfills from unlock_reason + context_request_id
-- (+ joins where possible), and collapses upsert_accepted_conversation to ONE
-- canonical 7-arg function (explicit casts on all callers — avoids 42725).
--
-- context_request_id (FK → mentorship_requests) is KEPT for existing FE reads:
--   mentorship unlocks set BOTH context_id and context_request_id to the same id.
--   referral / opportunity / connection never write context_request_id (FK would fail).
--
-- Step 2 prep: messages.message_kind ('user'|'system'), synced with is_system.
-- Turn-gate / rate-limit triggers already skip is_system; they also skip message_kind.
--
-- Idempotent. Paste entire file once in Supabase → SQL Editor.
-- Do NOT run before prior 20260805 upsert/progress hotfixes if those are pending.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Helpers
-- -----------------------------------------------------------------------------

create or replace function public.conversation_context_type_from_reason(p_reason text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_reason
    when 'referral' then 'referral'
    when 'referral_question' then 'referral_question'
    when 'mentorship' then 'mentorship'
    when 'opportunity_application' then 'opportunity'
    when 'manual_accept' then 'connection'
    else 'connection'
  end;
$$;

-- -----------------------------------------------------------------------------
-- 1) conversations — new context columns
-- -----------------------------------------------------------------------------

alter table public.conversations
  add column if not exists context_type text;

alter table public.conversations
  add column if not exists context_id uuid;

alter table public.conversations
  add column if not exists context_snapshot jsonb;

-- Ensure context_request_id exists (from prior mig / hotfix)
alter table public.conversations
  add column if not exists context_request_id uuid;

do $$
begin
  -- Attach mentorship FK only if missing (safe if already present)
  if not exists (
    select 1
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'conversations'
      and c.conname = 'conversations_context_request_id_fkey'
  ) then
    begin
      alter table public.conversations
        add constraint conversations_context_request_id_fkey
        foreign key (context_request_id)
        references public.mentorship_requests(id)
        on delete set null;
    exception
      when duplicate_object then null;
      when undefined_table then null;
    end;
  end if;
end;
$$;

alter table public.conversations
  drop constraint if exists conversations_context_type_check;

alter table public.conversations
  add constraint conversations_context_type_check
  check (
    context_type is null
    or context_type in (
      'connection',
      'referral',
      'referral_question',
      'mentorship',
      'opportunity'
    )
  );

create index if not exists conversations_context_type_idx
  on public.conversations (context_type)
  where context_type is not null;

create index if not exists conversations_context_id_idx
  on public.conversations (context_id)
  where context_id is not null;

create index if not exists conversations_context_request_idx
  on public.conversations (context_request_id)
  where context_request_id is not null;

comment on column public.conversations.context_type is
  'Stable unlock source: connection | referral | referral_question | mentorship | opportunity';
comment on column public.conversations.context_id is
  'Polymorphic source id (referral_requests / mentorship_requests / opportunity_applications). No FK.';
comment on column public.conversations.context_snapshot is
  'Frozen header fields (title, company, role, …) captured at unlock.';
comment on column public.conversations.context_request_id is
  'Legacy mentorship-only FK — kept in sync with context_id when context_type = mentorship.';

-- Derive context_type when unlock_reason is set but context_type omitted (e.g. connection accept)
create or replace function public.conversations_derive_context_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.context_type is null
     and (
       tg_op = 'INSERT'
       or new.unlock_reason is distinct from old.unlock_reason
       or (new.status = 'accepted' and old.status is distinct from 'accepted')
     ) then
    new.context_type := public.conversation_context_type_from_reason(new.unlock_reason);
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_derive_context_type on public.conversations;
create trigger conversations_derive_context_type
  before insert or update of unlock_reason, status, context_type on public.conversations
  for each row
  execute function public.conversations_derive_context_type();

-- -----------------------------------------------------------------------------
-- 2) messages.message_kind (Step 2 prep) — sync with existing is_system
-- -----------------------------------------------------------------------------

alter table public.messages
  add column if not exists is_system boolean not null default false;

alter table public.messages
  add column if not exists message_kind text;

update public.messages
set message_kind = case when coalesce(is_system, false) then 'system' else 'user' end
where message_kind is null;

alter table public.messages
  alter column message_kind set default 'user';

update public.messages
set message_kind = coalesce(message_kind, 'user')
where message_kind is null;

alter table public.messages
  alter column message_kind set not null;

alter table public.messages
  drop constraint if exists messages_message_kind_check;

alter table public.messages
  add constraint messages_message_kind_check
  check (message_kind in ('user', 'system'));

comment on column public.messages.message_kind is
  'user = normal chat; system = stage/gate notices — exclude from unread + turn limits.';

create or replace function public.messages_sync_system_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Either flag wins: keep message_kind + is_system aligned for existing FE.
  -- (Default message_kind='user' must not clobber an explicit is_system=true insert.)
  if coalesce(new.message_kind, 'user') = 'system'
     or coalesce(new.is_system, false) then
    new.message_kind := 'system';
    new.is_system := true;
    new.read := true; -- system lines never inflate unread
  else
    new.message_kind := 'user';
    new.is_system := false;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_sync_system_kind on public.messages;
create trigger messages_sync_system_kind
  before insert or update of message_kind, is_system, read on public.messages
  for each row
  execute function public.messages_sync_system_kind();

-- -----------------------------------------------------------------------------
-- 3) upsert_accepted_conversation — DROP ALL overloads, ONE canonical 7-arg
-- -----------------------------------------------------------------------------

drop function if exists public.upsert_accepted_conversation(uuid, uuid, text);
drop function if exists public.upsert_accepted_conversation(uuid, uuid, text, text);
drop function if exists public.upsert_accepted_conversation(uuid, uuid, text, text, uuid);
drop function if exists public.upsert_accepted_conversation(uuid, uuid, text, text, uuid, uuid);
drop function if exists public.upsert_accepted_conversation(uuid, uuid, text, text, uuid, uuid, jsonb);

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'upsert_accepted_conversation'
  loop
    execute format('drop function if exists %s', r.sig);
  end loop;
end;
$$;

create or replace function public.upsert_accepted_conversation(
  p_initiator uuid,
  p_recipient uuid,
  p_unlock_reason text,
  p_gate_mode text default 'open',
  p_gate_student uuid default null,
  p_context_id uuid default null,
  p_context_snapshot jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conv_id uuid;
  existing public.conversations%rowtype;
  desired text := coalesce(nullif(p_gate_mode, ''), 'open');
  new_mode text;
  v_student uuid;
  v_type text;
  v_mentorship_req uuid;
begin
  if p_initiator is null or p_recipient is null or p_initiator = p_recipient then
    return null;
  end if;

  if desired not in ('locked', 'turn_based', 'open') then
    desired := 'open';
  end if;

  v_student := coalesce(
    p_gate_student,
    case when desired = 'turn_based' then p_initiator else null end
  );

  v_type := public.conversation_context_type_from_reason(p_unlock_reason);

  -- Mentorship FE still reads context_request_id (FK-safe only for mentorship ids)
  v_mentorship_req := case
    when v_type = 'mentorship' then p_context_id
    else null
  end;

  select *
    into existing
  from public.conversations c
  where least(c.initiator_id, c.recipient_id) = least(p_initiator, p_recipient)
    and greatest(c.initiator_id, c.recipient_id) = greatest(p_initiator, p_recipient)
  limit 1;

  if found then
    if existing.status in ('declined', 'blocked') then
      return existing.id;
    end if;

    if public.gate_rank(existing.gate_mode) >= public.gate_rank(desired) then
      new_mode := existing.gate_mode;
    else
      new_mode := desired;
    end if;

    if existing.status = 'accepted'
       and coalesce(existing.gate_mode, 'open') = 'open' then
      new_mode := 'open';
    end if;

    update public.conversations
    set
      status = 'accepted',
      unlock_reason = coalesce(p_unlock_reason, unlock_reason),
      context_type = coalesce(v_type, context_type),
      context_id = coalesce(p_context_id, context_id),
      context_snapshot = coalesce(p_context_snapshot, context_snapshot),
      context_request_id = coalesce(v_mentorship_req, context_request_id),
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
      context_type,
      context_id,
      context_snapshot,
      context_request_id,
      intro_message_sent,
      gate_mode,
      gate_student_id,
      turn_holder,
      reply_count_by_recipient
    )
    values (
      p_initiator,
      p_recipient,
      'accepted',
      p_unlock_reason,
      v_type,
      p_context_id,
      p_context_snapshot,
      v_mentorship_req,
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

revoke all on function public.upsert_accepted_conversation(uuid, uuid, text, text, uuid, uuid, jsonb) from public;
grant execute on function public.upsert_accepted_conversation(uuid, uuid, text, text, uuid, uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 4) Unlock paths — populate context_type / context_id / context_snapshot
-- -----------------------------------------------------------------------------

-- 4a) Referral help / accept (in_progress | submitted)
create or replace function public.unlock_conversation_on_referral_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  helper uuid;
  snap jsonb;
begin
  helper := coalesce(new.helper_id, new.accepted_by);
  if new.status in ('in_progress', 'submitted', 'accepted')
     and (tg_op = 'INSERT'
          or old.status is distinct from new.status
          or coalesce(old.helper_id, old.accepted_by)
               is distinct from helper)
     and helper is not null
     and new.student_id is not null then
    snap := jsonb_build_object(
      'title', coalesce(nullif(trim(new.role), ''), 'Referral')
                || case
                     when nullif(trim(new.company), '') is not null
                       then ' at ' || trim(new.company)
                     else ''
                   end,
      'company', new.company,
      'role', new.role,
      'request_id', new.id
    );
    perform public.upsert_accepted_conversation(
      new.student_id,
      helper,
      'referral'::text,
      'open'::text,
      null::uuid,
      new.id,
      snap
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

-- 4b) help_with_referral_request RPC
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
  snap jsonb;
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

  begin
    if not public.can_view_referral(r.id, helper) then
      begin
        denial := public.referral_accept_denial_reason(r.id, helper);
      exception when undefined_function then
        denial := 'NOT_ALLOWED: You cannot help with this referral request.';
      end;
      raise exception '%', coalesce(denial, 'NOT_ALLOWED: You cannot help with this referral request.');
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

  snap := jsonb_build_object(
    'title', coalesce(nullif(trim(updated.role), ''), 'Referral')
              || case
                   when nullif(trim(updated.company), '') is not null
                     then ' at ' || trim(updated.company)
                   else ''
                 end,
    'company', updated.company,
    'role', updated.role,
    'request_id', updated.id
  );

  perform public.upsert_accepted_conversation(
    updated.student_id,
    coalesce(updated.helper_id, updated.accepted_by),
    'referral'::text,
    'open'::text,
    null::uuid,
    updated.id,
    snap
  );

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

-- 4c) Referral question → turn_based unlock
create or replace function public.unlock_on_referral_question()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rr public.referral_requests%rowtype;
  snap jsonb;
begin
  select * into rr
  from public.referral_requests
  where id = new.request_id;

  if rr.student_id is not null then
    snap := jsonb_build_object(
      'title', coalesce(nullif(trim(rr.role), ''), 'Referral')
                || case
                     when nullif(trim(rr.company), '') is not null
                       then ' at ' || trim(rr.company)
                     else ''
                   end,
      'company', rr.company,
      'role', rr.role,
      'request_id', rr.id,
      'question_id', new.id
    );
    perform public.upsert_accepted_conversation(
      new.asker_id,
      rr.student_id,
      'referral_question'::text,
      'turn_based'::text,
      rr.student_id,
      rr.id,
      snap
    );
  end if;

  return new;
end;
$$;

drop trigger if exists referral_question_unlock on public.referral_questions;
create trigger referral_question_unlock
  after insert on public.referral_questions
  for each row
  execute function public.unlock_on_referral_question();

-- 4d) Mentorship booking confirm (may lack request id)
create or replace function public.unlock_conversation_on_booking_confirm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed'
     and (tg_op = 'INSERT' or old.status is distinct from 'confirmed')
     and new.mentor_id is not null
     and new.student_id is not null then
    perform public.upsert_accepted_conversation(
      new.student_id,
      new.mentor_id,
      'mentorship'::text,
      'open'::text,
      null::uuid,
      null::uuid,
      jsonb_build_object(
        'title', 'Mentorship session',
        'booking_id', new.id,
        'duration_minutes', new.duration_minutes
      )
    );
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.mentor_bookings') is not null then
    drop trigger if exists mentorship_unlock_conversation on public.mentor_bookings;
    create trigger mentorship_unlock_conversation
      after insert or update of status on public.mentor_bookings
      for each row
      execute function public.unlock_conversation_on_booking_confirm();
  end if;
end;
$$;

-- 4e) Mentorship answer → turn_based + context
create or replace function public.request_answers_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_title text;
  v_company text;
  v_category text;
  other record;
  snap jsonb;
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

  declare
    v_description text;
    v_anon boolean;
  begin
    select student_id, title, target_company, category, description, is_anonymous
      into v_student, v_title, v_company, v_category, v_description, v_anon
    from public.mentorship_requests
    where id = new.request_id;

    if v_student is not null then
      snap := jsonb_build_object(
        'title', coalesce(nullif(trim(v_title), ''), 'Mentorship'),
        'company', v_company,
        'category', v_category,
        'request_id', new.request_id,
        'description', left(coalesce(v_description, ''), 600),
        'is_anonymous', coalesce(v_anon, false),
        'student_id', v_student
      );
      perform public.upsert_accepted_conversation(
        v_student,
        new.mentor_id,
        'mentorship'::text,
        'turn_based'::text,
        v_student,
        new.request_id,
        snap
      );
    end if;
  end;

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

drop trigger if exists request_answers_after_insert on public.request_answers;
create trigger request_answers_after_insert
  after insert on public.request_answers
  for each row
  execute function public.request_answers_after_insert();

-- 4f) Mentorship match accept / answered
create or replace function public.request_matches_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_title text;
  v_company text;
  v_category text;
  other record;
  snap jsonb;
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

    declare
      v_description text;
      v_anon boolean;
    begin
      select student_id, title, target_company, category, description, is_anonymous
        into v_student, v_title, v_company, v_category, v_description, v_anon
      from public.mentorship_requests
      where id = new.request_id;

      if v_student is not null then
        snap := jsonb_build_object(
          'title', coalesce(nullif(trim(v_title), ''), 'Mentorship'),
          'company', v_company,
          'category', v_category,
          'request_id', new.request_id,
          'description', left(coalesce(v_description, ''), 600),
          'is_anonymous', coalesce(v_anon, false),
          'student_id', v_student
        );
        perform public.upsert_accepted_conversation(
          v_student,
          new.mentor_id,
          'mentorship'::text,
          'open'::text,
          null::uuid,
          new.request_id,
          snap
        );
      end if;
    end;

  elsif new.status = 'answered'
        and (tg_op = 'INSERT' or old.status is distinct from 'answered') then
    new.responded_at := coalesce(new.responded_at, now());

    update public.mentorship_requests
    set
      revealed_at = coalesce(revealed_at, now()),
      status = case when status = 'open' then 'matched' else status end,
      resolution = coalesce(resolution, 'answered')
    where id = new.request_id;

    select student_id, title, target_company, category
      into v_student, v_title, v_company, v_category
    from public.mentorship_requests
    where id = new.request_id;

    if v_student is not null then
      snap := jsonb_build_object(
        'title', coalesce(nullif(trim(v_title), ''), 'Mentorship'),
        'company', v_company,
        'category', v_category,
        'request_id', new.request_id
      );
      perform public.upsert_accepted_conversation(
        v_student,
        new.mentor_id,
        'mentorship'::text,
        'turn_based'::text,
        v_student,
        new.request_id,
        snap
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

drop trigger if exists request_matches_on_accept on public.request_matches;
drop trigger if exists request_matches_on_status_change on public.request_matches;
create trigger request_matches_on_status_change
  before update of status on public.request_matches
  for each row
  execute function public.request_matches_on_status_change();

-- 4g) Opportunity decision (reviewing / shortlisted = move forward)
create or replace function public.opportunity_application_after_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  poster uuid;
  opp_title text;
  opp_company text;
  opp_type text;
  existing public.conversations%rowtype;
  snap jsonb;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select posted_by, title, company, type
    into poster, opp_title, opp_company, opp_type
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

  snap := jsonb_build_object(
    'title', coalesce(nullif(trim(opp_title), ''), 'Opportunity'),
    'company', opp_company,
    'type', opp_type,
    'opportunity_id', new.opportunity_id,
    'application_id', new.id
  );

  if new.status in ('reviewing', 'shortlisted', 'accepted')
     and old.status is distinct from new.status then
    perform public.upsert_accepted_conversation(
      new.applicant_id,
      poster,
      'opportunity_application'::text,
      'open'::text,
      null::uuid,
      new.id,
      snap
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
  elsif new.status = 'declined' then
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

-- Also stamp context on apply (pending/locked) so header is ready before unlock
create or replace function public.opportunity_application_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  poster uuid;
  opp_title text;
  opp_company text;
  opp_type text;
  conv_id uuid;
  existing public.conversations%rowtype;
  snap jsonb;
begin
  select posted_by, title, company, type
    into poster, opp_title, opp_company, opp_type
  from public.opportunities
  where id = new.opportunity_id;

  if poster is null or poster = new.applicant_id then
    return new;
  end if;

  snap := jsonb_build_object(
    'title', coalesce(nullif(trim(opp_title), ''), 'Opportunity'),
    'company', opp_company,
    'type', opp_type,
    'opportunity_id', new.opportunity_id,
    'application_id', new.id
  );

  select *
    into existing
  from public.conversations c
  where least(c.initiator_id, c.recipient_id) = least(new.applicant_id, poster)
    and greatest(c.initiator_id, c.recipient_id) = greatest(new.applicant_id, poster)
  limit 1;

  if found then
    if existing.status in ('declined', 'blocked') then
      insert into public.notifications (user_id, type, title, body, link, payload)
      values (
        poster,
        'opportunity_application',
        'New applicant on your posting',
        left(new.pitch, 120),
        '/opportunities',
        jsonb_build_object(
          'opportunity_id', new.opportunity_id,
          'application_id', new.id,
          'applicant_id', new.applicant_id
        )
      );
      return new;
    elsif existing.status = 'accepted' then
      conv_id := existing.id;
      update public.conversations
      set
        unlock_reason = coalesce(unlock_reason, 'opportunity_application'),
        context_type = coalesce(context_type, 'opportunity'),
        context_id = coalesce(context_id, new.id),
        context_snapshot = coalesce(context_snapshot, snap),
        updated_at = now()
      where id = conv_id;
    else
      update public.conversations
      set
        status = 'pending',
        unlock_reason = coalesce(unlock_reason, 'opportunity_application'),
        context_type = coalesce(context_type, 'opportunity'),
        context_id = coalesce(context_id, new.id),
        context_snapshot = coalesce(context_snapshot, snap),
        intro_message_sent = false,
        gate_mode = 'locked',
        updated_at = now()
      where id = existing.id
      returning id into conv_id;
    end if;
  else
    insert into public.conversations (
      initiator_id,
      recipient_id,
      status,
      unlock_reason,
      context_type,
      context_id,
      context_snapshot,
      intro_message_sent,
      gate_mode
    )
    values (
      new.applicant_id,
      poster,
      'pending',
      'opportunity_application',
      'opportunity',
      new.id,
      snap,
      false,
      'locked'
    )
    returning id into conv_id;
  end if;

  perform set_config('app.bypass_message_gate', 'on', true);

  insert into public.messages (
    sender_id,
    receiver_id,
    content,
    read,
    conversation_id,
    message_kind,
    is_system
  )
  values (
    new.applicant_id,
    poster,
    new.pitch,
    false,
    conv_id,
    'user',
    false
  );

  perform set_config('app.bypass_message_gate', 'off', true);

  update public.conversations
  set
    intro_message_sent = true,
    unlock_reason = coalesce(unlock_reason, 'opportunity_application'),
    context_type = coalesce(context_type, 'opportunity'),
    context_id = coalesce(context_id, new.id),
    context_snapshot = coalesce(context_snapshot, snap),
    updated_at = now()
  where id = conv_id;

  insert into public.notifications (user_id, type, title, body, link, payload)
  values (
    poster,
    'opportunity_application',
    'New applicant on your posting',
    left(new.pitch, 120),
    '/opportunities',
    jsonb_build_object(
      'opportunity_id', new.opportunity_id,
      'application_id', new.id,
      'applicant_id', new.applicant_id
    )
  );

  return new;
end;
$$;

drop trigger if exists opportunity_application_after_insert
  on public.opportunity_applications;
create trigger opportunity_application_after_insert
  after insert on public.opportunity_applications
  for each row
  execute function public.opportunity_application_after_insert();

-- 4h) Plain connection accept
create or replace function public.respond_to_conversation(
  p_conversation_id uuid,
  p_new_status text
)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  conv public.conversations%rowtype;
begin
  if p_new_status not in ('accepted', 'declined', 'blocked') then
    raise exception 'Invalid status';
  end if;

  select * into conv
  from public.conversations
  where id = p_conversation_id
  for update;

  if not found then
    raise exception 'Conversation not found';
  end if;

  if auth.uid() is distinct from conv.recipient_id then
    raise exception 'Only the recipient can respond to this request';
  end if;

  update public.conversations
  set
    status = p_new_status,
    unlock_reason = case
      when p_new_status = 'accepted' then coalesce(unlock_reason, 'manual_accept')
      else unlock_reason
    end,
    context_type = case
      when p_new_status = 'accepted' then coalesce(context_type, 'connection')
      else context_type
    end,
    updated_at = now()
  where id = p_conversation_id
  returning * into conv;

  return conv;
end;
$$;

revoke all on function public.respond_to_conversation(uuid, text) from public;
grant execute on function public.respond_to_conversation(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5) System-message aware turn gates / ensure_conversation
-- -----------------------------------------------------------------------------

create or replace function public.ensure_conversation_for_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv public.conversations%rowtype;
begin
  -- System lines (stage notices) never create connection requests / burn intro
  if coalesce(new.is_system, false)
     or coalesce(new.message_kind, 'user') = 'system' then
    if new.conversation_id is null then
      select c.id into new.conversation_id
      from public.conversations c
      where least(c.initiator_id, c.recipient_id) = least(new.sender_id, new.receiver_id)
        and greatest(c.initiator_id, c.recipient_id) = greatest(new.sender_id, new.receiver_id)
      limit 1;
    end if;
    return new;
  end if;

  if not public.can_send_message(new.sender_id, new.receiver_id) then
    raise exception 'MESSAGE_NOT_ALLOWED: You cannot send a message in this conversation.'
      using errcode = 'P0001';
  end if;

  select *
    into conv
  from public.conversations c
  where least(c.initiator_id, c.recipient_id) = least(new.sender_id, new.receiver_id)
    and greatest(c.initiator_id, c.recipient_id) = greatest(new.sender_id, new.receiver_id)
  limit 1;

  if not found then
    if (
      select count(*)
      from public.conversations c
      where c.initiator_id = new.sender_id
        and c.status = 'pending'
        and c.created_at > now() - interval '24 hours'
    ) >= 5 then
      raise exception 'DAILY_REQUEST_LIMIT: You can only send 5 connection requests per day. Try again tomorrow.'
        using errcode = 'P0001';
    end if;

    insert into public.conversations (
      initiator_id,
      recipient_id,
      status,
      unlock_reason,
      context_type,
      intro_message_sent
    )
    values (
      new.sender_id,
      new.receiver_id,
      'pending',
      null,
      'connection',
      false
    )
    returning * into conv;

  elsif conv.status = 'accepted' then
    null;

  elsif conv.status = 'pending'
        and conv.initiator_id = new.sender_id
        and (
          conv.intro_message_sent = false
          or current_setting('app.bypass_message_gate', true) = 'on'
        ) then
    null;

  elsif current_setting('app.bypass_message_gate', true) = 'on' then
    null;

  else
    raise exception 'MESSAGE_NOT_ALLOWED: You cannot send a message in this conversation.'
      using errcode = 'P0001';
  end if;

  new.conversation_id := conv.id;
  return new;
end;
$$;

create or replace function public.enforce_turn_based_message_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv public.conversations%rowtype;
begin
  if coalesce(new.is_system, false)
     or coalesce(new.message_kind, 'user') = 'system' then
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
     and conv.gate_student_id is not null
     and new.sender_id = conv.gate_student_id
     and char_length(new.content) > 500 then
    raise exception 'TURN_GATE_LIMIT: Follow-ups are limited to 500 characters until you can chat freely.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_turn_based_limits on public.messages;
create trigger messages_turn_based_limits
  before insert on public.messages
  for each row
  execute function public.enforce_turn_based_message_limits();

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
  if coalesce(new.is_system, false)
     or coalesce(new.message_kind, 'user') = 'system' then
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
    update public.conversations
    set
      turn_holder = v_mentor,
      updated_at = now()
    where id = conv.id;

  elsif new.sender_id = v_mentor then
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

        insert into public.messages (
          sender_id,
          receiver_id,
          content,
          read,
          conversation_id,
          is_system,
          message_kind
        )
        values (
          v_mentor,
          v_student,
          'You can now chat freely.',
          true,
          conv.id,
          true,
          'system'
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
  end if;

  return new;
end;
$$;

drop trigger if exists messages_turn_based_after_insert on public.messages;
create trigger messages_turn_based_after_insert
  after insert on public.messages
  for each row
  execute function public.messages_turn_based_after_insert();

-- -----------------------------------------------------------------------------
-- 6) Backfill existing conversations
-- -----------------------------------------------------------------------------

-- 6a) Map unlock_reason → context_type (default connection)
update public.conversations
set context_type = public.conversation_context_type_from_reason(unlock_reason)
where context_type is null;

-- 6b) Mentorship: context_request_id → context_id + snapshot
update public.conversations c
set
  context_id = coalesce(c.context_id, c.context_request_id),
  context_snapshot = coalesce(
    c.context_snapshot,
    jsonb_build_object(
      'title', coalesce(nullif(trim(mr.title), ''), 'Mentorship'),
      'company', mr.target_company,
      'category', mr.category,
      'request_id', mr.id
    )
  )
from public.mentorship_requests mr
where c.context_type = 'mentorship'
  and c.context_request_id = mr.id
  and (c.context_id is null or c.context_snapshot is null);

-- Mentorship without context_request_id: join latest accepted/answered match
update public.conversations c
set
  context_id = sub.request_id,
  context_request_id = coalesce(c.context_request_id, sub.request_id),
  context_snapshot = coalesce(
    c.context_snapshot,
    jsonb_build_object(
      'title', coalesce(nullif(trim(sub.title), ''), 'Mentorship'),
      'company', sub.target_company,
      'category', sub.category,
      'request_id', sub.request_id
    )
  )
from (
  select distinct on (least(mr.student_id, rm.mentor_id), greatest(mr.student_id, rm.mentor_id))
    mr.student_id,
    rm.mentor_id,
    rm.request_id,
    mr.title,
    mr.target_company,
    mr.category
  from public.request_matches rm
  join public.mentorship_requests mr on mr.id = rm.request_id
  where rm.status in ('accepted', 'answered')
  order by
    least(mr.student_id, rm.mentor_id),
    greatest(mr.student_id, rm.mentor_id),
    rm.responded_at desc nulls last,
    rm.created_at desc
) sub
where c.context_type = 'mentorship'
  and c.context_id is null
  and least(c.initiator_id, c.recipient_id) = least(sub.student_id, sub.mentor_id)
  and greatest(c.initiator_id, c.recipient_id) = greatest(sub.student_id, sub.mentor_id);

-- 6c) Referral help
update public.conversations c
set
  context_id = sub.request_id,
  context_snapshot = coalesce(
    c.context_snapshot,
    jsonb_build_object(
      'title', coalesce(nullif(trim(sub.role), ''), 'Referral')
                || case
                     when nullif(trim(sub.company), '') is not null
                       then ' at ' || trim(sub.company)
                     else ''
                   end,
      'company', sub.company,
      'role', sub.role,
      'request_id', sub.request_id
    )
  )
from (
  select distinct on (
    least(rr.student_id, coalesce(rr.helper_id, rr.accepted_by)),
    greatest(rr.student_id, coalesce(rr.helper_id, rr.accepted_by))
  )
    rr.student_id,
    coalesce(rr.helper_id, rr.accepted_by) as helper_id,
    rr.id as request_id,
    rr.company,
    rr.role
  from public.referral_requests rr
  where coalesce(rr.helper_id, rr.accepted_by) is not null
    and rr.status in ('in_progress', 'submitted', 'accepted', 'closed')
  order by
    least(rr.student_id, coalesce(rr.helper_id, rr.accepted_by)),
    greatest(rr.student_id, coalesce(rr.helper_id, rr.accepted_by)),
    rr.accepted_at desc nulls last,
    rr.created_at desc
) sub
where c.context_type = 'referral'
  and c.context_id is null
  and least(c.initiator_id, c.recipient_id) = least(sub.student_id, sub.helper_id)
  and greatest(c.initiator_id, c.recipient_id) = greatest(sub.student_id, sub.helper_id);

-- 6d) Referral question
update public.conversations c
set
  context_id = sub.request_id,
  context_snapshot = coalesce(
    c.context_snapshot,
    jsonb_build_object(
      'title', coalesce(nullif(trim(sub.role), ''), 'Referral')
                || case
                     when nullif(trim(sub.company), '') is not null
                       then ' at ' || trim(sub.company)
                     else ''
                   end,
      'company', sub.company,
      'role', sub.role,
      'request_id', sub.request_id,
      'question_id', sub.question_id
    )
  )
from (
  select distinct on (least(q.asker_id, rr.student_id), greatest(q.asker_id, rr.student_id))
    q.asker_id,
    rr.student_id as poster_id,
    rr.id as request_id,
    q.id as question_id,
    rr.company,
    rr.role
  from public.referral_questions q
  join public.referral_requests rr on rr.id = q.request_id
  order by
    least(q.asker_id, rr.student_id),
    greatest(q.asker_id, rr.student_id),
    q.created_at desc
) sub
where c.context_type = 'referral_question'
  and c.context_id is null
  and least(c.initiator_id, c.recipient_id) = least(sub.asker_id, sub.poster_id)
  and greatest(c.initiator_id, c.recipient_id) = greatest(sub.asker_id, sub.poster_id);

-- 6e) Opportunity applications
update public.conversations c
set
  context_id = sub.application_id,
  context_snapshot = coalesce(
    c.context_snapshot,
    jsonb_build_object(
      'title', coalesce(nullif(trim(sub.title), ''), 'Opportunity'),
      'company', sub.company,
      'type', sub.type,
      'opportunity_id', sub.opportunity_id,
      'application_id', sub.application_id
    )
  )
from (
  select distinct on (least(oa.applicant_id, o.posted_by), greatest(oa.applicant_id, o.posted_by))
    oa.applicant_id,
    o.posted_by as poster_id,
    oa.id as application_id,
    oa.opportunity_id,
    o.title,
    o.company,
    o.type
  from public.opportunity_applications oa
  join public.opportunities o on o.id = oa.opportunity_id
  where oa.status in ('pending', 'reviewing', 'shortlisted', 'accepted', 'closed')
  order by
    least(oa.applicant_id, o.posted_by),
    greatest(oa.applicant_id, o.posted_by),
    oa.created_at desc
) sub
where c.context_type = 'opportunity'
  and c.context_id is null
  and least(c.initiator_id, c.recipient_id) = least(sub.applicant_id, sub.poster_id)
  and greatest(c.initiator_id, c.recipient_id) = greatest(sub.applicant_id, sub.poster_id);

-- 6f) Anything still null → connection
update public.conversations
set context_type = 'connection'
where context_type is null;

-- -----------------------------------------------------------------------------
-- 7) System lines on referral / opportunity stage changes (Step 2)
-- -----------------------------------------------------------------------------

create or replace function public.insert_conversation_system_message(
  p_user_a uuid,
  p_user_b uuid,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conv_id uuid;
  msg_id uuid;
  body text := nullif(trim(coalesce(p_content, '')), '');
begin
  if p_user_a is null or p_user_b is null or p_user_a = p_user_b or body is null then
    return null;
  end if;

  select c.id into conv_id
  from public.conversations c
  where least(c.initiator_id, c.recipient_id) = least(p_user_a, p_user_b)
    and greatest(c.initiator_id, c.recipient_id) = greatest(p_user_a, p_user_b)
    and c.status = 'accepted'
  limit 1;

  if conv_id is null then
    return null;
  end if;

  perform set_config('app.bypass_message_gate', 'on', true);

  insert into public.messages (
    sender_id,
    receiver_id,
    content,
    read,
    conversation_id,
    message_kind,
    is_system
  )
  values (
    p_user_a,
    p_user_b,
    body,
    true,
    conv_id,
    'system',
    true
  )
  returning id into msg_id;

  perform set_config('app.bypass_message_gate', 'off', true);

  update public.conversations
  set updated_at = now()
  where id = conv_id;

  return msg_id;
end;
$$;

revoke all on function public.insert_conversation_system_message(uuid, uuid, text) from public;
grant execute on function public.insert_conversation_system_message(uuid, uuid, text) to authenticated;

-- Referral stage RPC — emit centred system lines
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

    if r.status is distinct from 'submitted' and helper is not null then
      perform public.insert_conversation_system_message(
        helper,
        r.student_id,
        'Marked submitted internally'
      );
    end if;

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

    if r.status is distinct from 'closed' and helper is not null then
      perform public.insert_conversation_system_message(
        coalesce(helper, actor),
        r.student_id,
        'Request closed'
      );
    end if;

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
    raise exception 'NOT_ALLOWED: Cannot set that stage.';
  end if;

  return updated;
end;
$$;

revoke all on function public.update_referral_stage(uuid, text, text, text) from public;
grant execute on function public.update_referral_stage(uuid, text, text, text) to authenticated;

-- Opportunity status trigger — system lines for shortlist / close
create or replace function public.opportunity_application_after_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  poster uuid;
  opp_title text;
  opp_company text;
  opp_type text;
  existing public.conversations%rowtype;
  snap jsonb;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select posted_by, title, company, type
    into poster, opp_title, opp_company, opp_type
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

  snap := jsonb_build_object(
    'title', coalesce(nullif(trim(opp_title), ''), 'Opportunity'),
    'company', opp_company,
    'role', opp_title,
    'type', opp_type,
    'opportunity_id', new.opportunity_id,
    'application_id', new.id,
    'pitch', left(coalesce(new.pitch, ''), 400)
  );

  if new.status in ('reviewing', 'shortlisted', 'accepted')
     and old.status is distinct from new.status then
    perform public.upsert_accepted_conversation(
      new.applicant_id,
      poster,
      'opportunity_application'::text,
      'open'::text,
      null::uuid,
      new.id,
      snap
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

    if new.status = 'shortlisted' and old.status is distinct from 'shortlisted' then
      perform public.insert_conversation_system_message(
        poster,
        new.applicant_id,
        'Moved to shortlist'
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
    if old.status is distinct from 'closed' then
      perform public.insert_conversation_system_message(
        poster,
        new.applicant_id,
        'Request closed'
      );
    end if;
  elsif new.status = 'declined' then
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

-- Enrich mentorship / opportunity snapshots with fields FE needs for fallback
update public.conversations c
set context_snapshot = coalesce(c.context_snapshot, '{}'::jsonb)
  || jsonb_strip_nulls(jsonb_build_object(
    'description', left(coalesce(mr.description, ''), 600),
    'is_anonymous', mr.is_anonymous,
    'student_id', mr.student_id
  ))
from public.mentorship_requests mr
where c.context_type = 'mentorship'
  and c.context_id = mr.id
  and (
    c.context_snapshot is null
    or not (c.context_snapshot ? 'description')
    or not (c.context_snapshot ? 'is_anonymous')
  );

update public.conversations c
set context_snapshot = coalesce(c.context_snapshot, '{}'::jsonb)
  || jsonb_strip_nulls(jsonb_build_object(
    'pitch', left(coalesce(oa.pitch, ''), 400),
    'role', o.title,
    'company', o.company
  ))
from public.opportunity_applications oa
join public.opportunities o on o.id = oa.opportunity_id
where c.context_type = 'opportunity'
  and c.context_id = oa.id
  and (
    c.context_snapshot is null
    or not (c.context_snapshot ? 'pitch')
  );

-- -----------------------------------------------------------------------------
-- 8) Sanity: exactly one upsert_accepted_conversation
-- -----------------------------------------------------------------------------

do $$
declare
  n int;
begin
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'upsert_accepted_conversation';

  if n <> 1 then
    raise exception
      'upsert_accepted_conversation overload count = % (expected 1)', n;
  end if;
end;
$$;
