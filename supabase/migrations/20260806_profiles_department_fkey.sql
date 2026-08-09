-- Cohortly Phase 2b: FK profiles.department → departments(short_code)
-- =============================================================================
-- DO NOT APPLY while custom departments are allowed.
-- DepartmentSelect supports "My department isn't listed" and stores free-text
-- on profiles.department; those values are NOT in public.departments.
-- Adding this FK would reject custom dept signup / complete-profile / edits.
--
-- Kept for a future multi-college / strict-canonical mode only.
-- If you ever re-enable a hard FK, run ONLY after:
--   1) Phase 1 + additive seeds applied
--   2) Custom "not listed" path is removed from the UI
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
