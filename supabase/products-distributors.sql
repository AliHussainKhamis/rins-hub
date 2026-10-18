-- RINS Hub: product photos and the Distributors section
-- Run once in Supabase: SQL Editor > New query > paste everything > Run.
-- Safe to run again. Needs documents.sql to have been run first.

-- 1. Product photos (stored privately in the "documents" storage folder)
alter table public.products add column if not exists image_path text not null default '';

-- 2. Distributors
create table if not exists public.distributors (
  id            text primary key default gen_random_uuid()::text,
  name          text not null,
  country       text not null default '',
  city          text not null default '',
  contact_name  text not null default '',
  phone         text not null default '',
  email         text not null default '',
  status        text not null default 'Prospect'
                check (status in ('Prospect','Contacted','Negotiating','Active','Paused')),
  terms         text not null default '',
  last_contact  date,
  next_step     text not null default '',
  notes         text not null default '',
  created_at    timestamptz not null default now()
);
alter table public.distributors enable row level security;
drop policy if exists "hub users only" on public.distributors;
create policy "hub users only" on public.distributors for all to authenticated
  using (public.is_hub_user()) with check (public.is_hub_user());
