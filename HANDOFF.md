# Handoff: posting studio

Status as of 2026-10-17, for whoever picks this up on their own machine. `README.md` explains how everything works. This file covers where things stand and what's next.

## What this is

Two things live in this repo:

- **The ATcoaching site** (homepage, plans, articles, guides). It's a static site.
- **The posting studio** at `/dashboard`. It's a private page where you upload one video and post it to Instagram Reels, Facebook Reels, YouTube Shorts, TikTok, X and LinkedIn. Each platform gets its own caption, hashtags, cover and schedule. It flags platforms the video doesn't fit (length, 60fps, size, codec) so you can give those platforms their own cut.

Account facts: the Instagram account is a **Creator** account, and LinkedIn is a **personal profile**. Facebook only allows posting through the API to a **Page**, so you need one before Facebook can be connected.

## Done

| Step | State |
| --- | --- |
| 1. Dashboard, uploads, fit checker, composer, queue | Built and committed |
| 2. Instagram + Facebook publishing | Built and tested against a fake Meta API (`tools/fake-meta.mjs`). **Not yet tried with real accounts** |
| 3. YouTube + LinkedIn | Not started |
| 4. X + TikTok | Not started |
| 5. Calendar view, failure alerts | Not started |

Cloudflare (account `anandtrainsyou@gmail.com`) already has:

- **D1 database** `atcoaching-studio`, with migrations applied.
- **R2 bucket** `atcoaching-media`. R2 is on the $0 plan.
- **Pages project** `atcoaching-site`. Nothing deployed yet. Its secrets are `TOKEN_KEY`, `MEDIA_URL_KEY`, `PUBLIC_BASE_URL`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and `ALLOWED_EMAILS`.
- **Zero Trust Access app "Studio"** (team `autumn-bush-333f`). It locks `anandtrainsyou.in/dashboard` and `anandtrainsyou.in/api` to `anandtrainsyou@gmail.com` only. Login is by an emailed one-time code.
- **Pages project `cardio`**. This is an older, unrelated page. Leave it alone.

## ⚠️ Decide first: the domain is already taken

`anandtrainsyou.in` and `www.anandtrainsyou.in` are currently served by a **different** project: the Worker `anand-website` from the GitHub repo `anandtrainsyou/anand-website` (Fat Loss Map, Workout Map). It is not this repo.

The studio needs the Pages Functions in this repo to run on whatever hostname you choose. Pick one option:

- **A. Put the studio on a subdomain**, e.g. `studio.anandtrainsyou.in`. This is the easiest option.
  - Attach that subdomain to the `atcoaching-site` Pages project.
  - Change the Access app's two destinations to that hostname.
  - Change `PUBLIC_BASE_URL` (a Pages secret and also in `workers/publisher/wrangler.toml`).
  - Update the Meta redirect URLs.
- **B. Keep `anandtrainsyou.in/dashboard`.** This means moving the studio into the `anand-website` Worker (Workers static assets plus the API as Worker routes), or routing `/dashboard*`, `/api/*` and `/m/*` to it. It's more work, but you get one site.

The ATcoaching homepage/plans in this repo and the Fat Loss Map site are also two separate sites. At some point, decide which one is the real anandtrainsyou.in.

## Set up on your machine

This code lives on the `posting-studio` branch of `anandtrainsyou/anand-website`. Its history is separate from that repo's `main` (the Fat Loss Map site), so never merge the two by accident. Clone just this branch:

```bash
git clone --branch posting-studio --single-branch https://github.com/anandtrainsyou/anand-website.git atcoaching-studio
cd atcoaching-studio
npm --prefix tools install
npx --prefix tools wrangler login
```

Then follow **"Run the studio locally"** in `README.md`. It runs with a fake Meta API, so you can test without real accounts.

### Fresh keys

The `TOKEN_KEY` and `MEDIA_URL_KEY` values on Pages are **not** in this repo, and the publisher Worker needs the same two values. No accounts are connected yet, so just generate new ones. Set them on both, from `tools/`:

```bash
TK=$(openssl rand -base64 32); MK=$(openssl rand -hex 32)
printf '%s' "$TK" | npx wrangler pages secret put TOKEN_KEY --project-name atcoaching-site
printf '%s' "$MK" | npx wrangler pages secret put MEDIA_URL_KEY --project-name atcoaching-site
npm run publisher:deploy
printf '%s' "$TK" | npx wrangler secret put TOKEN_KEY --config ../workers/publisher/wrangler.toml
printf '%s' "$MK" | npx wrangler secret put MEDIA_URL_KEY --config ../workers/publisher/wrangler.toml
unset TK MK
```

`publisher:deploy` starts the every-minute publisher. It does nothing until posts are queued.

## Next steps, in order

1. **Decide the domain** (above).
2. **Create the Meta app.** See "Meta app" in `README.md`. Use your own Facebook login, add your Instagram as a tester, and keep the app in Development mode. Save the keys as Pages secrets, pasting each value when prompted:
   ```bash
   npx --prefix tools wrangler pages secret put IG_APP_ID --project-name atcoaching-site
   ```
   Do the same for `IG_APP_SECRET`, `META_APP_ID` and `META_APP_SECRET`. Also do `FB_LOGIN_CONFIG_ID`, but only if Meta made you create a Login configuration.
3. **Deploy the site:** `npm --prefix tools run deploy:site`. Never use `wrangler pages deploy .` directly, because it would upload local test data and `.dev.vars`. Then attach the domain chosen in step 1.
4. **Fresh keys + publisher** (above).
5. Open the studio, go to **Accounts**, and connect Instagram and Facebook. Then post a real test Reel.
6. Then step 3 (YouTube + LinkedIn). Apply early for the slow approvals:
   - Google's audit, because YouTube uploads stay private until it passes.
   - TikTok's audit, because posts stay private-only until it passes.
   - X's paid API tier.

## Ground rules

- Platform limits live in one place: `dashboard/platforms.js`. The browser and the API both use it.
- Each platform's publisher goes in `server/adapters/<platform>.js` behind the same `step()` interface.
- Never commit secrets. `.dev.vars` and `.wrangler/` are gitignored.
- The privacy and terms pages (`privacy/`, `terms/`) are what Meta, Google and TikTok review. Keep them accurate when adding platforms.
