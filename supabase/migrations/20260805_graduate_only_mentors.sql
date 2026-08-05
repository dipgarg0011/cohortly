-- Cohortly: graduate-only mentors (reverses "anyone can mentor")
-- Run in Supabase → SQL Editor (or via migration runner).
--
-- RULE: Only profiles.status = 'graduate' may be mentors.
-- Graduates get an auto mentor_availability row (eligible by default) but
-- must confirm once (onboarding_state) before matching; is_available starts false.
--
-- Reverts mentor-open parts of:
--   20260804_opportunities_open_post_and_mentorship_seniority.sql
--   (RLS that let any authenticated user INSERT/UPDATE mentor_availability;
--    matching that treated students as mentors with a graduate score boost only)
--
-- Idempotent where practical. SECURITY DEFINER triggers use locked search_path.
-- Does NOT change opportunity posting (open posting stays).

-- =============================================================================
-- 1) Schema: onboarding_state + is_paused; safer defaults
-- =============================================================================

alter table public.mentor_availability
  add column if not exists onboarding_state text not null default 'not_asked';

alter table public.mentor_availability
  add column if not exists is_paused boolean not null default false;

-- New rows start unavailable until the graduate confirms and opts in.
alter table public.mentor_availability
  alter column is_available set default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mentor_availability_onboarding_state_check'
      and conrelid = 'public.mentor_availability'::regclass
  ) then
    alter table public.mentor_availability
      add constraint mentor_availability_onboarding_state_check
      check (onboarding_state in ('not_asked', 'confirmed', 'declined'));
  end if;
end $$;

comment on column public.mentor_availability.onboarding_state is
  'Graduate mentor prompt: not_asked (default auto-row) | confirmed | declined. Matching requires confirmed.';

comment on column public.mentor_availability.is_paused is
  'When true, mentor is temporarily excluded from matching even if is_available.';

-- Matching index: available + confirmed + not paused
create index if not exists mentor_availability_match_eligible_idx
  on public.mentor_availability (mentor_id)
  where is_available = true
    and is_paused = false
    and onboarding_state = 'confirmed';

-- =============================================================================
-- 2) Backfill: rows for all existing graduates; disarm non-graduates
-- =============================================================================

insert into public.mentor_availability (
  mentor_id,
  is_available,
  is_paused,
  onboarding_state
)
select
  p.id,
  false,
  false,
  'not_asked'
from public.profiles p
where p.status = 'graduate'
on conflict (mentor_id) do nothing;

-- New auto-rows stay not_asked + unavailable (must confirm once).
-- Graduates who were already opted-in (is_available = true) under the open
-- mentor era: treat as confirmed so they are not silently dropped from matching.
update public.mentor_availability ma
set onboarding_state = 'confirmed'
from public.profiles p
where p.id = ma.mentor_id
  and p.status = 'graduate'
  and ma.is_available = true
  and ma.onboarding_state = 'not_asked';

-- Students (and any non-graduate) must not be matchable.
update public.mentor_availability ma
set is_available = false
from public.profiles p
where p.id = ma.mentor_id
  and coalesce(p.status, 'student') is distinct from 'graduate'
  and ma.is_available = true;

-- =============================================================================
-- 3) Eligibility helper (used by matching + watch notify)
-- =============================================================================

create or replace function public.mentor_is_match_eligible(
  p_status text,
  p_is_available boolean,
  p_is_paused boolean,
  p_onboarding_state text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    coalesce(p_is_available, false) = true
    and coalesce(p_is_paused, false) = false
    and p_status = 'graduate'
    and p_onboarding_state = 'confirmed';
$$;

comment on function public.mentor_is_match_eligible(text, boolean, boolean, text) is
  'True when mentor may receive new mentorship matches.';

-- =============================================================================
-- 4) Enforce: only graduates can be available; available requires confirmed
-- =============================================================================

create or replace function public.enforce_mentor_availability_graduate_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select p.status into v_status
  from public.profiles p
  where p.id = new.mentor_id;

  if v_status is distinct from 'graduate' then
    -- Defensive: students cannot stay available (and should not own rows ideally).
    new.is_available := false;
    -- Allow the row write (e.g. legacy) but never matchable.
    return new;
  end if;

  if new.onboarding_state is null or new.onboarding_state = '' then
    new.onboarding_state := 'not_asked';
  end if;

  if new.onboarding_state not in ('not_asked', 'confirmed', 'declined') then
    raise exception 'MENTOR_ONBOARDING_STATE_INVALID';
  end if;

  -- is_available = true requires confirmed onboarding.
  if new.is_available = true and new.onboarding_state is distinct from 'confirmed' then
    raise exception 'MENTOR_AVAILABLE_REQUIRES_CONFIRMED';
  end if;

  if new.is_paused is null then
    new.is_paused := false;
  end if;

  return new;
end;
$$;

drop trigger if exists mentor_availability_enforce_graduate_only
  on public.mentor_availability;
create trigger mentor_availability_enforce_graduate_only
  before insert or update on public.mentor_availability
  for each row
  execute function public.enforce_mentor_availability_graduate_only();

-- =============================================================================
-- 5) Profile status triggers: auto-create on graduate; disarm on student
-- =============================================================================

create or replace function public.profiles_mentor_availability_on_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Becoming (or already being, on insert) graduate → ensure eligibility row.
  if new.status = 'graduate'
     and (tg_op = 'INSERT' or old.status is distinct from 'graduate') then
    insert into public.mentor_availability (
      mentor_id,
      is_available,
      is_paused,
      onboarding_state
    )
    values (
      new.id,
      false,
      false,
      'not_asked'
    )
    on conflict (mentor_id) do nothing;
  end if;

  -- Leaving graduate → force unavailable; keep onboarding_state + is_paused as-is.
  if tg_op = 'UPDATE'
     and old.status = 'graduate'
     and new.status is distinct from 'graduate' then
    update public.mentor_availability
    set is_available = false
    where mentor_id = new.id
      and is_available = true;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_mentor_availability_on_status on public.profiles;
create trigger profiles_mentor_availability_on_status
  after insert or update of status on public.profiles
  for each row
  execute function public.profiles_mentor_availability_on_status();

-- =============================================================================
-- 6) RLS: only graduates manage own mentor_availability
--     (reverts 20260804 "any authenticated user" mentor policies)
-- =============================================================================

drop policy if exists "Mentors manage own availability" on public.mentor_availability;
drop policy if exists "Mentors update own availability" on public.mentor_availability;
drop policy if exists "Mentors delete own availability" on public.mentor_availability;
drop policy if exists "Graduates manage own mentor availability" on public.mentor_availability;
drop policy if exists "Graduates update own mentor availability" on public.mentor_availability;
drop policy if exists "Graduates delete own mentor availability" on public.mentor_availability;

-- INSERT: own row + must be graduate.
-- is_available=true additionally requires confirmed (enforced by trigger too).
create policy "Graduates manage own mentor availability"
  on public.mentor_availability
  for insert
  to authenticated
  with check (
    auth.uid() = mentor_id
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'graduate'
    )
    and (
      is_available = false
      or onboarding_state = 'confirmed'
    )
  );

-- UPDATE: own row + must remain a graduate.
-- Can set onboarding_state to confirmed/declined; available only when confirmed.
create policy "Graduates update own mentor availability"
  on public.mentor_availability
  for update
  to authenticated
  using (
    auth.uid() = mentor_id
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'graduate'
    )
  )
  with check (
    auth.uid() = mentor_id
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'graduate'
    )
    and (
      is_available = false
      or onboarding_state = 'confirmed'
    )
  );

-- DELETE: graduates only (students cannot remove/create).
create policy "Graduates delete own mentor availability"
  on public.mentor_availability
  for delete
  to authenticated
  using (
    auth.uid() = mentor_id
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'graduate'
    )
  );

-- SELECT policy unchanged: authenticated can view (matching RPCs also filter).

-- =============================================================================
-- 7) Matching: score_mentor_for_request — hard-exclude non-graduates
-- =============================================================================

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
  v_mentor_batch int;
  v_mentor_status text;
  v_student_batch int;
  v_years_senior int;
begin
  if p_mentor_id = p_request.student_id then
    return query select 0::numeric, '{}'::text[];
    return;
  end if;

  if p_session_lengths is null
     or not (p_request.preferred_duration = any (p_session_lengths)) then
    return query select 0::numeric, '{}'::text[];
    return;
  end if;

  select p.batch_year, p.status
    into v_mentor_batch, v_mentor_status
  from public.profiles p
  where p.id = p_mentor_id;

  -- Graduate-only mentors (reverses student-as-mentor scoring).
  if v_mentor_status is distinct from 'graduate' then
    return query select 0::numeric, '{}'::text[];
    return;
  end if;

  select s.batch_year
    into v_student_batch
  from public.profiles s
  where s.id = p_request.student_id;

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

  if p_request.target_company is not null
     and nullif(trim(p_request.target_company), '') is not null
     and p_mentor_company is not null
     and public.normalize_tag(p_mentor_company)
       = public.normalize_tag(p_request.target_company) then
    v_score := v_score + 30;
    v_reasons := array_append(v_reasons, 'works at target company');
  end if;

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
      v_reasons := array_append(v_reasons, 'profile text similarity');
    end if;
  end if;

  if p_request.urgency = 'urgent' then
    v_score := v_score + 2;
  elsif p_request.urgency = 'this_week' then
    v_score := v_score + 1;
  end if;

  -- All matchable mentors are graduates; keep a small graduate signal for reasons.
  v_score := v_score + 25;
  v_reasons := array_append(v_reasons, 'graduate mentor');

  -- Earlier batch_year = more senior → higher score.
  if v_mentor_batch is not null and v_student_batch is not null
     and v_mentor_batch < v_student_batch then
    v_years_senior := least(v_student_batch - v_mentor_batch, 8);
    v_score := v_score + (v_years_senior * 5);
    v_reasons := array_append(
      v_reasons,
      v_years_senior::text || ' year'
        || case when v_years_senior = 1 then '' else 's' end
        || ' more senior'
    );
  end if;

  return query select v_score, v_reasons;
end;
$$;

-- =============================================================================
-- 8) Matching: mentorship_add_matches_for_stage — graduate + confirmed + not paused
-- =============================================================================

create or replace function public.mentorship_add_matches_for_stage(
  p_request public.mentorship_requests,
  p_stage int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted int := 0;
  r record;
  v_open int;
  v_max int;
  c_top_n constant int := 12;
  v_student_dept text;
  v_student_batch int;
begin
  select nullif(trim(department), ''), batch_year
    into v_student_dept, v_student_batch
  from public.profiles
  where id = p_request.student_id;

  for r in
    with scored as (
      select
        ma.mentor_id,
        ma.max_open_requests,
        p.department as mentor_dept,
        p.batch_year as mentor_batch,
        scored.score,
        scored.reasons
      from public.mentor_availability ma
      join public.profiles p on p.id = ma.mentor_id
      cross join lateral public.score_mentor_for_request(
        p_request,
        ma.mentor_id,
        p.skills,
        p.department,
        p.company,
        coalesce(p.role_title, p.current_job),
        coalesce(ma.bio_note, p.bio),
        ma.topics,
        ma.session_lengths
      ) as scored(score, reasons)
      where public.mentor_is_match_eligible(
          p.status,
          ma.is_available,
          ma.is_paused,
          ma.onboarding_state
        )
        and ma.mentor_id is distinct from p_request.student_id
        and not exists (
          select 1
          from public.request_matches rm
          where rm.request_id = p_request.id
            and rm.mentor_id = ma.mentor_id
        )
    )
    select *
    from scored s
    where
      case p_stage
        when 1 then
          s.score > 30
          and (
            v_student_batch is null
            or s.mentor_batch is null
            or s.mentor_batch < v_student_batch
          )
        when 2 then
          s.score >= 15
          and (
            v_student_batch is null
            or s.mentor_batch is null
            or s.mentor_batch < v_student_batch
          )
        when 3 then
          (
            v_student_dept is not null
            and nullif(trim(s.mentor_dept), '') is not null
            and lower(trim(s.mentor_dept)) = lower(v_student_dept)
          )
          and (
            v_student_batch is null
            or s.mentor_batch is null
            or s.mentor_batch < v_student_batch
          )
        when 4 then true
        else false
      end
    order by s.score desc nulls last
    limit c_top_n
  loop
    select count(*)::int into v_open
    from public.request_matches rm
    where rm.mentor_id = r.mentor_id
      and rm.status = 'pending';

    v_max := greatest(coalesce(r.max_open_requests, 3), 1);
    -- At capacity: skip (stage 4 still respects hard cap for fairness).
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
      p_request.id,
      r.mentor_id,
      coalesce(r.score, 0),
      coalesce(r.reasons, '{}'),
      'pending'
    )
    on conflict (request_id, mentor_id) do nothing;

    if found then
      inserted := inserted + 1;

      begin
        insert into public.notifications (user_id, type, title, body, link, payload)
        values (
          r.mentor_id,
          'mentorship_match',
          'New mentorship ask for you',
          left(coalesce(p_request.title, 'A student needs help'), 120),
          '/mentors',
          jsonb_build_object(
            'request_id', p_request.id,
            'stage', p_stage
          )
        );
      exception when others then
        null;
      end;
    end if;
  end loop;

  return inserted;
end;
$$;

-- =============================================================================
-- 9) list_my_matched_asks — unchanged return shape; still mentor-scoped.
--     New matches are only created for eligible graduates (sections 7–8).
--     Existing historical matches remain visible so mentors can respond.
-- =============================================================================

-- (No signature change needed. Recreate to keep migration self-contained if
--  a future filter is desired; behavior matches latest seniority migration.)

drop function if exists public.get_matched_ask(uuid);
drop function if exists public.list_my_matched_asks();

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
  student_id uuid,
  student_full_name text,
  student_avatar_url text,
  student_department text,
  student_batch_year int,
  student_status text
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

  -- Listing is for the caller as mentor. Eligibility gates apply at match
  -- creation time; we still show existing matches for response/history.
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
    p.batch_year as student_batch_year,
    p.status as student_status
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
  student_batch_year int,
  student_status text
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
-- 10) preview_mentorship_matches — same eligibility filters
-- =============================================================================

drop function if exists public.preview_mentorship_matches(text[], text, text);
create function public.preview_mentorship_matches(
  p_tags text[],
  p_title text default null,
  p_description text default null
)
returns table (
  match_count int,
  top_score numeric,
  suggested_tags text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  fake public.mentorship_requests%rowtype;
  cnt int := 0;
  top numeric := 0;
  alts text[] := '{}';
  v_student_batch int;
begin
  fake.id := gen_random_uuid();
  fake.student_id := auth.uid();
  fake.title := coalesce(nullif(trim(p_title), ''), 'Preview ask');
  fake.description := coalesce(nullif(trim(p_description), ''), 'Preview description for matching.');
  fake.tags := coalesce(p_tags, '{}');
  fake.urgency := 'flexible';
  fake.preferred_duration := 30;
  fake.status := 'open';
  fake.created_at := now();
  fake.expires_at := now() + interval '14 days';

  select batch_year into v_student_batch
  from public.profiles
  where id = auth.uid();

  select count(*)::int, coalesce(max(s.score), 0)
    into cnt, top
  from public.mentor_availability ma
  join public.profiles p on p.id = ma.mentor_id
  cross join lateral public.score_mentor_for_request(
    fake,
    ma.mentor_id,
    p.skills,
    p.department,
    p.company,
    coalesce(p.role_title, p.current_job),
    coalesce(ma.bio_note, p.bio),
    ma.topics,
    ma.session_lengths
  ) as s(score, reasons)
  where public.mentor_is_match_eligible(
      p.status,
      ma.is_available,
      ma.is_paused,
      ma.onboarding_state
    )
    and ma.mentor_id is distinct from auth.uid()
    and s.score > 30
    and (
      v_student_batch is null
      or p.batch_year is null
      or p.batch_year < v_student_batch
    )
    and (
      select count(*)::int
      from public.request_matches rm
      where rm.mentor_id = ma.mentor_id
        and rm.status = 'pending'
    ) < greatest(coalesce(ma.max_open_requests, 3), 1);

  select coalesce((
    select array_agg(topic order by freq desc)
    from (
      select topic, count(*)::int as freq
      from public.mentor_availability ma
      join public.profiles p on p.id = ma.mentor_id
      cross join lateral unnest(coalesce(ma.topics, '{}')) as topic
      where public.mentor_is_match_eligible(
          p.status,
          ma.is_available,
          ma.is_paused,
          ma.onboarding_state
        )
        and lower(topic) not in (
          select lower(x) from unnest(coalesce(p_tags, '{}')) x
        )
      group by topic
      order by freq desc
      limit 3
    ) s
  ), '{}'::text[]) into alts;

  match_count := cnt;
  top_score := top;
  suggested_tags := alts;
  return next;
end;
$$;

revoke all on function public.preview_mentorship_matches(text[], text, text) from public;
grant execute on function public.preview_mentorship_matches(text[], text, text) to authenticated;

-- =============================================================================
-- 11) Watch notify — only when an eligible graduate becomes available
-- =============================================================================

create or replace function public.mentor_availability_watch_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if new.is_available = true
     and coalesce(new.is_paused, false) = false
     and new.onboarding_state = 'confirmed'
     and (tg_op = 'INSERT' or old.is_available is distinct from true) then
    select p.status into v_status
    from public.profiles p
    where p.id = new.mentor_id;

    if v_status = 'graduate' then
      perform public.notify_mentorship_watches_for_mentor(new.mentor_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists mentor_availability_watch_notify on public.mentor_availability;
create trigger mentor_availability_watch_notify
  after insert or update of is_available, is_paused, onboarding_state
    on public.mentor_availability
  for each row
  execute function public.mentor_availability_watch_notify();

-- =============================================================================
-- 12) Defensive cleanup: student-owned availability rows stay non-matchable
-- =============================================================================

-- Do not delete historical rows (may have FK/analytics); force unavailable.
update public.mentor_availability ma
set is_available = false
from public.profiles p
where p.id = ma.mentor_id
  and coalesce(p.status, 'student') <> 'graduate'
  and ma.is_available = true;
