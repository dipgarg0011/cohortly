-- Hotfix: collapse upsert_accepted_conversation to ONE non-ambiguous function
--
-- Prod error (accept + Ask / referral_questions AFTER INSERT):
--   42725 function public.upsert_accepted_conversation(uuid, uuid, unknown) is not unique
--   hint: Could not choose a best candidate function. You might need to add explicit type casts.
--
-- Root cause: multiple overloads (3-arg, 5-arg, 6-arg) from prior hotfixes. Untyped
-- string literals become unknown → Postgres cannot pick a candidate.
--
-- Fix: DROP every overload, recreate a single canonical 6-arg function, rewrite all
-- in-DB callers with explicit ::text / ::uuid casts.
--
-- Idempotent. Paste entire file once in Supabase → SQL Editor.
-- Does NOT redefine can_view_referral / referral visibility.

-- =============================================================================
-- 0) Ensure context column exists (referenced by canonical upsert)
-- =============================================================================

alter table public.conversations
  add column if not exists context_request_id uuid
  references public.mentorship_requests(id) on delete set null;

create index if not exists conversations_context_request_idx
  on public.conversations (context_request_id)
  where context_request_id is not null;

-- =============================================================================
-- 1) DROP ALL overloads (known signatures + any leftover via pg_proc)
-- =============================================================================

drop function if exists public.upsert_accepted_conversation(uuid, uuid, text);
drop function if exists public.upsert_accepted_conversation(uuid, uuid, text, text);
drop function if exists public.upsert_accepted_conversation(uuid, uuid, text, text, uuid);
drop function if exists public.upsert_accepted_conversation(uuid, uuid, text, text, uuid, uuid);

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

-- =============================================================================
-- 2) ONE canonical function — defaults OK when no overloads remain
-- =============================================================================

create or replace function public.upsert_accepted_conversation(
  p_initiator uuid,
  p_recipient uuid,
  p_unlock_reason text,
  p_gate_mode text default 'open',
  p_gate_student uuid default null,
  p_context_request_id uuid default null
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
      context_request_id = coalesce(p_context_request_id, context_request_id),
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
      p_context_request_id,
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

revoke all on function public.upsert_accepted_conversation(uuid, uuid, text, text, uuid, uuid) from public;
grant execute on function public.upsert_accepted_conversation(uuid, uuid, text, text, uuid, uuid) to authenticated;

-- =============================================================================
-- 3) Callers — explicit casts on every upsert_accepted_conversation invoke
-- =============================================================================

-- 3a) Referral accept → unlock conversation
create or replace function public.unlock_conversation_on_referral_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted'
     and (tg_op = 'INSERT' or old.status is distinct from 'accepted')
     and new.accepted_by is not null
     and new.student_id is not null then
    perform public.upsert_accepted_conversation(
      new.student_id,
      new.accepted_by,
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
  after insert or update of status, accepted_by on public.referral_requests
  for each row
  execute function public.unlock_conversation_on_referral_accept();

-- 3b) Ask a question on referral → turn_based unlock (fixes Ask 400 / 42725)
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
      'referral_question'::text,
      'turn_based'::text,
      poster,
      null::uuid
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

-- 3c) Mentorship booking confirmed
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
      null::uuid
    );
  end if;
  return new;
end;
$$;

drop trigger if exists mentorship_unlock_conversation on public.mentor_bookings;
create trigger mentorship_unlock_conversation
  after insert or update of status on public.mentor_bookings
  for each row
  execute function public.unlock_conversation_on_booking_confirm();

-- 3d) Opportunity application accepted
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

  if new.status = 'accepted' then
    perform public.upsert_accepted_conversation(
      new.applicant_id,
      poster,
      'opportunity_application'::text,
      'open'::text,
      null::uuid,
      null::uuid
    );

    insert into public.notifications (user_id, type, title, body, link, payload)
    values (
      new.applicant_id,
      'opportunity_application_accepted',
      'Your application was accepted',
      'You can chat with the poster now.',
      '/messages?with=' || poster::text,
      jsonb_build_object(
        'opportunity_id', new.opportunity_id,
        'application_id', new.id
      )
    );
  elsif new.status = 'declined' then
    if found and existing.status = 'pending' then
      update public.conversations
      set
        status = 'declined',
        updated_at = now()
      where id = existing.id;
    end if;

    insert into public.notifications (user_id, type, title, body, link, payload)
    values (
      new.applicant_id,
      'opportunity_application_declined',
      'Application update',
      'Your application was not accepted.',
      '/opportunities',
      jsonb_build_object(
        'opportunity_id', new.opportunity_id,
        'application_id', new.id
      )
    );
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

-- 3e) accept_referral_request RPC — keep denial helper; cast upsert args
--     (does NOT redefine can_view_referral)
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

  perform public.upsert_accepted_conversation(
    updated.student_id,
    updated.accepted_by,
    'referral'::text,
    'open'::text,
    null::uuid,
    null::uuid
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

-- 3f) Mentorship answer → turn_based + context_request_id
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
      'mentorship'::text,
      'turn_based'::text,
      v_student,
      new.request_id
    );
  end if;

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

-- 3g) Mentorship match accept / answered
create or replace function public.request_matches_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
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

    select student_id into v_student
    from public.mentorship_requests
    where id = new.request_id;

    if v_student is not null then
      perform public.upsert_accepted_conversation(
        v_student,
        new.mentor_id,
        'mentorship'::text,
        'open'::text,
        null::uuid,
        new.request_id
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
        'mentorship'::text,
        'turn_based'::text,
        v_student,
        new.request_id
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

-- =============================================================================
-- 4) Sanity: exactly one upsert_accepted_conversation remains
-- =============================================================================

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
