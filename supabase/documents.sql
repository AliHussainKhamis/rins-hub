-- RINS Hub: document storage and product barcodes
-- Run once in Supabase: SQL Editor > New query > paste everything > Run.
-- Safe to run again.

-- 1. Barcode field on products (used by the Products page)
alter table public.products add column if not exists barcode text not null default '';

-- 2. Document records (the file itself lives in Storage, step 3)
create table if not exists public.documents (
  id          text primary key default gen_random_uuid()::text,
  title       text not null,
  doc_type    text not null default 'Other',
  product_id  text references public.products(id) on delete set null,
  reference   text not null default '',
  notes       text not null default '',
  file_path   text not null unique,
  file_name   text not null default '',
  file_type   text not null default '',
  file_size   bigint not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.documents enable row level security;
drop policy if exists "hub users only" on public.documents;
create policy "hub users only" on public.documents for all to authenticated
  using (public.is_hub_user()) with check (public.is_hub_user());

-- 3. Private file storage. Nothing here is public: files open only for
--    signed-in hub users, through links that expire after an hour.
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "hub users read documents" on storage.objects;
drop policy if exists "hub users upload documents" on storage.objects;
drop policy if exists "hub users delete documents" on storage.objects;
create policy "hub users read documents" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.is_hub_user());
create policy "hub users upload documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.is_hub_user());
create policy "hub users delete documents" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.is_hub_user());

-- 4. The two Pocket Bidet colours from your Products update, added only if
--    a product with the same SKU isn't already there. Delete them in the hub
--    if you don't want them.
insert into public.products (id, name, sku, line, price, reorder_at, unit, barcode)
select v.* from (values
  ('pocket-bidet-blue-4',  'Pocket Bidet Blue',  'PB-BLUE-4',  'Pocket Bidet', 1.990, 10, 'Pack of 4 caps', 'PB-BLUE-4'),
  ('pocket-bidet-black-4', 'Pocket Bidet Black', 'PB-BLACK-4', 'Pocket Bidet', 1.990, 10, 'Pack of 4 caps', 'PB-BLACK-4')
) as v(id, name, sku, line, price, reorder_at, unit, barcode)
where not exists (select 1 from public.products p where p.sku = v.sku or p.id = v.id);

-- 5. Links to files kept elsewhere (OneDrive, SharePoint, Google Drive...)
--    A document is either an uploaded file (file_path) or a link (link_url).
alter table public.documents add column if not exists link_url text not null default '';
alter table public.documents alter column file_path drop not null;
alter table public.documents drop constraint if exists documents_file_or_link;
alter table public.documents add constraint documents_file_or_link
  check (coalesce(file_path, '') <> '' or link_url <> '');
