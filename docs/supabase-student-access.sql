create extension if not exists pgcrypto;
create extension if not exists citext;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create table if not exists public.app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null unique,
  role text not null check (role in ('student', 'professor')),
  display_name text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  professor_user_id uuid not null references public.app_users (id) on delete restrict,
  title text not null,
  color_token text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  student_email citext not null,
  student_user_id uuid references public.app_users (id) on delete set null,
  status text not null check (status in ('invited', 'active', 'revoked')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  activated_at timestamptz
);

create table if not exists public.student_session_summaries (
  id uuid primary key default gen_random_uuid(),
  external_session_id text not null unique,
  student_user_id uuid not null references public.app_users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  title text not null,
  summary text not null default '',
  status text not null check (status in ('active', 'ended')),
  artifact_count integer not null default 0 check (artifact_count >= 0),
  event_count integer not null default 0 check (event_count >= 0),
  started_at timestamptz not null,
  ended_at timestamptz,
  last_activity_at timestamptz not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists course_enrollments_course_email_uidx
  on public.course_enrollments (course_id, student_email);

create index if not exists course_enrollments_student_email_status_idx
  on public.course_enrollments (student_email, status);

create index if not exists course_enrollments_student_user_id_status_idx
  on public.course_enrollments (student_user_id, status);

create index if not exists course_enrollments_course_id_idx
  on public.course_enrollments (course_id);

create index if not exists student_session_summaries_student_activity_idx
  on public.student_session_summaries (student_user_id, last_activity_at desc);

create index if not exists student_session_summaries_student_course_activity_idx
  on public.student_session_summaries (student_user_id, course_id, last_activity_at desc);

create index if not exists courses_professor_user_id_idx
  on public.courses (professor_user_id);

drop trigger if exists set_app_users_updated_at on public.app_users;
create trigger set_app_users_updated_at
before update on public.app_users
for each row
execute function public.set_updated_at();

drop trigger if exists set_courses_updated_at on public.courses;
create trigger set_courses_updated_at
before update on public.courses
for each row
execute function public.set_updated_at();

drop trigger if exists set_student_session_summaries_updated_at on public.student_session_summaries;
create trigger set_student_session_summaries_updated_at
before update on public.student_session_summaries
for each row
execute function public.set_updated_at();

create or replace function public.can_request_student_access(candidate_email citext)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.course_enrollments enrollments
    join public.courses courses
      on courses.id = enrollments.course_id
    where enrollments.student_email = candidate_email
      and enrollments.status in ('invited', 'active')
      and courses.is_active = true
  );
$$;

grant usage on schema public to anon, authenticated;
revoke all on function public.can_request_student_access(citext) from public;
grant select on public.app_users to authenticated;
grant select on public.courses to authenticated;
grant select on public.course_enrollments to authenticated;
grant select, insert, update, delete on public.student_session_summaries to authenticated;
grant execute on function public.can_request_student_access(citext) to anon, authenticated;

alter table public.app_users enable row level security;
alter table public.courses enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.student_session_summaries enable row level security;

drop policy if exists "Students can read their own app user row" on public.app_users;
create policy "Students can read their own app user row"
on public.app_users
for select
to authenticated
using (id = auth.uid());

drop policy if exists "Students can read active assigned courses" on public.courses;
create policy "Students can read active assigned courses"
on public.courses
for select
to authenticated
using (
  is_active
  and exists (
    select 1
    from public.course_enrollments enrollments
    where enrollments.course_id = courses.id
      and enrollments.student_user_id = auth.uid()
      and enrollments.status = 'active'
  )
);

drop policy if exists "Students can read their active enrollments" on public.course_enrollments;
create policy "Students can read their active enrollments"
on public.course_enrollments
for select
to authenticated
using (
  student_user_id = auth.uid()
  and status = 'active'
  and exists (
    select 1
    from public.courses courses
    where courses.id = course_enrollments.course_id
      and courses.is_active = true
  )
);

drop policy if exists "Students can read their own session summaries" on public.student_session_summaries;
create policy "Students can read their own session summaries"
on public.student_session_summaries
for select
to authenticated
using (student_user_id = auth.uid());

drop policy if exists "Students can insert their own session summaries" on public.student_session_summaries;
create policy "Students can insert their own session summaries"
on public.student_session_summaries
for insert
to authenticated
with check (
  student_user_id = auth.uid()
  and (
    course_id is null
    or exists (
      select 1
      from public.course_enrollments enrollments
      join public.courses courses
        on courses.id = enrollments.course_id
      where enrollments.course_id = student_session_summaries.course_id
        and enrollments.student_user_id = auth.uid()
        and enrollments.status = 'active'
        and courses.is_active = true
    )
  )
);

drop policy if exists "Students can update their own session summaries" on public.student_session_summaries;
create policy "Students can update their own session summaries"
on public.student_session_summaries
for update
to authenticated
using (student_user_id = auth.uid())
with check (
  student_user_id = auth.uid()
  and (
    course_id is null
    or exists (
      select 1
      from public.course_enrollments enrollments
      join public.courses courses
        on courses.id = enrollments.course_id
      where enrollments.course_id = student_session_summaries.course_id
        and enrollments.student_user_id = auth.uid()
        and enrollments.status = 'active'
        and courses.is_active = true
    )
  )
);

drop policy if exists "Students can delete their own session summaries" on public.student_session_summaries;
create policy "Students can delete their own session summaries"
on public.student_session_summaries
for delete
to authenticated
using (student_user_id = auth.uid());
