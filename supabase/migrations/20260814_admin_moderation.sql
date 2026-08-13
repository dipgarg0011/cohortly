-- Admin moderation console support (service-role / SQL Editor only).
-- App gates admins via ADMIN_EMAILS + SUPABASE_SERVICE_ROLE_KEY in Next.js.
-- Do NOT add authenticated SELECT/INSERT policies on user_reports or blocked_emails.

-- =============================================================================
-- 1) reviewed_at on user_reports
-- =============================================================================

alter table public.user_reports
  add column if not exists reviewed_at timestamptz;

create index if not exists user_reports_created_at_idx
  on public.user_reports (created_at desc);

create index if not exists user_reports_reviewed_at_idx
  on public.user_reports (reviewed_at)
  where reviewed_at is null;

-- =============================================================================
-- 2) Minimal admin action log (no message content)
-- =============================================================================

create table if not exists public.admin_moderation_log (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null,
  action text not null
    check (action in ('block_email', 'remove_user', 'mark_reviewed')),
  target_user_id uuid,
  target_email text,
  report_id uuid,
  detail text,
  created_at timestamptz not null default now()
);

comment on table public.admin_moderation_log is
  'Minimal admin moderation audit trail. Service role only; no private message bodies.';

alter table public.admin_moderation_log enable row level security;

revoke all on table public.admin_moderation_log from anon, authenticated;
grant all on table public.admin_moderation_log to service_role;

-- =============================================================================
-- 3) admin_remove_user — block email, clean FKs, delete auth user (skip storage)
-- =============================================================================

create or replace function public.admin_remove_user(
  p_user_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_email text;
  reason_text text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_user_id is null then
    raise exception 'USER_ID_REQUIRED';
  end if;

  select lower(btrim(u.email))
    into target_email
  from auth.users u
  where u.id = p_user_id;

  if target_email is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  insert into public.blocked_emails (email, reason)
  values (
    target_email,
    coalesce(reason_text, 'Removed by admin moderation')
  )
  on conflict (email) do update
    set reason = coalesce(excluded.reason, public.blocked_emails.reason);

  -- Scrub visible PII first (same idea as delete_own_account)
  begin
    update public.profiles
    set
      full_name = 'Deleted User',
      bio = null,
      avatar_url = null,
      linkedin_url = null,
      company = null,
      role_title = null,
      department = null,
      is_founder = false,
      deleted_at = now()
    where id = p_user_id;
  exception
    when undefined_column then
      update public.profiles
      set
        full_name = 'Deleted User',
        bio = null,
        avatar_url = null,
        linkedin_url = null,
        company = null,
        role_title = null,
        department = null,
        is_founder = false
      where id = p_user_id;
  end;

  begin
    update public.profiles
    set
      current_job = null,
      skills = '{}'::text[],
      open_to = '{}'::text[],
      past_companies = '{}'::text[]
    where id = p_user_id;
  exception
    when undefined_column then
      null;
  end;

  begin
    update public.profiles set push_token = null where id = p_user_id;
  exception
    when undefined_column then
      null;
  end;

  -- Intentionally skip storage.objects deletes (avatars/resumes).
  -- Orphan objects can be cleaned later via dashboard/lifecycle rules.

  begin
    delete from public.notifications where user_id = p_user_id;
  exception when undefined_table then null;
  end;

  begin
    delete from public.office_hours where mentor_id = p_user_id;
  exception when undefined_table then null;
  end;

  begin
    delete from public.mentor_bookings
    where mentor_id = p_user_id or student_id = p_user_id;
  exception when undefined_table then null;
  end;

  begin
    delete from public.mentor_availability where mentor_id = p_user_id;
  exception when undefined_table then null;
  end;

  begin
    delete from public.mentorship_answers where mentor_id = p_user_id;
  exception when undefined_table then null;
  end;

  begin
    update public.referral_requests
    set accepted_by = null
    where accepted_by = p_user_id;
  exception when undefined_table then null;
  end;

  begin
    update public.referral_requests
    set helper_id = null
    where helper_id = p_user_id;
  exception when undefined_table then null;
  end;

  begin
    delete from public.referral_requests where student_id = p_user_id;
  exception when undefined_table then null;
  end;

  begin
    delete from public.opportunity_applications where applicant_id = p_user_id;
  exception when undefined_table then null;
  end;

  begin
    delete from public.opportunities where posted_by = p_user_id;
  exception when undefined_table then null;
  end;

  begin
    delete from public.request_matches where mentor_id = p_user_id;
  exception when undefined_table then null;
  end;

  begin
    delete from public.mentorship_requests where student_id = p_user_id;
  exception when undefined_table then null;
  end;

  begin
    delete from public.user_reports
    where reporter_id = p_user_id or reported_id = p_user_id;
  exception when undefined_table then null;
  end;

  delete from auth.users where id = p_user_id;

  if not found then
    raise exception 'ADMIN_REMOVE_FAILED: Could not remove auth user.';
  end if;
end;
$$;

revoke all on function public.admin_remove_user(uuid, text) from public;
grant execute on function public.admin_remove_user(uuid, text) to service_role;

comment on function public.admin_remove_user(uuid, text) is
  'Service-role only: block email, clean owned rows, delete auth.users. Skips storage.objects.';
