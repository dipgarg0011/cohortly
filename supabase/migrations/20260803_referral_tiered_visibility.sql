-- Cohortly: tiered referral visibility, questions, dismissals, caps
-- Run in Supabase Dashboard → SQL Editor → New query → Run
--
-- Depends on:
--   - public.referral_requests (20260802_referral_requests.sql)
--   - public.conversations + upsert_accepted_conversation
--     (20260803_connection_requests.sql)  ← confirmed present
--   - public.profiles.status ('student' | 'graduate')
--     (20260803_profiles_status.sql)

-- =============================================================================
-- 1) referral_requests columns + status 'expired'
-- =============================================================================

alter table public.referral_requests
  add column if not exists target_company_normalized text,
  add column if not exists visibility_tier int not null default 1,
  add column if not exists opened_to_all_at timestamptz,
  add column if not exists context text,
  add column if not exists accepted_at timestamptz,
  add column if not exists referred_at timestamptz;

-- Expand status check to include expired
alter table public.referral_requests
  drop constraint if exists referral_requests_status_check;

alter table public.referral_requests
  add constraint referral_requests_status_check
  check (status in ('open', 'accepted', 'closed', 'expired'));

-- Backfill normalized company + accepted_at for existing rows
update public.referral_requests
set target_company_normalized = lower(trim(company))
where target_company_normalized is null
  and company is not null;

update public.referral_requests
set accepted_at = coalesce(accepted_at, created_at)
where status = 'accepted'
  and accepted_at is null;

-- Keep normalized company in sync on write
create or replace function public.referral_requests_normalize_company()
returns trigger
language plpgsql
as $$
begin
  new.target_company_normalized := lower(trim(new.company));
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

create index if not exists referral_requests_company_norm_idx
  on public.referral_requests (target_company_normalized)
  where status = 'open';

create index if not exists referral_requests_visibility_idx
  on public.referral_requests (visibility_tier, status);

comment on column public.referral_requests.target_company_normalized is
  'lower(trim(company)) for case-insensitive matching';
comment on column public.referral_requests.visibility_tier is
  '1=current company, 2=+past companies, 3=all graduates (derived from age)';
comment on column public.referral_requests.context is
  'Why they want the role / what makes them a fit';

-- =============================================================================
-- 2) profiles.past_companies
-- =============================================================================

alter table public.profiles
  add column if not exists past_companies text[] not null default '{}';

comment on column public.profiles.past_companies is
  'Previous employers (normalized display names); used for referral tier-2 matching';

create index if not exists profiles_past_companies_gin
  on public.profiles using gin (past_companies);

-- =============================================================================
-- 3) Tier helpers + can_view_referral (SECURITY DEFINER)
-- =============================================================================

-- Compute tier from created_at at read time (no cron).
--   Tier 1: first 48 hours
--   Tier 2: after 48 hours
--   Tier 3: after 5 days
create or replace function public.referral_age_tier(p_created_at timestamptz)
returns int
language sql
immutable
as $$
  select case
    when p_created_at is null then 1
    when now() < p_created_at + interval '48 hours' then 1
    when now() < p_created_at + interval '5 days' then 2
    else 3
  end;
$$;

-- Sync visibility_tier / opened_to_all_at from age (side-effect helper).
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

  -- Auto-expire: past deadline, or 30 days with no deadline, while still open
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

  -- Poster always sees their own request
  if r.student_id = p_viewer_id then
    perform public.sync_referral_visibility(r.id);
    return true;
  end if;

  -- Acceptor always sees a request they accepted
  if r.accepted_by = p_viewer_id then
    return true;
  end if;

  select * into v from public.profiles where id = p_viewer_id;
  if not found then
    return false;
  end if;

  -- Current students never see other people's referral requests
  if coalesce(v.status, 'student') <> 'graduate' then
    return false;
  end if;

  -- Non-open requests are not on the help board for other graduates
  if r.status <> 'open' then
    return false;
  end if;

  tier := public.sync_referral_visibility(r.id);
  target := coalesce(
    r.target_company_normalized,
    lower(trim(r.company))
  );
  viewer_company := lower(trim(coalesce(v.company, '')));

  -- Tier 1: current company match
  if viewer_company <> '' and viewer_company = target then
    return true;
  end if;

  -- Tier 2+: past companies
  if tier >= 2 then
    if exists (
      select 1
      from unnest(coalesce(v.past_companies, '{}'::text[])) as pc(name)
      where lower(trim(pc.name)) = target
    ) then
      return true;
    end if;
  end if;

  -- Tier 3: all graduates
  if tier >= 3 then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.can_view_referral(uuid, uuid) from public;
grant execute on function public.can_view_referral(uuid, uuid) to authenticated;

-- UI helper: reach stats for a request (poster-facing)
create or replace function public.referral_reach_stats(p_request_id uuid)
returns table (
  tier int,
  opens_to_all_at timestamptz,
  matching_graduate_count bigint,
  past_company_graduate_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.referral_requests%rowtype;
  t int;
  target text;
begin
  select * into r from public.referral_requests where id = p_request_id;
  if not found then
    return;
  end if;

  t := public.sync_referral_visibility(r.id);
  target := coalesce(r.target_company_normalized, lower(trim(r.company)));

  return query
  select
    t,
    case
      when t >= 3 then coalesce(r.opened_to_all_at, r.created_at + interval '5 days')
      else r.created_at + interval '5 days'
    end,
    (
      select count(*)::bigint
      from public.profiles p
      where p.status = 'graduate'
        and lower(trim(coalesce(p.company, ''))) = target
        and p.id <> r.student_id
    ),
    (
      select count(*)::bigint
      from public.profiles p
      where p.status = 'graduate'
        and p.id <> r.student_id
        and exists (
          select 1
          from unnest(coalesce(p.past_companies, '{}'::text[])) as pc(name)
          where lower(trim(pc.name)) = target
        )
    );
end;
$$;

revoke all on function public.referral_reach_stats(uuid) from public;
grant execute on function public.referral_reach_stats(uuid) to authenticated;

-- Company headcount for posting form expectations
create or replace function public.graduates_at_company(p_company text)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::bigint
  from public.profiles p
  where p.status = 'graduate'
    and lower(trim(coalesce(p.company, ''))) = lower(trim(p_company));
$$;

revoke all on function public.graduates_at_company(text) from public;
grant execute on function public.graduates_at_company(text) to authenticated;

-- Distinct company names for autocomplete
create or replace function public.list_known_companies()
returns table (company text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct trim(p.company) as company
  from public.profiles p
  where p.company is not null
    and trim(p.company) <> ''
  order by 1;
$$;

revoke all on function public.list_known_companies() from public;
grant execute on function public.list_known_companies() to authenticated;

-- =============================================================================
-- 4) Replace SELECT policy (drop permissive using(true))
-- =============================================================================

drop policy if exists "Authenticated users can view referral requests" on public.referral_requests;
drop policy if exists "View referral requests via can_view_referral" on public.referral_requests;

create policy "View referral requests via can_view_referral"
  on public.referral_requests
  for select
  to authenticated
  using (public.can_view_referral(id, auth.uid()));

-- Keep insert/update, tighten update for accept only when can_view
drop policy if exists "Users can update referral requests" on public.referral_requests;
create policy "Users can update referral requests"
  on public.referral_requests
  for update
  to authenticated
  using (
    auth.uid() = student_id
    or (
      status = 'open'
      and accepted_by is null
      and public.can_view_referral(id, auth.uid())
    )
  )
  with check (
    auth.uid() = student_id
    or auth.uid() = accepted_by
  );

-- =============================================================================
-- 5) Accept unlock (already exists) — extend unlock_reason for questions
-- =============================================================================

-- conversations.unlock_reason currently allows: manual_accept, referral, mentorship
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
      'referral_question'
    )
  );

-- Reaffirm accept → unlock (idempotent recreate)
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

-- =============================================================================
-- 6) referral_questions + unlock on ask
-- =============================================================================

create table if not exists public.referral_questions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.referral_requests(id) on delete cascade,
  asker_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) >= 1),
  created_at timestamptz not null default now()
);

create index if not exists referral_questions_request_idx
  on public.referral_questions (request_id, created_at desc);

create index if not exists referral_questions_asker_idx
  on public.referral_questions (asker_id, created_at desc);

alter table public.referral_questions enable row level security;

drop policy if exists "Poster and asker can read referral questions" on public.referral_questions;
create policy "Poster and asker can read referral questions"
  on public.referral_questions
  for select
  to authenticated
  using (
    asker_id = auth.uid()
    or exists (
      select 1
      from public.referral_requests rr
      where rr.id = request_id
        and rr.student_id = auth.uid()
    )
  );

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
      'referral_question'
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

-- =============================================================================
-- 7) Per-user dismissals ("Not a fit")
-- =============================================================================

create table if not exists public.referral_dismissals (
  request_id uuid not null references public.referral_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

alter table public.referral_dismissals enable row level security;

drop policy if exists "Users manage own referral dismissals" on public.referral_dismissals;
create policy "Users manage own referral dismissals"
  on public.referral_dismissals
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =============================================================================
-- 8) View impressions (Seen by X)
-- =============================================================================

create table if not exists public.referral_views (
  request_id uuid not null references public.referral_requests(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, viewer_id)
);

alter table public.referral_views enable row level security;

drop policy if exists "Users record own referral views" on public.referral_views;
create policy "Users record own referral views"
  on public.referral_views
  for insert
  to authenticated
  with check (
    viewer_id = auth.uid()
    and public.can_view_referral(request_id, auth.uid())
  );

drop policy if exists "Poster and viewer can read referral views" on public.referral_views;
create policy "Poster and viewer can read referral views"
  on public.referral_views
  for select
  to authenticated
  using (
    viewer_id = auth.uid()
    or exists (
      select 1
      from public.referral_requests rr
      where rr.id = request_id
        and rr.student_id = auth.uid()
    )
  );

-- =============================================================================
-- 9) Caps: max 3 open requests; one company per 30 days
-- =============================================================================

create or replace function public.enforce_referral_request_caps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  open_count int;
  recent_same_company int;
begin
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.status = 'open' and old.status is distinct from 'open') then
    select count(*) into open_count
    from public.referral_requests
    where student_id = new.student_id
      and status = 'open'
      and id is distinct from new.id;

    if open_count >= 3 then
      raise exception 'REFERRAL_OPEN_LIMIT: You can have at most 3 open referral requests at a time.';
    end if;
  end if;

  if tg_op = 'INSERT' then
    select count(*) into recent_same_company
    from public.referral_requests
    where student_id = new.student_id
      and lower(trim(company)) = lower(trim(new.company))
      and created_at >= now() - interval '30 days'
      and id is distinct from new.id;

    if recent_same_company > 0 then
      raise exception 'REFERRAL_COMPANY_LIMIT: You already requested this company in the last 30 days.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists referral_request_caps on public.referral_requests;
create trigger referral_request_caps
  before insert or update of status on public.referral_requests
  for each row
  execute function public.enforce_referral_request_caps();

-- =============================================================================
-- 10) Lightweight notifications
-- =============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications"
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications"
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Notify graduates at matching company when a new open request is posted
create or replace function public.notify_on_referral_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target text;
begin
  if new.status <> 'open' then
    return new;
  end if;

  target := coalesce(new.target_company_normalized, lower(trim(new.company)));

  insert into public.notifications (user_id, type, title, body, link, payload)
  select
    p.id,
    'referral_match',
    'New referral ask for ' || new.company,
    'Someone needs a referral for ' || new.role || ' at ' || new.company || '.',
    '/referrals',
    jsonb_build_object('request_id', new.id, 'company', new.company)
  from public.profiles p
  where p.status = 'graduate'
    and p.id <> new.student_id
    and lower(trim(coalesce(p.company, ''))) = target;

  return new;
end;
$$;

drop trigger if exists referral_notify_insert on public.referral_requests;
create trigger referral_notify_insert
  after insert on public.referral_requests
  for each row
  execute function public.notify_on_referral_insert();

-- Notify poster when someone asks a question
create or replace function public.notify_on_referral_question()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  poster uuid;
  company text;
begin
  select student_id, company into poster, company
  from public.referral_requests
  where id = new.request_id;

  if poster is not null then
    insert into public.notifications (user_id, type, title, body, link, payload)
    values (
      poster,
      'referral_question',
      'Someone asked about your referral request',
      'A graduate asked a question about your ' || coalesce(company, 'referral') || ' request.',
      '/messages?with=' || new.asker_id::text,
      jsonb_build_object('request_id', new.request_id, 'asker_id', new.asker_id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists referral_question_notify on public.referral_questions;
create trigger referral_question_notify
  after insert on public.referral_questions
  for each row
  execute function public.notify_on_referral_question();

-- Notify poster when accepted
create or replace function public.notify_on_referral_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted'
     and (tg_op = 'INSERT' or old.status is distinct from 'accepted')
     and new.accepted_by is not null then
    insert into public.notifications (user_id, type, title, body, link, payload)
    values (
      new.student_id,
      'referral_accepted',
      'Your referral request was accepted',
      'Someone accepted your request for ' || new.role || ' at ' || new.company || '.',
      '/messages?with=' || new.accepted_by::text,
      jsonb_build_object('request_id', new.id, 'accepted_by', new.accepted_by)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists referral_accepted_notify on public.referral_requests;
create trigger referral_accepted_notify
  after insert or update of status, accepted_by on public.referral_requests
  for each row
  execute function public.notify_on_referral_accepted();

-- Expiry-tomorrow notifications: call periodically (or from app) — no cron assumed
create or replace function public.notify_referral_expiring_tomorrow()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
begin
  insert into public.notifications (user_id, type, title, body, link, payload)
  select
    rr.student_id,
    'referral_expiring',
    'Your referral request expires tomorrow',
    'Your ask for ' || rr.role || ' at ' || rr.company || ' expires tomorrow.',
    '/referrals',
    jsonb_build_object('request_id', rr.id)
  from public.referral_requests rr
  where rr.status = 'open'
    and (
      rr.deadline = current_date + 1
      or (
        rr.deadline is null
        and (rr.created_at + interval '30 days')::date = current_date + 1
      )
    )
    and not exists (
      select 1
      from public.notifications n
      where n.user_id = rr.student_id
        and n.type = 'referral_expiring'
        and (n.payload->>'request_id') = rr.id::text
        and n.created_at > now() - interval '2 days'
    );

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.notify_referral_expiring_tomorrow() from public;
grant execute on function public.notify_referral_expiring_tomorrow() to authenticated;
