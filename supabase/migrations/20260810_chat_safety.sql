-- Chat safety: either-party block/disconnect + user reports
-- Messaging remains gated by can_send_message (declined/blocked → no send).

-- =============================================================================
-- 1) user_reports
-- =============================================================================

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  reason text not null
    check (
      reason in (
        'harassment',
        'spam',
        'inappropriate',
        'scam',
        'other'
      )
    ),
  details text
    check (details is null or char_length(trim(details)) <= 1000),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

create index if not exists user_reports_reporter_idx
  on public.user_reports (reporter_id, created_at desc);

create index if not exists user_reports_reported_idx
  on public.user_reports (reported_id, created_at desc);

alter table public.user_reports enable row level security;

drop policy if exists "Users can file reports" on public.user_reports;
create policy "Users can file reports"
  on public.user_reports
  for insert
  to authenticated
  with check (auth.uid() = reporter_id);

drop policy if exists "Users can read own reports" on public.user_reports;
create policy "Users can read own reports"
  on public.user_reports
  for select
  to authenticated
  using (auth.uid() = reporter_id);

-- =============================================================================
-- 2) Either participant: block (permanent) or disconnect (soft leave)
-- =============================================================================

create or replace function public.block_conversation(p_conversation_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  conv public.conversations%rowtype;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into conv
  from public.conversations
  where id = p_conversation_id
  for update;

  if not found then
    raise exception 'Conversation not found';
  end if;

  if uid is distinct from conv.initiator_id
     and uid is distinct from conv.recipient_id then
    raise exception 'Not a participant in this conversation';
  end if;

  if conv.status = 'blocked' then
    return conv;
  end if;

  update public.conversations
  set
    status = 'blocked',
    updated_at = now()
  where id = p_conversation_id
  returning * into conv;

  return conv;
end;
$$;

revoke all on function public.block_conversation(uuid) from public;
grant execute on function public.block_conversation(uuid) to authenticated;

create or replace function public.disconnect_conversation(p_conversation_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  conv public.conversations%rowtype;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into conv
  from public.conversations
  where id = p_conversation_id
  for update;

  if not found then
    raise exception 'Conversation not found';
  end if;

  if uid is distinct from conv.initiator_id
     and uid is distinct from conv.recipient_id then
    raise exception 'Not a participant in this conversation';
  end if;

  -- Blocked stays blocked (stronger); disconnect only soft-closes active chats
  if conv.status = 'blocked' then
    return conv;
  end if;

  update public.conversations
  set
    status = 'declined',
    updated_at = now()
  where id = p_conversation_id
  returning * into conv;

  return conv;
end;
$$;

revoke all on function public.disconnect_conversation(uuid) from public;
grant execute on function public.disconnect_conversation(uuid) to authenticated;

-- =============================================================================
-- 3) Report user (+ optional auto-block)
-- =============================================================================

create or replace function public.report_user(
  p_reported_id uuid,
  p_reason text,
  p_details text default null,
  p_conversation_id uuid default null,
  p_also_block boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_count int;
  conv public.conversations%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_reported_id is null or p_reported_id = uid then
    raise exception 'Invalid report target';
  end if;

  if p_reason not in (
    'harassment', 'spam', 'inappropriate', 'scam', 'other'
  ) then
    raise exception 'Invalid report reason';
  end if;

  -- Rate limit: 10 reports / 24h
  select count(*)::int into v_count
  from public.user_reports
  where reporter_id = uid
    and created_at > now() - interval '24 hours';

  if v_count >= 10 then
    raise exception 'REPORT_RATE_LIMIT: You can file up to 10 reports per day.';
  end if;

  if p_conversation_id is not null then
    select * into conv
    from public.conversations
    where id = p_conversation_id;

    if not found then
      raise exception 'Conversation not found';
    end if;

    if uid is distinct from conv.initiator_id
       and uid is distinct from conv.recipient_id then
      raise exception 'Not a participant in this conversation';
    end if;

    if p_reported_id is distinct from conv.initiator_id
       and p_reported_id is distinct from conv.recipient_id then
      raise exception 'Reported user is not in this conversation';
    end if;
  end if;

  insert into public.user_reports (
    reporter_id,
    reported_id,
    conversation_id,
    reason,
    details
  )
  values (
    uid,
    p_reported_id,
    p_conversation_id,
    p_reason,
    nullif(trim(coalesce(p_details, '')), '')
  )
  returning id into v_id;

  if coalesce(p_also_block, true) and p_conversation_id is not null then
    perform public.block_conversation(p_conversation_id);
  end if;

  return v_id;
end;
$$;

revoke all on function public.report_user(uuid, text, text, uuid, boolean) from public;
grant execute on function public.report_user(uuid, text, text, uuid, boolean) to authenticated;
