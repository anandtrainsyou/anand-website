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

The homepage copy is in `index.html`. The site name appears as "Coach Name" in `index.html`, `plans/index.html` and `assets/app.js` (`SITE_NAME`).

## Run locally

```bash
npx serve .
```

(The `/p/` short links only work on Cloudflare; locally use `/plans/?p=<id>`.)
