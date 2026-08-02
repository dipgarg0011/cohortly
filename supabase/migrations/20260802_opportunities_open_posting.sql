-- Allow any authenticated user to post opportunities (students, founders, graduates).
-- Run in Supabase → SQL Editor if you already applied the old graduate-only policy.

drop policy if exists "Graduates can post opportunities" on public.opportunities;
drop policy if exists "Authenticated users can post opportunities" on public.opportunities;

create policy "Authenticated users can post opportunities"
  on public.opportunities
  for insert
  to authenticated
  with check (auth.uid() = posted_by);
