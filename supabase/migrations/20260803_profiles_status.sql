-- Cohortly: explicit student vs graduate status on profiles
-- Run in Supabase Dashboard → SQL Editor → New query → Run
--
-- Batch year alone is not enough (Indian colleges graduate mid-year).
-- Backfill uses end-of-June graduation: if batch_year < current year, or
-- batch_year == current year and month is July or later → graduate;
-- otherwise student. Null batch_year → graduate.

alter table public.profiles
  add column if not exists status text;

-- Backfill existing rows (only where status is still null)
update public.profiles
set status = case
  when batch_year is null then 'graduate'
  when batch_year < extract(year from current_date)::int then 'graduate'
  when batch_year = extract(year from current_date)::int
    and extract(month from current_date)::int >= 7 then 'graduate'
  else 'student'
end
where status is null;

-- Enforce allowed values
alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check
  check (status in ('student', 'graduate'));

-- Require a value going forward (safe after backfill)
alter table public.profiles
  alter column status set default 'student';

alter table public.profiles
  alter column status set not null;

create index if not exists profiles_status_idx on public.profiles (status);

comment on column public.profiles.status is
  'Explicit enrollment status: student or graduate. Not inferred from batch_year alone.';
