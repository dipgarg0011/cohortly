-- Fix connection-request send failing with RLS / "can't send a message"
-- Cause: BEFORE INSERT set intro_message_sent=true, then RLS re-checked
-- can_send_message() and denied the same insert.
-- Run in Supabase → SQL Editor.

-- 1) Recover stuck pending requests (flag set, but no message landed)
update public.conversations c
set
  intro_message_sent = false,
  updated_at = now()
where c.status = 'pending'
  and c.intro_message_sent = true
  and not exists (
    select 1
    from public.messages m
    where m.conversation_id = c.id
  );

-- 2) BEFORE INSERT: create/attach conversation but do NOT mark intro as used yet
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
        and conv.intro_message_sent = false then
    -- Keep false until AFTER INSERT succeeds (RLS checks can_send_message again)
    null;

  else
    raise exception 'MESSAGE_NOT_ALLOWED: You cannot send a message in this conversation.'
      using errcode = 'P0001';
  end if;

  new.conversation_id := conv.id;
  return new;
end;
$$;

-- 3) AFTER INSERT: mark intro as used only once the message actually exists
create or replace function public.mark_intro_message_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.conversation_id is not null then
    update public.conversations
    set
      intro_message_sent = true,
      updated_at = now()
    where id = new.conversation_id
      and status = 'pending'
      and initiator_id = new.sender_id
      and intro_message_sent = false;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_mark_intro_sent on public.messages;
create trigger messages_mark_intro_sent
  after insert on public.messages
  for each row
  execute function public.mark_intro_message_sent();

-- Keep BEFORE trigger in place (recreate if needed)
drop trigger if exists messages_ensure_conversation on public.messages;
create trigger messages_ensure_conversation
  before insert on public.messages
  for each row
  execute function public.ensure_conversation_for_message();
