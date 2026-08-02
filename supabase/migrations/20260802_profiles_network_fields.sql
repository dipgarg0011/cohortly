-- Cohortly: extend profiles for network discovery
-- Run this in Supabase Dashboard → SQL Editor → New query → Run

alter table public.profiles
  add column if not exists company text,
  add column if not exists role_title text,
  add column if not exists is_founder boolean not null default false,
  add column if not exists open_to text[] not null default '{}',
  add column if not exists skills text[] not null default '{}';

comment on column public.profiles.company is 'Current company or startup name';
comment on column public.profiles.role_title is 'Job title, e.g. Software Engineer, Founder';
comment on column public.profiles.is_founder is 'True if the person runs their own startup';
comment on column public.profiles.open_to is 'Tags: Mentoring, Referrals, Hiring, Internships, Networking';
comment on column public.profiles.skills is 'Skill and interest tags';

-- Helpful indexes for filtering on array columns
create index if not exists profiles_open_to_gin on public.profiles using gin (open_to);
create index if not exists profiles_skills_gin on public.profiles using gin (skills);
create index if not exists profiles_is_founder_idx on public.profiles (is_founder)
  where is_founder = true;
