Read `HANDOFF.md` first for where the project stands and what's next. `README.md` explains how it works.

- Deploy the site only with `npm --prefix tools run deploy:site` (git-tracked files only), never `wrangler pages deploy .`.
- Tooling lives in `tools/`. Don't add a root `package.json`, or Pages will install and publish `node_modules`.
- Platform limits live in `dashboard/platforms.js`; publishers live in `server/adapters/` behind the shared `step()` interface.
- Test publishing locally against `tools/fake-meta.mjs` before touching real accounts.
- Never print or commit secrets (`.dev.vars`, Pages/Worker secrets).
