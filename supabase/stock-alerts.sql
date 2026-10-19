-- RINS Hub: stock levels per branch and WhatsApp alerts
-- Run once in Supabase: SQL Editor > New query > paste everything > Run.
-- Safe to run again.
--
-- How it works: every time stock moves (delivery, sale, return, correction),
-- the database recalculates stock at the affected branch. When a product drops
-- to or below its alert level there, one WhatsApp message is sent. It won't
-- repeat until the branch is refilled above the alert level and drops again.
-- Because this runs inside the database, alerts work no matter who records
-- the sale, including retailer staff in future.
--
-- Your phone number and WhatsApp key are NOT in this file (the code is public).
-- You set them separately with the short "alert_settings" update in the setup guide.

create extension if not exists pg_net;

-- 1. How much to keep at each branch, per product
create table if not exists public.stock_levels (
  location_id text not null references public.locations(id) on delete cascade,
  product_id  text not null references public.products(id) on delete cascade,
  keep_qty    integer not null default 0 check (keep_qty >= 0),
  alert_qty   integer not null default 0 check (alert_qty >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (location_id, product_id)
);
alter table public.stock_levels enable row level security;
drop policy if exists "hub users only" on public.stock_levels;
create policy "hub users only" on public.stock_levels for all to authenticated
  using (public.is_hub_user()) with check (public.is_hub_user());

-- 2. Alert settings: private. No access rule, so the website can never read
--    the key; only the functions below can.
create table if not exists public.alert_settings (
  id               integer primary key default 1 check (id = 1),
  whatsapp_phone   text not null default '',
  callmebot_apikey text not null default '',
  enabled          boolean not null default false
);
alter table public.alert_settings enable row level security;
insert into public.alert_settings (id) values (1) on conflict do nothing;

-- 3. Alert history (shown in the hub) and per-branch alert state (internal)
create table if not exists public.stock_alerts (
  id          bigserial primary key,
  location_id text references public.locations(id) on delete cascade,
  product_id  text references public.products(id) on delete cascade,
  qty         integer,
  alert_qty   integer,
  keep_qty    integer,
  message     text not null,
  status      text not null,
  created_at  timestamptz not null default now()
);
alter table public.stock_alerts enable row level security;
drop policy if exists "hub users read" on public.stock_alerts;
create policy "hub users read" on public.stock_alerts for select to authenticated
  using (public.is_hub_user());

create table if not exists public.stock_alert_state (
  location_id text not null references public.locations(id) on delete cascade,
  product_id  text not null references public.products(id) on delete cascade,
  is_low      boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (location_id, product_id)
);
alter table public.stock_alert_state enable row level security;

-- 4. Stock at one branch, calculated from the movement log (same rules as the website)
create or replace function public.stock_qty(p_product text, p_location text)
returns integer language sql stable
set search_path = public
as $$
  select coalesce(sum(
      case when type in ('in','transfer','return') and to_loc = p_location then qty else 0 end
    - case when type in ('transfer','return','sale') and from_loc = p_location then qty else 0 end
    + case when type = 'adjust' and from_loc = p_location then qty else 0 end
  ), 0)::integer
  from public.movements
  where product_id = p_product and (from_loc = p_location or to_loc = p_location);
$$;

-- 5. Send one WhatsApp message through CallMeBot (to the number in alert_settings)
create or replace function public.send_whatsapp(p_message text)
returns text language plpgsql security definer
set search_path = public
as $$
declare s public.alert_settings;
begin
  select * into s from public.alert_settings where id = 1;
  if s is null or not s.enabled or s.whatsapp_phone = '' or s.callmebot_apikey = '' then
    return 'not_configured';
  end if;
  perform net.http_get(
    url    := 'https://api.callmebot.com/whatsapp.php',
    params := jsonb_build_object('phone', s.whatsapp_phone, 'text', p_message, 'apikey', s.callmebot_apikey)
  );
  return 'sent';
end $$;
revoke all on function public.send_whatsapp(text) from public, anon, authenticated;

-- 6. Check one product at one branch and alert if it has just dropped to the alert level.
--    p_notify = false only records the state (used when levels are set, so setting
--    up many branches at once doesn't send a burst of messages).
drop function if exists public.check_stock_alert(text, text);
create or replace function public.check_stock_alert(p_location text, p_product text, p_notify boolean default true)
returns void language plpgsql security definer
set search_path = public
as $$
declare
  lvl public.stock_levels;
  q integer;
  was_low boolean;
  msg text;
  loc_name text;
  prod_name text;
begin
  if p_location is null or p_product is null then return; end if;
  select * into lvl from public.stock_levels where location_id = p_location and product_id = p_product;
  if lvl is null or lvl.alert_qty = 0 then
    delete from public.stock_alert_state where location_id = p_location and product_id = p_product;
    return;
  end if;
  q := public.stock_qty(p_product, p_location);
  select is_low into was_low from public.stock_alert_state where location_id = p_location and product_id = p_product;

  if q <= lvl.alert_qty then
    if coalesce(was_low, false) then return; end if;   -- already alerted, wait for a refill
    if not p_notify then
      insert into public.stock_alert_state (location_id, product_id, is_low, updated_at)
      values (p_location, p_product, true, now())
      on conflict (location_id, product_id) do update set is_low = true, updated_at = now();
      return;
    end if;
    select name into loc_name from public.locations where id = p_location;
    select name into prod_name from public.products where id = p_product;
    msg := 'RINS stock alert' || chr(10)
        || coalesce(loc_name, p_location) || ': ' || coalesce(prod_name, p_product) || chr(10)
        || q || ' left (alert at ' || lvl.alert_qty || ').'
        || case when lvl.keep_qty > q then chr(10) || 'Send ' || (lvl.keep_qty - q) || ' to refill to ' || lvl.keep_qty || '.' else '' end;
    insert into public.stock_alerts (location_id, product_id, qty, alert_qty, keep_qty, message, status)
    values (p_location, p_product, q, lvl.alert_qty, lvl.keep_qty, msg, public.send_whatsapp(msg));
    insert into public.stock_alert_state (location_id, product_id, is_low, updated_at)
    values (p_location, p_product, true, now())
    on conflict (location_id, product_id) do update set is_low = true, updated_at = now();
  else
    insert into public.stock_alert_state (location_id, product_id, is_low, updated_at)
    values (p_location, p_product, false, now())
    on conflict (location_id, product_id) do update set is_low = false, updated_at = now();
  end if;
end $$;
revoke all on function public.check_stock_alert(text, text, boolean) from public, anon, authenticated;

-- 7. Run the check whenever stock moves or levels change
create or replace function public.on_movement_check_alerts()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT','UPDATE') then
    perform public.check_stock_alert(new.from_loc, new.product_id);
    if new.to_loc is distinct from new.from_loc then perform public.check_stock_alert(new.to_loc, new.product_id); end if;
  end if;
  if tg_op in ('UPDATE','DELETE') then
    perform public.check_stock_alert(old.from_loc, old.product_id);
    if old.to_loc is distinct from old.from_loc then perform public.check_stock_alert(old.to_loc, old.product_id); end if;
  end if;
  return null;
end $$;
drop trigger if exists movements_check_alerts on public.movements;
create trigger movements_check_alerts after insert or update or delete on public.movements
  for each row execute function public.on_movement_check_alerts();

create or replace function public.on_level_check_alerts()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists stock_levels_touch on public.stock_levels;
create trigger stock_levels_touch before update on public.stock_levels
  for each row execute function public.on_level_check_alerts();

create or replace function public.after_level_check_alerts()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  perform public.check_stock_alert(new.location_id, new.product_id, false);
  return null;
end $$;
drop trigger if exists stock_levels_check_alerts on public.stock_levels;
create trigger stock_levels_check_alerts after insert or update on public.stock_levels
  for each row execute function public.after_level_check_alerts();

-- 8. Functions the website may call (signed-in hub users only)
create or replace function public.alert_status()
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare s public.alert_settings;
begin
  if not public.is_hub_user() then raise exception 'Not allowed'; end if;
  select * into s from public.alert_settings where id = 1;
  return jsonb_build_object(
    'enabled', coalesce(s.enabled, false),
    'configured', coalesce(s.whatsapp_phone <> '' and s.callmebot_apikey <> '', false),
    'phone_end', right(coalesce(s.whatsapp_phone, ''), 4));
end $$;

create or replace function public.send_test_whatsapp()
returns text language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_hub_user() then raise exception 'Not allowed'; end if;
  return public.send_whatsapp('RINS Hub test message: WhatsApp stock alerts are working.');
end $$;

drop function if exists public.check_all_stock_alerts();

revoke all on function public.alert_status() from public, anon;
revoke all on function public.send_test_whatsapp() from public, anon;
grant execute on function public.alert_status() to authenticated;
grant execute on function public.send_test_whatsapp() to authenticated;
