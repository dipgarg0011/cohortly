-- Fix: infinite recursion between mentorship_requests ↔ request_matches RLS
-- Run this in Supabase → SQL Editor.

-- SECURITY DEFINER helpers bypass RLS when checking the other table,
-- which breaks the policy recursion loop.

create or replace function public.is_matched_mentor_of_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.request_matches rm
    where rm.request_id = p_request_id
      and rm.mentor_id = auth.uid()
  );
$$;

create or replace function public.owns_mentorship_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mentorship_requests mr
    where mr.id = p_request_id
      and mr.student_id = auth.uid()
  );
$$;

revoke all on function public.is_matched_mentor_of_request(uuid) from public;
revoke all on function public.owns_mentorship_request(uuid) from public;
grant execute on function public.is_matched_mentor_of_request(uuid) to authenticated;
grant execute on function public.owns_mentorship_request(uuid) to authenticated;

-- Replace the recursive policies
drop policy if exists "Matched mentors can view mentorship requests" on public.mentorship_requests;
create policy "Matched mentors can view mentorship requests"
  on public.mentorship_requests
  for select
  to authenticated
  using (public.is_matched_mentor_of_request(id));

drop policy if exists "Students can view matches on own requests" on public.request_matches;
create policy "Students can view matches on own requests"
  on public.request_matches
  for select
  to authenticated
  using (public.owns_mentorship_request(request_id));
