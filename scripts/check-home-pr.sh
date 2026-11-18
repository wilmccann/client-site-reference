#!/usr/bin/env bash
# Checks for pull requests that change the AI-edited home page.
# Usage: scripts/check-home-pr.sh <base-sha> <head-sha> [--skip-paths]
# Run `npm run build` first; the link check reads dist/index.html.
set -euo pipefail

base="${1:?base commit required}"
head="${2:?head commit required}"
skip_paths="${3:-}"
status=0

if grep -Eq 'href="/portfolio/?"' dist/index.html; then
  echo "ok: home page links to /portfolio/"
else
  echo "FAIL: the home page must keep a link to /portfolio/ (href=\"/portfolio/\")."
  status=1
fi

if [[ "$skip_paths" == "--skip-paths" ]]; then
  echo "skipped: path allowlist (pull request is labeled allow-any-path)"
else
  allowed='^(src/pages/index\.astro|src/home/.+|public/home/.+|public/theme\.css)$'
  outside=$(git diff --name-only "$base...$head" | grep -Ev "$allowed" || true)
  if [[ -z "$outside" ]]; then
    echo "ok: only home page files changed"
  else
    echo "FAIL: this pull request changes files outside the home page:"
    echo "$outside" | sed 's/^/  - /'
    echo "Home page changes may only touch src/pages/index.astro, src/home/, public/home/, and public/theme.css (see AGENTS.md)."
    status=1
  fi
fi

exit "$status"
