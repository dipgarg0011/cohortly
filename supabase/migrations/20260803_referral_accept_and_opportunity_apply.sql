-- Cohortly: fix referral accept (RLS + atomic accept) + opportunity applications
-- Run in Supabase → SQL Editor after prior referral / connection migrations.
--
-- Part A: Accept & refer was a silent dead end when UPDATE matched 0 rows
--         (PostgREST returns no error). Also tighten UPDATE so non-posters
--         may only set status/accepted_by while open.
-- Part B: opportunity_applications (SQL only — wait before frontend)

-- =============================================================================
-- PART A1) Tighten referral_requests UPDATE policies
-- =============================================================================

drop policy if exists "Users can update referral requests" on public.referral_requests;
drop policy if exists "Poster can update own referral requests" on public.referral_requests;
drop policy if exists "Graduates can accept open referral requests" on public.referral_requests;

-- Poster: full update on own rows
create policy "Poster can update own referral requests"
  on public.referral_requests
  for update
  to authenticated
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

-- Non-poster accept: only while open / unclaimed; WITH CHECK locks acceptor
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

-- Acceptor can mark referred_at / maintain their accepted row
drop policy if exists "Acceptor can update accepted referral" on public.referral_requests;
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
as $$
begin
  if auth.uid() is distinct from old.student_id then
    if new.student_id is distinct from old.student_id
       or new.company is distinct from old.company
       or new.role is distinct from old.role
       or new.why is distinct from old.why
       or new.context is distinct from old.context
       or new.resume_path is distinct from old.resume_path
       or new.deadline is distinct from old.deadline
       or coalesce(new.target_company_normalized, '')
            is distinct from coalesce(old.target_company_normalized, '')
    then
      raise exception 'NOT_ALLOWED: You can only accept this request, not edit its details.';
    end if;

    -- Accept transition
    if old.status = 'open'
       and old.accepted_by is null
       and new.status = 'accepted'
       and new.accepted_by = auth.uid() then
      return new;
    end if;

    -- Acceptor marks referred / closes their side of workflow
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

-- =============================================================================
-- PART A2) Atomic accept RPC — clear errors, no silent 0-row
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

  select coalesce(nullif(trim(full_name), ''), 'Someone')
    into acceptor_name
  from public.profiles
  where id = acceptor;

  -- Prefer named notification (trigger may also fire; dedupe by replacing title)
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

-- Enrich existing notify trigger to include name when possible
create or replace function public.notify_on_referral_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acceptor_name text;
begin
  if new.status = 'accepted'
     and (tg_op = 'INSERT' or old.status is distinct from 'accepted')
     and new.accepted_by is not null then
    select coalesce(nullif(trim(full_name), ''), 'Someone')
      into acceptor_name
    from public.profiles
    where id = new.accepted_by;

    -- Skip if an identical notify was just inserted by accept_referral_request
    -- (same second). Still safe to insert once from trigger for direct UPDATEs.
    if not exists (
      select 1
      from public.notifications n
      where n.user_id = new.student_id
        and n.type = 'referral_accepted'
        and (n.payload->>'request_id') = new.id::text
        and n.created_at > now() - interval '2 seconds'
    ) then
      insert into public.notifications (user_id, type, title, body, link, payload)
      values (
        new.student_id,
        'referral_accepted',
        acceptor_name || ' accepted your referral request',
        'They accepted your request for ' || new.role || ' at ' || new.company || '.',
        '/messages?with=' || new.accepted_by::text,
        jsonb_build_object('request_id', new.id, 'accepted_by', new.accepted_by)
      );
    end if;
  end if;
  return new;
end;
$$;

-- =============================================================================
-- PART B) opportunity_applications
-- =============================================================================

alter table public.conversations
  drop constraint if exists conversations_unlock_reason_check;

alter table public.conversations
  add constraint conversations_unlock_reason_check
  check (
    unlock_reason is null
    or unlock_reason in (
      'manual_accept',
      'referral',
      'mentorship',
      'referral_question',
      'opportunity_application'
    )
  );

create table if not exists public.opportunity_applications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null
    references public.opportunities(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  pitch text not null
    check (
      char_length(trim(pitch)) >= 100
      and char_length(pitch) <= 600
    ),
  resume_url text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  unique (opportunity_id, applicant_id)
);

create index if not exists opportunity_applications_opportunity_idx
  on public.opportunity_applications (opportunity_id, created_at desc);

create index if not exists opportunity_applications_applicant_idx
  on public.opportunity_applications (applicant_id, created_at desc);

alter table public.opportunity_applications enable row level security;

drop policy if exists "Applicant or poster can read applications"
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

drop policy if exists "Users can apply to opportunities"
  on public.opportunity_applications;
create policy "Users can apply to opportunities"
  on public.opportunity_applications
  for insert
  to authenticated
  with check (
    applicant_id = auth.uid()
    and exists (
      select 1 from public.opportunities o where o.id = opportunity_id
    )
  );

-- Poster may accept/decline; applicant may withdraw
drop policy if exists "Poster or applicant can update application status"
  on public.opportunity_applications;
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

create or replace function public.opportunity_applications_guard_update()
returns trigger
language plpgsql
as $$
declare
  poster uuid;
begin
  select posted_by into poster
  from public.opportunities
  where id = old.opportunity_id;

  if auth.uid() = old.applicant_id then
    if new.status is distinct from 'withdrawn' then
      raise exception 'NOT_ALLOWED: Applicants can only withdraw.';
    end if;
    if old.status is distinct from 'pending' then
      raise exception 'NOT_ALLOWED: Only pending applications can be withdrawn.';
    end if;
    if new.pitch is distinct from old.pitch
       or new.resume_url is distinct from old.resume_url
       or new.opportunity_id is distinct from old.opportunity_id
       or new.applicant_id is distinct from old.applicant_id then
      raise exception 'NOT_ALLOWED: Cannot edit application details after submit.';
    end if;
  elsif auth.uid() = poster then
    if new.status not in ('accepted', 'declined') then
      raise exception 'NOT_ALLOWED: Poster may only accept or decline.';
    end if;
    if old.status is distinct from 'pending' then
      raise exception 'NOT_ALLOWED: Only pending applications can be decided.';
    end if;
    if new.pitch is distinct from old.pitch
       or new.resume_url is distinct from old.resume_url
       or new.opportunity_id is distinct from old.opportunity_id
       or new.applicant_id is distinct from old.applicant_id then
      raise exception 'NOT_ALLOWED: Cannot edit applicant fields.';
    end if;
  else
    raise exception 'NOT_ALLOWED: Not permitted.';
  end if;

  return new;
end;
$$;

drop trigger if exists opportunity_applications_guard_update
  on public.opportunity_applications;
create trigger opportunity_applications_guard_update
  before update on public.opportunity_applications
  for each row
  execute function public.opportunity_applications_guard_update();

-- Rate limit: max 5 applications / 7 days
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

  return new;
end;
$$;

drop trigger if exists opportunity_applications_rate_limit
  on public.opportunity_applications;
create trigger opportunity_applications_rate_limit
  before insert on public.opportunity_applications
  for each row
  execute function public.opportunity_applications_rate_limit();

-- On insert: pending conversation, pitch = intro message, intro_message_sent=true
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
      -- Leave locked permanently for declined/blocked pairs
      conv_id := existing.id;
    elsif existing.status = 'accepted' then
      -- Already open chat — keep open; still post pitch as a message
      conv_id := existing.id;
    else
      update public.conversations
      set
        status = 'pending',
        unlock_reason = coalesce(unlock_reason, 'opportunity_application'),
        intro_message_sent = true,
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
      true,
      'locked'
    )
    returning id into conv_id;
  end if;

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

-- On accept → open chat; on decline → leave locked
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
-- Done. Confirm SQL success before Part B frontend.
-- =============================================================================
