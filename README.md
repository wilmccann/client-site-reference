# Low-cost, client-editable personal site: reference implementation

A reference implementation of a personal website built for a client who wanted to own and edit
their site without paying for, or maintaining, a server. It's a static [Astro](https://astro.build)
site with two pages: a free-form home page the owner changes by asking an AI coding agent, and a
structured portfolio page they edit through [Sveltia CMS](https://github.com/sveltia/sveltia-cms)
at `/admin`. One Google Cloud Run service serves the pages and handles the CMS's GitHub sign-in,
and it scales to zero, so the expected hosting bill is $0/month. GitHub Actions deploys every push
to `main` through Workload Identity Federation, with no stored keys. The sample owner, Jordan
Avery, is fictional, and every account, project, and domain value is a placeholder (see
[Deploying your own copy](#deploying-your-own-copy)).

## What the client gets

| Page | What it is | How the owner edits it |
| --- | --- | --- |
| `/` | Home page: a greeting, three games played against the computer (Checkers, Chess, Connect Four), and a link to the portfolio | Asks an AI coding agent (for example Claude Code on the web or Google Antigravity) in plain English. The agent opens a pull request; automatic checks run; the owner merges it to publish |
| `/portfolio/` | Structured portfolio: intro, portrait, work items, about, contact | The CMS at `/admin`: "Sign in with GitHub", edit, Save |
| `/admin` | The Sveltia CMS editor | Used by the owner; its fields are configured by a developer (`public/admin/config.yml`) |
| Shared look | Colours and fonts in `public/theme.css`, used by both pages | Either way above; a change restyles both pages |

Every CMS save and every merge to `main` goes live in about 1 to 2 minutes. The two editing paths
touch different files, so an open AI pull request and a CMS save never conflict. The CMS edits the
portfolio page's text (`src/content/pages/portfolio.yml`) and one Markdown file per work item
(`src/content/work/`); uploads go to `public/images/uploads/`. Fields are defined in
`public/admin/config.yml` and validated by the Astro schema in `src/content/config.ts`.

## Architecture

```
  Owner                          GitHub (repo YOUR_GITHUB_OWNER/YOUR_REPO)
  ├─ /admin (Sveltia CMS) ─────► commit to main ─┐
  └─ AI agent ─► branch ─► pull request          │
                    │   PR checks: build,        │
                    │   path allowlist, link     │
                    └──── merge to main ─────────┤
                                                 ▼
                              GitHub Actions: Deploy (.github/workflows/deploy.yml)
                              npm ci, npm run build, copy dist/ to server/public/
                              sign in through Workload Identity Federation (main only)
                              gcloud run deploy my-site --source server
                                                 │
                                                 ▼
  Visitor ─► example.com ─► Cloud Run service my-site (YOUR_GCP_PROJECT_ID, us-central1)
                            server/server.js, Node.js built-ins only
                            ├─ static pages from server/public/
                            └─ /auth, /callback: GitHub OAuth for the CMS
                                 client secret from Secret Manager
```

| Piece | Where it lives |
| --- | --- |
| Site source | `src/pages/` (`index.astro`, `portfolio.astro`, `404.astro`), `src/home/` (games), `src/layouts/Base.astro`, `public/theme.css` |
| Content | `src/content/` (schema in `src/content/config.ts`) |
| CMS | `public/admin/index.html` (loads Sveltia CMS) and `public/admin/config.yml` |
| Server | `server/server.js`: serves the built site and the CMS sign-in. No npm dependencies |
| Deploy | `.github/workflows/deploy.yml`, on every push to `main` |
| Pull request checks | `.github/workflows/pr-checks.yml` and `scripts/check-home-pr.sh` |
| Runtime | Cloud Run `my-site`, deployed from source on Google's Node.js 24 base image with automatic base image updates, runs as `my-site-runtime@` |
| Secret | Secret Manager `github-oauth-client-secret`, set on the service as `GITHUB_CLIENT_SECRET` |
| Images | Artifact Registry `cloud-run-source-deploy` (cleanup policy: keep the newest 5, delete older than 30 days; the newest-5 rule wins, so the running image is never deleted) |
| Domain | `example.com`, mapped to `my-site` with Cloud Run domain mapping |

**The server.** `server/server.js` looks up a file, then the folder's `index.html`, then
`name.html`, and falls back to `404.html`. It sends ETags and gzip, gives Astro's hashed `/_astro/`
assets a one-year immutable cache, and refuses hidden files and `..` paths. `/auth` starts the
GitHub OAuth flow with a `state` cookie; `/callback` checks the state, exchanges the code for a
token, and hands it to the CMS window with Sveltia's `postMessage` handshake, but only to an origin
listed in `ALLOWED_ORIGINS`.

**Who patches what.** Google updates Linux and Node.js on the running service without a redeploy
(automatic base image updates). The server uses no npm packages, so there's nothing else to
update. The only manual step is moving to the next Node.js major version before Node.js 24's end
of support (about April 2028): change `nodejs24` in the deploy command and push.

## Requirements and design decisions

The binding constraint was cost: hosting under $2/month for a site expected to get fewer than 5
human visits a month. The second was that the owner can run the site alone after handoff.

| Requirement | How it's met |
| --- | --- |
| Hosting under $2/month | $0/month expected; every piece stays in Google's free allowances (see [Cost](#cost)) |
| Editing that feels familiar to a WordPress user: dashboard, rich text, media, a publish button | Sveltia CMS at `/admin` with "Sign in with GitHub" |
| No server or database to maintain | No database; Google patches the runtime; the server has no dependencies |
| Keep the client's existing domain and email | DNS stays at the current registrar; the site doesn't touch email |
| A home page the owner can redesign by asking an AI agent, without risk to the portfolio or the CMS | Free-form `/` edited through pull requests, with checks (see [Guardrails](#guardrails-for-ai-agent-edits)) |

### Editing platform and site generator

| Option | Outcome | Why |
| --- | --- | --- |
| WordPress, self-hosted | Rejected | Always on, about $3.50 to $5/month: over the ceiling |
| Grav CMS (flat-file PHP) | Rejected | Still needs a PHP server running all the time |
| Decap CMS | Passed over | Its maintenance has slowed |
| TinaCMS | Not chosen | Depends on a hosted service for sign-in and media |
| **Sveltia CMS** | **Chosen** | Git-backed (every save is a commit, so every change can be undone), free, actively maintained, WordPress-like dashboard |
| Eleventy | Not chosen | Would also have worked |
| **Astro** | **Chosen** | Static output; the content schema checks the fields the CMS saves, so a bad edit fails the build instead of breaking the page |

### Hosting

Compared on performance, security and upkeep, and ongoing cost, plus how much there is for the
owner to understand.

| Option | Performance | Security and upkeep | Cost | Outcome |
| --- | --- | --- | --- | --- |
| S3 + CloudFront | CDN, no cold starts | Nothing to patch; a second cloud vendor | About $0 | Rejected: one vendor was preferred |
| GitHub Pages, Cloudflare Pages, Netlify | CDN | Nothing to patch; another vendor | $0 | Not evaluated in depth, same reason |
| Cloud Run with an nginx container | About 0.7 s first visit after a quiet spell | Image only patched when rebuilt; a second service needed for CMS sign-in | $0 | Rejected |
| Firebase Hosting plus a Cloud Run sign-in service | CDN, no cold starts | Nothing to patch for pages; supported custom domain; two products; spend cap covers only the sign-in | $0 | Strong alternative; not chosen\* |
| Cloud Run behind a load balancer | About 0.7 s first visit after a quiet spell | Fully supported custom domain | About $18/month | Rejected: 9x the budget |
| **One Cloud Run service, Node.js built-ins, automatic base image updates** | About 0.7 s first visit after a quiet spell | Google patches Linux and Node.js; no npm packages; one product; one spend cap covers everything; custom domain through domain mapping, a Preview feature | **$0** | **Chosen** |

\* Firebase Hosting would give instant first visits (CDN) and a generally available custom
domain. It wasn't chosen because it meant two products for the owner to understand, and its spend
cap covered only the sign-in service. A tripped cap on the chosen design pauses the whole site,
which the budget alerts warn about first.

### Decision log

| Decision | Instead of | Why |
| --- | --- | --- |
| Static site (Astro) with a git-backed CMS (Sveltia) | WordPress, Grav, Decap, TinaCMS, Eleventy | Cost ceiling, nothing to maintain, every change versioned |
| One Cloud Run service; Node.js built-ins on Google's base image with automatic updates | Firebase Hosting plus a sign-in service; an nginx container; Express | One product, one spend cap, nothing to patch |
| Home page and portfolio in one repository, with pull request checks | Two repositories, portfolio on a subdomain | Keeps `/portfolio/` on the main domain with a shared theme; splitting one domain by path would need a load balancer |
| Production deploy identity accepts only `main` | Any branch | Once an AI agent creates branches, a workflow on a branch could otherwise deploy to production |
| Custom domain through Cloud Run domain mapping (Preview) | A load balancer | About $18/month, 9x the budget |
| CMS sign-in through a GitHub OAuth App with the token exchange on the same service | The owner pasting a GitHub personal access token into the CMS | One click; no token to create, store, and renew |
| Cloud Run spend cap of $5/month | $1/month | A tripped cap takes the whole site offline, so leave room above normal use |
| DNS stays at the existing registrar | Route 53 or Cloud DNS | No hosted-zone fee; nothing to move |
| Agent rules in `AGENTS.md`, enforced by pull request checks | Tying the workflow to one AI agent | Claude Code and Google Antigravity both read `AGENTS.md`; any agent that can edit files and open pull requests works |

### Known risks and open items

| Item | Impact | Plan |
| --- | --- | --- |
| Domain mapping is a Preview feature | Could change, with no SLA | Put Firebase Hosting in front of the same service with a rewrite that sends every path to it ($0, no code change), or use a load balancer (about $18/month) |
| Spend cap pauses the whole site if it trips | Offline until the 1st of next month | $5 is far above normal use ($0); the $2 budget emails warn first |
| `public/admin/index.html` loads Sveltia CMS from unpkg with no version pin | A new release can change the editor without warning | Pin a version |
| Guardrails are checks, not locks (see below) | A failing pull request can still be merged | Owner is told not to merge red checks or add `allow-any-path` |
| No automatic preview links on pull requests | Previews are a manual tagged deploy | Would need a separate, narrower preview identity |
| Contact form | `mailto:` link only | A route on the same service, with a honeypot field and rate limiting |

## Guardrails for AI-agent edits

| Guardrail | How | Catches |
| --- | --- | --- |
| Agent instructions | `AGENTS.md` (Claude Code reads it through `CLAUDE.md`): allowed files, no new packages, keep the portfolio link, always open a pull request | Most mistakes, before they happen |
| Path allowlist | `scripts/check-home-pr.sh` fails if a pull request changes anything except `src/pages/index.astro`, `src/home/**`, `public/home/**`, or `public/theme.css`. A developer adds the `allow-any-path` label to skip it for intended changes elsewhere | Agent edits to the CMS, portfolio, workflows, or dependencies |
| Link check | The same script fails if the built `dist/index.html` has no `href="/portfolio/"` | A redesign that strands the portfolio |
| Build check | `.github/workflows/pr-checks.yml` runs `npm run build` | A page that doesn't compile |
| Deploy identity locked to `main` | The Workload Identity provider accepts only tokens from `YOUR_GITHUB_OWNER/YOUR_REPO` on `refs/heads/main` | A workflow on an agent's branch deploying to production |
| No public-access flags in deploys | Deploys never pass `--allow-unauthenticated` or `--no-invoker-iam-check`; the deployer isn't allowed to change public access, and every deploy keeps the current setting | A deploy that widens or breaks access |
| Undo | GitHub **Revert** on the merged pull request | Anything that slips through |

On GitHub Free a private repository can't have protected branches, so these are checks, not
locks: a failing check flags a bad change but can't stop someone merging it. That's an accepted
trade-off for a one-person site. On a paid plan, make the PR checks required on `main`.

## Cost

**Budget ceiling: $2/month. Expected: $0/month.** A bad month (a burst of bot traffic, lots of
publishing) should still come in under $0.25. Nothing runs while nobody is visiting.

| Piece | Free each month | Expected use | Cost |
| --- | --- | --- | --- |
| Cloud Run `my-site` | 2 million requests, 180,000 vCPU-seconds, 360,000 GiB-seconds | A few thousand requests, mostly bots | $0 |
| Cloud Run outbound data | 1 GiB to North America | Small pages; photos are the main driver | $0 |
| Cloud Build (source deploys) | 2,500 build-minutes | 1 to 2 minutes per publish | $0 |
| Artifact Registry | 0.5 GB | A few MB, kept small by the cleanup policy | $0 |
| Cloud Storage (deploy source uploads) | 5 GB in `us-central1` | About 2.5 MB per publish | $0 |
| Secret Manager | 6 secret versions, 10,000 reads | 1 version, a read per instance start | $0 |
| Cloud Logging | 50 GiB | A few MB | $0 |
| Domain mapping and HTTPS certificate | Free | | $0 |
| GitHub Actions | 2,000 minutes (private repo, GitHub Free) | About 1 minute per publish | $0 |

Free allowances count per billing account, across all its projects, so a billing account used only
for this site keeps them to itself. Outside Google Cloud, the owner pays only the yearly domain
renewal and any email hosting.

**What would raise the bill:** large photos with real traffic (1 GiB is about 200 visits to a page
with 5 MB of photos; resize uploads to under 500 KB); `--min-instances` above 0 (one always-on
instance costs several dollars a month); a load balancer (about $18/month).

**Limits:** a $2/month budget on the billing account with alerts at 50%, 90%, and 100% (budgets
only send email), and a $5/month **spend cap** scoped to Cloud Run in the project, which does stop
the service. The cap counts gross estimated cost and isn't instant, so a burst can go slightly
over. If it trips, the whole site pauses until the 1st of the next month unless someone raises or
lifts it in **Billing > Budgets & alerts**. Moving the project to another billing account deletes
its spend caps, so recreate them afterwards. Free tier figures were checked against Google's
pricing pages at launch; recheck them before quoting.

## Operations

**Editing.** Portfolio: `/admin`, edit, Save (saving publishes; there's no draft step). Home page:
ask an AI agent to "work on a branch and open a pull request", wait for green checks, merge. Agents
that run locally or in Cloud Shell can push directly, so always ask for a pull request; a push to
`main` goes live without the checks.

**Structural portfolio changes** (new CMS fields, detail pages) are developer tasks: they must
change `public/admin/config.yml`, `src/content/config.ts`, and `src/pages/portfolio.astro` together,
and the path check fails until a developer reviews and adds `allow-any-path`. Example: "Add an
optional `url` field to work items in the CMS config and schema, and show a 'Visit project' link
on cards when it's set."

**Undo.**

- Home page change: open the merged pull request on GitHub, click **Revert**, and merge the revert
  pull request.
- Portfolio edit: edit it back in `/admin`, or find the old text in the repository's commit
  history and have a developer or agent revert that commit.
- Bad deploy: send traffic to an earlier revision (console: **Cloud Run > my-site > Revisions >
  Manage traffic**). The next push to `main` moves traffic forward again.

**If the site looks wrong:** check the latest **Deploy** run in GitHub Actions (a red X shows the
failing step); check the service in the Cloud Run console; if the whole site is down with no recent
change, check **Billing > Budgets & alerts** for a tripped spend cap.

**Branch previews.** A developer can deploy a branch as a tagged revision with no traffic. It gets
its own `https://preview---my-site-...run.app` address; the live site doesn't change.

**Rotating the GitHub OAuth secret.** Generate a new client secret in the OAuth App, add it as a new
version of `github-oauth-client-secret`, start a new revision, sign in at `/admin` to check, then
delete the old secret in the OAuth App.

**Monthly checklist (5 minutes):** recent Deploy runs are green; **Billing > Reports** for the
project shows $0 (or under $0.25); no budget alert emails. **Renewals:** the domain (yearly, or
auto-renew at the registrar), and the Node.js base image before `nodejs24` reaches end of support
(about April 2028). Cloud Run has no contract or base fee.

## Access and handoff model

The pattern: **the client owns everything from day one**, and the contractor works inside it with
narrow, removable access.

| Account | Owns or does |
| --- | --- |
| Owner's admin account | Google Cloud organization and project (Owner), the GitHub repository, the GitHub OAuth App, the domain. Keep organization and billing admin groups to the owner alone |
| Contractor account inside the owner's domain (for example a Cloud Identity Free user, no mailbox) | Does the work. Using an account in the owner's domain avoids weakening a domain restricted sharing policy, and the owner can suspend it at any time |
| Service accounts | One per job, least privilege, no keys (below) |

**Service accounts:**

| Account | Roles |
| --- | --- |
| `my-site-runtime@` | Secret Manager Secret Accessor on `github-oauth-client-secret` only |
| `my-site-build@` | Cloud Run Builder (source deploys package the service as this account) |
| `my-site-deployer@` | Cloud Run Source Developer, Service Usage Consumer, and Service Account User on the runtime and build accounts only. GitHub Actions signs in as this account through Workload Identity Federation |

**Contractor roles on the project:** Owner only while building (Google doesn't allow an expiry on
Owner, so set a reminder to remove it). Afterwards: Cloud Run Developer (redeploy, roll back,
previews, but not change who has access), Logs Viewer, Monitoring Viewer, and Service Account User
on the runtime and build accounts only. The contractor can't read secret values, change billing, or
act outside this project. If they need email-admin help later, grant a narrow admin role, never
super admin: a super admin can make itself an organization administrator in Google Cloud.

**Billing:** if someone other than the owner pays during the build, use a separate billing account
used only for this project, so costs and free allowances stay separate and handoff is a relink with
no downtime. Give the owner Billing Account Viewer on it; grant Billing Account User only long
enough to link the project.

**Organization policies:** Google Cloud Setup's recommended policies work with this design: domain
restricted sharing (hence the invoker IAM check instead of `allUsers`), no service account keys
(hence Workload Identity Federation), and no automatic Editor for default service accounts (hence
the explicit build account). A "Proof of concept" foundation is enough; "Production" adds logging
projects and services this site doesn't use.

**At handoff:**

1. Link the project to the owner's billing account, then recreate the budget and the Cloud Run
   spend cap there (moving billing deletes spend caps).
2. Add the owner as an owner of the domain in Google Search Console.
3. Remove the contractor's Owner role and any roles left from earlier plans. Decide whether the
   contractor keeps the narrow support roles under an agreement; if not, remove them and suspend
   the account.
4. Remove contractor collaborators from the GitHub repository when their work is done.
5. Close any temporary billing account after the last invoice.

## Deploying your own copy

<details>
<summary>Placeholders, setup steps, and command reference (for developers)</summary>

### Placeholders

Replace these everywhere (`grep -rn YOUR_ --exclude-dir=node_modules .` finds most of them):

| Placeholder | Meaning |
| --- | --- |
| `YOUR_GCP_PROJECT_ID` | Google Cloud project ID |
| `YOUR_GCP_PROJECT_NUMBER` | Google Cloud project number |
| `us-central1` | Region (a sensible default; any Cloud Run region with domain mapping works) |
| `my-site` | Cloud Run service name |
| `my-site-runtime@YOUR_GCP_PROJECT_ID.iam.gserviceaccount.com` | Runtime service account |
| `my-site-deployer@YOUR_GCP_PROJECT_ID.iam.gserviceaccount.com` | Deploy service account |
| `my-site-build@YOUR_GCP_PROJECT_ID.iam.gserviceaccount.com` | Build service account |
| `YOUR_GITHUB_OWNER/YOUR_REPO` | GitHub repository |
| `YOUR_GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth App client ID (public, but per deployment) |
| `https://my-site-YOUR_GCP_PROJECT_NUMBER.us-central1.run.app` | Cloud Run service URL |
| `example.com` | Custom domain |
| `my-site` | gcloud configuration name in `.gcloud-config` |

Files that hold them: `.github/workflows/deploy.yml`, `public/admin/config.yml`,
`scripts/gcloud-init.sh`, `.gcloud-config`, `astro.config.mjs` (`site`), and the `ALLOWED_ORIGINS`
default in `server/server.js`. Replace the sample content in `src/content/` and the name in
`src/pages/index.astro` and `src/pages/404.astro`. Until every placeholder in `deploy.yml` is
filled in, the Deploy workflow builds the site and skips the Google Cloud steps, so it deploys
nothing.

### Local development

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
```

`/admin` only signs in against the deployed service. To check a home page change the way the pull
request check does: `npm run build`, then `bash scripts/check-home-pr.sh origin/main HEAD` (add
`--skip-paths` to skip the allowlist).

### Steps

Steps without a command here aren't scripted in this repo; follow the named Google or GitHub
documentation.

1. **Repository.** Push this code to a new GitHub repository, `YOUR_GITHUB_OWNER/YOUR_REPO`
   (private is fine). Create a label named `allow-any-path` (GitHub docs: "Managing labels").
2. **Project and APIs.** Create a Google Cloud project, link a billing account, and note its ID
   and number. Enable the APIs this setup uses: Cloud Run Admin, Cloud Build, Artifact Registry,
   Secret Manager, IAM Service Account Credentials, and Security Token Service (Google Cloud docs:
   "Enabling an API in your Google Cloud project").
3. **gcloud.** Set `PROJECT_ID` and `CONFIG` in `scripts/gcloud-init.sh` (`CONFIG` must match
   `.gcloud-config`), run `gcloud auth login`, then `bash scripts/gcloud-init.sh`. It creates a
   named gcloud configuration for this project without activating it, so commands meant for other
   projects can't land here. Select it in each terminal with
   `export CLOUDSDK_ACTIVE_CONFIG_NAME=my-site`, and confirm with `gcloud config get project`
   before changing anything.
4. **Service accounts** (Google Cloud docs: "Create service accounts"), with the roles listed in
   [Access and handoff model](#access-and-handoff-model).
5. **Workload Identity Federation.** Create a pool `github-pool` with an OIDC provider
   `github-provider` for GitHub Actions, with an attribute condition that accepts only repository
   `YOUR_GITHUB_OWNER/YOUR_REPO` and ref `refs/heads/main`. Let that principal impersonate
   `my-site-deployer@` (Workload Identity User). Create no service account keys. References: Google
   Cloud docs "Configure Workload Identity Federation with deployment pipelines", and the README
   of `google-github-actions/auth`. The provider's full path goes in `WIF_PROVIDER` in
   `deploy.yml`.
6. **GitHub OAuth App** (GitHub docs: "Creating an OAuth app"), owned by the site owner's account.
   Homepage URL `https://example.com`; Authorization callback URL
   `https://my-site-YOUR_GCP_PROJECT_NUMBER.us-central1.run.app/callback`. Put the client ID in
   `GITHUB_CLIENT_ID` in `deploy.yml`. Generate a client secret.
7. **Secret.** In the console, **Security > Secret Manager**, create `github-oauth-client-secret`
   and paste the client secret as its value. Never paste it into a terminal, chat, or file.
8. **CMS config.** In `public/admin/config.yml`, set `repo` and `base_url` (the service URL,
   matching the OAuth callback). Set `ALLOWED_ORIGINS` in `deploy.yml` to every origin `/admin`
   is opened from: the custom domain and the service URL.
9. **First deploy**, by hand as a project owner, with the same flags as `deploy.yml`:

   ```bash
   npm ci && npm run build
   rm -rf server/public && cp -R dist server/public
   gcloud run deploy my-site --source server \
     --base-image nodejs24 --automatic-updates \
     --service-account "my-site-runtime@YOUR_GCP_PROJECT_ID.iam.gserviceaccount.com" \
     --build-service-account "projects/YOUR_GCP_PROJECT_ID/serviceAccounts/my-site-build@YOUR_GCP_PROJECT_ID.iam.gserviceaccount.com" \
     --min-instances 0 --max-instances 2 \
     --set-env-vars "^;^GITHUB_CLIENT_ID=YOUR_GITHUB_OAUTH_CLIENT_ID;ALLOWED_ORIGINS=https://example.com,https://my-site-YOUR_GCP_PROJECT_NUMBER.us-central1.run.app" \
     --set-secrets "GITHUB_CLIENT_SECRET=github-oauth-client-secret:latest"
   ```

10. **Public access, once.** As a project owner, make the service public. If your organization
    enforces domain restricted sharing, it blocks granting the invoker role to `allUsers`; turn
    off the service's invoker IAM check instead (Cloud Run docs: "Allowing public
    (unauthenticated) access"). Deploys keep this setting; the deployer can't change it.
11. **Automatic deploys.** Push to `main`. The Deploy workflow signs in as `my-site-deployer@`
    and deploys. Check that a workflow on another branch can't authenticate.
12. **Custom domain.** Verify `example.com` in Google Search Console as the account that creates
    the mapping, then map it to `my-site` and add the DNS records it shows at your registrar
    (Cloud Run docs: "Mapping custom domains"). Keep every `google-site-verification` TXT record;
    Google rechecks them. Add the domain's origin to `ALLOWED_ORIGINS` if you haven't.
13. **Cost limits and cleanup.** Create the $2 budget and the $5 Cloud Run spend cap (Cloud Billing
    docs: "Create, edit, or delete budgets and budget alerts", and Cloud Run's spend cap
    documentation). Add the Artifact Registry cleanup policy on `cloud-run-source-deploy`: keep
    the newest 5, delete older than 30 days (Artifact Registry docs: "Configure cleanup policies").
14. **Check.** Open `/admin`, sign in with GitHub, save a small change, and watch it deploy.

Don't connect Cloud Build triggers or `gcloud builds connections` to the repository; GitHub Actions
already deploys, and a second pipeline would compete with it.

### Command reference

Status, revisions, logs, and rolling back to an earlier revision:

```bash
gcloud run services describe my-site --format="value(status.url,status.latestReadyRevisionName)"
gcloud run revisions list --service my-site --limit 5
gcloud run services logs read my-site --limit 50
gcloud run services update-traffic my-site --to-revisions my-site-00012-abc=100
```

Branch preview (a tagged revision with no traffic):

```bash
npm ci && npm run build
rm -rf server/public && cp -R dist server/public
gcloud run deploy my-site --source server --no-traffic --tag preview \
  --base-image nodejs24 --automatic-updates
```

Start a new revision after adding a secret version, and check the custom domain:

```bash
gcloud run services update my-site --update-secrets GITHUB_CLIENT_SECRET=github-oauth-client-secret:latest
gcloud beta run domain-mappings describe --domain example.com
```

</details>
