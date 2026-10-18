# RINS Hub

Operations hub for RINS W.L.L: stock by location, sales tracking, products, links and an AI assistant.

- **Website:** GitHub Pages (free)
- **Database and login:** Supabase (free plan to start)
- **Assistant:** Claude, called from a Supabase Edge Function (optional, paid per use)

Stock is never typed in directly. Every delivery, transfer, return, sale and correction is one row in the movement log, and stock levels are calculated from it.

## What's in this folder

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The website |
| `config.js` | Your Supabase address and public key (step 4) |
| `assets/rins-mark.png` | Logo and browser icon |
| `supabase/schema.sql` | Creates the database, the access rules and your starting data (step 2) |
| `supabase/documents.sql` | Adds document storage and product barcodes (step 2b) |
| `supabase/locations.sql` | Adds retailer, format and display to locations, plus the Alosra supermarkets (step 2c) |
| `supabase/functions/assistant/index.ts` | The assistant (step 6) |

---

## Setup (about 20 minutes)

### 1. Create the Supabase project

1. Go to **supabase.com** and sign up. Signing in with GitHub is easiest.
2. Click **New project**. Name it `rins-hub`, set a strong database password and save it somewhere safe, then pick the region closest to Bahrain.
3. Wait a minute or two for the project to start.

### 2. Create the database

1. In the left menu open **SQL Editor**, then **New query**.
2. Open `supabase/schema.sql`, copy everything, paste it in and click **Run**.
3. Open **Table Editor**. You should see `products`, `locations`, `movements`, `links` and `hub_users`, with your 3 products, 3 locations and 2 links already in them.

The script lets in `rinstravelbh@gmail.com`. To use a different address, change it in the `hub_users` table.

### 2b. Set up document storage

Run `supabase/documents.sql` the same way (SQL Editor > New query > paste > Run). It adds the barcode field on products, the documents table and a private storage folder for the files. Only signed-in hub users can open the files, through links that expire after an hour.

### 2c. Set up location details

Run `supabase/locations.sql` the same way. It adds the retailer, format (Supermarket, To Go) and display (Stand, Hanger) fields to locations, and adds the six Alosra supermarkets with stands.

### 3. Create your login and close sign-ups

1. Open **Authentication > Sign In / Providers** and turn **off** "Allow new users to sign up". Only accounts you create yourself can then exist.
2. Open **Authentication > Users > Add user > Create new user**. Enter the same email as in `hub_users`, choose a strong password, tick **Auto Confirm User**, and create it.

### 4. Connect the website to the database

1. Open **Project Settings > API Keys** (in some projects, **Project Settings > API**).
2. Copy the **Project URL** and the **anon public** key (newer projects call it the **publishable** key).
3. Open `config.js` and paste them in place of the two `YOUR-...` values.

Never paste the **service_role** or **secret** key anywhere in this website. That key bypasses all the access rules.

### 5. Put it on GitHub Pages

1. On GitHub, click **New repository**, name it `rins-hub`, and create it. On a free GitHub plan the repository must be **Public** for Pages. That is safe: the code holds no data and no secret keys, and the database rules decide who sees anything.
2. In the new repository click **uploading an existing file**. Drag in **everything inside this folder** (including the `assets` and `supabase` folders and the `.nojekyll` file), then click **Commit changes**.
3. Open **Settings > Pages**. Under **Source** choose **Deploy from a branch**, pick **main** and **/(root)**, and click **Save**.
4. After a minute or two the hub is live at `https://<your-github-username>.github.io/rins-hub/`. Sign in with the account from step 3.

To see `.nojekyll` on a Mac, press Cmd+Shift+. in Finder. If it gets left out, the site still works.

### 6. Switch on the assistant (optional)

The rest of the hub works without this step.

1. Go to **console.anthropic.com**, add billing, and create an API key. You pay per question, typically a few fils each.
2. In Supabase open **Edge Functions > Deploy a new function > Via Editor**. Name it exactly `assistant`, replace the sample code with everything from `supabase/functions/assistant/index.ts`, and click **Deploy**.
3. Open **Edge Functions > Secrets** and add `ANTHROPIC_API_KEY` with your key as the value.
4. In the hub, open **Assistant** and ask a question.

The key stays inside Supabase. The website never sees it.

---

## Day to day

- **Updating the website:** edit a file on GitHub (pencil icon) or upload a new version. Pages republishes in about a minute.
- **Backups:** the free plan has no automatic backups. Once a month, open each table in **Table Editor** and use **Export > Export to CSV**. Supabase Pro ($25/month) adds daily backups and stops the free plan's pause after a week without use.
- **Adding a team member:** add their email to `hub_users`, then create their login under **Authentication > Users**.
- **Security:** turn on two-factor login for both your GitHub and Supabase accounts.
