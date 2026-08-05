-- Hotfix: fully self-contained resume of 20260805_conversation_context_request.sql
--
-- Use when the original migration failed mid-script (e.g. 42P13 on CREATE OR REPLACE
-- of upsert_accepted_conversation) and the transaction rolled back — so the DB may
-- have NEITHER conversations.context_request_id NOR the new function overloads.
--
-- Safe / idempotent: ADD COLUMN IF NOT EXISTS, DROP FUNCTION IF EXISTS, CREATE OR REPLACE.
-- Paste the entire file once in Supabase → SQL Editor.

-- =============================================================================
-- 1) Column + index (MUST run before any UPDATE/function body referencing the col)
-- =============================================================================

alter table public.conversations
  add column if not exists context_request_id uuid
  references public.mentorship_requests(id) on delete set null;

create index if not exists conversations_context_request_idx
  on public.conversations (context_request_id)
  where context_request_id is not null;

-- =============================================================================
-- 2) upsert_accepted_conversation — DROP all overloads, recreate with context
-- =============================================================================
-- Existing 5-arg overload has parameter defaults; CREATE OR REPLACE cannot remove
-- them (42P13). Drop all known overloads, then recreate cleanly.

drop function if exists public.upsert_accepted_conversation(uuid, uuid, text, text, uuid, uuid);
drop function if exists public.upsert_accepted_conversation(uuid, uuid, text, text, uuid);
drop function if exists public.upsert_accepted_conversation(uuid, uuid, text);

create or replace function public.upsert_accepted_conversation(
  p_user_a uuid,
  p_user_b uuid,
  p_reason text,
  p_desired_gate text default 'open',
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
      unlock_reason = coalesce(p_reason, unlock_reason),
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
      p_user_a,
      p_user_b,
      'accepted',
      p_reason,
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

-- Keep 3-arg overload
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
    p_user_a, p_user_b, p_reason, 'open', null, null
  );
end;
$$;

-- 5-arg overload (gate + student) — pass null context
create or replace function public.upsert_accepted_conversation(
  p_user_a uuid,
  p_user_b uuid,
  p_reason text,
  p_desired_gate text,
  p_gate_student uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.upsert_accepted_conversation(
    p_user_a, p_user_b, p_reason, p_desired_gate, p_gate_student, null
  );
end;
$$;

revoke all on function public.upsert_accepted_conversation(uuid, uuid, text, text, uuid, uuid) from public;
grant execute on function public.upsert_accepted_conversation(uuid, uuid, text, text, uuid, uuid) to authenticated;
revoke all on function public.upsert_accepted_conversation(uuid, uuid, text, text, uuid) from public;
grant execute on function public.upsert_accepted_conversation(uuid, uuid, text, text, uuid) to authenticated;
revoke all on function public.upsert_accepted_conversation(uuid, uuid, text) from public;
grant execute on function public.upsert_accepted_conversation(uuid, uuid, text) to authenticated;

-- =============================================================================
-- 3) Mentorship unlock triggers — set context_request_id
-- =============================================================================

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
        'mentorship',
        'open',
        null,
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
        'mentorship',
        'turn_based',
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
-- 4) Backfill from unlock paths
-- =============================================================================

-- Accepted / answered matches → conversation between student and mentor
update public.conversations c
set context_request_id = sub.request_id
from (
  select distinct on (least(mr.student_id, rm.mentor_id), greatest(mr.student_id, rm.mentor_id))
    mr.student_id,
    rm.mentor_id,
    rm.request_id
  from public.request_matches rm
  join public.mentorship_requests mr on mr.id = rm.request_id
  where rm.status in ('accepted', 'answered')
  order by
    least(mr.student_id, rm.mentor_id),
    greatest(mr.student_id, rm.mentor_id),
    rm.responded_at desc nulls last,
    rm.created_at desc
) sub
where c.unlock_reason = 'mentorship'
  and c.context_request_id is null
  and least(c.initiator_id, c.recipient_id) = least(sub.student_id, sub.mentor_id)
  and greatest(c.initiator_id, c.recipient_id) = greatest(sub.student_id, sub.mentor_id);

-- Answers alone (in case match status lagged)
update public.conversations c
set context_request_id = sub.request_id
from (
  select distinct on (least(mr.student_id, ra.mentor_id), greatest(mr.student_id, ra.mentor_id))
    mr.student_id,
    ra.mentor_id,
    ra.request_id
  from public.request_answers ra
  join public.mentorship_requests mr on mr.id = ra.request_id
  order by
    least(mr.student_id, ra.mentor_id),
    greatest(mr.student_id, ra.mentor_id),
    ra.created_at desc
) sub
where c.unlock_reason = 'mentorship'
  and c.context_request_id is null
  and least(c.initiator_id, c.recipient_id) = least(sub.student_id, sub.mentor_id)
  and greatest(c.initiator_id, c.recipient_id) = greatest(sub.student_id, sub.mentor_id);
