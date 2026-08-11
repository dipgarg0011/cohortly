-- Account deletion (App Store / privacy requirement)
-- Run in Supabase → SQL Editor before relying on Profile → Delete my account.
--
-- Also ensure chat safety is applied first if not already:
--   supabase/migrations/20260810_chat_safety.sql
--   (includes report rate limit: 10 reports / 24h)
--
-- What this does:
--   1) Marks + scrubs the caller's profile PII
--   2) Deletes avatar/resume storage objects under {user_id}/
--   3) Deletes owned rows that may lack ON DELETE CASCADE
--   4) Deletes auth.users (sessions die; profiles cascade when FK allows)
--
-- Residual / ops:
--   - Export/review user_reports before bulk deletions if you need a paper trail
--   - Supabase dashboard backups may retain deleted data per your project retention
--   - Service-role key must stay server-only (Edge Functions / Vault), never NEXT_PUBLIC_*

alter table public.profiles
  add column if not exists deleted_at timestamptz;

create index if not exists profiles_deleted_at_idx
  on public.profiles (deleted_at)
  where deleted_at is not null;

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, storage, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Scrub visible PII first
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
  where id = uid;

  begin
    update public.profiles
    set
      current_job = null,
      skills = '{}'::text[],
      open_to = '{}'::text[],
      past_companies = '{}'::text[]
    where id = uid;
  exception
    when undefined_column then
      null;
  end;

  begin
    update public.profiles set push_token = null where id = uid;
  exception
    when undefined_column then
      null;
  end;

  -- Storage folders: {user_id}/...
  delete from storage.objects
  where bucket_id in ('avatars', 'resumes')
    and (storage.foldername(name))[1] = uid::text;

  -- Tables that historically lacked ON DELETE CASCADE from profiles
  begin
    delete from public.notifications where user_id = uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.office_hours where mentor_id = uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.mentor_bookings
    where mentor_id = uid or student_id = uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.mentor_availability where mentor_id = uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.mentorship_answers where mentor_id = uid;
  exception when undefined_table then null;
  end;

  begin
    update public.referral_requests
    set accepted_by = null
    where accepted_by = uid;
  exception when undefined_table then null;
  end;

  begin
    update public.referral_requests
    set helper_id = null
    where helper_id = uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.referral_requests where student_id = uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.opportunity_applications where applicant_id = uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.opportunities where posted_by = uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.request_matches where mentor_id = uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.mentorship_requests where student_id = uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.user_reports where reporter_id = uid;
  exception when undefined_table then null;
  end;

  -- Remove auth identity (invalidates all sessions)
  delete from auth.users where id = uid;

  if not found then
    raise exception 'ACCOUNT_DELETE_FAILED: Could not remove auth user.';
  end if;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

comment on function public.delete_own_account() is
  'Caller-only account deletion: scrub PII, remove storage, delete owned rows, delete auth.users.';
