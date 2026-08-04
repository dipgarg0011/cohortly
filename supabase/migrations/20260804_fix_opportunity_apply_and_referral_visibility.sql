-- Cohortly: fix opportunity apply (MESSAGE_NOT_ALLOWED) + strict referral tiers
-- Run in Supabase → SQL Editor (production).
--
-- Bug 1: opportunity_application_after_insert created the conversation with
--   intro_message_sent=true, then inserted the pitch message. The messages
--   BEFORE INSERT trigger ensure_conversation_for_message called can_send_message
--   which returns false when pending + intro already "sent", raising
--   MESSAGE_NOT_ALLOWED — surfaced in the UI as "You're not allowed to do that."
--
-- Bug 2: referral SELECT may still have leftover using(true); and
--   referral_effective_tier opened to ALL graduates immediately when nobody
--   at the target company existed. Students must never see others' asks.
--   Tier is computed at READ TIME from created_at only.

-- =============================================================================
-- PART 1) Opportunities: graduates may post; anyone authenticated may apply
-- =============================================================================

drop policy if exists "Graduates can post opportunities" on public.opportunities;
drop policy if exists "Authenticated users can post opportunities" on public.opportunities;

create policy "Graduates can post opportunities"
  on public.opportunities
  for insert
  to authenticated
  with check (
    auth.uid() = posted_by
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'graduate'
    )
  );

-- =============================================================================
-- PART 2) opportunity_applications RLS (exact policies)
-- =============================================================================

alter table public.opportunity_applications enable row level security;

-- BEFORE (from 20260803_referral_accept_and_opportunity_apply.sql):
--   "Applicant or poster can read applications"  SELECT  applicant_id = auth.uid() OR poster
--   "Users can apply to opportunities"           INSERT  applicant_id = auth.uid() AND opportunity exists
--   "Poster or applicant can update application status"  UPDATE  applicant OR poster
--   (no DELETE policy)

drop policy if exists "Applicant or poster can read applications"
  on public.opportunity_applications;
drop policy if exists "Users can apply to opportunities"
  on public.opportunity_applications;
drop policy if exists "Poster or applicant can update application status"
  on public.opportunity_applications;
drop policy if exists "Applicants can withdraw own applications"
  on public.opportunity_applications;

create policy "Applicant or poster can read applications"
  on public.opportunity_applications
  for select
  to authenticated
  using (
    applicant_id = auth.uid()
    or exists (
      select 1
      from public.opportunities o
      where o.id = opportunity_id
        and o.posted_by = auth.uid()
    )
  );

-- Any authenticated user may apply as themselves to a non-expired, non-own posting
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

create policy "Poster or applicant can update application status"
  on public.opportunity_applications
  for update
  to authenticated
  using (
    applicant_id = auth.uid()
    or exists (
      select 1
      from public.opportunities o
      where o.id = opportunity_id
        and o.posted_by = auth.uid()
    )
  )
  with check (
    applicant_id = auth.uid()
    or exists (
      select 1
      from public.opportunities o
      where o.id = opportunity_id
        and o.posted_by = auth.uid()
    )
  );

-- Optional hard delete for own pending apps (withdraw also via status update)
create policy "Applicants can withdraw own applications"
  on public.opportunity_applications
  for delete
  to authenticated
  using (
    applicant_id = auth.uid()
    and status = 'pending'
  );

-- =============================================================================
-- PART 3) Bypass message gate for system-seeded pitch inserts + fix after_insert
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
  -- Local (transaction-scoped) bypass used by opportunity_application_after_insert
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

  if conv.status = 'pending' or coalesce(conv.gate_mode, 'open') = 'locked' then
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

  if coalesce(conv.gate_mode, 'open') = 'open' then
    return true;
  end if;

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
      -- Do not seed a pitch into a permanently closed pair
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
      -- Keep intro_message_sent false until the pitch row lands
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

  -- Seed pitch even if a prior intro flag would block a normal client send
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

  -- Ensure intro flag is set (mark_intro trigger also does this for pending)
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

-- Rate-limit helper: clearer errors (keep existing behavior)
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
-- PART 4) Referral visibility — strict age tiers + drop permissive SELECT
-- =============================================================================

create or replace function public.normalize_company_name(p_company text)
returns text
language sql
immutable
as $$
  select nullif(
    lower(trim(regexp_replace(coalesce(p_company, ''), '\s+', ' ', 'g'))),
    ''
  );
$$;

create or replace function public.referral_requests_normalize_company()
returns trigger
language plpgsql
as $$
begin
  new.target_company_normalized := public.normalize_company_name(new.company);
  if new.status = 'accepted'
     and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    new.accepted_at := coalesce(new.accepted_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists referral_requests_normalize_company on public.referral_requests;
create trigger referral_requests_normalize_company
  before insert or update of company, status on public.referral_requests
  for each row
  execute function public.referral_requests_normalize_company();

-- Backfill normalized company for existing rows
update public.referral_requests
set target_company_normalized = public.normalize_company_name(company)
where company is not null
  and (
    target_company_normalized is null
    or target_company_normalized is distinct from public.normalize_company_name(company)
  );

create or replace function public.referral_age_tier(p_created_at timestamptz)
returns int
language sql
stable
as $$
  select case
    when p_created_at is null then 1
    when now() < p_created_at + interval '48 hours' then 1
    when now() < p_created_at + interval '5 days' then 2
    else 3
  end;
$$;

-- Effective tier = age tier only (no "nobody at company → open to all" shortcut)
create or replace function public.referral_effective_tier(
  p_created_at timestamptz,
  p_target_company text,
  p_poster_id uuid
)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select public.referral_age_tier(p_created_at);
$$;

revoke all on function public.referral_effective_tier(timestamptz, text, uuid) from public;
grant execute on function public.referral_effective_tier(timestamptz, text, uuid) to authenticated;

create or replace function public.sync_referral_visibility(p_request_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.referral_requests%rowtype;
  tier int;
begin
  select * into r from public.referral_requests where id = p_request_id;
  if not found then
    return 1;
  end if;

  if r.status = 'open' then
    if (r.deadline is not null and r.deadline < current_date)
       or (r.deadline is null and r.created_at < now() - interval '30 days') then
      update public.referral_requests
      set status = 'expired'
      where id = r.id
        and status = 'open';
      return coalesce(r.visibility_tier, 1);
    end if;
  end if;

  tier := public.referral_age_tier(r.created_at);

  update public.referral_requests
  set
    visibility_tier = tier,
    opened_to_all_at = case
      when tier >= 3 then coalesce(opened_to_all_at, r.created_at + interval '5 days')
      else opened_to_all_at
    end
  where id = r.id
    and (
      visibility_tier is distinct from tier
      or (tier >= 3 and opened_to_all_at is null)
    );

  return tier;
end;
$$;

revoke all on function public.sync_referral_visibility(uuid) from public;
grant execute on function public.sync_referral_visibility(uuid) to authenticated;

create or replace function public.can_view_referral(
  p_request_id uuid,
  p_viewer_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.referral_requests%rowtype;
  v public.profiles%rowtype;
  tier int;
  viewer_company text;
  target text;
begin
  if p_request_id is null or p_viewer_id is null then
    return false;
  end if;

  select * into r from public.referral_requests where id = p_request_id;
  if not found then
    return false;
  end if;

  -- Poster always sees own
  if r.student_id = p_viewer_id then
    return true;
  end if;

  -- Acceptor always sees
  if r.accepted_by = p_viewer_id then
    return true;
  end if;

  -- Anyone who already asked a question keeps access
  if exists (
    select 1
    from public.referral_questions q
    where q.request_id = r.id
      and q.asker_id = p_viewer_id
  ) then
    return true;
  end if;

  select * into v from public.profiles where id = p_viewer_id;
  if not found then
    return false;
  end if;

  -- Current students NEVER see anyone else's referral
  if coalesce(v.status, 'student') <> 'graduate' then
    return false;
  end if;

  if r.status <> 'open' then
    return false;
  end if;

  if r.deadline is not null and r.deadline < current_date then
    return false;
  end if;
  if r.deadline is null and r.created_at < now() - interval '30 days' then
    return false;
  end if;

  target := coalesce(
    r.target_company_normalized,
    public.normalize_company_name(r.company)
  );
  viewer_company := public.normalize_company_name(v.company);

  -- Tier at READ TIME from created_at
  tier := public.referral_age_tier(r.created_at);

  -- Tier 1 (0–48h): current company match only
  if viewer_company is not null and target is not null and viewer_company = target then
    return true;
  end if;

  -- Tier 2 (48h–5d): + past companies
  if tier >= 2 then
    if target is not null and exists (
      select 1
      from unnest(coalesce(v.past_companies, '{}'::text[])) as pc(name)
      where public.normalize_company_name(pc.name) = target
    ) then
      return true;
    end if;
  end if;

  -- Tier 3 (after 5 days): all graduates
  if tier >= 3 then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.can_view_referral(uuid, uuid) from public;
grant execute on function public.can_view_referral(uuid, uuid) to authenticated;

-- OUT/return row type changed vs older 4-column signature; CREATE OR REPLACE cannot alter it.
-- No CASCADE: nothing depends on this function as a hard object dependency.
drop function if exists public.referral_reach_stats(uuid);

create or replace function public.referral_reach_stats(p_request_id uuid)
returns table (
  tier int,
  opens_to_all_at timestamptz,
  matching_graduate_count bigint,
  past_company_graduate_count bigint,
  age_tier int,
  open_to_all_now boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.referral_requests%rowtype;
  t int;
  a int;
  target text;
  match_count bigint;
begin
  select * into r from public.referral_requests where id = p_request_id;
  if not found then
    return;
  end if;

  t := public.sync_referral_visibility(r.id);
  a := public.referral_age_tier(r.created_at);
  target := coalesce(
    r.target_company_normalized,
    public.normalize_company_name(r.company)
  );

  select count(*) into match_count
  from public.profiles p
  where p.status = 'graduate'
    and p.id is distinct from r.student_id
    and public.normalize_company_name(p.company) = target;

  return query
  select
    t,
    r.created_at + interval '5 days',
    coalesce(match_count, 0),
    (
      select count(*)::bigint
      from public.profiles p
      where p.status = 'graduate'
        and p.id is distinct from r.student_id
        and exists (
          select 1
          from unnest(coalesce(p.past_companies, '{}'::text[])) as pc(name)
          where public.normalize_company_name(pc.name) = target
        )
    ),
    a,
    (t >= 3);
end;
$$;

revoke all on function public.referral_reach_stats(uuid) from public;
grant execute on function public.referral_reach_stats(uuid) to authenticated;

-- DROP leftover permissive SELECT (Postgres ORs policies — must not keep using(true))
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
-- PART 5) Mentorship audit — mentors must not SELECT unmatched (or any) rows
-- =============================================================================
-- Design: mentors read via list_my_matched_asks() only (masks student_id).
-- Drop table SELECT for mentors if reintroduced by an older migration order.
-- No using(true) should exist; drop it if present.

drop policy if exists "Authenticated users can view mentorship requests"
  on public.mentorship_requests;
drop policy if exists "Anyone can view mentorship requests"
  on public.mentorship_requests;
drop policy if exists "Matched mentors can view mentorship requests"
  on public.mentorship_requests;

-- Ensure student-only SELECT remains
drop policy if exists "Students can view own mentorship requests"
  on public.mentorship_requests;
create policy "Students can view own mentorship requests"
  on public.mentorship_requests
  for select
  to authenticated
  using (auth.uid() = student_id);

-- Sync visibility_tier columns for open asks
do $$
declare
  rid uuid;
begin
  for rid in
    select id from public.referral_requests where status = 'open'
  loop
    perform public.sync_referral_visibility(rid);
  end loop;
end;
$$;
