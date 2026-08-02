-- Enable Realtime for messages + allow receivers to mark messages as read.
-- Run in Supabase → SQL Editor.

-- 1) Realtime: add messages to the supabase_realtime publication
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

-- 2) Receivers can update read status on messages sent to them
drop policy if exists "Users can mark received messages as read" on public.messages;
create policy "Users can mark received messages as read"
  on public.messages
  for update
  to authenticated
  using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);
