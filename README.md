# TINAN AI

TINAN AI is an AI-assisted project workspace built on Next.js App Router, React, and TypeScript. The public homepage is available at `/`; `/workspace`, `/projects`, and API routes require the configured single-owner HTTP Basic Auth credentials.

## Agent core

- `POST /api/agent/tasks` accepts an objective (maximum 2,000 characters) and returns a task ID. `GET /api/agent/tasks/:id` polls status; `/cancel` cancels active work; `/approval` records explicit approval or decline.
- `TINAN_AI_PROVIDER` selects `demo` (default) or `openai-compatible`. Demo plans are deterministic and simulated; they never call a model or execute tools.
- The OpenAI-compatible provider sends server-side requests to `/chat/completions` and validates the returned structured plan. Only the four registered tools can run: `project.info`, `files.read`, `tasks.track`, and `tests.propose`. Test commands are proposals only; no shell commands or file writes are executed.
- Production/financial/destructive objectives wait for user approval. Approval does not enable unsupported deployment, financial, write, or shell operations.
- File reading is disabled unless `TINAN_ENABLE_FILE_READING=true` and the user explicitly supplies authorized relative paths in the task request. Paths are checked against traversal, symlinks, secrets, and a 64 KiB limit.
- The process-local limiter allows 20 task submissions per minute per server process. This is a coarse development safeguard, not a substitute for authenticated, distributed production rate limiting.

## Server environment

All provider secrets are server-only. Do not prefix these values with `NEXT_PUBLIC_`.

| Variable | Required | Description |
| --- | --- | --- |
| `TINAN_AI_PROVIDER` | No | `demo` (default) or `openai-compatible`. |
| `TINAN_AI_API_KEY` | For real provider | API key, read only by server code. |
| `TINAN_AI_MODEL` | For real provider | Model identifier supported by the configured endpoint. |
| `TINAN_AI_BASE_URL` | No | OpenAI-compatible API base URL; defaults to `https://openrouter.ai/api/v1`. HTTPS is required except for localhost development. |
| `TINAN_AI_TIMEOUT_MS` | No | Provider timeout from 1,000 to 60,000 ms; defaults to 20,000 ms. |
| `TINAN_AUTH_USERNAME` | Required | Single-owner Basic Auth username for the application and API. |
| `TINAN_AUTH_PASSWORD` | Required | Single-owner Basic Auth password; must be at least 32 characters. Set server-side and use HTTPS in production. |
| `TINAN_ENABLE_FILE_READING` | No | Must be `true` to allow explicitly authorized workspace file reads. |
| `TINAN_SANDBOX_VERIFIED` | No | Execution remains disabled. Setting this value does not enable project checks. |

No real provider credentials were available during implementation, so provider integration was tested with mocked HTTP responses; a paid/external provider connection is not claimed.

## Cloudflare Workers

This project uses `@opennextjs/cloudflare@1.19.11` with Next.js `15.5.27` (the adapter peer range includes Next `>=15.5.18 <16`) and Wrangler `4.150.0` (Node.js 22 or newer). The adapter version was chosen instead of `1.20.11` because the latter added npm audit findings in this repository's lockfile. `.node-version` selects Node 22. OpenNext builds the app and Worker bundle with `npm run build:cloudflare`; `npm run preview:cloudflare` previews that bundle locally, and `npm run deploy:cloudflare` deploys it when explicitly invoked. Sandbox checks remain disabled by default.

Project metadata, tasks, repair state, and distributed project locks are stored in D1. Generated file contents and rollback snapshots are stored in R2. Every project lookup and mutation is scoped by the authenticated owner ID; object keys also include that owner ID. Unit tests use SQLite-backed D1-compatible bindings and an R2 binding mock, then reload the project-store module between operations to simulate separate requests and a Worker restart.

### Provision durable storage

Create the Cloudflare resources from the repository root:

```bash
npx wrangler d1 create tinan-ai-metadata
npx wrangler r2 bucket create tinan-ai-project-files
```

The deployment environment used for this work has no authenticated Cloudflare account, so no real D1 database could be verified or configured. Before deploying, authenticate Wrangler with `npx wrangler login` (or provide an authorized `CLOUDFLARE_API_TOKEN`), run the commands above in the intended account, and set the `database_id` property in the `TINAN_DB` binding in `wrangler.jsonc` to the exact ID returned by `npx wrangler d1 create`. Do not deploy until the binding contains the real ID. Keep the names and binding identifiers aligned with the config:

| Resource | Wrangler binding | Resource name |
| --- | --- | --- |
| D1 database | `TINAN_DB` | `tinan-ai-metadata` |
| R2 bucket | `TINAN_PROJECT_FILES` | `tinan-ai-project-files` |

Apply the D1 migration to the remote database before deploying:

```bash
npx wrangler d1 migrations apply tinan-ai-metadata --remote
```

For local Worker preview, initialize Wrangler's local D1 database first:

```bash
npx wrangler d1 migrations apply tinan-ai-metadata --local
npm run preview:cloudflare
```

Wrangler persists local D1/R2 preview state under the ignored `.wrangler/` directory. Cloudflare production and preview Workers need both bindings configured; the names above are already declared in `wrangler.jsonc`. D1 stores project/task JSON metadata, ownership, check/repair state, and locks. R2 stores source files and durable rollback snapshots. Do not manually expose either binding to browser code.

Project persistence tests verify create, update, retrieve, export, and rollback through newly loaded storage modules against the same D1/R2 backing data. This exercises the durable binding contract across request/module restarts; production Cloudflare account provisioning and remote persistence have not been tested from this environment.

### Workers Builds screen

In **Workers & Pages → Workers → Build → Build settings**, use:

- **Production branch:** `main` (merge this feature branch into `main` before enabling production builds).
- **Root directory:** `/` (repository root).
- **Build command:** `npm run build:cloudflare`.
- **Deploy command:** `npm run deploy:cloudflare`.
- **Build environment variable:** `NODE_VERSION=22` (also recorded in `.node-version`).
- **Install command, if shown:** `npm ci`.

This repository currently has only Copilot automation workflows, not an application deployment workflow. Workers Builds must install and publish the app from the application repository; GitHub Actions secrets do not automatically become Cloudflare runtime bindings.

The Wrangler config enables only the default `workers.dev` endpoint; it has no custom-domain routes. After a successful deployment, Wrangler will report a URL in the form `https://tinanai2.<account-subdomain>.workers.dev`. The account subdomain is assigned by Cloudflare and cannot be confirmed until deployment in the authorized account. No domain, DNS record, nameserver, or registration is changed by this configuration.

### Worker runtime settings

Set the following under the Worker's **Settings → Variables and Secrets** for each environment (production and preview/development separately).

| Name | Type | Value |
| --- | --- | --- |
| `TINAN_AUTH_USERNAME` | Variable | Your single-owner sign-in name. |
| `TINAN_AUTH_PASSWORD` | Secret | A newly generated random value of at least 32 characters. |
| `TINAN_AI_PROVIDER` | Variable | `openai-compatible` to enable real provider requests; `demo` keeps real requests disabled. |
| `TINAN_AI_API_KEY` | Secret | The existing OpenRouter secret, entered directly in Cloudflare's secret UI. Do not paste it into GitHub source, build logs, or chat. |
| `TINAN_AI_MODEL` | Variable | Exact model ID selected from OpenRouter. |
| `TINAN_AI_BASE_URL` | Variable | `https://openrouter.ai/api/v1`. |
| `TINAN_AI_TIMEOUT_MS` | Variable | Optional integer from `1000` to `60000`; e.g. `20000`. |
| `TINAN_ENABLE_FILE_READING` | Variable | `false` unless explicitly needed. |
| `TINAN_SANDBOX_VERIFIED` | Variable | `false`; execution remains disabled in code. |

Set the provider to `openai-compatible` only when intentionally enabling paid/credit-consuming provider calls. Cloudflare secrets/variables are runtime settings and must be present on the deployed Worker; build-time secrets are not a substitute. For local Wrangler preview, copy `.dev.vars.example` to `.dev.vars` and use test-only values. Never put a real provider key in the example file.

## Project Builder

- Visit `/projects` to submit natural-language requirements. A configured real provider first returns a structured plan; source generation starts only after explicit approval. Planning itself makes a provider request and may incur provider charges. Without a configured provider, planning fails with a setup message and no project is claimed as generated.
- Provider output is validated and limited to 12 files, 128 KiB total source, and safe relative paths. Project metadata/tasks are owner-scoped in D1; source files and rollback snapshots use owner-prefixed R2 keys.
- Source export is a `.tar.gz` containing generated source and a draft `deployment.config.json`. The draft does not deploy. Preview status remains “not started.”
- Project execution and generated code checks are disabled in the interface and API; requests return unavailable and never spawn a process or execute model-generated commands.
- After a failed check, one explicit AI repair attempt is available per project. Updates are diffed and the prior source can be restored from the durable R2 snapshot.

## Persistence and deployment limits

The app and APIs require a single-owner HTTP Basic Auth credential configured with `TINAN_AUTH_USERNAME` and a generated 32+ character `TINAN_AUTH_PASSWORD`; requests are challenged before the app runs, unsafe methods require a same-origin `Origin`/`Referer`, and production requests require HTTPS. The username is reduced to an opaque SHA-256 owner ID, which is stored with projects/tasks and checked in D1 queries for reads, updates, exports, repair, rollback, and cancellation. This remains a single shared account, not multi-user authentication: do not expose the service to untrusted users. Project/task metadata is durable in D1 and source/snapshots are durable in R2; local process memory holds only transient abort controllers. Existing filesystem-only projects are not automatically migrated and are not visible through the D1-backed APIs.

## Phase 4 verification status

- Real provider/project generation was not verified in the development environment: `TINAN_AI_PROVIDER`, `TINAN_AI_API_KEY`, and `TINAN_AI_MODEL` were not configured, and no local environment file was present. Configure those server-only values (optionally `TINAN_AI_BASE_URL` and `TINAN_AI_TIMEOUT_MS`) in the deployment secret manager, then run a small plan-and-approval generation request and verify its persisted files and archive. Never place the API key in a `NEXT_PUBLIC_` variable, source control, or logs.
- Project checks and execution are disabled by the implementation; no Docker isolation is claimed. `TINAN_SANDBOX_VERIFIED` remains `false`.
- Tests cover mocked provider responses/failures/timeouts, D1/R2-compatible project create/update/retrieve/export/rollback across fresh store modules, owner filtering, path traversal rejection, task persistence/cancellation, and disabled execution. These tests do not prove remote Cloudflare account provisioning, live OpenRouter connectivity, or production storage availability.

### Manual OpenRouter website generation test

Only run this after configuring `TINAN_AI_PROVIDER=openai-compatible`, the OpenRouter key as server-side `TINAN_AI_API_KEY`, the exact OpenRouter model ID as `TINAN_AI_MODEL`, `TINAN_AI_BASE_URL=https://openrouter.ai/api/v1`, and the two `TINAN_AUTH_*` values on the application host. The command below makes a real provider request and may incur charges; it does not pass the OpenRouter key to curl. Set `TINAN_AUTH_USERNAME` locally and curl will prompt for the corresponding Basic Auth password.

```bash
APP_ORIGIN='https://tinanai2.<account-subdomain>.workers.dev'
TASK_ID=$(curl --fail-with-body --silent --show-error \
  --user "$TINAN_AUTH_USERNAME" \
  --header "Origin: $APP_ORIGIN" \
  --header 'Content-Type: application/json' \
  --data '{"requirements":"Build a minimal responsive sample services website. Include a homepage, semantic header and navigation, hero section, services section, and footer. Return actual HTML and CSS source files. Do not include shell commands."}' \
  "$APP_ORIGIN/api/projects" | jq -r '.task.id')

while :; do
  TASK=$(curl --fail-with-body --silent --show-error \
    --user "$TINAN_AUTH_USERNAME" \
    "$APP_ORIGIN/api/projects/tasks/$TASK_ID")
  STATUS=$(printf '%s' "$TASK" | jq -r '.task.status')
  [ "$STATUS" != 'generating' ] && break
  sleep 2
done

PROJECT_ID=$(printf '%s' "$TASK" | jq -r '.task.projectId')
test "$STATUS" = 'completed' && test "$PROJECT_ID" != 'null'
curl --fail-with-body --silent --show-error \
  --user "$TINAN_AUTH_USERNAME" \
  "$APP_ORIGIN/api/projects/$PROJECT_ID" | jq '.project.files'
curl --fail-with-body --silent --show-error \
  --user "$TINAN_AUTH_USERNAME" \
  --output tinan-sample-services.tar.gz \
  "$APP_ORIGIN/api/projects/$PROJECT_ID/export"
tar -tzf tinan-sample-services.tar.gz
```

This live test has not been run from this environment. A successful mocked unit test does not establish OpenRouter connectivity or live generation.

## Cloudflare deployment readiness — workers.dev

This repository has no application deployment workflow; the visible GitHub Actions workflows are Copilot automations, not application deployment. Configure the environment on the actual Next.js hosting platform. Do not deploy or change DNS until the owner explicitly approves. All items below remain required before production use:

- [ ] Replace single-owner Basic Auth with the selected production identity provider before multi-user use; preserve server-side ownership checks, origin protections, and HTTPS.
- [ ] Create the Cloudflare D1 database and R2 bucket listed in the Cloudflare Workers section, replace the placeholder D1 ID in `wrangler.jsonc`, apply migrations remotely, and verify persistence in a staging Worker across deploy/restart.
- [ ] Configure D1/R2 backups, retention, restore drills, and distributed rate limits before production. Existing filesystem-only projects require a separately planned migration.
- [ ] Configure host-side server-only secrets: `TINAN_AUTH_USERNAME`, a strong `TINAN_AUTH_PASSWORD`, `TINAN_AI_PROVIDER=openai-compatible`, `TINAN_AI_API_KEY`, and `TINAN_AI_MODEL`; the default `TINAN_AI_BASE_URL` is `https://openrouter.ai/api/v1`, with `TINAN_AI_TIMEOUT_MS` optional. Map the existing OpenRouter secret into `TINAN_AI_API_KEY` in the application host’s secret manager; GitHub Actions secrets do not automatically reach the running app. Keep file reading disabled unless specifically required and authorized.
- [ ] Keep project execution disabled. Any future execution feature needs a separately reviewed isolated execution service; do not enable it by setting a flag or exposing Docker to the Worker.
- [ ] Verify HTTPS, security headers, and secure cookie settings on the assigned `workers.dev` endpoint.
- [ ] Configure distributed rate limits and execution budgets, provider and sandbox timeouts, structured redacted audit logs, metrics/alerts, error tracking, and operational runbooks. Ensure logs never contain provider keys or sensitive project contents.
- [ ] Validate generation, file persistence, export, authorization/isolation, backup restoration, sandbox checks, cancellation, and failure recovery in staging. Run dependency/security checks and production build before requesting deployment approval.
- [ ] Prepare a rollback plan and verify backups and monitoring before any approved release.

## Dependency audit

The current `npm audit` reports 9 findings (7 high, 2 moderate, 0 critical). The affected dependency paths are:

- High: direct `tailwindcss@3.3.3` → `chokidar@3.6.0` → `braces@3.0.3`; direct `tailwindcss@3.3.3` → `fast-glob@3.3.3` → `micromatch@4.0.8` → `braces@3.0.3`; and `tailwindcss@3.3.3` → `postcss-nested@6.2.0` → `postcss-selector-parser@6.1.4`.
- High: direct `eslint-config-next@15.5.27` → `@next/eslint-plugin-next@15.5.27` → `fast-glob@3.3.1` → `micromatch@4.0.8` → `braces@3.0.3`.
- Moderate: `postcss-nested@6.2.0` → `postcss-selector-parser@6.1.4` is affected by the parser advisory for versions below 7.1.6.

`npm ci` and `npm audit` still report 9 findings (7 high, 2 moderate). No compatible safe fix is currently available without a major dependency migration: npm's Tailwind remediation is Tailwind CSS 4.3.3, while the installed Tailwind 3 line tops out at 3.4.19 and remains affected; npm's `eslint-config-next` suggestion is 14.2.35, a downgrade incompatible with the installed Next.js 15 line. The registry currently exposes `braces` 3.0.3, which remains in the affected range, and `postcss-nested` 6.x requires `postcss-selector-parser` 6.x while the parser advisory requires 7.1.6 or later. These findings remain unresolved and must be addressed in a separately tested Tailwind v4 / compatible Next lint-tooling migration; do not force-install incompatible versions.

## Local development and validation

```bash
npm ci
npm run dev
npm test
npm run lint
npm run build
```

The earlier audit remediation reduced findings from 19 (3 moderate, 16 high) to 9. Re-run `npm audit` before each deployment; advisories and compatible fixes can change.
