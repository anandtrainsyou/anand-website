# Workout plans site

A plain static site (HTML/CSS/JS, no build step) hosted on Cloudflare Pages.
Every push to `main` on GitHub redeploys the site automatically.

## Pages

| URL | File |
| --- | --- |
| `/` | `index.html`: homepage (about, splits, latest plans) |
| `/plans/` | `plans/index.html`: list of every plan |
| `/plans/?p=<id>` | same file, shows a single plan |
| `/p/<id>` | short link that redirects to the plan (for Instagram) |

## Adding a plan

Open `data/plans.json` and add an entry to the list. The `id` becomes the link, e.g. `"id": "glute-builder"` → `yoursite.com/p/glute-builder`.

```json
{
  "id": "glute-builder",
  "title": "Glute Builder",
  "level": "Beginner",
  "daysPerWeek": 3,
  "duration": "6 weeks",
  "goal": "Glutes",
  "summary": "One or two sentences shown on the card and at the top of the plan.",
  "notes": ["How to run it, tip 1", "Tip 2"],
  "days": [
    {
      "name": "Day 1",
      "focus": "Heavy",
      "exercises": [
        { "name": "Hip Thrust", "sets": 4, "reps": "8-10", "rest": "2 min", "notes": "Optional cue" }
      ]
    }
  ]
}
```

New plans appear at the top of the homepage's "Latest plans" if you put them first in the list.

**Downloads:** every plan has a "Download PDF" button that generates a PDF from this data automatically.
If you'd rather hand out your own designed PDF, drop it in `downloads/` and add `"pdf": "/downloads/glute-builder.pdf"` to the plan.

## Editing text

The homepage copy is in `index.html`. The site name "ATcoaching" appears in `index.html`, `plans/index.html` and `assets/app.js` (`SITE_NAME`).

## Run locally

```bash
npx serve .
```

(The `/p/` short links only work on Cloudflare; locally use `/plans/?p=<id>`.)

## Posting studio (`/dashboard`)

A private dashboard for uploading one video and posting it to YouTube Shorts, Instagram Reels, Facebook Reels, TikTok, X and LinkedIn, each with its own caption, hashtags, cover and schedule. It checks the video against each platform's limits (length, frame rate, size, codec). A platform the main video doesn't fit can get its own cut.

**Publishing works for Instagram and Facebook.** YouTube, TikTok, X and LinkedIn come in later steps. Posts for them wait in the queue.

| Path | What |
| --- | --- |
| `dashboard/` | The studio UI. `platforms.js` holds every platform limit, shared with the API |
| `functions/api/` | Cloudflare Pages Functions: uploads, posts, hashtag sets, account logins. `_middleware.js` checks the Cloudflare Access login on every request |
| `functions/m/` | Signed, expiring public links to uploaded files. Instagram and Facebook download videos and covers from here |
| `server/` | Code shared by the API and the publisher: token encryption, Meta API client, one adapter per platform |
| `workers/publisher/` | A Worker that runs every minute and publishes whatever is due (Pages Functions can't run on a timer) |
| `migrations/` | D1 database schema |
| `privacy/`, `terms/` | Public policy pages the platforms ask for during app review |
| `tools/` | Wrangler (Cloudflare's CLI) and `fake-meta.mjs` for local testing. Kept here so Pages never installs or publishes it |

**How a post goes out:** every minute the publisher finds platforms that are due and moves each one step forward, for example "hand Instagram the video link" or "check whether it's done processing". It saves its progress between runs, so it never sits waiting on Meta. Platform hiccups are retried (5 tries, backing off). Real rejections show as **Failed** in the queue with the platform's reason and a **Retry** button.

### One-time Cloudflare setup

1. `cd tools && npm install && npx wrangler login`
2. `npx wrangler d1 create trainzoo-studio` and paste the printed `database_id` into **both** `wrangler.toml` and `workers/publisher/wrangler.toml`. **Do this before pushing**, because Pages deploys fail on the placeholder id. Also make sure `name` in `wrangler.toml` matches the Pages project name.
3. `npx wrangler r2 bucket create trainzoo-media`
4. `npm run db:migrate`
5. **Lock the studio:** Cloudflare dashboard → Zero Trust → Access → Applications → Add → Self-hosted. Add two destinations, `trainzoo.in/dashboard` and `trainzoo.in/api`, with a policy that allows only your email. Copy the application's **AUD tag**. (Leave `/m/` public, since the platforms fetch videos from it.)
6. Make two random keys: `openssl rand -base64 32` (for `TOKEN_KEY`) and `openssl rand -hex 32` (for `MEDIA_URL_KEY`). Changing `TOKEN_KEY` later means reconnecting every account.
7. Pages project → Settings → Variables and secrets (Production):

   | Name | Value |
   | --- | --- |
   | `ACCESS_TEAM_DOMAIN` | `<your-team>.cloudflareaccess.com` |
   | `ACCESS_AUD` | AUD tag from step 5 |
   | `ALLOWED_EMAILS` | your email (comma-separate several) |
   | `PUBLIC_BASE_URL` | `https://trainzoo.in` |
   | `TOKEN_KEY`, `MEDIA_URL_KEY` | from step 6 (as secrets) |
   | `IG_APP_ID`, `IG_APP_SECRET` | from the Meta app, below (secret as a secret) |
   | `META_APP_ID`, `META_APP_SECRET` | from the Meta app, below |
   | `FB_LOGIN_CONFIG_ID` | only if your Meta app uses "Facebook Login for Business" |

   Without the Access values, the API refuses every request on the live site.
8. Push. The D1 and R2 bindings come from `wrangler.toml`.
9. **Deploy the publisher:**
   ```bash
   cd tools
   npx wrangler secret put TOKEN_KEY --config ../workers/publisher/wrangler.toml
   npx wrangler secret put MEDIA_URL_KEY --config ../workers/publisher/wrangler.toml
   npm run publisher:deploy
   ```
   Use the same two values as the Pages project. Its logs are under Workers → trainzoo-publisher → Logs.

### Meta app (Instagram + Facebook)

One app at [developers.facebook.com](https://developers.facebook.com/apps) covers both. Meta moves its menus around, so look for these names:

1. **Create app**, and pick the use cases for managing Instagram content and managing a Facebook Page.
2. **Instagram → API setup with Instagram login:**
   - Copy the *Instagram app ID* and *Instagram app secret* into `IG_APP_ID` / `IG_APP_SECRET`.
   - Under business login settings, add the redirect URL `https://trainzoo.in/api/accounts/instagram/callback`.
   - Add your Instagram account as a tester (App roles), then accept the invite in Instagram.
3. **Facebook Login (for Business) → Settings:** add the redirect URL `https://trainzoo.in/api/accounts/facebook/callback`. If it asks for a *configuration*, create one with a user access token and the permissions `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` and `business_management`, then put its ID in `FB_LOGIN_CONFIG_ID`.
4. **App settings → Basic:** copy the App ID and secret into `META_APP_ID` / `META_APP_SECRET`. Point the privacy policy URL at `https://trainzoo.in/privacy/` and terms at `https://trainzoo.in/terms/`.
5. Keep the app in **Development** mode. It can post to accounts that have a role on the app (you) without App Review.
6. In the studio, open **Accounts** and click **Connect** for each one. If you manage several Facebook Pages, pick the one to post to.

Instagram logins last 60 days and the publisher renews them automatically. Facebook Page logins don't expire.

### Run the studio locally

```bash
npm --prefix tools run db:migrate:local
npm --prefix tools run dev
```

Open http://localhost:8788/dashboard/. Locally there's no Access login: the API only answers on localhost when the Access variables are unset.

To test publishing without real accounts, run the fake Meta API and the publisher too. Put these in `.dev.vars` **and** `workers/publisher/.dev.vars` (both gitignored):

```
TOKEN_KEY=<openssl rand -base64 32>
MEDIA_URL_KEY=<openssl rand -hex 32>
PUBLIC_BASE_URL=http://localhost:8788
IG_APP_ID=fake
IG_APP_SECRET=fake
META_APP_ID=fake
META_APP_SECRET=fake
IG_GRAPH_BASE=http://localhost:8790
IG_API_BASE=http://localhost:8790
FB_GRAPH_BASE=http://localhost:8790
FB_RUPLOAD_BASE=http://localhost:8790
```

```bash
node tools/fake-meta.mjs
npm --prefix tools run publisher:dev
```

Connect the accounts by hand. The real login page can't be reached locally, so open `/api/accounts/instagram/connect`, take `state` from the redirect, and call `/api/accounts/instagram/callback?code=good-code&state=…`. Then queue a post and trigger the publisher with `curl localhost:8789/__scheduled`. `curl 'localhost:8790/__mode?ig=error'` makes the fake reject the next video.
