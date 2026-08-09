-- Cohortly: additive IIT (BHU) department seed
-- =============================================================================
-- Run in Supabase SQL Editor AFTER Phase 1 (20260806_departments_canonical.sql).
-- Idempotent: inserts missing short_codes; updates names on conflict.
-- Does NOT recreate tables, RLS, or remaps. No Phase 1 re-run.
--
-- Official campus codes (iitbhu.ac.in/dept/<code>):
--   CHY (Chemistry), MAT (Mathematical Sciences / MnC IDD), PHY (Physics),
--   DSE (NC Jain School of Decision Science and Engineering),
--   HSS (Humanistic Studies)
--
-- Do NOT apply 20260806_profiles_department_fkey.sql while custom departments
-- are allowed ("My department isn't listed" stores free-text on profiles).
-- =============================================================================

insert into public.departments (short_code, name)
values
  ('CHY', 'Chemistry'),
  ('DSE', 'Decision Science and Engineering'),
  ('HSS', 'Humanistic Studies'),
  ('MAT', 'Mathematical Sciences (Mathematics and Computing)'),
  ('PHY', 'Physics')
on conflict (short_code) do update
set name = excluded.name;
