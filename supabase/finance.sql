-- RINS Hub: Finance, phase 1
-- Money accounts, income and expense records, cost per pack, retailer terms,
-- and owner-only access to everything financial.
-- Run once in Supabase: SQL Editor > New query > paste everything > Run.
-- Safe to run again.

-- 1. Roles: the owner sees finance; retailer logins (later) never will
alter table public.hub_users add column if not exists role  text not null default 'owner';
alter table public.hub_users add column if not exists chain text not null default '';
alter table public.hub_users drop constraint if exists hub_users_role_check;
alter table public.hub_users add constraint hub_users_role_check check (role in ('owner','retailer'));

create or replace function public.is_owner()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.hub_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and role = 'owner'
  );
$$;

-- 2. Cost per pack and retailer terms (used to work out profit)
alter table public.products  add column if not exists unit_cost    numeric(12,3) check (unit_cost is null or unit_cost >= 0);
alter table public.locations add column if not exists margin_pct   numeric(5,2) not null default 0 check (margin_pct >= 0 and margin_pct < 100);
alter table public.locations add column if not exists payment_days integer not null default 0 check (payment_days >= 0);

-- 3. Settings: financial year and the date the books start
create table if not exists public.fin_settings (
  id             integer primary key default 1 check (id = 1),
  fy_start_month integer not null default 1 check (fy_start_month between 1 and 12),
  books_start    date not null default date_trunc('month', current_date)::date,
  currency       text not null default 'BHD'
);
insert into public.fin_settings (id) values (1) on conflict do nothing;

-- 4. Where money is kept
create table if not exists public.fin_accounts (
  id              text primary key default gen_random_uuid()::text,
  name            text not null,
  kind            text not null default 'bank' check (kind in ('bank','cash','wallet','card')),
  opening_balance numeric(12,3) not null default 0,
  archived        boolean not null default false,
  created_at      timestamptz not null default now()
);

-- 5. Categories. "kind" decides where an entry lands:
--    income / expense      -> profit and loss
--    stock                 -> stock purchases (cost reaches profit when packs sell)
--    asset                 -> equipment, molds, stands (depreciated in phase 2)
--    settlement            -> retailer paying for sales already recorded on the Sales page
--    capital / loan / drawings -> money in or out that is not profit
create table if not exists public.fin_categories (
  id         text primary key default gen_random_uuid()::text,
  name       text not null,
  kind       text not null check (kind in ('income','expense','stock','asset','settlement','capital','loan','drawings')),
  direction  text not null check (direction in ('in','out')),
  sort       integer not null default 100,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

-- 6. Money in and out
create table if not exists public.fin_transactions (
  id           text primary key default gen_random_uuid()::text,
  date         date not null default current_date,
  type         text not null check (type in ('in','out','transfer')),
  account_id   text not null references public.fin_accounts(id) on delete restrict,
  to_account_id text references public.fin_accounts(id) on delete restrict,
  category_id  text references public.fin_categories(id) on delete restrict,
  amount       numeric(12,3) not null check (amount > 0),
  counterparty text not null default '',
  description  text not null default '',
  reference    text not null default '',
  doc_link     text not null default '',
  location_id  text references public.locations(id) on delete set null,
  created_at   timestamptz not null default now(),
  check ((type = 'transfer') = (to_account_id is not null)),
  check (type = 'transfer' or category_id is not null)
);
create index if not exists fin_transactions_date_idx on public.fin_transactions (date);

-- 7. Owner-only access to all finance tables
alter table public.fin_settings     enable row level security;
alter table public.fin_accounts     enable row level security;
alter table public.fin_categories   enable row level security;
alter table public.fin_transactions enable row level security;
do $$
declare t text;
begin
  foreach t in array array['fin_settings','fin_accounts','fin_categories','fin_transactions'] loop
    execute format('drop policy if exists "owner only" on public.%I', t);
    execute format(
      'create policy "owner only" on public.%I for all to authenticated
         using (public.is_owner()) with check (public.is_owner())', t);
  end loop;
end $$;

-- 8. Starting accounts and categories (rename or add more in the hub)
insert into public.fin_accounts (id, name, kind)
select v.* from (values ('bank','Bank','bank'), ('cash','Cash','cash'), ('benefitpay','BenefitPay','wallet')) as v(id, name, kind)
where not exists (select 1 from public.fin_accounts a where a.id = v.id);

insert into public.fin_categories (id, name, kind, direction, sort)
select v.* from (values
  ('settlement',    'Retailer payment for recorded sales', 'settlement', 'in',  10),
  ('b2b-sales',     'B2B or direct sales (not on Sales page)', 'income', 'in', 20),
  ('other-income',  'Other income',                        'income',     'in',  30),
  ('capital-in',    'Owner capital',                       'capital',    'in',  40),
  ('loan-in',       'Loan received',                       'loan',       'in',  50),
  ('mfg-xtrude',    'Manufacturing (Xtrude)',              'stock',      'out', 10),
  ('packaging',     'Packaging and sachets',               'stock',      'out', 20),
  ('freight',       'Freight and import duties',           'stock',      'out', 30),
  ('stands',        'Display stands and hangers',          'expense',    'out', 40),
  ('marketing',     'Marketing and ads',                   'expense',    'out', 50),
  ('samples',       'Samples and giveaways',               'expense',    'out', 60),
  ('delivery',      'Transport and delivery',              'expense',    'out', 70),
  ('rent',          'Rent and storage',                    'expense',    'out', 80),
  ('salaries',      'Salaries and wages',                  'expense',    'out', 90),
  ('licences',      'CR, licences and government fees',    'expense',    'out', 100),
  ('professional',  'Accounting and legal',                'expense',    'out', 110),
  ('software',      'Software and subscriptions',          'expense',    'out', 120),
  ('bank-fees',     'Bank fees',                           'expense',    'out', 130),
  ('office',        'Office and supplies',                 'expense',    'out', 140),
  ('other-expense', 'Other expenses',                      'expense',    'out', 150),
  ('equipment',     'Equipment, molds and machines',       'asset',      'out', 160),
  ('drawings',      'Owner drawings',                      'drawings',   'out', 170),
  ('loan-repay',    'Loan repayment',                      'loan',       'out', 180)
) as v(id, name, kind, direction, sort)
where not exists (select 1 from public.fin_categories c where c.id = v.id);

notify pgrst, 'reload schema';
