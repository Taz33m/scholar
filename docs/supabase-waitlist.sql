create extension if not exists pgcrypto;

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists waitlist_entries_created_at_idx
  on public.waitlist_entries (created_at desc);
