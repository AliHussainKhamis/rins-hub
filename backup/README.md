# Nightly backup

`nightly-backup.yml` copies the hub's database every night into a **private** GitHub repo you own, and keeps the last 60 nights.

Each backup includes every table and its data: products, branches, stock moves, sales, tasks, milestones, finance, documents list, Excel keys and settings. It also includes the functions and access rules.

It does **not** include:
- logins (recreate them in Supabase);
- uploaded files and photos (they live in Supabase Storage);
- the reminder schedule (re-run `supabase/tasks-milestones.sql`).

## Setup (once)

1. **Create a private repo** on GitHub, for example `rins-hub-backup`, and set it to **Private**. The backups contain all your business data, so never make this repo public.
2. **Put the workflow in it** at `.github/workflows/nightly-backup.yml`. Claude can push it for you.
3. **Get the database connection string.** In Supabase, click **Connect** at the top, choose **Session pooler**, and copy the URI. It looks like
   `postgresql://postgres.txbgbtwthjvfsmizvhee:[YOUR-PASSWORD]@aws-0-….pooler.supabase.com:5432/postgres`
   - Replace `[YOUR-PASSWORD]` with your database password.
   - If you don't know the password: **Project Settings › Database › Reset database password**. Use letters and numbers only. Resetting it doesn't affect the hub website.
4. **Add the secret.** In the backup repo, go to **Settings › Secrets and variables › Actions › New repository secret**. Name it `SUPABASE_DB_URL` and paste the URI as the value.
5. **Test it.** Open **Actions › Nightly database backup › Run workflow**. A file `backups/rins-hub-YYYY-MM-DD.sql.gz` appears within a minute or two.

After that it runs every night at 02:30 Bahrain time.

## Restoring

Restore into a new, empty Supabase project, or any PostgreSQL database:

```bash
gunzip -c backups/rins-hub-2026-10-28.sql.gz | psql "postgresql://…your new database URI…"
```

Then re-run `supabase/tasks-milestones.sql` for the reminder schedule, recreate your login, and point `config.js` at the new project.
