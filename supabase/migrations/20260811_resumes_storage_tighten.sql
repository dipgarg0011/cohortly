-- Tighten private resumes bucket: no more "any authenticated user can read all resumes".
-- Run in Supabase → SQL Editor (after 20260803_resumes_storage_bucket.sql).
--
-- Read allowed only when:
--   - object is under the caller's own folder, OR
--   - path is attached to a referral the caller owns / is helping, OR
--   - path is attached to an opportunity application the caller owns / posted

drop policy if exists "Authenticated users can read resumes" on storage.objects;
drop policy if exists "Users can read own or authorized resumes" on storage.objects;

create policy "Users can read own or authorized resumes"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'resumes'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.referral_requests r
        where r.resume_url = name
          and (
            r.student_id = auth.uid()
            or r.accepted_by = auth.uid()
            or r.helper_id = auth.uid()
          )
      )
      or exists (
        select 1
        from public.opportunity_applications a
        join public.opportunities o on o.id = a.opportunity_id
        where a.resume_url = name
          and (
            a.applicant_id = auth.uid()
            or o.posted_by = auth.uid()
          )
      )
    )
  );

-- Keep write policies owner-folder-only (reaffirm if older policies drifted)
drop policy if exists "Users can upload own resumes" on storage.objects;
create policy "Users can upload own resumes"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own resumes" on storage.objects;
create policy "Users can update own resumes"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own resumes" on storage.objects;
create policy "Users can delete own resumes"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
