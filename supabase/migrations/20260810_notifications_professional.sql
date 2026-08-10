-- Cohortly: professional, high-signal push notifications
-- Short titles/bodies · useful events only · no noisy / long copy
-- Prerequisites: 20260810_profiles_push_token.sql, 20260810_push_notifications.sql

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.profile_first_name(p_name text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(trim(split_part(trim(coalesce(p_name, '')), ' ', 1)), ''),
    'Someone'
  );
$$;

create or replace function public.notification_preview(p_text text, p_max int default 90)
returns text
language sql
immutable
as $$
  select case
    when p_text is null or length(trim(p_text)) = 0 then null
    when length(trim(p_text)) <= greatest(p_max, 20) then trim(p_text)
    else left(trim(p_text), greatest(p_max, 20) - 1) || '…'
  end;
$$;

-- -----------------------------------------------------------------------------
-- Connection request — short, actionable
-- -----------------------------------------------------------------------------
create or replace function public.notify_on_connection_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  initiator_name text;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;

  select public.profile_first_name(full_name)
    into initiator_name
  from public.profiles
  where id = new.initiator_id;

  insert into public.notifications (user_id, type, title, body, link, payload)
  values (
    new.recipient_id,
    'connection_request',
    initiator_name || ' wants to connect',
    'Tap to review.',
    '/messages?with=' || new.initiator_id::text,
    jsonb_build_object(
      'type', 'connection',
      'conversation_id', new.id,
      'partner_id', new.initiator_id,
      'status', 'pending'
    )
  );

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Connection accepted
-- -----------------------------------------------------------------------------
create or replace function public.notify_on_connection_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acceptor_name text;
begin
  if new.status is distinct from 'accepted' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'accepted' then
    return new;
  end if;

  select public.profile_first_name(full_name)
    into acceptor_name
  from public.profiles
  where id = new.recipient_id;

  insert into public.notifications (user_id, type, title, body, link, payload)
  values (
    new.initiator_id,
    'connection_accepted',
    acceptor_name || ' accepted',
    'You''re connected.',
    '/messages?with=' || new.recipient_id::text,
    jsonb_build_object(
      'type', 'connection',
      'conversation_id', new.id,
      'partner_id', new.recipient_id,
      'status', 'accepted'
    )
  );

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Mentor answered
-- -----------------------------------------------------------------------------
create or replace function public.notify_student_on_mentor_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_title text;
begin
  select student_id, title
    into v_student, v_title
  from public.mentorship_requests
  where id = new.request_id;

  if v_student is null then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, link, payload)
  values (
    v_student,
    'mentorship_answer',
    'Mentor replied',
    coalesce(
      public.notification_preview(v_title, 80),
      'Open Mentors to read.'
    ),
    '/mentors?tab=mine&requestId=' || new.request_id::text,
    jsonb_build_object(
      'type', 'mentor',
      'request_id', new.request_id,
      'answer_id', new.id,
      'match_id', new.match_id
    )
  );

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- New chat message (accepted threads only — pending intros use connection_request)
-- -----------------------------------------------------------------------------
create or replace function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
  v_status text;
  v_preview text;
begin
  if coalesce(new.is_system, false)
     or coalesce(new.message_kind, 'user') = 'system' then
    return new;
  end if;
  if new.receiver_id is null or new.sender_id = new.receiver_id then
    return new;
  end if;

  if new.conversation_id is not null then
    select status into v_status
    from public.conversations
    where id = new.conversation_id;

    -- Pending intros are covered by connection_request
    if v_status is not distinct from 'pending' then
      return new;
    end if;
    if v_status in ('declined', 'blocked') then
      return new;
    end if;
  end if;

  select public.profile_first_name(full_name)
    into sender_name
  from public.profiles
  where id = new.sender_id;

  v_preview := public.notification_preview(new.content, 90);
  if v_preview is null then
    v_preview := 'Sent you a message';
  end if;

  insert into public.notifications (user_id, type, title, body, link, payload)
  values (
    new.receiver_id,
    'message',
    sender_name,
    v_preview,
    '/messages?with=' || new.sender_id::text,
    jsonb_build_object(
      'type', 'message',
      'partner_id', new.sender_id,
      'conversation_id', new.conversation_id,
      'message_id', new.id
    )
  );

  return new;
end;
$$;

drop trigger if exists messages_notify_receiver on public.messages;
create trigger messages_notify_receiver
  after insert on public.messages
  for each row
  execute function public.notify_on_new_message();

-- -----------------------------------------------------------------------------
-- Push fan-out — high-signal types only; truncate body; set channel
-- -----------------------------------------------------------------------------
create or replace function public.notifications_enqueue_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data jsonb;
  v_push_type text;
  v_channel text;
  v_body text;
begin
  -- Useful alerts only (skip nudges / auto-withdraw / expiry spam)
  if new.type not in (
    'connection_request',
    'connection_accepted',
    'message',
    'mentorship_answer',
    'mentorship_match',
    'mentorship_watch_match',
    'mentorship_resolution',
    'referral_question',
    'referral_accepted',
    'referral_helping',
    'referral_match',
    'referral_progress',
    'opportunity_application',
    'opportunity_application_accepted',
    'opportunity_application_declined',
    'opportunity_application_reviewing'
  ) then
    return new;
  end if;

  v_data := coalesce(new.payload, '{}'::jsonb);
  v_body := public.notification_preview(coalesce(new.body, ''), 100);
  if v_body is null then
    v_body := '';
  end if;

  if new.type in ('connection_request', 'connection_accepted') then
    v_push_type := 'connection';
    v_channel := 'activity';
  elsif new.type = 'message' then
    v_push_type := 'message';
    v_channel := 'messages';
  elsif new.type like 'mentorship%' then
    v_push_type := 'mentor';
    v_channel := 'activity';
  elsif new.type like 'referral%' then
    v_push_type := 'referral';
    v_channel := 'activity';
  elsif new.type like 'opportunity%' then
    v_push_type := 'opportunity';
    v_channel := 'activity';
  else
    v_push_type := new.type;
    v_channel := 'activity';
  end if;

  v_data := v_data || jsonb_build_object(
    'type', v_push_type,
    'notification_type', new.type,
    'link', new.link,
    'channelId', v_channel
  );

  perform public.enqueue_expo_push(
    new.user_id,
    left(trim(new.title), 60),
    v_body,
    v_data
  );

  return new;
end;
$$;

drop trigger if exists notifications_enqueue_push on public.notifications;
create trigger notifications_enqueue_push
  after insert on public.notifications
  for each row
  execute function public.notifications_enqueue_push();
