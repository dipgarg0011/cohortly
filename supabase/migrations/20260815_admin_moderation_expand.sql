-- Expand admin moderation: unblock logging + email / recent-user lookup (service role only).

-- =============================================================================
-- 1) Allow unblock_email on admin_moderation_log
-- =============================================================================

alter table public.admin_moderation_log
  drop constraint if exists admin_moderation_log_action_check;

alter table public.admin_moderation_log
  add constraint admin_moderation_log_action_check
  check (
    action in (
      'block_email',
      'unblock_email',
      'remove_user',
      'mark_reviewed'
    )
  );

-- =============================================================================
-- 2) Lookup auth user by email (exact or partial), service_role only
-- =============================================================================

create or replace function public.admin_find_users_by_email(p_query text)
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id as user_id, lower(btrim(u.email)) as email
  from auth.users u
  where
    u.email is not null
    and (
      lower(btrim(u.email)) = lower(btrim(coalesce(p_query, '')))
      or lower(u.email) like '%' || lower(btrim(coalesce(p_query, ''))) || '%'
    )
  order by
    case
      when lower(btrim(u.email)) = lower(btrim(coalesce(p_query, ''))) then 0
      else 1
    end,
    u.email
  limit 20;
$$;

revoke all on function public.admin_find_users_by_email(text) from public;
grant execute on function public.admin_find_users_by_email(text) to service_role;

comment on function public.admin_find_users_by_email(text) is
  'Service-role only: find auth users by email for admin moderation member lookup.';

-- =============================================================================
-- 3) Recent signups from auth.users, service_role only
-- =============================================================================

create or replace function public.admin_list_recent_users(p_limit int default 20)
returns table (user_id uuid, email text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    u.id as user_id,
    lower(btrim(u.email)) as email,
    u.created_at
  from auth.users u
  where u.email is not null
  order by u.created_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.admin_list_recent_users(int) from public;
grant execute on function public.admin_list_recent_users(int) to service_role;

comment on function public.admin_list_recent_users(int) is
  'Service-role only: newest auth users for admin moderation Members tab.';
