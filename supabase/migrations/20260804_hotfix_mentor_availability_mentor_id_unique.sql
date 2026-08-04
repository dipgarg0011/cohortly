-- Hotfix: mentor "Available as mentor" toggle fails with:
--   there is no unique or exclusion constraint matching the ON CONFLICT specification
--
-- Cause: clients upsert with onConflict: 'mentor_id' (see components/mentors-board.tsx),
-- but production mentor_availability may lack UNIQUE(mentor_id). The original
-- 20260802_mentorship.sql declares mentor_id UNIQUE, yet CREATE TABLE IF NOT EXISTS
-- does not add the constraint if an older table already existed without it.
-- 20260804_opportunities_open_post_and_mentorship_seniority.sql only touched RLS /
-- match functions — it never ensured the unique constraint.
--
-- Run in Supabase → SQL Editor (safe to re-run).

-- Collapse duplicate mentor_id rows (keep newest) before adding uniqueness.
delete from public.mentor_availability a
using public.mentor_availability b
where a.mentor_id = b.mentor_id
  and a.ctid < b.ctid;

-- Ensure a single-column unique index on mentor_id so ON CONFLICT (mentor_id) works.
do $$
begin
  if not exists (
    select 1
    from pg_index i
    join pg_attribute a
      on a.attrelid = i.indrelid
     and a.attnum = any (i.indkey)
    where i.indrelid = 'public.mentor_availability'::regclass
      and i.indisunique
      and not i.indisprimary
      and a.attname = 'mentor_id'
      and i.indnkeyatts = 1
  ) then
    alter table public.mentor_availability
      add constraint mentor_availability_mentor_id_key unique (mentor_id);
  end if;
end $$;
