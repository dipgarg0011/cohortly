-- Mentorship tables + RLS
-- Run in Supabase → SQL Editor

create table if not exists public.mentor_availability (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid references public.profiles(id) not null unique,
  is_available boolean not null default true,
  session_lengths int[] not null default '{30,60}',
  bio_note text,
  created_at timestamp with time zone default now()
);

create table if not exists public.mentor_bookings (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid references public.profiles(id) not null,
  student_id uuid references public.profiles(id) not null,
  duration_minutes int not null check (duration_minutes in (30, 60)),
  requested_time timestamp with time zone not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'declined', 'completed')),
  notes text,
  created_at timestamp with time zone default now()
);

create table if not exists public.office_hours (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid references public.profiles(id) not null,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamp with time zone default now(),
  check (end_time > start_time)
);

create index if not exists mentor_availability_available_idx
  on public.mentor_availability (is_available) where is_available = true;
create index if not exists mentor_bookings_mentor_idx
  on public.mentor_bookings (mentor_id, status);
create index if not exists mentor_bookings_student_idx
  on public.mentor_bookings (student_id, status);
create index if not exists office_hours_mentor_idx
  on public.office_hours (mentor_id) where is_active = true;

-- RLS: mentor_availability
alter table public.mentor_availability enable row level security;

drop policy if exists "Anyone authenticated can view mentor availability" on public.mentor_availability;
create policy "Anyone authenticated can view mentor availability"
  on public.mentor_availability for select to authenticated using (true);

drop policy if exists "Mentors manage own availability" on public.mentor_availability;
create policy "Mentors manage own availability"
  on public.mentor_availability for insert to authenticated
  with check (auth.uid() = mentor_id);

drop policy if exists "Mentors update own availability" on public.mentor_availability;
create policy "Mentors update own availability"
  on public.mentor_availability for update to authenticated
  using (auth.uid() = mentor_id) with check (auth.uid() = mentor_id);

drop policy if exists "Mentors delete own availability" on public.mentor_availability;
create policy "Mentors delete own availability"
  on public.mentor_availability for delete to authenticated
  using (auth.uid() = mentor_id);

-- RLS: mentor_bookings
alter table public.mentor_bookings enable row level security;

drop policy if exists "Participants can view bookings" on public.mentor_bookings;
create policy "Participants can view bookings"
  on public.mentor_bookings for select to authenticated
  using (auth.uid() = mentor_id or auth.uid() = student_id);

drop policy if exists "Students can create bookings" on public.mentor_bookings;
create policy "Students can create bookings"
  on public.mentor_bookings for insert to authenticated
  with check (auth.uid() = student_id);

drop policy if exists "Participants can update bookings" on public.mentor_bookings;
create policy "Participants can update bookings"
  on public.mentor_bookings for update to authenticated
  using (auth.uid() = mentor_id or auth.uid() = student_id)
  with check (auth.uid() = mentor_id or auth.uid() = student_id);

-- RLS: office_hours
alter table public.office_hours enable row level security;

drop policy if exists "Anyone authenticated can view office hours" on public.office_hours;
create policy "Anyone authenticated can view office hours"
  on public.office_hours for select to authenticated using (true);

drop policy if exists "Mentors insert office hours" on public.office_hours;
create policy "Mentors insert office hours"
  on public.office_hours for insert to authenticated
  with check (auth.uid() = mentor_id);

drop policy if exists "Mentors update office hours" on public.office_hours;
create policy "Mentors update office hours"
  on public.office_hours for update to authenticated
  using (auth.uid() = mentor_id) with check (auth.uid() = mentor_id);

drop policy if exists "Mentors delete office hours" on public.office_hours;
create policy "Mentors delete office hours"
  on public.office_hours for delete to authenticated
  using (auth.uid() = mentor_id);
