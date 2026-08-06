-- Cohortly Phase 1: departments reference table + profile backfill
-- =============================================================================
-- Approved for run in Supabase SQL Editor (user confirmed Phase 1).
-- SQL only. No frontend. No hard FK/CHECK on profiles.department yet.
--
-- Goals:
--   1) Create public.departments (global short_code reference; no colleges table)
--   2) Seed full IIT (BHU) Varanasi undergraduate engineering branch list
--   3) Remap known messy profiles.department values → canonical short_code
--   4) Defer FK / CHECK constraint until Phase 2 (dropdown UI) so free-text
--      signup/profile edits keep working
--
-- Official campus short codes (iitbhu.ac.in/dept/<code>, head.<code>@…):
--   MEC (Mechanical), EEE (Electrical), ECE, CSE, MET, CHE, CIV, MIN, CER,
--   PHE, APD, plus schools BCE / BME / MST.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) departments reference table
-- -----------------------------------------------------------------------------

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  short_code text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  constraint departments_short_code_nonempty
    check (char_length(trim(short_code)) > 0),
  constraint departments_name_nonempty
    check (char_length(trim(name)) > 0)
);

comment on table public.departments is
  'Canonical department short codes + display names. Global for now (no college_id); add nullable college_id later when multi-college ships.';

comment on column public.departments.short_code is
  'Campus short code stored on profiles.department (e.g. CSE, MEC, MET).';

comment on column public.departments.name is
  'Official / full department name for UI display.';

-- Read-only for authenticated clients; writes via SQL/service role only
alter table public.departments enable row level security;

drop policy if exists "Authenticated can read departments" on public.departments;
create policy "Authenticated can read departments"
  on public.departments
  for select
  to authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- 2) Seed IIT (BHU) undergraduate engineering branches (+ schools with UG/IDD)
--    Idempotent: insert only when short_code is missing
-- -----------------------------------------------------------------------------

insert into public.departments (short_code, name)
values
  ('APD', 'Architecture, Planning and Design'),
  ('BCE', 'Biochemical Engineering'),
  ('BME', 'Biomedical Engineering'),
  ('CER', 'Ceramic Engineering'),
  ('CHE', 'Chemical Engineering and Technology'),
  ('CIV', 'Civil Engineering'),
  ('CSE', 'Computer Science and Engineering'),
  ('ECE', 'Electronics Engineering'),
  ('EEE', 'Electrical Engineering'),
  ('MEC', 'Mechanical Engineering'),
  ('MET', 'Metallurgical Engineering'),
  ('MIN', 'Mining Engineering'),
  ('MST', 'Materials Science and Technology'),
  ('PHE', 'Pharmaceutical Engineering and Technology')
on conflict (short_code) do update
set name = excluded.name;

-- -----------------------------------------------------------------------------
-- 3) Backfill profiles.department — ONLY known messy → canonical mappings
--
-- Live distinct values before backfill (Phase 0):
--   MET (8), CSE (2), MEC (1), Metallurgy (1)
--
-- Confident remap:
--   Metallurgy → MET
--
-- Already canonical (leave unchanged):
--   CSE, MET, MEC
--
-- Note: IIT BHU official short code for Mechanical is MEC (not ME).
--       Do NOT remap MEC → ME.
-- -----------------------------------------------------------------------------

-- Inline alias map (no temp table — safer under SQL Editor autocommit).
-- Only remap known messy values; already-canonical rows are untouched.
update public.profiles p
set department = v.canonical
from (
  values
    ('Metallurgy', 'MET')
) as v(messy, canonical)
where p.department is not null
  and trim(p.department) = v.messy
  and exists (
    select 1
    from public.departments d
    where d.short_code = v.canonical
  );

-- Optional diagnostic (commented): distinct values after backfill
-- select department, count(*) from public.profiles
-- where department is not null
-- group by 1 order by 2 desc;

-- -----------------------------------------------------------------------------
-- 4) Phase 2 (NOT in this migration) — hard constraint options
-- -----------------------------------------------------------------------------
-- Prefer AFTER Phase 2 frontend ships a department dropdown:
--
--   alter table public.profiles
--     add constraint profiles_department_fkey
--     foreign key (department) references public.departments (short_code);
--
-- Or a soft CHECK:
--
--   alter table public.profiles
--     add constraint profiles_department_known_check
--     check (
--       department is null
--       or exists (
--         select 1 from public.departments d
--         where d.short_code = department
--       )
--     );
--
-- Adding either NOW would break free-text signup / complete-profile / profile
-- edit until Phase 2. Phase 1 intentionally stops at create + seed + backfill.
-- =============================================================================
