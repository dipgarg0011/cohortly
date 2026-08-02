-- Cohortly: connection-request gating for messaging
-- Run this entire script in Supabase → SQL Editor.
-- Confirm success before any frontend work.

-- =============================================================================
-- 1) conversations table
-- =============================================================================

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  initiator_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'blocked')),
  unlock_reason text
    check (
      unlock_reason is null
      or unlock_reason in ('manual_accept', 'referral', 'mentorship')
    ),
  intro_message_sent boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (initiator_id <> recipient_id)
);

-- Only ONE conversation row per unordered pair of people
create unique index if not exists conversations_unique_pair_idx
  on public.conversations (
    least(initiator_id, recipient_id),
    greatest(initiator_id, recipient_id)
  );

create index if not exists conversations_initiator_idx
  on public.conversations (initiator_id, status);

create index if not exists conversations_recipient_idx
  on public.conversations (recipient_id, status);

-- Keep updated_at fresh
create or replace function public.set_conversations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row
  execute function public.set_conversations_updated_at();

-- =============================================================================
-- 2) Add conversation_id to messages + backfill
-- =============================================================================

alter table public.messages
  add column if not exists conversation_id uuid references public.conversations(id);

-- Backfill: for every pair that already has messages, create an ACCEPTED
-- conversation (initiator = earliest sender) and attach messages to it.
do $$
declare
  pair record;
  conv_id uuid;
  first_sender uuid;
  first_recipient uuid;
begin
  for pair in
    select
      least(m.sender_id, m.receiver_id) as user_a,
      greatest(m.sender_id, m.receiver_id) as user_b,
      min(m.created_at) as first_at
    from public.messages m
    where m.conversation_id is null
    group by 1, 2
  loop
    -- Earliest message sender becomes initiator for historical rows
    select m.sender_id
      into first_sender
    from public.messages m
    where least(m.sender_id, m.receiver_id) = pair.user_a
      and greatest(m.sender_id, m.receiver_id) = pair.user_b
    order by m.created_at asc
    limit 1;

    first_recipient := case
      when first_sender = pair.user_a then pair.user_b
      else pair.user_a
    end;

    select c.id into conv_id
    from public.conversations c
    where least(c.initiator_id, c.recipient_id) = pair.user_a
      and greatest(c.initiator_id, c.recipient_id) = pair.user_b
    limit 1;

    if conv_id is null then
      insert into public.conversations (
        initiator_id,
        recipient_id,
        status,
        unlock_reason,
        intro_message_sent,
        created_at,
        updated_at
      )
      values (
        first_sender,
        first_recipient,
        'accepted',
        'manual_accept',
        true,
        pair.first_at,
        now()
      )
      returning id into conv_id;
    else
      update public.conversations
      set
        status = 'accepted',
        intro_message_sent = true,
        unlock_reason = coalesce(unlock_reason, 'manual_accept'),
        updated_at = now()
      where id = conv_id;
    end if;

    update public.messages m
    set conversation_id = conv_id
    where m.conversation_id is null
      and least(m.sender_id, m.receiver_id) = pair.user_a
      and greatest(m.sender_id, m.receiver_id) = pair.user_b;
  end loop;
end $$;

create index if not exists messages_conversation_id_idx
  on public.messages (conversation_id);

-- =============================================================================
-- 3) can_send_message(sender, receiver) — SECURITY DEFINER
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

  -- No conversation yet → first intro is allowed
  if not found then
    return true;
  end if;

  if conv.status = 'accepted' then
    return true;
  end if;

  if conv.status in ('declined', 'blocked') then
    return false;
  end if;

  -- pending
  if conv.status = 'pending' then
    -- Only initiator may send, and only if intro not yet sent
    if conv.initiator_id = p_sender and conv.intro_message_sent = false then
      return true;
    end if;
    return false;
  end if;

  return false;
end;
$$;

revoke all on function public.can_send_message(uuid, uuid) from public;
grant execute on function public.can_send_message(uuid, uuid) to authenticated;

-- =============================================================================
-- 4) Replace messages INSERT policy to use can_send_message
-- =============================================================================

drop policy if exists "Users can send messages" on public.messages;
drop policy if exists "Users can insert messages if allowed" on public.messages;

create policy "Users can insert messages if allowed"
  on public.messages
  for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and public.can_send_message(sender_id, receiver_id)
  );

-- Keep existing select / update policies if present; recreate safely:
drop policy if exists "Users can read own messages" on public.messages;
create policy "Users can read own messages"
  on public.messages
  for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "Users can mark received messages as read" on public.messages;
create policy "Users can mark received messages as read"
  on public.messages
  for update
  to authenticated
  using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

-- =============================================================================
-- Helper: get-or-create pending conversation for intro send
-- Called from app OR from a messages BEFORE INSERT trigger below.
-- =============================================================================

create or replace function public.ensure_conversation_for_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv public.conversations%rowtype;
  new_id uuid;
begin
  -- Gate again inside trigger for safety
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
    -- Creating a NEW pending conversation counts toward anti-spam limit
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
  elsif conv.status = 'pending'
        and conv.initiator_id = new.sender_id
        and conv.intro_message_sent = false then
    -- Leave intro_message_sent=false until AFTER INSERT (RLS re-checks can_send_message)
    null;
  elsif conv.status = 'accepted' then
    -- fine — free chat
    null;
  else
    raise exception 'MESSAGE_NOT_ALLOWED: You cannot send a message in this conversation.'
      using errcode = 'P0001';
  end if;

  new.conversation_id := conv.id;
  return new;
end;
$$;

drop trigger if exists messages_ensure_conversation on public.messages;
create trigger messages_ensure_conversation
  before insert on public.messages
  for each row
  execute function public.ensure_conversation_for_message();

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

-- =============================================================================
-- 5) RLS on conversations
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
  with check (auth.uid() = initiator_id);

-- Only the RECIPIENT can update status (accept / decline / block)
drop policy if exists "Recipient can update conversation status" on public.conversations;
create policy "Recipient can update conversation status"
  on public.conversations
  for update
  to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- =============================================================================
-- 6) Anti-spam: max 5 PENDING outbound requests / rolling 24h
--    (Also enforced in ensure_conversation_for_message when creating via message.)
-- =============================================================================

create or replace function public.enforce_pending_request_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    if (
      select count(*)
      from public.conversations c
      where c.initiator_id = new.initiator_id
        and c.status = 'pending'
        and c.created_at > now() - interval '24 hours'
        and c.id is distinct from new.id
    ) >= 5 then
      raise exception 'DAILY_REQUEST_LIMIT: You can only send 5 connection requests per day. Try again tomorrow.'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists conversations_pending_limit on public.conversations;
create trigger conversations_pending_limit
  before insert on public.conversations
  for each row
  execute function public.enforce_pending_request_limit();

-- =============================================================================
-- 7) Auto-unlock on referral accept / mentorship confirm
-- =============================================================================

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
declare
  conv_id uuid;
  existing public.conversations%rowtype;
begin
  if p_user_a is null or p_user_b is null or p_user_a = p_user_b then
    return null;
  end if;

  select *
    into existing
  from public.conversations c
  where least(c.initiator_id, c.recipient_id) = least(p_user_a, p_user_b)
    and greatest(c.initiator_id, c.recipient_id) = greatest(p_user_a, p_user_b)
  limit 1;

  if found then
    update public.conversations
    set
      status = 'accepted',
      unlock_reason = coalesce(p_reason, unlock_reason),
      intro_message_sent = true,
      updated_at = now()
    where id = existing.id
    returning id into conv_id;
  else
    insert into public.conversations (
      initiator_id,
      recipient_id,
      status,
      unlock_reason,
      intro_message_sent
    )
    values (
      p_user_a,
      p_user_b,
      'accepted',
      p_reason,
      true
    )
    returning id into conv_id;
  end if;

  return conv_id;
end;
$$;

-- Referral accepted → unlock between poster (student_id) and acceptor (accepted_by)
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

-- Mentor booking confirmed → unlock between mentor and student
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
      new.mentor_id,
      new.student_id,
      'mentorship'
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

-- =============================================================================
-- Optional helper for recipients updating status with unlock_reason
-- =============================================================================

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
      when p_new_status = 'accepted' then 'manual_accept'
      else unlock_reason
    end,
    updated_at = now()
  where id = p_conversation_id
  returning * into conv;

  return conv;
end;
$$;

revoke all on function public.respond_to_conversation(uuid, text) from public;
grant execute on function public.respond_to_conversation(uuid, text) to authenticated;

-- Realtime: so inbox tabs update when requests are accepted
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;

-- Done.
-- After running: tell your agent "SQL ran successfully" to proceed with frontend.
