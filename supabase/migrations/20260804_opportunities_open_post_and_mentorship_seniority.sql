-- Cohortly: open opportunity posting + mentorship seniority scoring
-- Run in Supabase → SQL Editor (production).
--
-- PART 1) Opportunities: any authenticated user may post (posted_by = self),
--         quality checks, 5 active posting cap, contact_info column.
-- PART 2) Mentorship: seniority + graduate boost in score; batch gate until
--         stage 4 widen; student_status on matched asks; defensive SELECT audit.

-- =============================================================================
-- PART 1) Opportunities — open posting + quality control
-- =============================================================================

alter table public.opportunities
  add column if not exists contact_info text;

-- Active = not past deadline (null deadline counts as active)
create or replace function public.opportunity_is_active(p_deadline date)
returns boolean
language sql
immutable
as $$
  select p_deadline is null or p_deadline >= current_date;
$$;

create or replace function public.enforce_opportunity_posting_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count int;
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if length(trim(coalesce(new.title, ''))) = 0 then
      raise exception 'OPPORTUNITY_TITLE_REQUIRED';
    end if;

    if new.type is null or trim(new.type) = '' then
      raise exception 'OPPORTUNITY_TYPE_REQUIRED';
    end if;

    if length(trim(coalesce(new.description, ''))) < 100 then
      raise exception 'OPPORTUNITY_DESCRIPTION_TOO_SHORT';
    end if;

    if nullif(trim(coalesce(new.apply_link, '')), '') is null
       and nullif(trim(coalesce(new.contact_info, '')), '') is null then
      raise exception 'OPPORTUNITY_CONTACT_REQUIRED';
    end if;
  end if;

  if tg_op = 'INSERT'
     or (
       tg_op = 'UPDATE'
       and public.opportunity_is_active(new.deadline)
       and not public.opportunity_is_active(old.deadline)
     ) then
    select count(*)::int into active_count
    from public.opportunities o
    where o.posted_by = new.posted_by
      and public.opportunity_is_active(o.deadline)
      and (tg_op = 'INSERT' or o.id is distinct from new.id);

    if active_count >= 5 then
      raise exception 'OPPORTUNITY_ACTIVE_CAP';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists opportunities_enforce_posting_rules on public.opportunities;
create trigger opportunities_enforce_posting_rules
  before insert or update on public.opportunities
  for each row
  execute function public.enforce_opportunity_posting_rules();

-- Any authenticated user may INSERT as themselves (graduate gate removed).
drop policy if exists "Graduates can post opportunities" on public.opportunities;
drop policy if exists "Authenticated users can post opportunities" on public.opportunities;

create policy "Authenticated users can post opportunities"
  on public.opportunities
  for insert
  to authenticated
  with check (
    auth.uid() = posted_by
    and (
      select count(*)::int
      from public.opportunities o
      where o.posted_by = auth.uid()
        and public.opportunity_is_active(o.deadline)
    ) < 5
  );

-- Keep own-row delete (already present historically; recreate defensively).
drop policy if exists "Posters can delete own opportunities" on public.opportunities;
create policy "Posters can delete own opportunities"
  on public.opportunities
  for delete
  to authenticated
  using (auth.uid() = posted_by);

-- =============================================================================
-- PART 2) Mentorship — seniority scoring + batch widen gate
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

  -- Graduate mentors outrank students on the same request.
  if v_mentor_status = 'graduate' then
    v_score := v_score + 25;
    v_reasons := array_append(v_reasons, 'graduate mentor');
  end if;

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

-- Stages 1–3: only mentors with an earlier (more senior) batch than the requester.
-- Stage 4 (day 9+): pool widened — same/junior batches allowed.
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
      where ma.is_available = true
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
    if v_open >= v_max and p_stage < 4 then
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

-- Matched asks: include student status for badges (DROP first — return type change).
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

-- Defensive: mentors must not SELECT unmatched mentorship_requests (referral-bug pattern).
drop policy if exists "Authenticated users can view mentorship requests"
  on public.mentorship_requests;
drop policy if exists "Anyone can view mentorship requests"
  on public.mentorship_requests;
drop policy if exists "Matched mentors can view mentorship requests"
  on public.mentorship_requests;

drop policy if exists "Students can view own mentorship requests"
  on public.mentorship_requests;
create policy "Students can view own mentorship requests"
  on public.mentorship_requests
  for select
  to authenticated
  using (auth.uid() = student_id);

-- Any authenticated user may manage their own mentor_availability (no graduate gate).
drop policy if exists "Mentors manage own availability" on public.mentor_availability;
create policy "Mentors manage own availability"
  on public.mentor_availability
  for insert
  to authenticated
  with check (auth.uid() = mentor_id);

drop policy if exists "Mentors update own availability" on public.mentor_availability;
create policy "Mentors update own availability"
  on public.mentor_availability
  for update
  to authenticated
  using (auth.uid() = mentor_id)
  with check (auth.uid() = mentor_id);

-- Preview uses stage-1 rules: score > 30 + senior-batch mentors only.
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
  where ma.is_available = true
    and ma.mentor_id is distinct from auth.uid()
    and s.score > 30
    and (
      v_student_batch is null
      or p.batch_year is null
      or p.batch_year < v_student_batch
    );

  select coalesce((
    select array_agg(topic order by freq desc)
    from (
      select topic, count(*)::int as freq
      from public.mentor_availability ma
      cross join lateral unnest(coalesce(ma.topics, '{}')) as topic
      where ma.is_available = true
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
