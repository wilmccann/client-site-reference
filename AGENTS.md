# Agent rules

Rules for AI coding agents (Claude Code, Google Antigravity, and others) working in this repo.
Everything else (architecture, design decisions, setup, operations, costs) is in `README.md`.

## Home page tasks (read first)

The home page (`/`) belongs to the site owner, who changes it by asking an AI agent. If you are
that agent, these rules apply to every **home page task** (a change to the home page's content,
look, or games). A request to change the portfolio page or what the CMS can edit is a different
kind of task: follow [Portfolio and CMS changes](#portfolio-and-cms-changes-developer-tasks)
instead, and say in the pull request that it needs the `allow-any-path` label and a developer's
review. If you can't tell which kind of task you've been given, ask.

- **Only edit these files:** `src/pages/index.astro`, anything under `src/home/` or
  `public/home/`, and `public/theme.css` (shared colours and fonts; the portfolio page uses them
  too). The pull request check (`scripts/check-home-pr.sh`) fails if anything else changes.
- **Never touch, in a home page task:** `src/pages/portfolio.astro`, `src/content/`,
  `src/layouts/`, `public/admin/`, `.github/`, `server/`, `scripts/`, `package.json`, or lock files.
- **Keep a visible link to `/portfolio/`** on the home page. A check fails without one.
- **Plain HTML, CSS, and JavaScript** inside `index.astro` and `src/home/`. Don't add npm packages
  or frameworks. Put images in `public/home/` and reference them as `/home/<file>`.
- **The games** live in `src/home/checkers.js`, `src/home/chess.js`, and `src/home/connect-four.js`;
  a tab switcher (`.game-tabs`) in `index.astro` toggles between them. Change, restyle, add, or
  remove games (along with their markup and `<script>` wiring) if the owner asks.
- **Run `npm run build`** and make sure it passes.
- **Always work on a branch and open a pull request.** Never push to `main`: a push to `main`
  publishes to the live site immediately.

## Portfolio and CMS changes (developer tasks)

The portfolio page (`/portfolio/`) is structured and edited through Sveltia CMS at `/admin`.
Changing what the CMS can edit touches three files that must stay in sync:

1. `public/admin/config.yml` (CMS collection and field definitions)
2. `src/content/config.ts` (Astro content collections schema, using Zod)
3. `src/pages/portfolio.astro` (layout and presentation template)

Both config files define two collections, with their content in `src/content/`:

- `work`: one Markdown file per project in `src/content/work/`.
- `pages`: a single entry, `src/content/pages/portfolio.yml`, with the page's name, greeting, intro,
  portrait, about, and contact email. New fields for the page's own text belong here.

Rules:

- **Content requests aren't code changes:** if the owner wants different words or a different
  photo in a field the CMS already has, point them to `/admin` instead of opening a pull request.
  The fixed headings ("A few things I've made", "a little about me", "Let's talk") are in the
  template and aren't CMS fields, so changing one is a developer task.
- **Keep CMS content out of the template:** never hard-code anything the CMS edits into
  `portfolio.astro`, or edits in `/admin` stop showing on the page.
- **Scope:** only the files the change needs: usually the three above, plus `src/content/`
  entries or new pages under `src/pages/portfolio/`. Never touch `.github/`, `server/`,
  `scripts/`, `package.json`, or lock files without the user's explicit go-ahead.
- **Schema matching:** fields in `config.yml` and the Zod schema in `config.ts` must match field
  for field (names, data types, required or optional). A field the schema doesn't declare is
  silently dropped; a required schema field the CMS doesn't save fails the build. A new required
  field also needs a value in every existing entry, or the build fails.
- **Build check:** `npm run build` must pass cleanly.
- **PR label:** these pull requests touch files outside the home page allowlist, so the path check
  fails until a developer adds the `allow-any-path` label. Don't add the label yourself.
- **Human review** by a developer is required before merging. Work on a branch and open a pull
  request; never push to `main`.

## Deploy and cloud safety

- A push to `main` deploys to production through `.github/workflows/deploy.yml`. Docs-only changes
  (`README.md`, `AGENTS.md`, `CLAUDE.md`) don't deploy.
- The Workload Identity provider accepts only `main` of this repository. Don't loosen it; it keeps
  agent-made branches away from production.
- Never pass `--allow-unauthenticated` or `--no-invoker-iam-check` in a deploy. Every deploy keeps
  the current public-access setting.
- Keep `--min-instances 0` and a low `--max-instances` (cost ceiling).
- Don't set up Cloud Build triggers or `gcloud builds connections`; they would duplicate the
  deploy pipeline. Don't add npm packages to `server/`; it uses Node.js built-ins only.
- Never commit secrets. The GitHub OAuth client secret lives only in Secret Manager; the client ID
  is public.
- Before any gcloud command, run `bash scripts/gcloud-init.sh` and confirm the target with
  `gcloud config get project`. Don't run `gcloud config configurations activate` or change other
  gcloud configurations.
- Ask before changing IAM, Workload Identity Federation, billing, the domain mapping, or deleting
  any Google Cloud resource.
