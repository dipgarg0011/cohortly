-- Opportunity Board table + RLS
-- Run in Supabase → SQL Editor

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  posted_by uuid references public.profiles(id) not null,
  type text not null check (type in (
    'Internship', 'Job', 'Research', 'Freelance', 'Campus Ambassador'
  )),
  title text not null,
  company text,
  description text,
  apply_link text,
  location text,
  deadline date,
  created_at timestamp with time zone default now()
);

create index if not exists opportunities_type_idx on public.opportunities (type);
create index if not exists opportunities_created_idx
  on public.opportunities (created_at desc);

alter table public.opportunities enable row level security;

drop policy if exists "Authenticated users can view opportunities" on public.opportunities;
create policy "Authenticated users can view opportunities"
  on public.opportunities
  for select
  to authenticated
  using (true);

drop policy if exists "Graduates can post opportunities" on public.opportunities;
drop policy if exists "Authenticated users can post opportunities" on public.opportunities;
create policy "Authenticated users can post opportunities"
  on public.opportunities
  for insert
  to authenticated
  with check (auth.uid() = posted_by);

drop policy if exists "Posters can update own opportunities" on public.opportunities;
create policy "Posters can update own opportunities"
  on public.opportunities
  for update
  to authenticated
  using (auth.uid() = posted_by)
  with check (auth.uid() = posted_by);

drop policy if exists "Posters can delete own opportunities" on public.opportunities;
create policy "Posters can delete own opportunities"
  on public.opportunities
  for delete
  to authenticated
  using (auth.uid() = posted_by);
