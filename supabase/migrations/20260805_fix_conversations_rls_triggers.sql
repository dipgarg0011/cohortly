-- Cohortly: fix conversations RLS blocking apply / ask / accept / mentorship
-- Run in Supabase → SQL Editor (production). Safe to re-run.
--
-- Root cause:
--   conversations INSERT policy required auth.uid() = initiator_id only.
--   Referral accept + mentorship accept/answer unlock insert with
--   initiator = student (poster), recipient = mentor/acceptor — INSERT fails
--   under RLS if the trigger/RPC does not bypass RLS. Same class of failure for
--   UPDATE (recipient-only) when upsert_accepted_conversation upgrades a pair.
--
-- Also re-locks conversation-creating triggers (incl. request_matches accept +
-- request_answers insert) as SECURITY DEFINER + search_path, widens INSERT to
-- initiator OR recipient, reaffirms referral/opportunity policies, keeps
-- opportunity pitch seeding atomic, and ensures turn_based never blocks mentors.

-- =============================================================================
-- 1) conversations RLS — INSERT allows either participant
-- =============================================================================

alter table public.conversations enable row level security;

drop policy if exists "Participants can view conversations" on public.conversations;
create policy "Participants can view conversations"
  on public.conversations
  for select
  to authenticated
  using (
    auth.uid() = initiator_id
    or auth.uid() = recipient_id
  );

drop policy if exists "Users can start conversations" on public.conversations;
create policy "Users can start conversations"
  on public.conversations
  for insert
  to authenticated
  with check (
    auth.uid() = initiator_id
    or auth.uid() = recipient_id
  );

-- Recipient still owns accept / decline / block from the client.
-- System unlocks go through SECURITY DEFINER upsert (below).
drop policy if exists "Recipient can update conversation status" on public.conversations;
create policy "Recipient can update conversation status"
  on public.conversations
  for update
  to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- =============================================================================
-- 2) upsert_accepted_conversation — SECURITY DEFINER (both overloads)
-- =============================================================================

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

revoke all on function public.upsert_accepted_conversation(uuid, uuid, text, text, uuid) from public;
grant execute on function public.upsert_accepted_conversation(uuid, uuid, text, text, uuid) to authenticated;
revoke all on function public.upsert_accepted_conversation(uuid, uuid, text) from public;
grant execute on function public.upsert_accepted_conversation(uuid, uuid, text) to authenticated;

-- =============================================================================
-- 3) Conversation-creating triggers — SECURITY DEFINER + locked search_path
-- =============================================================================

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
      'referral'
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

drop trigger if exists referral_question_unlock on public.referral_questions;
create trigger referral_question_unlock
  after insert on public.referral_questions
  for each row
  execute function public.unlock_on_referral_question();

create or replace function public.unlock_conversation_on_booking_confirm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed'
     and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    perform public.upsert_accepted_conversation(
      new.student_id,
      new.mentor_id,
      'mentorship'
    );
  end if;
  return new;
end;
$$;

-- Only recreate booking trigger if the table exists
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

-- =============================================================================
-- 4) Opportunity apply — atomic application + conversation + pitch (same TX)
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
  -- Opportunity pitch seed (same TX as application insert)
  if current_setting('app.bypass_message_gate', true) = 'on' then
    return true;
  end if;

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

  if not found then
    return true;
  end if;

  if conv.status in ('declined', 'blocked') then
    return false;
  end if;

  -- pending / locked intro: initiator only, one shot
  if conv.status = 'pending' then
    if conv.initiator_id = p_sender and conv.intro_message_sent = false then
      return true;
    end if;
    return false;
  end if;

  if conv.status <> 'accepted' then
    return false;
  end if;

  if coalesce(conv.gate_mode, 'open') = 'locked' then
    -- Accepted but still locked (e.g. opportunity pitch awaiting poster accept)
    return false;
  end if;

  if coalesce(conv.gate_mode, 'open') = 'open' then
    return true;
  end if;

  -- turn_based → mentor ALWAYS; student only when they hold the turn
  if conv.gate_mode = 'turn_based' then
    v_student := conv.gate_student_id;
    if v_student is null then
      return true;
    end if;
    if p_sender is distinct from v_student then
      return true;
    end if;
    return conv.turn_holder is not distinct from v_student;
  end if;

  return false;
end;
$$;

revoke all on function public.can_send_message(uuid, uuid) from public;
grant execute on function public.can_send_message(uuid, uuid) to authenticated;

create or replace function public.ensure_conversation_for_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv public.conversations%rowtype;
begin
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
      intro_message_sent
    )
    values (
      new.sender_id,
      new.receiver_id,
      'pending',
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

create or replace function public.opportunity_application_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  poster uuid;
  conv_id uuid;
  existing public.conversations%rowtype;
begin
  select posted_by into poster
  from public.opportunities
  where id = new.opportunity_id;

  if poster is null or poster = new.applicant_id then
    return new;
  end if;

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
    else
      update public.conversations
      set
        status = 'pending',
        unlock_reason = coalesce(unlock_reason, 'opportunity_application'),
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
      intro_message_sent,
      gate_mode
    )
    values (
      new.applicant_id,
      poster,
      'pending',
      'opportunity_application',
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
    conversation_id
  )
  values (
    new.applicant_id,
    poster,
    new.pitch,
    false,
    conv_id
  );

  perform set_config('app.bypass_message_gate', 'off', true);

  update public.conversations
  set
    intro_message_sent = true,
    unlock_reason = coalesce(unlock_reason, 'opportunity_application'),
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
      'opportunity_application',
      'open',
      null
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

-- =============================================================================
-- 5) opportunity_applications INSERT — self-apply, non-expired, no graduate guard
-- =============================================================================

alter table public.opportunity_applications enable row level security;

drop policy if exists "Users can apply to opportunities"
  on public.opportunity_applications;
create policy "Users can apply to opportunities"
  on public.opportunity_applications
  for insert
  to authenticated
  with check (
    applicant_id = auth.uid()
    and exists (
      select 1
      from public.opportunities o
      where o.id = opportunity_id
        and o.posted_by is distinct from auth.uid()
        and (o.deadline is null or o.deadline >= current_date)
    )
  );

create or replace function public.opportunity_applications_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt int;
begin
  select count(*)::int into cnt
  from public.opportunity_applications
  where applicant_id = new.applicant_id
    and created_at >= now() - interval '7 days'
    and id is distinct from new.id;

  if cnt >= 5 then
    raise exception 'APPLICATION_RATE_LIMIT: You can submit at most 5 applications every 7 days.';
  end if;

  if auth.uid() is distinct from new.applicant_id then
    raise exception 'NOT_ALLOWED: applicant_id must be you.';
  end if;

  if exists (
    select 1 from public.opportunities o
    where o.id = new.opportunity_id and o.posted_by = new.applicant_id
  ) then
    raise exception 'NOT_ALLOWED: You cannot apply to your own posting.';
  end if;

  if exists (
    select 1 from public.opportunities o
    where o.id = new.opportunity_id
      and o.deadline is not null
      and o.deadline < current_date
  ) then
    raise exception 'NOT_ALLOWED: This opportunity has expired.';
  end if;

  return new;
end;
$$;

-- =============================================================================
-- 6) referral_questions INSERT — anyone who passes can_view_referral
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
-- 7) referral_requests UPDATE — non-poster accept only while open
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
  );

create policy "Acceptor can update accepted referral"
  on public.referral_requests
  for update
  to authenticated
  using (auth.uid() = accepted_by)
  with check (auth.uid() = accepted_by);

-- Column guard: non-poster may only accept (open→accepted) or mark referred_at
create or replace function public.referral_requests_guard_accept_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is distinct from old.student_id then
    if new.student_id is distinct from old.student_id
       or new.company is distinct from old.company
       or new.role is distinct from old.role
       or new.context is distinct from old.context
       or new.resume_url is distinct from old.resume_url
       or new.job_link is distinct from old.job_link
       or new.deadline is distinct from old.deadline
       or coalesce(new.target_company_normalized, '')
            is distinct from coalesce(old.target_company_normalized, '')
       or coalesce(new.visibility_tier, 0)
            is distinct from coalesce(old.visibility_tier, 0)
    then
      raise exception 'NOT_ALLOWED: You can only accept this request, not edit its details.';
    end if;

    if old.status = 'open'
       and old.accepted_by is null
       and new.status = 'accepted'
       and new.accepted_by = auth.uid() then
      return new;
    end if;

    if old.accepted_by = auth.uid()
       and new.accepted_by = auth.uid()
       and new.status = old.status
       and (
         new.referred_at is distinct from old.referred_at
         or new.status in ('accepted', 'closed')
       ) then
      return new;
    end if;

    raise exception 'NOT_ALLOWED: Invalid update for a non-poster.';
  end if;

  return new;
end;
$$;

drop trigger if exists referral_requests_guard_accept_columns
  on public.referral_requests;
create trigger referral_requests_guard_accept_columns
  before update on public.referral_requests
  for each row
  execute function public.referral_requests_guard_accept_columns();

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
-- 8) accept_referral_request RPC — clear errors; unlock via trigger in same TX
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

  -- Belt-and-suspenders: ensure conversation exists even if trigger missing
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
-- 9) Mentorship — accept + answer triggers MUST be SECURITY DEFINER
--    (initiator = student; calling mentor is recipient — same RLS trap)
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
      v_student
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
    -- Decline / refer / expire: silent to the student (no notification by design)
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

-- Keep routing / turn helpers locked as SECURITY DEFINER
create or replace function public.mentorship_requests_auto_route()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.route_mentorship_request(new.id);
  return new;
end;
$$;

drop trigger if exists mentorship_requests_auto_route on public.mentorship_requests;
create trigger mentorship_requests_auto_route
  after insert on public.mentorship_requests
  for each row
  execute function public.mentorship_requests_auto_route();

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
  end if;

  return new;
end;
$$;

drop trigger if exists messages_turn_based_after_insert on public.messages;
create trigger messages_turn_based_after_insert
  after insert on public.messages
  for each row
  execute function public.messages_turn_based_after_insert();

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
