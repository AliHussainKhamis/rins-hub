-- RINS Hub: calendar tasks, reminders (Telegram + email) and the milestone map
-- Run once in Supabase: SQL Editor > New query > paste everything > Run.
-- Safe to run again. Run stock-alerts.sql first (it creates the alert settings
-- and the Telegram sender that reminders use).
--
-- Reminders: a scheduled job runs every minute and sends any reminder that is
-- due, by Telegram and/or email, once. Your email key is NOT in this file (the
-- code is public); you set it separately in the setup guide.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1. Milestones: the company roadmap
create table if not exists public.milestones (
  id          text primary key default gen_random_uuid()::text,
  title       text not null,
  target_date date,
  category    text not null default 'Operations',
  status      text not null default 'Planned' check (status in ('Planned','In progress','At risk','Done')),
  description text not null default '',
  created_at  timestamptz not null default now()
);
alter table public.milestones enable row level security;
drop policy if exists "hub users only" on public.milestones;
create policy "hub users only" on public.milestones for all to authenticated
  using (public.is_hub_user()) with check (public.is_hub_user());

-- 2. Tasks on the calendar
create table if not exists public.tasks (
  id              text primary key default gen_random_uuid()::text,
  title           text not null,
  due_date        date not null,
  due_time        time,
  category        text not null default 'Operations',
  importance      text not null default 'medium' check (importance in ('high','medium','low')),
  notes           text not null default '',
  done            boolean not null default false,
  milestone_id    text references public.milestones(id) on delete set null,
  remind_rule     text not null default 'none',
  remind_at       timestamptz,
  remind_telegram boolean not null default false,
  remind_email    boolean not null default false,
  reminded_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists tasks_due_idx on public.tasks (due_date);
create index if not exists tasks_remind_idx on public.tasks (remind_at) where reminded_at is null;
alter table public.tasks enable row level security;
drop policy if exists "hub users only" on public.tasks;
create policy "hub users only" on public.tasks for all to authenticated
  using (public.is_hub_user()) with check (public.is_hub_user());

-- When a reminder time changes, it can fire again
create or replace function public.tasks_reset_reminder()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if new.remind_at is distinct from old.remind_at then new.reminded_at := null; end if;
  return new;
end $$;
drop trigger if exists tasks_reset_reminder on public.tasks;
create trigger tasks_reset_reminder before update on public.tasks
  for each row execute function public.tasks_reset_reminder();

-- 3. Email settings (private, like the Telegram token)
alter table public.alert_settings add column if not exists email_to       text not null default '';
alter table public.alert_settings add column if not exists resend_api_key text not null default '';
alter table public.alert_settings add column if not exists email_from     text not null default 'RINS Hub <onboarding@resend.dev>';

create or replace function public.send_email(p_subject text, p_text text)
returns text language plpgsql security definer
set search_path = public
as $$
declare s public.alert_settings;
begin
  select * into s from public.alert_settings where id = 1;
  if s is null or s.resend_api_key = '' or s.email_to = '' then return 'not_configured'; end if;
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    body    := jsonb_build_object('from', s.email_from, 'to', s.email_to, 'subject', p_subject, 'text', p_text),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || s.resend_api_key)
  );
  return 'sent';
end $$;
revoke all on function public.send_email(text, text) from public, anon, authenticated;

-- 4. Send every reminder that is due (run by the scheduled job)
create or replace function public.send_due_reminders()
returns integer language plpgsql security definer
set search_path = public
as $$
declare t record; n integer := 0; msg text;
begin
  for t in
    select * from public.tasks
    where remind_at is not null and remind_at <= now() and remind_at > now() - interval '2 days'
      and reminded_at is null and not done and (remind_telegram or remind_email)
    order by remind_at limit 50
  loop
    msg := 'RINS reminder' || chr(10) || t.title || chr(10)
        || 'Due ' || to_char(t.due_date, 'Dy DD Mon YYYY')
        || coalesce(' at ' || to_char(t.due_time, 'HH24:MI'), '') || chr(10)
        || initcap(t.importance) || ' importance · ' || t.category
        || case when t.notes <> '' then chr(10) || t.notes else '' end;
    if t.remind_telegram then perform public.send_alert(msg); end if;
    if t.remind_email then perform public.send_email('Reminder: ' || t.title, msg); end if;
    update public.tasks set reminded_at = now() where id = t.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.send_due_reminders() from public, anon, authenticated;

-- 5. Run the reminder check every minute
select cron.unschedule(jobid) from cron.job where jobname = 'rins-task-reminders';
select cron.schedule('rins-task-reminders', '* * * * *', $$select public.send_due_reminders()$$);

-- 6. Functions the website may call (signed-in hub users only)
create or replace function public.email_status()
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare s public.alert_settings;
begin
  if not public.is_hub_user() then raise exception 'Not allowed'; end if;
  select * into s from public.alert_settings where id = 1;
  return jsonb_build_object(
    'configured', coalesce(s.resend_api_key <> '' and s.email_to <> '', false),
    'to', coalesce(s.email_to, ''));
end $$;

create or replace function public.send_test_email()
returns text language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_hub_user() then raise exception 'Not allowed'; end if;
  return public.send_email('RINS Hub test email', 'RINS Hub test message: email reminders are working.');
end $$;

revoke all on function public.email_status() from public, anon;
revoke all on function public.send_test_email() from public, anon;
grant execute on function public.email_status() to authenticated;
grant execute on function public.send_test_email() to authenticated;

-- 7. Starting milestones from the company profile (dates to set in the hub)
insert into public.milestones (title, category, status, description)
select v.title, v.category, 'Planned', v.description from (values
  ('Alosra listing live',            'Sales',      'Six supermarket stands and To Go hangers stocked'),
  ('Day2Day listing live',           'Sales',      ''),
  ('Airport retail launch',          'Sales',      ''),
  ('Sacheting machine commissioned', 'Production', 'In-house packing of single-use sachets'),
  ('Ninja and e-commerce launch',    'Marketing',  'Online ordering and delivery'),
  ('First international market',     'Sales',      'First distributor outside Bahrain'),
  ('Next product launch',            'Production', '')
) as v(title, category, description)
where not exists (select 1 from public.milestones m where lower(m.title) = lower(v.title));
