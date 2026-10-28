-- RINS Hub: Excel link
-- Lets the "RINS Hub" Excel workbook pull a copy of your data (Refresh) and
-- send new sales, stock moves and money entries (Send to hub).
-- Run once in Supabase: SQL Editor > New query > paste everything > Run.
-- Safe to run again. Run finance.sql first.
--
-- How it is protected: the workbook signs in with a private Excel key that you
-- create on the hub's "Excel link" page. Only a scrambled copy of each key is
-- stored here. Each key can be read-only or allowed to add entries, can include
-- or hide finance, and can be switched off at any time.

-- 1. Excel keys
create table if not exists public.excel_keys (
  id           text primary key default gen_random_uuid()::text,
  name         text not null,
  key_hash     text not null unique,
  key_hint     text not null default '',
  can_write    boolean not null default false,
  can_finance  boolean not null default false,
  revoked      boolean not null default false,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.excel_keys enable row level security;
drop policy if exists "owner reads keys" on public.excel_keys;
create policy "owner reads keys" on public.excel_keys for select to authenticated using (public.is_owner());
drop policy if exists "owner switches keys" on public.excel_keys;
create policy "owner switches keys" on public.excel_keys for update to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner deletes keys" on public.excel_keys;
create policy "owner deletes keys" on public.excel_keys for delete to authenticated using (public.is_owner());

-- Rows already received from Excel (so pressing Send twice never saves twice)
create table if not exists public.excel_refs (
  ref        text primary key,
  kind       text not null,
  record_id  text,
  key_id     text,
  created_at timestamptz not null default now()
);
alter table public.excel_refs enable row level security;

-- 2. Create a key (owner only). The key is shown once; only its hash is kept.
create or replace function public.create_excel_key(p_name text, p_can_write boolean, p_can_finance boolean)
returns text language plpgsql security definer
set search_path = public, extensions
as $$
declare k text;
begin
  if not public.is_owner() then raise exception 'Only the owner can create Excel keys'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the key a name, such as the person who will use it'; end if;
  k := 'rins_' || encode(gen_random_bytes(24), 'hex');
  insert into public.excel_keys (name, key_hash, key_hint, can_write, can_finance)
  values (trim(p_name), encode(digest(k, 'sha256'), 'hex'), right(k, 4), coalesce(p_can_write, false), coalesce(p_can_finance, false));
  return k;
end $$;
revoke all on function public.create_excel_key(text, boolean, boolean) from public, anon;
grant execute on function public.create_excel_key(text, boolean, boolean) to authenticated;

-- 3. Check the key the workbook sends in the "x-hub-key" header
create or replace function public.excel_auth(p_write boolean)
returns public.excel_keys language plpgsql security definer
set search_path = public, extensions
as $$
declare k text; r public.excel_keys;
begin
  k := trim(coalesce(current_setting('request.headers', true)::json ->> 'x-hub-key', ''));
  if k = '' then raise exception 'No Excel key. Paste your key on the Start sheet.'; end if;
  select * into r from public.excel_keys where key_hash = encode(digest(k, 'sha256'), 'hex');
  if r.id is null then raise exception 'This Excel key is not valid. Check it on the Start sheet.'; end if;
  if r.revoked then raise exception 'This Excel key has been switched off on the hub.'; end if;
  if p_write and not r.can_write then raise exception 'This Excel key is read-only. It can refresh but not send entries.'; end if;
  update public.excel_keys set last_used_at = now() where id = r.id;
  return r;
end $$;
revoke all on function public.excel_auth(boolean) from public, anon, authenticated;

-- Answers go back to Excel as plain text (a PostgREST "media type" domain)
do $$ begin
  if not exists (select 1 from pg_type where typname = 'text/plain' and typnamespace = 'public'::regnamespace) then
    create domain public."text/plain" as text;
  end if;
end $$;

-- Text helpers: one tab-separated value, safe to put in a cell
create or replace function public.xl(v anyelement) returns text language sql immutable
as $$ select coalesce(regexp_replace(v::text, '[\t\r\n]+', ' ', 'g'), '') $$;

create or replace function public.xl_find_product(p text) returns text language sql stable
set search_path = public
as $$ select id from public.products where lower(trim(name)) = lower(trim(p)) or (sku <> '' and lower(sku) = lower(trim(p))) order by (lower(trim(name)) = lower(trim(p))) desc limit 1 $$;
create or replace function public.xl_find_location(p text) returns text language sql stable
set search_path = public
as $$ select id from public.locations where lower(trim(name)) = lower(trim(p)) limit 1 $$;
revoke all on function public.xl_find_product(text) from public, anon, authenticated;
revoke all on function public.xl_find_location(text) from public, anon, authenticated;

-- 4. Refresh: everything the workbook shows, as tab-separated tables.
--    Each table: "#TABLE name", a header line, a type line (t text, n number, d date), then rows.
drop function if exists public.excel_feed();
create or replace function public.excel_feed()
returns public."text/plain" language plpgsql security definer
set search_path = public, extensions
as $$
declare
  r public.excel_keys;
  fin boolean;
  out text := '';
  t text;
begin
  r := public.excel_auth(false);
  fin := r.can_finance;

  out := out || '#TABLE Info' || chr(10) || 'Item' || chr(9) || 'Value' || chr(10) || 't' || chr(9) || 't' || chr(10)
    || 'Refreshed' || chr(9) || to_char(now() at time zone 'Asia/Bahrain', 'YYYY-MM-DD HH24:MI') || ' (Bahrain time)' || chr(10)
    || 'Key' || chr(9) || xl(r.name) || chr(10)
    || 'Access' || chr(9) || case when r.can_write then 'Refresh and send entries' else 'Refresh only' end
       || case when fin then ', with finance' else ', no finance' end || chr(10);

  -- Products
  select string_agg(xl(name) || chr(9) || xl(sku) || chr(9) || xl(line) || chr(9) || xl(unit) || chr(9) || xl(barcode) || chr(9) || xl(price)
         || case when fin then chr(9) || xl(unit_cost) || chr(9) || xl(case when price > 0 and unit_cost is not null then round((price - unit_cost) / price * 100, 1) end) else '' end
         || chr(9) || xl(id), chr(10) order by name)
    into t from public.products;
  out := out || '#TABLE Products' || chr(10)
    || 'Name' || chr(9) || 'SKU' || chr(9) || 'Line' || chr(9) || 'Pack' || chr(9) || 'Barcode' || chr(9) || 'Shelf price'
    || case when fin then chr(9) || 'Cost per pack' || chr(9) || 'Margin at shelf %' else '' end || chr(9) || 'ID' || chr(10)
    || 't' || chr(9) || 't' || chr(9) || 't' || chr(9) || 't' || chr(9) || 't' || chr(9) || 'n'
    || case when fin then chr(9) || 'n' || chr(9) || 'n' else '' end || chr(9) || 't' || chr(10)
    || coalesce(t || chr(10), '');

  -- Branches
  select string_agg(xl(name) || chr(9) || xl(chain) || chr(9) || xl(type) || chr(9) || xl(format) || chr(9) || xl(display)
         || case when fin then chr(9) || xl(margin_pct) || chr(9) || xl(payment_days) else '' end
         || chr(9) || xl(note) || chr(9) || xl(id), chr(10) order by chain, name)
    into t from public.locations;
  out := out || '#TABLE Branches' || chr(10)
    || 'Name' || chr(9) || 'Chain' || chr(9) || 'Type' || chr(9) || 'Format' || chr(9) || 'Display'
    || case when fin then chr(9) || 'Retailer margin %' || chr(9) || 'Pays after (days)' else '' end || chr(9) || 'Note' || chr(9) || 'ID' || chr(10)
    || 't' || chr(9) || 't' || chr(9) || 't' || chr(9) || 't' || chr(9) || 't'
    || case when fin then chr(9) || 'n' || chr(9) || 'n' else '' end || chr(9) || 't' || chr(9) || 't' || chr(10)
    || coalesce(t || chr(10), '');

  -- Stock by branch (from the movement log, same rules as the website)
  with q as (
    select product_id, loc, sum(d)::integer as qty from (
      select product_id, to_loc as loc, qty as d from public.movements where type in ('in','transfer','return') and to_loc is not null
      union all select product_id, from_loc, -qty from public.movements where type in ('transfer','return','sale') and from_loc is not null
      union all select product_id, from_loc, qty from public.movements where type = 'adjust' and from_loc is not null
    ) x group by product_id, loc
  ), s as (
    select coalesce(q.product_id, lv.product_id) as product_id, coalesce(q.loc, lv.location_id) as loc,
           coalesce(q.qty, 0) as qty, coalesce(lv.keep_qty, 0) as keep_qty, coalesce(lv.alert_qty, 0) as alert_qty
    from q full join public.stock_levels lv on lv.product_id = q.product_id and lv.location_id = q.loc
  )
  select string_agg(xl(p.name) || chr(9) || xl(l.name) || chr(9) || xl(l.chain) || chr(9) || xl(l.type) || chr(9) || s.qty || chr(9)
         || case when s.keep_qty > 0 then s.keep_qty::text else '' end || chr(9) || case when s.alert_qty > 0 then s.alert_qty::text else '' end || chr(9)
         || case when s.keep_qty = 0 and s.alert_qty = 0 then ''
                 when s.alert_qty > 0 and s.qty <= s.alert_qty then case when s.qty <= 0 then 'Empty' else 'Alert' end
                 when s.keep_qty > 0 and s.qty < s.keep_qty then 'Below target' else 'OK' end
         || chr(9) || case when s.keep_qty > s.qty then (s.keep_qty - s.qty)::text else '' end,
         chr(10) order by l.type <> 'warehouse', l.chain, l.name, p.name)
    into t from s join public.products p on p.id = s.product_id join public.locations l on l.id = s.loc
   where s.qty <> 0 or s.keep_qty > 0 or s.alert_qty > 0;
  out := out || '#TABLE Stock' || chr(10)
    || 'Product' || chr(9) || 'Branch' || chr(9) || 'Chain' || chr(9) || 'Type' || chr(9) || 'Qty' || chr(9) || 'Keep' || chr(9) || 'Alert at' || chr(9) || 'Status' || chr(9) || 'To send' || chr(10)
    || 't' || chr(9) || 't' || chr(9) || 't' || chr(9) || 't' || chr(9) || 'n' || chr(9) || 'n' || chr(9) || 'n' || chr(9) || 't' || chr(9) || 'n' || chr(10)
    || coalesce(t || chr(10), '');

  -- Stock moves (the full log)
  select string_agg(xl(m.date) || chr(9) || xl(case m.type when 'in' then 'Stock in' when 'transfer' then 'Transfer' when 'sale' then 'Sale' when 'return' then 'Return' else 'Adjustment' end)
         || chr(9) || xl(p.name) || chr(9) || xl(lf.name) || chr(9) || xl(lt.name) || chr(9) || m.qty || chr(9) || xl(m.price) || chr(9) || xl(m.note) || chr(9) || xl(m.id),
         chr(10) order by m.date, m.created_at)
    into t from public.movements m join public.products p on p.id = m.product_id
    left join public.locations lf on lf.id = m.from_loc left join public.locations lt on lt.id = m.to_loc;
  out := out || '#TABLE Stock moves' || chr(10)
    || 'Date' || chr(9) || 'Type' || chr(9) || 'Product' || chr(9) || 'From' || chr(9) || 'To' || chr(9) || 'Qty' || chr(9) || 'Price' || chr(9) || 'Note' || chr(9) || 'ID' || chr(10)
    || 'd' || chr(9) || 't' || chr(9) || 't' || chr(9) || 't' || chr(9) || 't' || chr(9) || 'n' || chr(9) || 'n' || chr(9) || 't' || chr(9) || 't' || chr(10)
    || coalesce(t || chr(10), '');

  -- Sales, with retailer margin and cost when finance is allowed
  select string_agg(xl(m.date) || chr(9) || to_char(m.date, 'YYYY-MM') || chr(9) || xl(l.name) || chr(9) || xl(l.chain) || chr(9) || xl(p.name) || chr(9) || xl(p.line) || chr(9)
         || m.qty || chr(9) || xl(m.price) || chr(9) || xl(round(m.qty * coalesce(m.price, 0), 3))
         || case when fin then chr(9) || xl(round(m.qty * coalesce(m.price, 0) * coalesce(l.margin_pct, 0) / 100, 3))
                 || chr(9) || xl(round(m.qty * coalesce(m.price, 0) * (1 - coalesce(l.margin_pct, 0) / 100), 3))
                 || chr(9) || xl(round(m.qty * p.unit_cost, 3))
                 || chr(9) || xl(round(m.qty * coalesce(m.price, 0) * (1 - coalesce(l.margin_pct, 0) / 100) - m.qty * coalesce(p.unit_cost, 0), 3))
            else '' end
         || chr(9) || xl(m.note) || chr(9) || xl(m.id), chr(10) order by m.date, m.created_at)
    into t from public.movements m join public.products p on p.id = m.product_id left join public.locations l on l.id = m.from_loc
   where m.type = 'sale';
  out := out || '#TABLE Sales' || chr(10)
    || 'Date' || chr(9) || 'Month' || chr(9) || 'Branch' || chr(9) || 'Chain' || chr(9) || 'Product' || chr(9) || 'Line' || chr(9) || 'Qty' || chr(9) || 'Shelf price' || chr(9) || 'Shelf sales'
    || case when fin then chr(9) || 'Retailer margin' || chr(9) || 'Net sales' || chr(9) || 'Cost of packs' || chr(9) || 'Gross profit' else '' end
    || chr(9) || 'Note' || chr(9) || 'ID' || chr(10)
    || 'd' || chr(9) || 't' || chr(9) || 't' || chr(9) || 't' || chr(9) || 't' || chr(9) || 't' || chr(9) || 'n' || chr(9) || 'n' || chr(9) || 'n'
    || case when fin then chr(9) || 'n' || chr(9) || 'n' || chr(9) || 'n' || chr(9) || 'n' else '' end || chr(9) || 't' || chr(9) || 't' || chr(10)
    || coalesce(t || chr(10), '');

  if fin then
    -- Transactions
    select string_agg(xl(x.date) || chr(9) || to_char(x.date, 'YYYY-MM') || chr(9)
           || case x.type when 'in' then 'Money in' when 'out' then 'Money out' else 'Transfer' end || chr(9)
           || xl(a.name) || chr(9) || xl(ta.name) || chr(9) || xl(c.name) || chr(9)
           || xl(case c.kind when 'income' then 'Income' when 'expense' then 'Expense' when 'stock' then 'Stock purchase' when 'asset' then 'Equipment'
                 when 'settlement' then 'Retailer payment' when 'capital' then 'Owner capital' when 'loan' then 'Loan' when 'drawings' then 'Owner drawings' end) || chr(9)
           || xl(x.amount) || chr(9) || case x.type when 'in' then x.amount when 'out' then -x.amount else 0 end || chr(9)
           || xl(x.counterparty) || chr(9) || xl(l.name) || chr(9) || xl(x.description) || chr(9) || xl(x.reference) || chr(9) || xl(x.doc_link) || chr(9) || xl(x.id),
           chr(10) order by x.date, x.created_at)
      into t from public.fin_transactions x join public.fin_accounts a on a.id = x.account_id
      left join public.fin_accounts ta on ta.id = x.to_account_id left join public.fin_categories c on c.id = x.category_id
      left join public.locations l on l.id = x.location_id;
    out := out || '#TABLE Transactions' || chr(10)
      || 'Date' || chr(9) || 'Month' || chr(9) || 'Type' || chr(9) || 'Account' || chr(9) || 'To account' || chr(9) || 'Category' || chr(9) || 'Kind' || chr(9)
      || 'Amount' || chr(9) || 'Cash effect' || chr(9) || 'Paid to / from' || chr(9) || 'Branch' || chr(9) || 'Description' || chr(9) || 'Reference' || chr(9) || 'Receipt link' || chr(9) || 'ID' || chr(10)
      || 'd' || chr(9) || 't' || chr(9) || 't' || chr(9) || 't' || chr(9) || 't' || chr(9) || 't' || chr(9) || 't' || chr(9)
      || 'n' || chr(9) || 'n' || chr(9) || 't' || chr(9) || 't' || chr(9) || 't' || chr(9) || 't' || chr(9) || 't' || chr(9) || 't' || chr(10)
      || coalesce(t || chr(10), '');

    -- Accounts
    select string_agg(xl(a.name) || chr(9) || xl(a.kind) || chr(9) || xl(a.opening_balance) || chr(9) || xl(coalesce(i.v, 0)) || chr(9) || xl(coalesce(o.v, 0)) || chr(9)
           || xl(a.opening_balance + coalesce(i.v, 0) - coalesce(o.v, 0)), chr(10) order by a.created_at)
      into t from public.fin_accounts a
      left join lateral (select sum(amount) v from public.fin_transactions where (type = 'in' and account_id = a.id) or (type = 'transfer' and to_account_id = a.id)) i on true
      left join lateral (select sum(amount) v from public.fin_transactions where (type = 'out' and account_id = a.id) or (type = 'transfer' and account_id = a.id)) o on true
     where not a.archived;
    out := out || '#TABLE Accounts' || chr(10)
      || 'Account' || chr(9) || 'Kind' || chr(9) || 'Opening balance' || chr(9) || 'Money in' || chr(9) || 'Money out' || chr(9) || 'Balance now' || chr(10)
      || 't' || chr(9) || 't' || chr(9) || 'n' || chr(9) || 'n' || chr(9) || 'n' || chr(9) || 'n' || chr(10)
      || coalesce(t || chr(10), '');

    -- Profit and loss by month (same rules as the Statements page)
    with s as (
      select to_char(m.date, 'YYYY-MM') mon, sum(m.qty * coalesce(m.price, 0)) gross,
             sum(m.qty * coalesce(m.price, 0) * coalesce(l.margin_pct, 0) / 100) share, sum(m.qty * coalesce(p.unit_cost, 0)) cogs
        from public.movements m join public.products p on p.id = m.product_id left join public.locations l on l.id = m.from_loc
       where m.type = 'sale' group by 1
    ), f as (
      select to_char(x.date, 'YYYY-MM') mon, sum(case when c.kind = 'income' then x.amount else 0 end) inc, sum(case when c.kind = 'expense' then x.amount else 0 end) exp
        from public.fin_transactions x join public.fin_categories c on c.id = x.category_id where x.type <> 'transfer' group by 1
    ), mm as (select mon from s union select mon from f)
    select string_agg(mm.mon || chr(9) || xl(round(coalesce(s.gross, 0), 3)) || chr(9) || xl(round(coalesce(s.share, 0), 3)) || chr(9)
           || xl(round(coalesce(s.gross, 0) - coalesce(s.share, 0), 3)) || chr(9) || xl(round(coalesce(f.inc, 0), 3)) || chr(9)
           || xl(round(coalesce(s.gross, 0) - coalesce(s.share, 0) + coalesce(f.inc, 0), 3)) || chr(9) || xl(round(coalesce(s.cogs, 0), 3)) || chr(9)
           || xl(round(coalesce(s.gross, 0) - coalesce(s.share, 0) + coalesce(f.inc, 0) - coalesce(s.cogs, 0), 3)) || chr(9) || xl(round(coalesce(f.exp, 0), 3)) || chr(9)
           || xl(round(coalesce(s.gross, 0) - coalesce(s.share, 0) + coalesce(f.inc, 0) - coalesce(s.cogs, 0) - coalesce(f.exp, 0), 3)),
           chr(10) order by mm.mon)
      into t from mm left join s on s.mon = mm.mon left join f on f.mon = mm.mon;
    out := out || '#TABLE Profit and loss' || chr(10)
      || 'Month' || chr(9) || 'Shelf sales' || chr(9) || 'Retailer margin' || chr(9) || 'Net product sales' || chr(9) || 'Other income' || chr(9) || 'Total revenue' || chr(9)
      || 'Cost of packs sold' || chr(9) || 'Gross profit' || chr(9) || 'Operating expenses' || chr(9) || 'Net profit' || chr(10)
      || 't' || chr(9) || 'n' || chr(9) || 'n' || chr(9) || 'n' || chr(9) || 'n' || chr(9) || 'n' || chr(9) || 'n' || chr(9) || 'n' || chr(9) || 'n' || chr(9) || 'n' || chr(10)
      || coalesce(t || chr(10), '');

    -- Categories (for the entry sheet's drop-down)
    select string_agg(xl(name) || chr(9) || case direction when 'in' then 'Money in' else 'Money out' end || chr(9) || xl(kind), chr(10) order by direction desc, sort)
      into t from public.fin_categories where not archived;
    out := out || '#TABLE Categories' || chr(10) || 'Category' || chr(9) || 'Used for' || chr(9) || 'Kind' || chr(10) || 't' || chr(9) || 't' || chr(9) || 't' || chr(10)
      || coalesce(t || chr(10), '');
  end if;

  return out;
end $$;
revoke all on function public.excel_feed() from public;
grant execute on function public.excel_feed() to anon, authenticated;

-- 5. Send to hub: new entries from the workbook's entry sheets.
--    Sections "#SALES", "#MOVES", "#MONEY"; each row starts with the row's reference.
--    Returns one line per row: reference, OK or ERR, message.
drop function if exists public.excel_send(text);
create or replace function public.excel_send(text)
returns public."text/plain" language plpgsql security definer
set search_path = public, extensions
as $$
declare
  r public.excel_keys;
  sect text := '';
  ln text;
  f text[];
  res text := '';
  v_ref text;
  v_date date; v_qty integer; v_amt numeric; v_type text;
  v_prod text; v_from text; v_to text; v_acc text; v_to_acc text; v_cat public.fin_categories; v_loc text; v_price numeric;
  new_id text;
  done_ref text;
begin
  r := public.excel_auth(true);
  foreach ln in array regexp_split_to_array(coalesce($1, ''), E'\n') loop
    ln := rtrim(ln, E'\r');
    if ln = '' then continue; end if;
    if left(ln, 1) = '#' then sect := upper(trim(ln)); continue; end if;
    f := string_to_array(ln, E'\t');
    v_ref := trim(coalesce(f[1], ''));
    if v_ref = '' then continue; end if;
    select record_id into done_ref from public.excel_refs where excel_refs.ref = v_ref;
    if found then res := res || v_ref || E'\tOK\tAlready saved' || E'\n'; continue; end if;
    begin
      if sect = '#SALES' then
        -- ref, date, branch, product, qty, note
        begin v_date := f[2]::date; exception when others then raise exception 'Date is missing or not a date'; end;
        v_from := xl_find_location(f[3]); if v_from is null then raise exception 'Branch "%" is not on the hub', f[3]; end if;
        v_prod := xl_find_product(f[4]); if v_prod is null then raise exception 'Product "%" is not on the hub', f[4]; end if;
        begin v_qty := f[5]::numeric::integer; exception when others then raise exception 'Qty must be a whole number'; end;
        if v_qty is null or v_qty <= 0 then raise exception 'Qty must be more than 0'; end if;
        select price into v_price from public.products where id = v_prod;
        if v_price is null then raise exception 'This product has no shelf price. Set it on Products first.'; end if;
        insert into public.movements (type, date, product_id, from_loc, qty, price, note)
        values ('sale', v_date, v_prod, v_from, v_qty, v_price, coalesce(trim(f[6]), '')) returning id into new_id;
        insert into public.excel_refs (ref, kind, record_id, key_id) values (v_ref, 'sale', new_id, r.id);
        res := res || v_ref || E'\tOK\tSaved: ' || v_qty || ' × ' || to_char(v_price, 'FM9990.000') || ' BHD' || E'\n';

      elsif sect = '#MOVES' then
        -- ref, date, type, product, from, to, qty, note
        begin v_date := f[2]::date; exception when others then raise exception 'Date is missing or not a date'; end;
        v_type := case lower(trim(coalesce(f[3], ''))) when 'stock in' then 'in' when 'in' then 'in' when 'transfer' then 'transfer' when 'delivery' then 'transfer'
                  when 'return' then 'return' when 'adjustment' then 'adjust' when 'adjust' then 'adjust' when 'correction' then 'adjust' end;
        if v_type is null then raise exception 'Type must be Stock in, Transfer, Return or Adjustment'; end if;
        v_prod := xl_find_product(f[4]); if v_prod is null then raise exception 'Product "%" is not on the hub', f[4]; end if;
        v_from := nullif(trim(coalesce(f[5], '')), ''); v_to := nullif(trim(coalesce(f[6], '')), '');
        if v_from is not null then v_from := xl_find_location(v_from); if v_from is null then raise exception 'From "%" is not on the hub', f[5]; end if; end if;
        if v_to is not null then v_to := xl_find_location(v_to); if v_to is null then raise exception 'To "%" is not on the hub', f[6]; end if; end if;
        begin v_qty := f[7]::numeric::integer; exception when others then raise exception 'Qty must be a whole number'; end;
        if v_qty is null or v_qty = 0 then raise exception 'Enter a quantity'; end if;
        if v_type <> 'adjust' and v_qty < 0 then raise exception 'Use a positive quantity. Only adjustments can be negative.'; end if;
        if v_type = 'in' then v_from := null; if v_to is null then raise exception 'Stock in needs a To location'; end if; end if;
        if v_type = 'adjust' then v_to := null; if v_from is null then raise exception 'An adjustment needs a From location (where the count was corrected)'; end if; end if;
        if v_type in ('transfer', 'return') then
          if v_from is null or v_to is null then raise exception 'A % needs both From and To', lower(f[3]); end if;
          if v_from = v_to then raise exception 'From and To are the same location'; end if;
        end if;
        insert into public.movements (type, date, product_id, from_loc, to_loc, qty, note)
        values (v_type, v_date, v_prod, v_from, v_to, v_qty, coalesce(trim(f[8]), '')) returning id into new_id;
        insert into public.excel_refs (ref, kind, record_id, key_id) values (v_ref, 'move', new_id, r.id);
        res := res || v_ref || E'\tOK\tSaved' || E'\n';

      elsif sect = '#MONEY' then
        -- ref, date, type, account, to account, category, amount, who, branch, description, reference, link
        if not r.can_finance then raise exception 'This Excel key cannot add finance entries'; end if;
        begin v_date := f[2]::date; exception when others then raise exception 'Date is missing or not a date'; end;
        v_type := case lower(trim(coalesce(f[3], ''))) when 'money in' then 'in' when 'in' then 'in' when 'money out' then 'out' when 'out' then 'out' when 'transfer' then 'transfer' end;
        if v_type is null then raise exception 'Type must be Money in, Money out or Transfer'; end if;
        select id into v_acc from public.fin_accounts where lower(name) = lower(trim(coalesce(f[4], ''))) limit 1;
        if v_acc is null then raise exception 'Account "%" is not on the hub', f[4]; end if;
        begin v_amt := round(f[7]::numeric, 3); exception when others then raise exception 'Amount must be a number'; end;
        if v_amt is null or v_amt <= 0 then raise exception 'Amount must be more than 0'; end if;
        v_to_acc := null; v_cat := null; v_loc := null;
        if v_type = 'transfer' then
          select id into v_to_acc from public.fin_accounts where lower(name) = lower(trim(coalesce(f[5], ''))) limit 1;
          if v_to_acc is null then raise exception 'To account "%" is not on the hub', f[5]; end if;
          if v_to_acc = v_acc then raise exception 'From and To are the same account'; end if;
        else
          select * into v_cat from public.fin_categories where lower(name) = lower(trim(coalesce(f[6], ''))) limit 1;
          if v_cat.id is null then raise exception 'Category "%" is not on the hub', f[6]; end if;
          if v_cat.direction <> v_type then raise exception '"%" is a % category', v_cat.name, case v_cat.direction when 'in' then 'money in' else 'money out' end; end if;
          if nullif(trim(coalesce(f[9], '')), '') is not null then
            v_loc := xl_find_location(f[9]); if v_loc is null then raise exception 'Branch "%" is not on the hub', f[9]; end if;
          end if;
        end if;
        if nullif(trim(coalesce(f[12], '')), '') is not null and trim(f[12]) !~* '^https://' then raise exception 'The receipt link must start with https://'; end if;
        insert into public.fin_transactions (date, type, account_id, to_account_id, category_id, amount, counterparty, description, reference, doc_link, location_id)
        values (v_date, v_type, v_acc, v_to_acc, v_cat.id, v_amt, case when v_type = 'transfer' then '' else coalesce(trim(f[8]), '') end,
                coalesce(trim(f[10]), ''), coalesce(trim(f[11]), ''), coalesce(trim(f[12]), ''), v_loc) returning id into new_id;
        insert into public.excel_refs (ref, kind, record_id, key_id) values (v_ref, 'money', new_id, r.id);
        res := res || v_ref || E'\tOK\tSaved' || E'\n';
      else
        raise exception 'Unknown sheet section';
      end if;
    exception when others then
      res := res || v_ref || E'\tERR\t' || xl(sqlerrm) || E'\n';
    end;
  end loop;
  return res;
end $$;
revoke all on function public.excel_send(text) from public;
grant execute on function public.excel_send(text) to anon, authenticated;

notify pgrst, 'reload schema';
