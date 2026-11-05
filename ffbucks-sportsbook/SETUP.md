# FFBucks sportsbook: one-time setup

Play money only. No real-money wagering. This takes about 20 minutes, once.

The sportsbook is its own website with its own database, separate from the
league site. The league site posts the lines; this site takes the bets.

## 1. Make the GitHub repo

1. On GitHub, click **New repository**. Name it `FFBucks`. Make it **Public**
   (GitHub Pages is free for public repos). Don't add a README.
2. Unzip `ffbucks-sportsbook.zip` on your computer.
3. On the new repo page, click **uploading an existing file** and drag in
   everything from the unzipped folder, then **Commit changes**.
   - On a Mac, the `.github` folder is hidden. Press **Cmd + Shift + .** in
     Finder to show it, and make sure it gets uploaded too.

## 2. Make the database

1. Go to supabase.com and create a **new project** called `ffbucks`. Do not
   reuse the league site's project.
2. Open **SQL Editor**, click **New query**, paste in the whole file
   `supabase/migrations/202611040001_sportsbook.sql`, and click **Run**.
3. The result shows **your_invite_code**. Copy it somewhere; it's your own
   code for joining.

## 3. Let members sign up without email

Supabase's built-in email only reaches your own team, so members join with
your invite code instead.

1. In Supabase, go to **Authentication → Sign In / Providers → Email**.
2. Turn **Confirm email** off and save.

## 4. Copy three values from Supabase

In **Project Settings → API Keys** (and **Data API** for the URL), copy:

- the **Project URL** (looks like `https://abcd.supabase.co`)
- the **publishable key** (starts with `sb_publishable_`)
- the **secret key** (starts with `sb_secret_`). Keep this one private.

## 5. Give them to GitHub

In the FFBucks repo: **Settings → Secrets and variables → Actions**.

On the **Variables** tab, add:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | the Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the publishable key |

On the **Secrets** tab, add:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | the Project URL |
| `SUPABASE_SECRET_KEY` | the secret key |

## 6. Turn on the website

1. **Settings → Pages**, set **Source** to **GitHub Actions**.
2. **Actions → Deploy sportsbook → Run workflow**. When it turns green, the
   site is live at `https://dac0009.github.io/FFBucks/`.

## 7. Post the first lines

1. In the **league** repo (FantasyFootballs), press **Refresh ESPN data**.
   This posts this week's lines.
2. Back in the **FFBucks** repo: **Actions → Sync sportsbook → Run workflow**.
   After that it runs on its own every 15 minutes.

## 8. Join and invite everyone

1. Open the site, choose **First time here**, make an account, and enter your
   invite code. You get 1,000 free FFBucks.
2. Go to **Commish**:
   - **Tip link:** paste your Linktree and press **Save link**. Change it any
     time; leave it blank to hide the button.
   - **Invite members:** press **Make code** next to each owner and text them
     the code with the site link.

## Every week after that

Nothing to do. Tuesday's league refresh posts lines and results, the hourly
lock check moves lock times, and the sync grades bets.

- **Someone forgot their password:** on Commish press **New login code** next
  to their name. They make a new account with it, and their FFBucks and bets
  move over.
- **A line is broken:** on Commish press **Pull this line**. Every bet on it is
  refunded.

## Tell the league

FFBucks are play money. They can't be bought, cashed out or traded for
anything. Settling FFBucks results in real money between yourselves would make
it real gambling.
