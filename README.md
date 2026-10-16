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

| Path | What |
| --- | --- |
| `dashboard/` | The studio UI. `platforms.js` holds every platform limit, shared with the API |
| `functions/api/` | Cloudflare Pages Functions: uploads to R2, posts, hashtag sets. `_middleware.js` checks the Cloudflare Access login on every request |
| `migrations/` | D1 database schema |
| `privacy/`, `terms/` | Public policy pages the platforms ask for during app review |
| `tools/` | Wrangler (Cloudflare's CLI). Lives here so Pages never installs or publishes it |

Accounts aren't connected yet (that's step 2), so nothing publishes. Saved and scheduled posts wait in the queue.

### One-time Cloudflare setup

1. `cd tools && npm install && npx wrangler login`
2. `npx wrangler d1 create trainzoo-studio` and paste the printed `database_id` into `wrangler.toml`. **Do this before pushing**, because Pages deploys fail on the placeholder id. Also make sure `name` in `wrangler.toml` matches the Pages project name.
3. `npx wrangler r2 bucket create trainzoo-media`
4. `npm run db:migrate`
5. **Lock the studio:** Cloudflare dashboard → Zero Trust → Access → Applications → Add → Self-hosted. Add two destinations, `trainzoo.in/dashboard` and `trainzoo.in/api`, with a policy that allows only your email. Copy the application's **AUD tag**.
6. Pages project → Settings → Variables and secrets (Production):
   - `ACCESS_TEAM_DOMAIN`: `<your-team>.cloudflareaccess.com`
   - `ACCESS_AUD`: the AUD tag from step 5
   - `ALLOWED_EMAILS`: your email (comma-separate several)

   Without these, the API refuses every request on the live site.
7. Push. The D1 and R2 bindings come from `wrangler.toml`.

### Run the studio locally

```bash
npm --prefix tools run db:migrate:local
npm --prefix tools run dev
```

Open http://localhost:8788/dashboard/. Locally there's no Access login: the API only answers on localhost when the Access variables are unset.
