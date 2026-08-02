-- Cohortly: mentorship REQUEST-AND-MATCH model
-- Run this entire script in Supabase → SQL Editor.
-- Confirm success before any frontend work.

-- =============================================================================
-- 1) pg_trgm — text similarity scoring
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- Fallback if the project has no "extensions" schema (common on older projects)
do $$
begin
  create extension if not exists pg_trgm;
exception
  when others then
    -- Already created under extensions schema, or insufficient privilege
    null;
end $$;

-- =============================================================================
-- 2) mentorship_requests
-- =============================================================================

create table if not exists public.mentorship_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  tags text[] not null default '{}',
  category text
    check (
      category is null
      or category in (
        'Career',
        'Interviews',
        'Higher Studies',
        'Startup',
        'Skills',
        'Other'
      )
    ),
  target_company text,
  urgency text not null default 'flexible'
    check (urgency in ('urgent', 'this_week', 'flexible')),
  preferred_duration int not null default 30
    check (preferred_duration in (30, 60)),
  status text not null default 'open'
    check (status in ('open', 'matched', 'closed', 'expired')),
  expires_at timestamp with time zone not null default (now() + interval '14 days'),
  created_at timestamp with time zone not null default now(),
  check (char_length(trim(title)) >= 3),
  check (char_length(trim(description)) >= 20),
  check (cardinality(tags) >= 1)
);

create index if not exists mentorship_requests_student_idx
  on public.mentorship_requests (student_id, created_at desc);

create index if not exists mentorship_requests_status_idx
  on public.mentorship_requests (status)
  where status = 'open';

create index if not exists mentorship_requests_expires_idx
  on public.mentorship_requests (expires_at)
  where status = 'open';

create index if not exists mentorship_requests_tags_gin
  on public.mentorship_requests using gin (tags);

-- =============================================================================
-- 3) request_matches — one row per request → mentor routing
-- =============================================================================

create table if not exists public.request_matches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null
    references public.mentorship_requests(id) on delete cascade,
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  match_score numeric not null check (match_score >= 0),
  match_reasons text[] not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'referred', 'expired')),
  referred_to uuid references public.profiles(id),
  referred_by uuid references public.profiles(id),
  responded_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  unique (request_id, mentor_id)
);

create index if not exists request_matches_mentor_status_idx
  on public.request_matches (mentor_id, status, created_at desc);

create index if not exists request_matches_request_idx
  on public.request_matches (request_id, status);

create index if not exists request_matches_referred_to_idx
  on public.request_matches (referred_to)
  where referred_to is not null;

-- =============================================================================
-- 4) Extend mentor_availability
-- =============================================================================

alter table public.mentor_availability
  add column if not exists max_open_requests int not null default 3;

alter table public.mentor_availability
  add column if not exists topics text[] not null default '{}';

-- Capacity must be at least 1
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mentor_availability_max_open_requests_check'
      and conrelid = 'public.mentor_availability'::regclass
  ) then
    alter table public.mentor_availability
      add constraint mentor_availability_max_open_requests_check
      check (max_open_requests >= 1 and max_open_requests <= 20);
  end if;
end $$;

create index if not exists mentor_availability_topics_gin
  on public.mentor_availability using gin (topics);

-- =============================================================================
-- Matching helpers (pg_trgm + skills overlap)
-- =============================================================================

-- Normalize tags/skills for comparison
create or replace function public.normalize_tag(p_tag text)
returns text
language sql
immutable
as $$
  select lower(trim(both from coalesce(p_tag, '')));
$$;

-- Score one mentor against one request. Returns (score, reasons[]).
create or replace function public.score_mentor_for_request(
  p_request public.mentorship_requests,
  p_mentor_id uuid,
  p_mentor_skills text[],
  p_mentor_department text,
  p_mentor_company text,
  p_mentor_role text,
  p_mentor_bio text,
  p_topics text[],
  p_session_lengths int[]
)
returns table (score numeric, reasons text[])
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_score numeric := 0;
  v_reasons text[] := '{}';
  v_shared_skills int := 0;
  v_shared_topics int := 0;
  v_req_tags text[];
  v_skills text[];
  v_topics text[];
  v_text_sim real := 0;
  v_haystack text;
  v_needle text;
begin
  -- Never match a student to themselves
  if p_mentor_id = p_request.student_id then
    return query select 0::numeric, '{}'::text[];
    return;
  end if;

  -- Preferred duration must be offered
  if p_session_lengths is null
     or not (p_request.preferred_duration = any (p_session_lengths)) then
    return query select 0::numeric, '{}'::text[];
    return;
  end if;

  select array_agg(distinct public.normalize_tag(t))
    into v_req_tags
  from unnest(coalesce(p_request.tags, '{}')) as t
  where public.normalize_tag(t) <> '';

  select array_agg(distinct public.normalize_tag(t))
    into v_skills
  from unnest(coalesce(p_mentor_skills, '{}')) as t
  where public.normalize_tag(t) <> '';

  select array_agg(distinct public.normalize_tag(t))
    into v_topics
  from unnest(coalesce(p_topics, '{}')) as t
  where public.normalize_tag(t) <> '';

  v_req_tags := coalesce(v_req_tags, '{}');
  v_skills := coalesce(v_skills, '{}');
  v_topics := coalesce(v_topics, '{}');

  -- Shared profile skills ↔ request tags (strong signal)
  select count(*)::int into v_shared_skills
  from unnest(v_req_tags) r
  where r = any (v_skills);

  if v_shared_skills > 0 then
    v_score := v_score + (v_shared_skills * 25);
    v_reasons := array_append(
      v_reasons,
      v_shared_skills::text || ' shared skill'
        || case when v_shared_skills = 1 then '' else 's' end
    );
  end if;

  -- Mentor topics ↔ request tags
  select count(*)::int into v_shared_topics
  from unnest(v_req_tags) r
  where r = any (v_topics);

  if v_shared_topics > 0 then
    v_score := v_score + (v_shared_topics * 20);
    v_reasons := array_append(
      v_reasons,
      v_shared_topics::text || ' matching topic'
        || case when v_shared_topics = 1 then '' else 's' end
    );
  end if;

  -- Same department
  if p_mentor_department is not null
     and exists (
       select 1
       from public.profiles s
       where s.id = p_request.student_id
         and s.department is not null
         and public.normalize_tag(s.department)
           = public.normalize_tag(p_mentor_department)
     ) then
    v_score := v_score + 15;
    v_reasons := array_append(v_reasons, 'same department');
  end if;

  -- Target company match
  if p_request.target_company is not null
     and nullif(trim(p_request.target_company), '') is not null
     and p_mentor_company is not null
     and public.normalize_tag(p_mentor_company)
       = public.normalize_tag(p_request.target_company) then
    v_score := v_score + 30;
    v_reasons := array_append(v_reasons, 'works at target company');
  end if;

  -- Text similarity (title + description + tags vs mentor profile text)
  v_needle := lower(
    coalesce(p_request.title, '') || ' ' ||
    coalesce(p_request.description, '') || ' ' ||
    array_to_string(v_req_tags, ' ')
  );
  v_haystack := lower(
    coalesce(p_mentor_bio, '') || ' ' ||
    coalesce(p_mentor_role, '') || ' ' ||
    coalesce(p_mentor_company, '') || ' ' ||
    array_to_string(v_skills, ' ') || ' ' ||
    array_to_string(v_topics, ' ')
  );

  if length(trim(v_haystack)) > 0 and length(trim(v_needle)) > 0 then
    v_text_sim := similarity(v_needle, v_haystack);
    if v_text_sim >= 0.12 then
      v_score := v_score + round((v_text_sim * 40)::numeric, 2);
      v_reasons := array_append(
        v_reasons,
        'profile text similarity'
      );
    end if;
  end if;

  -- Mild urgency boost does not change routing eligibility; scoring only
  if p_request.urgency = 'urgent' then
    v_score := v_score + 2;
  elsif p_request.urgency = 'this_week' then
    v_score := v_score + 1;
  end if;

  return query select v_score, v_reasons;
end;
$$;

-- Route an open request to the best-matching available mentors (capacity-aware).
-- Strong-match floor: score >= 25 (at least one shared skill, or company + something).
create or replace function public.route_mentorship_request(p_request_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.mentorship_requests%rowtype;
  inserted int := 0;
  r record;
  v_open int;
  v_max int;
  -- Cap how many mentors see one request
  c_top_n constant int := 8;
  c_min_score constant numeric := 25;
begin
  select * into req
  from public.mentorship_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND: Mentorship request not found.';
  end if;

  if req.status <> 'open' then
    return 0;
  end if;

  if req.expires_at <= now() then
    update public.mentorship_requests
    set status = 'expired'
    where id = req.id;
    return 0;
  end if;

  for r in
    with candidates as (
      select
        ma.mentor_id,
        ma.max_open_requests,
        scored.score,
        scored.reasons
      from public.mentor_availability ma
      join public.profiles p on p.id = ma.mentor_id
      cross join lateral public.score_mentor_for_request(
        req,
        ma.mentor_id,
        p.skills,
        p.department,
        p.company,
        coalesce(p.role_title, p.current_job),
        coalesce(ma.bio_note, p.bio),
        ma.topics,
        ma.session_lengths
      ) as scored(score, reasons)
      where ma.is_available = true
        and scored.score >= c_min_score
        and not exists (
          select 1
          from public.request_matches rm
          where rm.request_id = req.id
            and rm.mentor_id = ma.mentor_id
        )
    )
    select *
    from candidates
    order by score desc
    limit c_top_n
  loop
    -- Capacity: pending matches already on this mentor's plate
    select count(*)::int into v_open
    from public.request_matches rm
    where rm.mentor_id = r.mentor_id
      and rm.status = 'pending';

    v_max := greatest(coalesce(r.max_open_requests, 3), 1);

    if v_open >= v_max then
      continue;
    end if;

    insert into public.request_matches (
      request_id,
      mentor_id,
      match_score,
      match_reasons,
      status
    )
    values (
      req.id,
      r.mentor_id,
      r.score,
      coalesce(r.reasons, '{}'),
      'pending'
    )
    on conflict (request_id, mentor_id) do nothing;

    if found then
      inserted := inserted + 1;
    end if;
  end loop;

  return inserted;
end;
$$;

-- Auto-route whenever a student creates a request
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

-- When a mentor accepts: mark request matched, expire other pending matches,
-- and unlock messaging between student and mentor.
create or replace function public.request_matches_on_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
begin
  if new.status = 'accepted'
     and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    new.responded_at := coalesce(new.responded_at, now());

    update public.mentorship_requests
    set status = 'matched'
    where id = new.request_id
      and status = 'open';

    update public.request_matches
    set status = 'expired',
        responded_at = coalesce(responded_at, now())
    where request_id = new.request_id
      and id <> new.id
      and status = 'pending';

    select student_id into v_student
    from public.mentorship_requests
    where id = new.request_id;

    if v_student is not null
       and to_regprocedure('public.upsert_accepted_conversation(uuid,uuid,text)') is not null then
      perform public.upsert_accepted_conversation(
        v_student,
        new.mentor_id,
        'mentorship'
      );
    end if;
  elsif new.status in ('declined', 'referred', 'expired')
        and old.status is distinct from new.status then
    new.responded_at := coalesce(new.responded_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists request_matches_on_accept on public.request_matches;
create trigger request_matches_on_accept
  before update of status on public.request_matches
  for each row
  execute function public.request_matches_on_accept();

-- Mentor refers a request to another graduate (creates a new pending match)
create or replace function public.refer_mentorship_match(
  p_match_id uuid,
  p_referred_to uuid
)
returns public.request_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  src public.request_matches%rowtype;
  req public.mentorship_requests%rowtype;
  new_match public.request_matches%rowtype;
begin
  select * into src
  from public.request_matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'MATCH_NOT_FOUND: Match not found.';
  end if;

  if auth.uid() is distinct from src.mentor_id then
    raise exception 'NOT_ALLOWED: Only the matched mentor can refer this request.';
  end if;

  if src.status <> 'pending' then
    raise exception 'MATCH_NOT_PENDING: Only pending matches can be referred.';
  end if;

  if p_referred_to is null or p_referred_to = src.mentor_id then
    raise exception 'INVALID_REFERRAL: Pick a different mentor to refer to.';
  end if;

  select * into req from public.mentorship_requests where id = src.request_id;

  if req.student_id = p_referred_to then
    raise exception 'INVALID_REFERRAL: Cannot refer a request to the student.';
  end if;

  update public.request_matches
  set
    status = 'referred',
    referred_to = p_referred_to,
    responded_at = now()
  where id = src.id;

  -- Create / refresh a pending match for the referred mentor
  insert into public.request_matches (
    request_id,
    mentor_id,
    match_score,
    match_reasons,
    status,
    referred_by
  )
  values (
    src.request_id,
    p_referred_to,
    greatest(src.match_score, 25),
    array['referred by a mentor'],
    'pending',
    src.mentor_id
  )
  on conflict (request_id, mentor_id) do update
    set
      status = 'pending',
      referred_by = excluded.referred_by,
      match_reasons = array[
        'referred by a mentor'
      ],
      responded_at = null
  returning * into new_match;

  return new_match;
end;
$$;

revoke all on function public.refer_mentorship_match(uuid, uuid) from public;
grant execute on function public.refer_mentorship_match(uuid, uuid) to authenticated;

revoke all on function public.route_mentorship_request(uuid) from public;
grant execute on function public.route_mentorship_request(uuid) to authenticated;

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.mentorship_requests enable row level security;
alter table public.request_matches enable row level security;

-- Helpers: SECURITY DEFINER so policies don't recurse across tables
create or replace function public.is_matched_mentor_of_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.request_matches rm
    where rm.request_id = p_request_id
      and rm.mentor_id = auth.uid()
  );
$$;

create or replace function public.owns_mentorship_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mentorship_requests mr
    where mr.id = p_request_id
      and mr.student_id = auth.uid()
  );
$$;

revoke all on function public.is_matched_mentor_of_request(uuid) from public;
revoke all on function public.owns_mentorship_request(uuid) from public;
grant execute on function public.is_matched_mentor_of_request(uuid) to authenticated;
grant execute on function public.owns_mentorship_request(uuid) to authenticated;

-- Students see their own requests; mentors see requests they were matched to
drop policy if exists "Students manage own mentorship requests" on public.mentorship_requests;
drop policy if exists "Students can view own mentorship requests" on public.mentorship_requests;
drop policy if exists "Students can create mentorship requests" on public.mentorship_requests;
drop policy if exists "Students can update own mentorship requests" on public.mentorship_requests;
drop policy if exists "Matched mentors can view mentorship requests" on public.mentorship_requests;

create policy "Students can view own mentorship requests"
  on public.mentorship_requests
  for select
  to authenticated
  using (auth.uid() = student_id);

create policy "Matched mentors can view mentorship requests"
  on public.mentorship_requests
  for select
  to authenticated
  using (public.is_matched_mentor_of_request(id));

create policy "Students can create mentorship requests"
  on public.mentorship_requests
  for insert
  to authenticated
  with check (auth.uid() = student_id);

create policy "Students can update own mentorship requests"
  on public.mentorship_requests
  for update
  to authenticated
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

-- request_matches: mentors see their own; students see matches on their requests
drop policy if exists "Mentors can view own matches" on public.request_matches;
drop policy if exists "Students can view matches on own requests" on public.request_matches;
drop policy if exists "Mentors can update own matches" on public.request_matches;
drop policy if exists "System can insert matches" on public.request_matches;

create policy "Mentors can view own matches"
  on public.request_matches
  for select
  to authenticated
  using (auth.uid() = mentor_id);

create policy "Students can view matches on own requests"
  on public.request_matches
  for select
  to authenticated
  using (public.owns_mentorship_request(request_id));

-- Inserts are done by SECURITY DEFINER routing / refer RPC.
-- No direct client inserts for authenticated.

create policy "Mentors can update own matches"
  on public.request_matches
  for update
  to authenticated
  using (auth.uid() = mentor_id)
  with check (auth.uid() = mentor_id);

-- Realtime for mentor inbox updates
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mentorship_requests'
  ) then
    alter publication supabase_realtime add table public.mentorship_requests;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'request_matches'
  ) then
    alter publication supabase_realtime add table public.request_matches;
  end if;
end $$;

-- Done.
-- After running: reply "SQL ran successfully" to proceed with frontend.
