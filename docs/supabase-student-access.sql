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

alter table public.app_users add column if not exists memory_opt_in boolean not null default false;
alter table public.app_users add column if not exists memory_opted_in_at timestamptz;
alter table public.app_users add column if not exists memory_consent_version text;

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  professor_user_id uuid not null references public.app_users (id) on delete restrict,
  slug text,
  title text not null,
  course_code text,
  term_label text,
  description text,
  meeting_pattern text,
  time_zone text not null default 'America/New_York',
  color_token text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.courses add column if not exists slug text;
alter table public.courses add column if not exists course_code text;
alter table public.courses add column if not exists term_label text;
alter table public.courses add column if not exists description text;
alter table public.courses add column if not exists meeting_pattern text;
alter table public.courses add column if not exists time_zone text;

update public.courses
set slug = coalesce(
  nullif(slug, ''),
  nullif(trim(both '-' from regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g')), ''),
  'course-' || left(id::text, 8)
)
where slug is null
   or btrim(slug) = '';

update public.courses
set time_zone = 'America/New_York'
where time_zone is null
   or btrim(time_zone) = '';

alter table public.courses
  alter column slug set not null;

alter table public.courses
  alter column time_zone set default 'America/New_York';

alter table public.courses
  alter column time_zone set not null;

create table if not exists public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  student_email citext not null,
  student_user_id uuid references public.app_users (id) on delete set null,
  status text not null check (status in ('invited', 'active', 'revoked')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  activated_at timestamptz
);

create table if not exists public.course_exams (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  slug text not null,
  title text not null,
  exam_kind text not null check (exam_kind in ('midterm', 'final', 'practical', 'other')),
  scheduled_for timestamptz,
  scope_summary text not null default '',
  focus_topics text[] not null default '{}',
  status text not null check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (course_id, slug)
);

create table if not exists public.student_course_onboarding (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.app_users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  exam_id uuid not null references public.course_exams (id) on delete cascade,
  status text not null check (status in ('not_started', 'in_progress', 'completed')),
  confidence_level integer check (confidence_level between 1 and 5),
  selected_focus_topics text[] not null default '{}',
  goal_text text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (student_user_id, course_id, exam_id)
);

create table if not exists public.student_session_summaries (
  id uuid primary key default gen_random_uuid(),
  external_session_id text not null unique,
  student_user_id uuid not null references public.app_users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  exam_id uuid references public.course_exams (id) on delete set null,
  title text not null,
  summary text not null default '',
  status text not null check (status in ('active', 'ended')),
  entry_point text not null default 'manual',
  focus_topic text,
  session_goal text not null default '',
  artifact_count integer not null default 0 check (artifact_count >= 0),
  event_count integer not null default 0 check (event_count >= 0),
  started_at timestamptz not null,
  ended_at timestamptz,
  last_activity_at timestamptz not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.student_concept_progress (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.app_users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  exam_id uuid references public.course_exams (id) on delete set null,
  concept_id text not null,
  concept_name text not null,
  highest_demonstrated_bloom_level text check (
    highest_demonstrated_bloom_level in ('remember', 'understand', 'apply', 'analyze')
  ),
  status text not null check (
    status in ('not_assessed', 'emerging', 'developing', 'confident', 'needs_review')
  ),
  confidence_signal numeric(4,3) not null default 0 check (
    confidence_signal >= 0 and confidence_signal <= 1
  ),
  misconception_summary text not null default '',
  evidence_count integer not null default 0 check (evidence_count >= 0),
  last_demonstrated_at timestamptz,
  evidence_summary text not null default '',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (student_user_id, course_id, concept_id)
);

create table if not exists public.student_session_objectives (
  id uuid primary key default gen_random_uuid(),
  external_session_id text not null references public.student_session_summaries (external_session_id) on delete cascade,
  student_user_id uuid not null references public.app_users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  exam_id uuid references public.course_exams (id) on delete set null,
  concept_id text not null,
  label text not null,
  bloom_target text not null check (bloom_target in ('remember', 'understand', 'apply', 'analyze')),
  success_criteria text not null default '',
  status text not null check (status in ('not_started', 'in_progress', 'completed', 'needs_review')),
  evidence_note text not null default '',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (external_session_id, concept_id, bloom_target)
);

create table if not exists public.student_session_learning_evidence (
  id uuid primary key default gen_random_uuid(),
  external_session_id text not null references public.student_session_summaries (external_session_id) on delete cascade,
  student_user_id uuid not null references public.app_users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  exam_id uuid references public.course_exams (id) on delete set null,
  concept_id text,
  source_type text not null check (source_type in ('transcript', 'quiz', 'worksheet', 'artifact', 'session_summary')),
  excerpt text not null default '',
  score numeric(5,4),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.student_profile_signal_ledger (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.app_users (id) on delete cascade,
  profile_key text not null,
  family text not null,
  summary text not null default '',
  trust_class text not null check (trust_class in ('authoritative_derived', 'behavioral_inference')),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  status text not null check (status in ('candidate', 'confirmed', 'stale', 'contradicted', 'superseded')),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  last_confirmed_at timestamptz,
  source_session_ids text[] not null default '{}',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.student_memory_sync_status (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.app_users (id) on delete cascade,
  custom_id text not null,
  memory_type text not null check (memory_type in ('study_episode', 'student_profile')),
  external_document_id text,
  sync_status text not null check (sync_status in ('synced', 'failed')),
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (student_user_id, custom_id)
);

alter table public.student_session_summaries add column if not exists exam_id uuid references public.course_exams (id) on delete set null;
alter table public.student_session_summaries add column if not exists entry_point text;
alter table public.student_session_summaries add column if not exists focus_topic text;
alter table public.student_session_summaries add column if not exists session_goal text;

update public.student_session_summaries
set entry_point = 'manual'
where entry_point is null
   or btrim(entry_point) = '';

update public.student_session_summaries
set session_goal = ''
where session_goal is null;

alter table public.student_session_summaries
  alter column entry_point set default 'manual';

alter table public.student_session_summaries
  alter column entry_point set not null;

alter table public.student_session_summaries
  alter column session_goal set default '';

alter table public.student_session_summaries
  alter column session_goal set not null;

alter table public.student_session_summaries
  drop constraint if exists student_session_summaries_entry_point_check;

alter table public.student_session_summaries
  add constraint student_session_summaries_entry_point_check
  check (entry_point in ('manual', 'course_home', 'exam_card', 'onboarding'));

alter table public.student_session_summaries
  drop constraint if exists student_session_summaries_exam_requires_course_check;

alter table public.student_session_summaries
  add constraint student_session_summaries_exam_requires_course_check
  check (exam_id is null or course_id is not null);

create unique index if not exists course_enrollments_course_email_uidx
  on public.course_enrollments (course_id, student_email);

create unique index if not exists courses_slug_uidx
  on public.courses (slug);

create index if not exists course_enrollments_student_email_status_idx
  on public.course_enrollments (student_email, status);

create index if not exists course_enrollments_student_user_id_status_idx
  on public.course_enrollments (student_user_id, status);

create index if not exists course_enrollments_course_id_idx
  on public.course_enrollments (course_id);

create index if not exists course_exams_course_status_scheduled_idx
  on public.course_exams (course_id, status, scheduled_for asc);

create index if not exists student_course_onboarding_student_course_idx
  on public.student_course_onboarding (student_user_id, course_id, exam_id);

create index if not exists student_session_summaries_student_activity_idx
  on public.student_session_summaries (student_user_id, last_activity_at desc);

create index if not exists student_session_summaries_student_course_activity_idx
  on public.student_session_summaries (student_user_id, course_id, last_activity_at desc);

create index if not exists student_session_summaries_exam_activity_idx
  on public.student_session_summaries (student_user_id, exam_id, last_activity_at desc);

create index if not exists student_concept_progress_student_course_idx
  on public.student_concept_progress (student_user_id, course_id, status, updated_at desc);

create index if not exists student_session_objectives_session_idx
  on public.student_session_objectives (external_session_id, student_user_id, updated_at desc);

create index if not exists student_session_learning_evidence_session_idx
  on public.student_session_learning_evidence (external_session_id, student_user_id, created_at desc);

create index if not exists student_profile_signal_ledger_student_idx
  on public.student_profile_signal_ledger (student_user_id, last_seen_at desc);

create index if not exists student_profile_signal_ledger_student_family_idx
  on public.student_profile_signal_ledger (student_user_id, family, last_seen_at desc);

create index if not exists student_memory_sync_status_student_idx
  on public.student_memory_sync_status (student_user_id, last_synced_at desc);

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

drop trigger if exists set_course_exams_updated_at on public.course_exams;
create trigger set_course_exams_updated_at
before update on public.course_exams
for each row
execute function public.set_updated_at();

drop trigger if exists set_student_course_onboarding_updated_at on public.student_course_onboarding;
create trigger set_student_course_onboarding_updated_at
before update on public.student_course_onboarding
for each row
execute function public.set_updated_at();

drop trigger if exists set_student_session_summaries_updated_at on public.student_session_summaries;
create trigger set_student_session_summaries_updated_at
before update on public.student_session_summaries
for each row
execute function public.set_updated_at();

drop trigger if exists set_student_concept_progress_updated_at on public.student_concept_progress;
create trigger set_student_concept_progress_updated_at
before update on public.student_concept_progress
for each row
execute function public.set_updated_at();

drop trigger if exists set_student_session_objectives_updated_at on public.student_session_objectives;
create trigger set_student_session_objectives_updated_at
before update on public.student_session_objectives
for each row
execute function public.set_updated_at();

drop trigger if exists set_student_profile_signal_ledger_updated_at on public.student_profile_signal_ledger;
create trigger set_student_profile_signal_ledger_updated_at
before update on public.student_profile_signal_ledger
for each row
execute function public.set_updated_at();

drop trigger if exists set_student_memory_sync_status_updated_at on public.student_memory_sync_status;
create trigger set_student_memory_sync_status_updated_at
before update on public.student_memory_sync_status
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

create or replace function public.student_has_active_course_access(candidate_course_id uuid)
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
    where enrollments.course_id = candidate_course_id
      and enrollments.student_user_id = auth.uid()
      and enrollments.status = 'active'
      and courses.is_active = true
  );
$$;

create or replace function public.student_has_active_exam_access(
  candidate_course_id uuid,
  candidate_exam_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.course_exams exams
    where exams.id = candidate_exam_id
      and exams.course_id = candidate_course_id
      and exams.status = 'active'
      and public.student_has_active_course_access(candidate_course_id)
  );
$$;

grant usage on schema public to anon, authenticated;

revoke all on function public.can_request_student_access(citext) from public;
revoke all on function public.student_has_active_course_access(uuid) from public;
revoke all on function public.student_has_active_exam_access(uuid, uuid) from public;

grant execute on function public.can_request_student_access(citext) to anon, authenticated;
grant execute on function public.student_has_active_course_access(uuid) to authenticated;
grant execute on function public.student_has_active_exam_access(uuid, uuid) to authenticated;

grant select on public.app_users to authenticated;
grant select on public.courses to authenticated;
grant select on public.course_enrollments to authenticated;
grant select on public.course_exams to authenticated;
grant select, insert, update on public.student_course_onboarding to authenticated;
grant select, insert, update, delete on public.student_session_summaries to authenticated;
grant select, insert, update on public.student_concept_progress to authenticated;
grant select, insert, update on public.student_session_objectives to authenticated;
grant select, insert, delete on public.student_session_learning_evidence to authenticated;
grant select, update on public.app_users to authenticated;
grant select, insert, update, delete on public.student_profile_signal_ledger to authenticated;
grant select, insert, update on public.student_memory_sync_status to authenticated;

alter table public.app_users enable row level security;
alter table public.courses enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.course_exams enable row level security;
alter table public.student_course_onboarding enable row level security;
alter table public.student_session_summaries enable row level security;
alter table public.student_concept_progress enable row level security;
alter table public.student_session_objectives enable row level security;
alter table public.student_session_learning_evidence enable row level security;
alter table public.student_profile_signal_ledger enable row level security;
alter table public.student_memory_sync_status enable row level security;

drop policy if exists "Students can read their own app user row" on public.app_users;
create policy "Students can read their own app user row"
on public.app_users
for select
to authenticated
using (id = auth.uid());

drop policy if exists "Students can update their own app user row" on public.app_users;
create policy "Students can update their own app user row"
on public.app_users
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Students can read active assigned courses" on public.courses;
create policy "Students can read active assigned courses"
on public.courses
for select
to authenticated
using (
  is_active
  and public.student_has_active_course_access(id)
);

drop policy if exists "Students can read their active enrollments" on public.course_enrollments;
create policy "Students can read their active enrollments"
on public.course_enrollments
for select
to authenticated
using (
  student_user_id = auth.uid()
  and status = 'active'
  and public.student_has_active_course_access(course_id)
);

drop policy if exists "Students can read active course exams" on public.course_exams;
create policy "Students can read active course exams"
on public.course_exams
for select
to authenticated
using (
  status = 'active'
  and public.student_has_active_course_access(course_id)
);

drop policy if exists "Students can read their onboarding rows" on public.student_course_onboarding;
create policy "Students can read their onboarding rows"
on public.student_course_onboarding
for select
to authenticated
using (
  student_user_id = auth.uid()
  and public.student_has_active_exam_access(course_id, exam_id)
);

drop policy if exists "Students can insert their onboarding rows" on public.student_course_onboarding;
create policy "Students can insert their onboarding rows"
on public.student_course_onboarding
for insert
to authenticated
with check (
  student_user_id = auth.uid()
  and public.student_has_active_exam_access(course_id, exam_id)
);

drop policy if exists "Students can update their onboarding rows" on public.student_course_onboarding;
create policy "Students can update their onboarding rows"
on public.student_course_onboarding
for update
to authenticated
using (student_user_id = auth.uid())
with check (
  student_user_id = auth.uid()
  and public.student_has_active_exam_access(course_id, exam_id)
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
    (course_id is null and exam_id is null)
    or (
      public.student_has_active_course_access(course_id)
      and (
        exam_id is null
        or public.student_has_active_exam_access(course_id, exam_id)
      )
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
    (course_id is null and exam_id is null)
    or (
      public.student_has_active_course_access(course_id)
      and (
        exam_id is null
        or public.student_has_active_exam_access(course_id, exam_id)
      )
    )
  )
);

drop policy if exists "Students can delete their own session summaries" on public.student_session_summaries;
create policy "Students can delete their own session summaries"
on public.student_session_summaries
for delete
to authenticated
using (student_user_id = auth.uid());

drop policy if exists "Students can read their own concept progress" on public.student_concept_progress;
create policy "Students can read their own concept progress"
on public.student_concept_progress
for select
to authenticated
using (
  student_user_id = auth.uid()
  and public.student_has_active_course_access(course_id)
);

drop policy if exists "Students can upsert their own concept progress" on public.student_concept_progress;
create policy "Students can upsert their own concept progress"
on public.student_concept_progress
for insert
to authenticated
with check (
  student_user_id = auth.uid()
  and public.student_has_active_course_access(course_id)
  and (
    exam_id is null
    or public.student_has_active_exam_access(course_id, exam_id)
  )
);

drop policy if exists "Students can update their own concept progress" on public.student_concept_progress;
create policy "Students can update their own concept progress"
on public.student_concept_progress
for update
to authenticated
using (student_user_id = auth.uid())
with check (
  student_user_id = auth.uid()
  and public.student_has_active_course_access(course_id)
  and (
    exam_id is null
    or public.student_has_active_exam_access(course_id, exam_id)
  )
);

drop policy if exists "Students can read their own session objectives" on public.student_session_objectives;
create policy "Students can read their own session objectives"
on public.student_session_objectives
for select
to authenticated
using (
  student_user_id = auth.uid()
  and public.student_has_active_course_access(course_id)
);

drop policy if exists "Students can insert their own session objectives" on public.student_session_objectives;
create policy "Students can insert their own session objectives"
on public.student_session_objectives
for insert
to authenticated
with check (
  student_user_id = auth.uid()
  and public.student_has_active_course_access(course_id)
  and (
    exam_id is null
    or public.student_has_active_exam_access(course_id, exam_id)
  )
);

drop policy if exists "Students can update their own session objectives" on public.student_session_objectives;
create policy "Students can update their own session objectives"
on public.student_session_objectives
for update
to authenticated
using (student_user_id = auth.uid())
with check (
  student_user_id = auth.uid()
  and public.student_has_active_course_access(course_id)
  and (
    exam_id is null
    or public.student_has_active_exam_access(course_id, exam_id)
  )
);

drop policy if exists "Students can read their own session evidence" on public.student_session_learning_evidence;
create policy "Students can read their own session evidence"
on public.student_session_learning_evidence
for select
to authenticated
using (
  student_user_id = auth.uid()
  and public.student_has_active_course_access(course_id)
);

drop policy if exists "Students can insert their own session evidence" on public.student_session_learning_evidence;
create policy "Students can insert their own session evidence"
on public.student_session_learning_evidence
for insert
to authenticated
with check (
  student_user_id = auth.uid()
  and public.student_has_active_course_access(course_id)
  and (
    exam_id is null
    or public.student_has_active_exam_access(course_id, exam_id)
  )
);

drop policy if exists "Students can delete their own session evidence" on public.student_session_learning_evidence;
create policy "Students can delete their own session evidence"
on public.student_session_learning_evidence
for delete
to authenticated
using (student_user_id = auth.uid());

drop policy if exists "Students can read their own profile signal ledger" on public.student_profile_signal_ledger;
create policy "Students can read their own profile signal ledger"
on public.student_profile_signal_ledger
for select
to authenticated
using (student_user_id = auth.uid());

drop policy if exists "Students can insert their own profile signal ledger" on public.student_profile_signal_ledger;
create policy "Students can insert their own profile signal ledger"
on public.student_profile_signal_ledger
for insert
to authenticated
with check (student_user_id = auth.uid());

drop policy if exists "Students can update their own profile signal ledger" on public.student_profile_signal_ledger;
create policy "Students can update their own profile signal ledger"
on public.student_profile_signal_ledger
for update
to authenticated
using (student_user_id = auth.uid())
with check (student_user_id = auth.uid());

drop policy if exists "Students can delete their own profile signal ledger" on public.student_profile_signal_ledger;
create policy "Students can delete their own profile signal ledger"
on public.student_profile_signal_ledger
for delete
to authenticated
using (student_user_id = auth.uid());

drop policy if exists "Students can read their own memory sync status" on public.student_memory_sync_status;
create policy "Students can read their own memory sync status"
on public.student_memory_sync_status
for select
to authenticated
using (student_user_id = auth.uid());

drop policy if exists "Students can insert their own memory sync status" on public.student_memory_sync_status;
create policy "Students can insert their own memory sync status"
on public.student_memory_sync_status
for insert
to authenticated
with check (student_user_id = auth.uid());

drop policy if exists "Students can update their own memory sync status" on public.student_memory_sync_status;
create policy "Students can update their own memory sync status"
on public.student_memory_sync_status
for update
to authenticated
using (student_user_id = auth.uid())
with check (student_user_id = auth.uid());
