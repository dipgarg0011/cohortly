-- Blocked emails: deny signup / login for abuse accounts.
-- Table is service-role / SQL Editor only (RLS on, no anon/authenticated policies).
-- App checks via security-definer RPC is_email_blocked (boolean only).

create table if not exists public.blocked_emails (
  email text primary key
    check (email = lower(btrim(email)) and position('@' in email) > 1),
  reason text,
  created_at timestamptz not null default now()
);

comment on table public.blocked_emails is
  'Emails barred from Cohortly auth. Insert via SQL Editor / service role only.';

alter table public.blocked_emails enable row level security;

-- Explicit deny: no policies for authenticated/anon → no direct table access.
revoke all on table public.blocked_emails from anon, authenticated;
grant all on table public.blocked_emails to service_role;

create or replace function public.is_email_blocked(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.blocked_emails b
    where b.email = lower(btrim(coalesce(check_email, '')))
  );
$$;

revoke all on function public.is_email_blocked(text) from public;
grant execute on function public.is_email_blocked(text) to anon, authenticated;

comment on function public.is_email_blocked(text) is
  'Returns true when email is on blocked_emails. Callable by anon/authenticated; no row exposure.';
