#!/bin/sh
# Deploy the site + studio API to Cloudflare Pages from a clean copy of the repo.
# Only files git tracks (or would track) go up, so local-only things like .wrangler/
# (the local test database), .dev.vars and node_modules never get published.
set -e
cd "$(dirname "$0")/.."
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
git ls-files -co --exclude-standard | grep -vE '^(tools|workers|migrations)/|^(README|HANDOFF|CLAUDE)\.md$|^\.gitignore$' | rsync -a --files-from=- ./ "$STAGE/"
cd "$STAGE"
"$OLDPWD/tools/node_modules/.bin/wrangler" pages deploy . --project-name atcoaching-site --branch main --commit-dirty=true "$@"
