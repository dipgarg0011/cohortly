-- Referral Board: table, RLS, and Storage policies for resumes
-- Run in Supabase → SQL Editor after creating the Storage bucket (see README steps).

-- 1) Table
create table if not exists public.referral_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles(id) not null,
  company text not null,
  role text not null,
  resume_url text,
  job_link text,
  deadline date,
  status text not null default 'open' check (status in ('open', 'accepted', 'closed')),
  accepted_by uuid references public.profiles(id),
  created_at timestamp with time zone default now()
);

create index if not exists referral_requests_status_idx
  on public.referral_requests (status);
create index if not exists referral_requests_student_idx
  on public.referral_requests (student_id);
create index if not exists referral_requests_created_idx
  on public.referral_requests (created_at desc);

-- 2) RLS
alter table public.referral_requests enable row level security;

drop policy if exists "Authenticated users can view referral requests" on public.referral_requests;
create policy "Authenticated users can view referral requests"
  on public.referral_requests
  for select
  to authenticated
  using (true);

drop policy if exists "Students can create referral requests" on public.referral_requests;
create policy "Students can create referral requests"
  on public.referral_requests
  for insert
  to authenticated
  with check (auth.uid() = student_id);

drop policy if exists "Users can update referral requests" on public.referral_requests;
create policy "Users can update referral requests"
  on public.referral_requests
  for update
  to authenticated
  using (
    auth.uid() = student_id
    or (status = 'open' and accepted_by is null)
  )
  with check (
    auth.uid() = student_id
    or auth.uid() = accepted_by
  );

-- 3) Storage bucket policies for "resumes"
-- Create the bucket in Dashboard first (name: resumes, private).
-- Then run these policies:

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  5242880, -- 5 MB
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
  );

drop policy if exists "Authenticated users can read resumes" on storage.objects;
create policy "Authenticated users can read resumes"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'resumes');

drop policy if exists "Users can delete own resumes" on storage.objects;
create policy "Users can delete own resumes"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
