-- =============================================================================
-- ONE-SHOT ADMIN: remove spam profile "Malai Romali" + block their email
-- Run in Supabase → SQL Editor (service role / postgres).
--
-- Prerequisites: apply migration 20260813_blocked_emails.sql first
--   (or create blocked_emails + is_email_blocked from that file).
--
-- Order: INSPECT → BLOCK email → CLEAN owned rows → DELETE auth.users
-- (mirrors cleanup order in 20260811_delete_own_account.sql)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1 — INSPECT (run alone first; confirm id + email before deleting)
-- -----------------------------------------------------------------------------
select
  p.id,
  p.full_name,
  p.batch_year,
  p.status,
  p.department,
  p.is_founder,
  p.skills,
  p.role_title,
  u.email as auth_email,
  u.created_at as auth_created_at
from public.profiles p
join auth.users u on u.id = p.id
where p.full_name ilike '%Malai Romali%';

-- Also catch auth-only matches / name variants
select
  u.id,
  u.email,
  u.raw_user_meta_data->>'full_name' as meta_full_name,
  p.full_name as profile_name
from auth.users u
left join public.profiles p on p.id = u.id
where coalesce(p.full_name, u.raw_user_meta_data->>'full_name', '')
      ilike '%Malai Romali%';

-- -----------------------------------------------------------------------------
-- STEP 2 — BLOCK + DELETE (edit target_email if STEP 1 shows a different address)
-- Uncomment the DO block below after verifying STEP 1.
-- -----------------------------------------------------------------------------
/*
do $$
declare
  target_uid uuid;
  target_email text;
  target_name text := '%Malai Romali%';
begin
  select p.id, lower(btrim(u.email))
    into target_uid, target_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.full_name ilike target_name
  limit 1;

  if target_uid is null then
    raise exception 'No profile matched full_name ILIKE %', target_name;
  end if;

  raise notice 'Blocking and deleting: id=% email=%', target_uid, target_email;

  -- 1) Ban email so they cannot re-register
  insert into public.blocked_emails (email, reason)
  values (
    target_email,
    'Abuse/spam profile: Malai Romali (Batch 2069, HSS, Founder, Trading/Ricing/FemBoy)'
  )
  on conflict (email) do update
    set reason = excluded.reason;

  -- 2) Storage folders: {user_id}/...
  delete from storage.objects
  where bucket_id in ('avatars', 'resumes')
    and (storage.foldername(name))[1] = target_uid::text;

  -- 3) Owned rows that may lack ON DELETE CASCADE (same set as delete_own_account)
  begin
    delete from public.notifications where user_id = target_uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.office_hours where mentor_id = target_uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.mentor_bookings
    where mentor_id = target_uid or student_id = target_uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.mentor_availability where mentor_id = target_uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.mentorship_answers where mentor_id = target_uid;
  exception when undefined_table then null;
  end;

  begin
    update public.referral_requests
    set accepted_by = null
    where accepted_by = target_uid;
  exception when undefined_table then null;
  end;

  begin
    update public.referral_requests
    set helper_id = null
    where helper_id = target_uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.referral_requests where student_id = target_uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.opportunity_applications where applicant_id = target_uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.opportunities where posted_by = target_uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.request_matches where mentor_id = target_uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.mentorship_requests where student_id = target_uid;
  exception when undefined_table then null;
  end;

  begin
    delete from public.user_reports
    where reporter_id = target_uid or reported_id = target_uid;
  exception when undefined_table then null;
  end;

  -- 4) Remove auth identity (profiles / cascaded FKs follow when configured)
  delete from auth.users where id = target_uid;

  if not found then
    raise exception 'Failed to delete auth.users id=%', target_uid;
  end if;

  raise notice 'Done. Email % is blocked; auth user removed.', target_email;
end;
$$;
*/

-- -----------------------------------------------------------------------------
-- STEP 3 — VERIFY
-- -----------------------------------------------------------------------------
-- select * from public.blocked_emails order by created_at desc;
-- select id, full_name from public.profiles where full_name ilike '%Malai Romali%';
