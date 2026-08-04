-- Cohortly: convert timestamp-without-tz → timestamptz + ensure messages realtime
--
-- Background:
--   Original tables (profiles, messages, …) were created as `timestamp` (no TZ).
--   Postgres stores wall-clock UTC values; JS then parses them as local time →
--   ~5.5h skew in India. Later migrations used timestamptz for new tables, but
--   CREATE TABLE IF NOT EXISTS never upgraded existing timestamp columns.
--
-- Conversion rule:
--   USING col AT TIME ZONE 'UTC'  — treat stored values as UTC, attach offset.
--   Only alters columns that are still `timestamp without time zone`.
--
-- ALSO: re-ensure `messages` is in supabase_realtime (idempotent).
--
-- Run in Supabase → SQL Editor (production requires a manual run).

-- =============================================================================
-- 1) Convert timestamp → timestamptz for known tables / time columns
-- =============================================================================

do $$
declare
  r record;
  tbl text;
  col text;
  target_tables text[] := array[
    'messages',
    'conversations',
    'profiles',
    'unclaimed_alumni',
    'help_requests',
    'mentorship_requests',
    'request_matches',
    'request_answers',
    'referral_requests',
    'referral_questions',
    'referral_answers',
    'referral_matches',
    'opportunities',
    'opportunity_applications',
    'notifications',
    'mentor_bookings',
    'mentor_availability',
    'office_hours',
    'mentorship_watches',
    'connection_requests'
  ];
  time_cols text[] := array[
    'created_at',
    'updated_at',
    'last_seen_at',
    'responded_at',
    'reminded_at',
    'expires_at',
    'requested_time',
    'revealed_at',
    'accepted_at',
    'referred_at',
    'opened_to_all_at',
    'read_at',
    'last_escalated_at',
    'awaiting_resolution_at',
    'gate_lifted_at',
    'turn_nudge_sent_at',
    'last_notified_at'
  ];
begin
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.data_type = 'timestamp without time zone'
      and (
        c.table_name = any (target_tables)
        or c.column_name = any (time_cols)
      )
      and (
        c.column_name = any (time_cols)
        or c.column_name like '%\_at' escape '\'
        or c.column_name like '%\_time' escape '\'
      )
      -- Keep calendar deadlines as `date` (not in this set); skip plain `time`
  loop
    tbl := r.table_name;
    col := r.column_name;

    execute format(
      'alter table public.%I alter column %I type timestamptz using %I at time zone %L',
      tbl,
      col,
      col,
      'UTC'
    );

    -- Prefer DB clock as source of truth for created_at / updated_at defaults
    if col in ('created_at', 'updated_at') then
      execute format(
        'alter table public.%I alter column %I set default now()',
        tbl,
        col
      );
    end if;

    raise notice 'converted %.% to timestamptz', tbl, col;
  end loop;
end $$;

-- =============================================================================
-- 2) Ensure messages.created_at defaults to now() even if already timestamptz
-- =============================================================================

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'created_at'
  ) then
    alter table public.messages
      alter column created_at set default now();
  end if;
end $$;

-- =============================================================================
-- 3) Realtime: add messages to supabase_realtime (idempotent)
-- =============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Conversations (inbox status updates) — also idempotent
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'conversations'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;
