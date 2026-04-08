create extension if not exists pgcrypto;

create table if not exists public.student_concept_nodes (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.app_users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  concept_name text not null,
  mastery_score integer not null default 0 check (mastery_score >= 0 and mastery_score <= 100),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  last_studied_at timestamptz,
  evidence_summary text,
  position_x numeric(5,2),
  position_y numeric(5,2),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (student_user_id, course_id, concept_name)
);

create table if not exists public.student_concept_edges (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.app_users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  source_node_id uuid not null references public.student_concept_nodes(id) on delete cascade,
  target_node_id uuid not null references public.student_concept_nodes(id) on delete cascade,
  strength numeric(4,3) not null default 0.5,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (student_user_id, course_id, source_node_id, target_node_id)
);

create table if not exists public.student_session_graph_updates (
  external_session_id text primary key,
  student_user_id uuid not null references public.app_users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  source_title text not null,
  source_summary text not null,
  transcript_text text not null,
  artifact_summaries jsonb not null default '[]'::jsonb,
  ended_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists student_concept_nodes_student_course_idx
  on public.student_concept_nodes (student_user_id, course_id);

create index if not exists student_concept_nodes_last_studied_idx
  on public.student_concept_nodes (student_user_id, course_id, last_studied_at desc nulls last);

create index if not exists student_concept_edges_student_course_idx
  on public.student_concept_edges (student_user_id, course_id);

create index if not exists student_session_graph_updates_student_course_idx
  on public.student_session_graph_updates (student_user_id, course_id, ended_at desc);

alter table public.student_concept_nodes enable row level security;
alter table public.student_concept_edges enable row level security;
alter table public.student_session_graph_updates enable row level security;

drop policy if exists "Students can read their own concept nodes" on public.student_concept_nodes;
create policy "Students can read their own concept nodes"
  on public.student_concept_nodes
  for select
  to authenticated
  using (student_user_id = auth.uid());

drop policy if exists "Students can read their own concept edges" on public.student_concept_edges;
create policy "Students can read their own concept edges"
  on public.student_concept_edges
  for select
  to authenticated
  using (student_user_id = auth.uid());

drop policy if exists "Students can read their own graph updates" on public.student_session_graph_updates;
create policy "Students can read their own graph updates"
  on public.student_session_graph_updates
  for select
  to authenticated
  using (student_user_id = auth.uid());

drop trigger if exists student_concept_nodes_set_updated_at on public.student_concept_nodes;
create trigger student_concept_nodes_set_updated_at
before update on public.student_concept_nodes
for each row execute function public.set_updated_at();

drop trigger if exists student_concept_edges_set_updated_at on public.student_concept_edges;
create trigger student_concept_edges_set_updated_at
before update on public.student_concept_edges
for each row execute function public.set_updated_at();

drop trigger if exists student_session_graph_updates_set_updated_at on public.student_session_graph_updates;
create trigger student_session_graph_updates_set_updated_at
before update on public.student_session_graph_updates
for each row execute function public.set_updated_at();
