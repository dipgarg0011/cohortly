-- Cohortly: anonymous asks + text answers + quality/answers counters
-- Additive migration (run AFTER mentorship request-match + RLS recursion fix).
-- Run entire script in Supabase → SQL Editor. Confirm before frontend work.

-- Depends on owns_mentorship_request from the RLS recursion fix — recreate safely
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

revoke all on function public.owns_mentorship_request(uuid) from public;
grant execute on function public.owns_mentorship_request(uuid) to authenticated;

-- =============================================================================
-- 1) mentorship_requests: anonymity + quality
-- =============================================================================

alter table public.mentorship_requests
  add column if not exists is_anonymous boolean not null default false;

alter table public.mentorship_requests
  add column if not exists revealed_at timestamp with time zone;

alter table public.mentorship_requests
  add column if not exists quality_score int not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mentorship_requests_quality_score_check'
      and conrelid = 'public.mentorship_requests'::regclass
  ) then
    alter table public.mentorship_requests
      add constraint mentorship_requests_quality_score_check
      check (quality_score >= 0 and quality_score <= 3);
  end if;
end $$;

-- =============================================================================
-- 2) mentor_availability: answers_given
-- =============================================================================

alter table public.mentor_availability
  add column if not exists answers_given int not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mentor_availability_answers_given_check'
      and conrelid = 'public.mentor_availability'::regclass
  ) then
    alter table public.mentor_availability
      add constraint mentor_availability_answers_given_check
      check (answers_given >= 0);
  end if;
end $$;

-- =============================================================================
-- 3) request_matches: allow status 'answered'
-- =============================================================================

alter table public.request_matches
  drop constraint if exists request_matches_status_check;

alter table public.request_matches
  add constraint request_matches_status_check
  check (status in ('pending', 'accepted', 'declined', 'referred', 'expired', 'answered'));

-- =============================================================================
-- 4) request_answers
-- =============================================================================

create table if not exists public.request_answers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null
    references public.mentorship_requests(id) on delete cascade,
  match_id uuid not null
    references public.request_matches(id) on delete cascade,
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  is_public boolean not null default false,
  helpful boolean,
  created_at timestamp with time zone not null default now(),
  check (char_length(trim(content)) >= 10)
);

create index if not exists request_answers_request_idx
  on public.request_answers (request_id, created_at desc);

create index if not exists request_answers_mentor_idx
  on public.request_answers (mentor_id, created_at desc);

create index if not exists request_answers_match_idx
  on public.request_answers (match_id);

-- One answer per match (mentor can revise via update of content if we allow;
-- for now one row per match_id)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'request_answers_match_id_key'
      and conrelid = 'public.request_answers'::regclass
  ) then
    alter table public.request_answers
      add constraint request_answers_match_id_key unique (match_id);
  end if;
end $$;

-- =============================================================================
-- Quality score heuristics (draft-help checklist → 0..3)
-- =============================================================================

create or replace function public.compute_request_quality_score(p_description text)
returns int
language plpgsql
immutable
as $$
declare
  d text := lower(coalesce(p_description, ''));
  score int := 0;
  has_goal boolean;
  has_tried boolean;
  has_specific boolean;
begin
  -- Working towards a goal / outcome
  has_goal :=
    d ~ '(want to|looking to|aim(ing)?|goal|preparing for|working towards|hoping to|trying to (get|land|break|switch)|career|interview|admit|offer|internship|job)'
    or (char_length(trim(d)) >= 80);

  -- Already tried something
  has_tried :=
    d ~ '(tried|already|attempted|so far|looked into|researched|went through|practi[cs]ed|read|watched|applied|failed|didn''t work|have been)';

  -- Asked something specific
  has_specific :=
    position('?' in d) > 0
    or d ~ '(how (do|can|should|would)|what (should|would|is the best)|which|when should|could you|can you (help|review|walk)|specifically|concrete|example)'
    or (char_length(trim(d)) >= 160);

  if has_goal then score := score + 1; end if;
  if has_tried then score := score + 1; end if;
  if has_specific then score := score + 1; end if;

  return score;
end;
$$;

create or replace function public.mentorship_requests_set_quality_score()
returns trigger
language plpgsql
as $$
begin
  new.quality_score := public.compute_request_quality_score(new.description);
  return new;
end;
$$;

drop trigger if exists mentorship_requests_set_quality_score on public.mentorship_requests;
create trigger mentorship_requests_set_quality_score
  before insert or update of description on public.mentorship_requests
  for each row
  execute function public.mentorship_requests_set_quality_score();

-- Backfill existing rows
update public.mentorship_requests
set quality_score = public.compute_request_quality_score(description)
where true;

-- =============================================================================
-- Identity reveal helper (per-mentor)
-- =============================================================================

create or replace function public.mentor_may_see_student_identity(
  p_request_id uuid,
  p_mentor_id uuid
)
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
      and (
        mr.is_anonymous = false
        or exists (
          select 1
          from public.request_matches rm
          where rm.request_id = mr.id
            and rm.mentor_id = p_mentor_id
            and rm.status in ('accepted', 'answered')
        )
      )
  );
$$;

revoke all on function public.mentor_may_see_student_identity(uuid, uuid) from public;
grant execute on function public.mentor_may_see_student_identity(uuid, uuid) to authenticated;

-- =============================================================================
-- Mentors MUST NOT read mentorship_requests directly (would expose student_id).
-- They read via list_my_matched_asks() which masks identity until reveal.
-- =============================================================================

drop policy if exists "Matched mentors can view mentorship requests" on public.mentorship_requests;

-- Optional: keep helper for other policies, but do not grant table SELECT to mentors.
-- Students retain "Students can view own mentorship requests".

create or replace function public.list_my_matched_asks()
returns table (
  match_id uuid,
  match_status text,
  match_score numeric,
  match_reasons text[],
  referred_by uuid,
  match_created_at timestamptz,
  match_responded_at timestamptz,
  request_id uuid,
  title text,
  description text,
  tags text[],
  category text,
  target_company text,
  urgency text,
  preferred_duration int,
  request_status text,
  expires_at timestamptz,
  request_created_at timestamptz,
  is_anonymous boolean,
  revealed_at timestamptz,
  quality_score int,
  -- Identity: null while anonymous & not revealed to THIS mentor
  student_id uuid,
  student_full_name text,
  student_avatar_url text,
  -- Always visible
  student_department text,
  student_batch_year int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  return query
  select
    rm.id as match_id,
    rm.status as match_status,
    rm.match_score,
    rm.match_reasons,
    rm.referred_by,
    rm.created_at as match_created_at,
    rm.responded_at as match_responded_at,
    mr.id as request_id,
    mr.title,
    mr.description,
    mr.tags,
    mr.category,
    mr.target_company,
    mr.urgency,
    mr.preferred_duration,
    mr.status as request_status,
    mr.expires_at,
    mr.created_at as request_created_at,
    mr.is_anonymous,
    mr.revealed_at,
    mr.quality_score,
    case
      when public.mentor_may_see_student_identity(mr.id, uid)
        then mr.student_id
      else null
    end as student_id,
    case
      when public.mentor_may_see_student_identity(mr.id, uid)
        then p.full_name
      else null
    end as student_full_name,
    case
      when public.mentor_may_see_student_identity(mr.id, uid)
        then p.avatar_url
      else null
    end as student_avatar_url,
    p.department as student_department,
    p.batch_year as student_batch_year
  from public.request_matches rm
  join public.mentorship_requests mr on mr.id = rm.request_id
  join public.profiles p on p.id = mr.student_id
  where rm.mentor_id = uid
  order by
    case when rm.status = 'pending' then 0 else 1 end,
    rm.created_at desc;
end;
$$;

revoke all on function public.list_my_matched_asks() from public;
grant execute on function public.list_my_matched_asks() to authenticated;

-- Single-match detail (same masking rules)
create or replace function public.get_matched_ask(p_match_id uuid)
returns table (
  match_id uuid,
  match_status text,
  match_score numeric,
  match_reasons text[],
  referred_by uuid,
  match_created_at timestamptz,
  match_responded_at timestamptz,
  request_id uuid,
  title text,
  description text,
  tags text[],
  category text,
  target_company text,
  urgency text,
  preferred_duration int,
  request_status text,
  expires_at timestamptz,
  request_created_at timestamptz,
  is_anonymous boolean,
  revealed_at timestamptz,
  quality_score int,
  student_id uuid,
  student_full_name text,
  student_avatar_url text,
  student_department text,
  student_batch_year int
)
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.list_my_matched_asks() t
  where t.match_id = p_match_id;
$$;

revoke all on function public.get_matched_ask(uuid) from public;
grant execute on function public.get_matched_ask(uuid) to authenticated;

-- =============================================================================
-- Accept trigger: also set revealed_at for anonymous asks (per accepting mentor
-- identity is gated by match status; revealed_at is audit timestamp).
-- =============================================================================

create or replace function public.request_matches_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_anonymous boolean;
begin
  if new.status = 'accepted'
     and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    new.responded_at := coalesce(new.responded_at, now());

    update public.mentorship_requests
    set
      status = 'matched',
      revealed_at = coalesce(revealed_at, now())
    where id = new.request_id
      and status in ('open', 'matched');

    -- Only expire other pendings on full accept (not on text answer)
    update public.request_matches
    set status = 'expired',
        responded_at = coalesce(responded_at, now())
    where request_id = new.request_id
      and id <> new.id
      and status = 'pending';

    select student_id, is_anonymous
      into v_student, v_anonymous
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

  elsif new.status = 'answered'
        and (tg_op = 'INSERT' or old.status is distinct from 'answered') then
    new.responded_at := coalesce(new.responded_at, now());

    update public.mentorship_requests
    set revealed_at = coalesce(revealed_at, now())
    where id = new.request_id;

    -- Do not force request to 'matched' solely from a text answer if still open;
    -- leave status as-is unless already matched. Optionally mark matched:
    update public.mentorship_requests
    set status = 'matched'
    where id = new.request_id
      and status = 'open';

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
drop trigger if exists request_matches_on_status_change on public.request_matches;
create trigger request_matches_on_status_change
  before update of status on public.request_matches
  for each row
  execute function public.request_matches_on_status_change();

-- =============================================================================
-- Answer insert trigger: status → answered, reveal, unlock chat, answers_given++
-- =============================================================================

create or replace function public.request_answers_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
begin
  -- Flip match to answered (fires status-change trigger for reveal + unlock)
  update public.request_matches
  set status = 'answered'
  where id = new.match_id
    and mentor_id = new.mentor_id
    and status in ('pending', 'accepted', 'answered');

  -- Ensure revealed_at even if status was already answered
  update public.mentorship_requests
  set revealed_at = coalesce(revealed_at, now())
  where id = new.request_id;

  -- Increment mentor answer counter
  update public.mentor_availability
  set answers_given = answers_given + 1
  where mentor_id = new.mentor_id;

  -- If availability row missing, still unlock chat
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

  return new;
end;
$$;

drop trigger if exists request_answers_after_insert on public.request_answers;
create trigger request_answers_after_insert
  after insert on public.request_answers
  for each row
  execute function public.request_answers_after_insert();

-- Validate answer insert: mentor must own a pending/accepted match for this request
create or replace function public.request_answers_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.request_matches%rowtype;
begin
  select * into m
  from public.request_matches
  where id = new.match_id
  for update;

  if not found then
    raise exception 'MATCH_NOT_FOUND: Match not found.';
  end if;

  if m.mentor_id is distinct from new.mentor_id then
    raise exception 'NOT_ALLOWED: mentor_id must match the match row.';
  end if;

  if m.request_id is distinct from new.request_id then
    raise exception 'NOT_ALLOWED: request_id must match the match row.';
  end if;

  if m.status not in ('pending', 'accepted', 'answered') then
    raise exception 'MATCH_NOT_OPEN: You can only answer an open match.';
  end if;

  if auth.uid() is distinct from new.mentor_id then
    raise exception 'NOT_ALLOWED: Only the matched mentor can answer.';
  end if;

  return new;
end;
$$;

drop trigger if exists request_answers_before_insert on public.request_answers;
create trigger request_answers_before_insert
  before insert on public.request_answers
  for each row
  execute function public.request_answers_before_insert();

-- =============================================================================
-- RLS: request_answers
-- =============================================================================

alter table public.request_answers enable row level security;

drop policy if exists "Student or mentor can read answers" on public.request_answers;
drop policy if exists "Matched mentor can insert answers" on public.request_answers;
drop policy if exists "Student can update helpful" on public.request_answers;
drop policy if exists "Mentor can update is_public" on public.request_answers;

create policy "Student or mentor can read answers"
  on public.request_answers
  for select
  to authenticated
  using (
    auth.uid() = mentor_id
    or public.owns_mentorship_request(request_id)
  );

create policy "Matched mentor can insert answers"
  on public.request_answers
  for insert
  to authenticated
  with check (
    auth.uid() = mentor_id
    and exists (
      select 1
      from public.request_matches rm
      where rm.id = match_id
        and rm.mentor_id = auth.uid()
        and rm.request_id = request_id
        and rm.status in ('pending', 'accepted', 'answered')
    )
  );

-- Students may only change "helpful"; mentors only "is_public" / content.
-- Enforce via two UPDATE policies + trigger that rejects illegal column changes.

create or replace function public.request_answers_guard_update()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() = old.mentor_id then
    -- Mentor: may change content / is_public only
    if new.helpful is distinct from old.helpful then
      raise exception 'NOT_ALLOWED: Only the student can set helpful.';
    end if;
    if new.request_id is distinct from old.request_id
       or new.match_id is distinct from old.match_id
       or new.mentor_id is distinct from old.mentor_id then
      raise exception 'NOT_ALLOWED: Cannot reassign an answer.';
    end if;
    return new;
  end if;

  if public.owns_mentorship_request(old.request_id) then
    -- Student: may change helpful only
    if new.content is distinct from old.content
       or new.is_public is distinct from old.is_public
       or new.request_id is distinct from old.request_id
       or new.match_id is distinct from old.match_id
       or new.mentor_id is distinct from old.mentor_id then
      raise exception 'NOT_ALLOWED: Students may only update helpful.';
    end if;
    return new;
  end if;

  raise exception 'NOT_ALLOWED: You cannot update this answer.';
end;
$$;

drop trigger if exists request_answers_guard_update on public.request_answers;
create trigger request_answers_guard_update
  before update on public.request_answers
  for each row
  execute function public.request_answers_guard_update();

create policy "Participants can update answers"
  on public.request_answers
  for update
  to authenticated
  using (
    auth.uid() = mentor_id
    or public.owns_mentorship_request(request_id)
  )
  with check (
    auth.uid() = mentor_id
    or public.owns_mentorship_request(request_id)
  );

-- Realtime
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'request_answers'
  ) then
    alter publication supabase_realtime add table public.request_answers;
  end if;
end $$;

-- Done.
-- After running: reply "SQL ran successfully" for frontend (draft help, anonymous
-- toggle, answer UI, etc.).
