-- RINS Hub: location details (retailer, format, display) and the Alosra branches
-- Run once in Supabase: SQL Editor > New query > paste everything > Run.
-- Safe to run again.

-- 1. New location fields
alter table public.locations add column if not exists chain   text not null default '';
alter table public.locations add column if not exists format  text not null default '';
alter table public.locations add column if not exists display text not null default 'none';
alter table public.locations drop constraint if exists locations_display_check;
alter table public.locations add constraint locations_display_check check (display in ('stand','hanger','none'));
update public.locations set display = 'stand' where stand and display = 'none';

-- 2. The six Alosra supermarkets, each with a RINS stand.
--    Added only if a location with the same name isn't already there.
insert into public.locations (id, name, chain, type, format, display, stand, note)
select v.* from (values
  ('alosra-amwaj',     'Alosra Amwaj Islands',     'Alosra', 'retail', 'Supermarket', 'stand', true, ''),
  ('alosra-durrat',    'Alosra Durrat Al Bahrain', 'Alosra', 'retail', 'Supermarket', 'stand', true, ''),
  ('alosra-juffair',   'Alosra Juffair',           'Alosra', 'retail', 'Supermarket', 'stand', true, ''),
  ('alosra-riffa',     'Alosra Riffa',             'Alosra', 'retail', 'Supermarket', 'stand', true, ''),
  ('alosra-saar',      'Alosra Saar',              'Alosra', 'retail', 'Supermarket', 'stand', true, ''),
  ('alosra-janabiyah', 'Alosra Janabiyah',         'Alosra', 'retail', 'Supermarket', 'stand', true, '')
) as v(id, name, chain, type, format, display, stand, note)
where not exists (select 1 from public.locations l where l.id = v.id or lower(l.name) = lower(v.name));

-- 3. Existing retailers get their chain name so they group neatly
update public.locations set chain = 'Day2Day' where id = 'day2day' and chain = '';
update public.locations set chain = 'Airport' where id = 'airport' and chain = '';
