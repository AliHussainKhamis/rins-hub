-- RINS Hub database
-- Run this once in Supabase: SQL Editor > New query > paste everything > Run.
-- It creates the tables, locks them so only listed users can read or write,
-- and adds your current products, locations and links.

-- 1. Who may use the hub -------------------------------------------------
create table if not exists public.hub_users (
  email text primary key,
  added_at timestamptz not null default now()
);

-- The account you sign in with. Add a row here for each future team member.
insert into public.hub_users (email) values ('rinstravelbh@gmail.com')
on conflict do nothing;

create or replace function public.is_hub_user()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.hub_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 2. Tables --------------------------------------------------------------
create table if not exists public.products (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  sku         text not null default '',
  line        text not null default '',
  price       numeric(12,3) check (price is null or price >= 0),
  reorder_at  integer not null default 10 check (reorder_at >= 0),
  unit        text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.locations (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  type        text not null default 'retail'
              check (type in ('warehouse','retail','online','b2b')),
  stand       boolean not null default false,
  note        text not null default '',
  created_at  timestamptz not null default now()
);

-- Every stock change is one row. Stock levels are calculated from this log.
create table if not exists public.movements (
  id          text primary key default gen_random_uuid()::text,
  type        text not null check (type in ('in','transfer','sale','return','adjust')),
  date        date not null default current_date,
  product_id  text not null references public.products(id) on delete restrict,
  from_loc    text references public.locations(id) on delete restrict,
  to_loc      text references public.locations(id) on delete restrict,
  qty         integer not null check (qty <> 0),
  price       numeric(12,3) check (price is null or price >= 0),
  note        text not null default '',
  created_at  timestamptz not null default now(),
  check (type = 'adjust' or qty > 0),
  check (type = 'in'     or from_loc is not null),
  check (type = 'adjust' or type = 'sale' or to_loc is not null)
);
create index if not exists movements_date_idx on public.movements (date);
create index if not exists movements_product_idx on public.movements (product_id);

create table if not exists public.links (
  id          text primary key default gen_random_uuid()::text,
  title       text not null,
  url         text not null,
  category    text not null default 'Other',
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- 3. Access rules: nobody can read or write unless signed in and listed ---
alter table public.hub_users enable row level security;
alter table public.products  enable row level security;
alter table public.locations enable row level security;
alter table public.movements enable row level security;
alter table public.links     enable row level security;

drop policy if exists "see own membership" on public.hub_users;
create policy "see own membership" on public.hub_users
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

do $$
declare t text;
begin
  foreach t in array array['products','locations','movements','links'] loop
    execute format('drop policy if exists "hub users only" on public.%I', t);
    execute format(
      'create policy "hub users only" on public.%I for all to authenticated
         using (public.is_hub_user()) with check (public.is_hub_user())', t);
  end loop;
end $$;

-- 4. Your current data (from the claude.ai version) ----------------------
insert into public.products (id, name, sku, line, price, reorder_at, unit) values
  ('pocket-bidet', 'Pocket Bidet', 'PN-2023-01R3', 'Pocket Bidet', null, 10, 'Pouch of 4 caps'),
  ('bath-towel', 'Disposable Bath Towel', '', 'Classic Fusion', null, 10, '70 x 140 cm, single sachet'),
  ('seat-cover', 'Disposable Toilet Seat Cover', '', 'Classic Fusion', null, 10, 'Single sachet')
on conflict (id) do nothing;

insert into public.locations (id, name, type, stand, note) values
  ('warehouse', 'RINS warehouse', 'warehouse', false, 'Rename to your real stock location'),
  ('day2day', 'Day2Day', 'retail', false, ''),
  ('airport', 'Airport', 'retail', false, '')
on conflict (id) do nothing;

insert into public.links (id, title, url, category, pinned) values
  ('instagram', 'Instagram', 'https://www.instagram.com/rins.travel/', 'Social', true),
  ('tiktok', 'TikTok', 'https://www.tiktok.com/@rins.travel', 'Social', true)
on conflict (id) do nothing;
