-- Cohortly Phase 2b: FK profiles.department → departments(short_code)
-- =============================================================================
-- Run ONLY after:
--   1) Phase 1 migration (20260806_departments_canonical.sql) has been applied
--   2) Phase 2 frontend is live (department dropdown — no free-text submit)
--   3) profiles.department values are only NULL or canonical short_codes
--
-- Verify before applying:
--   select department, count(*) from public.profiles
--   where department is not null
--     and department not in (select short_code from public.departments)
--   group by 1;
--   -- Expect 0 rows.
-- =============================================================================

alter table public.profiles
  drop constraint if exists profiles_department_fkey;

alter table public.profiles
  add constraint profiles_department_fkey
  foreign key (department)
  references public.departments (short_code);

comment on constraint profiles_department_fkey on public.profiles is
  'Department must be NULL or a known short_code from public.departments. Requires Phase 2 dropdown UI.';
