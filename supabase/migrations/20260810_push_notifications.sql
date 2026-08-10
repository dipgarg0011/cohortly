-- Cohortly: Expo push notifications via notifications fan-out + Edge Function
-- Prerequisites:
--   1) profiles.push_token (20260810_profiles_push_token.sql)
--   2) Deploy Edge Function `send-push`
--   3) Set DB settings (or Vault) once per project:
--        alter database postgres set app.settings.supabase_url = 'https://YOUR_REF.supabase.co';
--        alter database postgres set app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';

create extension if not exists pg_net with schema extensions;

-- -----------------------------------------------------------------------------
-- Helper: enqueue HTTP call to Edge Function (non-blocking via pg_net)
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_expo_push(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_url text;
  v_key text;
begin
  select push_token into v_token
  from public.profiles
  where id = p_user_id;

  if v_token is null or length(trim(v_token)) = 0 then
    return;
  end if;

  v_url := current_setting('app.settings.supabase_url', true);
  v_key := current_setting('app.settings.service_role_key', true);

  -- Optional Vault fallbacks (create secrets named supabase_url / service_role_key)
  if v_url is null or length(trim(v_url)) = 0 then
    begin
      select ds.decrypted_secret into v_url
      from vault.decrypted_secrets ds
      where ds.name = 'supabase_url'
      limit 1;
    exception
      when undefined_table then null;
      when others then null;
    end;
  end if;

  if v_key is null or length(trim(v_key)) = 0 then
    begin
      select ds.decrypted_secret into v_key
      from vault.decrypted_secrets ds
      where ds.name = 'service_role_key'
      limit 1;
    exception
      when undefined_table then null;
      when others then null;
    end;
  end if;

  if v_url is null or v_key is null then
    raise warning 'enqueue_expo_push: missing supabase_url or service_role_key settings';
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'token', v_token,
      'title', p_title,
      'body', coalesce(p_body, ''),
      'data', coalesce(p_data, '{}'::jsonb)
    )
  );
end;
$$;

revoke all on function public.enqueue_expo_push(uuid, text, text, jsonb) from public;

-- -----------------------------------------------------------------------------
-- Connection request created (pending conversation)
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

  select coalesce(nullif(trim(full_name), ''), 'Someone')
    into initiator_name
  from public.profiles
  where id = new.initiator_id;

  insert into public.notifications (user_id, type, title, body, link, payload)
  values (
    new.recipient_id,
    'connection_request',
    initiator_name || ' wants to connect',
    'Open Messages to accept or decline.',
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

drop trigger if exists conversations_notify_request on public.conversations;
create trigger conversations_notify_request
  after insert on public.conversations
  for each row
  execute function public.notify_on_connection_request();

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

  select coalesce(nullif(trim(full_name), ''), 'Someone')
    into acceptor_name
  from public.profiles
  where id = new.recipient_id;

  insert into public.notifications (user_id, type, title, body, link, payload)
  values (
    new.initiator_id,
    'connection_accepted',
    acceptor_name || ' accepted your request',
    'You can message each other now.',
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

drop trigger if exists conversations_notify_accepted on public.conversations;
create trigger conversations_notify_accepted
  after update of status on public.conversations
  for each row
  execute function public.notify_on_connection_accepted();

-- -----------------------------------------------------------------------------
-- Mentor answered an ask → notify the student
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
    'Your ask was answered',
    coalesce(nullif(trim(v_title), ''), 'Open Mentors to read the reply.'),
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

drop trigger if exists request_answers_notify_student on public.request_answers;
create trigger request_answers_notify_student
  after insert on public.request_answers
  for each row
  execute function public.notify_student_on_mentor_answer();

-- -----------------------------------------------------------------------------
-- Push fan-out when an in-app notification is created
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
begin
  if new.type not in (
    'connection_request',
    'connection_accepted',
    'mentorship_answer',
    'mentorship_match',
    'mentorship_watch_match',
    'mentorship_nudge',
    'mentorship_resolution',
    'mentorship_auto_withdraw',
    'referral_question',
    'referral_accepted',
    'referral_helping',
    'referral_match',
    'referral_nudge',
    'referral_not_referred',
    'referral_expiring',
    'referral_progress'
  ) then
    return new;
  end if;

  v_data := coalesce(new.payload, '{}'::jsonb);

  if new.type in ('connection_request', 'connection_accepted') then
    v_push_type := 'connection';
  elsif new.type like 'mentorship%' then
    v_push_type := 'mentor';
  elsif new.type like 'referral%' then
    v_push_type := 'referral';
  else
    v_push_type := new.type;
  end if;

  v_data := v_data || jsonb_build_object(
    'type', v_push_type,
    'notification_type', new.type,
    'link', new.link
  );

  perform public.enqueue_expo_push(
    new.user_id,
    new.title,
    new.body,
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
