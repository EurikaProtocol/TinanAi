# TINAN AI

TINAN AI is an early-stage agent workspace built on Next.js App Router, React, and TypeScript.

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
| `TINAN_AI_BASE_URL` | No | OpenAI-compatible API base URL; defaults to `https://api.openai.com/v1`. HTTPS is required except for localhost development. |
| `TINAN_AI_TIMEOUT_MS` | No | Provider timeout from 1,000 to 60,000 ms; defaults to 20,000 ms. |
| `TINAN_AUTH_USERNAME` | Required | Single-owner Basic Auth username for the application and API. |
| `TINAN_AUTH_PASSWORD` | Required | Single-owner Basic Auth password; must be at least 32 characters. Set server-side and use HTTPS in production. |
| `TINAN_ENABLE_FILE_READING` | No | Must be `true` to allow explicitly authorized workspace file reads. |
| `TINAN_PROJECTS_DIR` | No | Root directory for isolated generated project workspaces; defaults to the OS temporary directory at `tinan-ai-projects`. |
| `TINAN_SANDBOX_IMAGE` | For checks | Pre-pulled `node:<tag>@sha256:<64 lowercase hex>` image. Docker runs only fixed npm check commands with network disabled, a read-only container root, resource limits, and the generated project mounted as the only writable workspace. The service never pulls images itself. |
| `TINAN_SANDBOX_VERIFIED` | For checks | Must be `true` only after an operator has verified Docker isolation in the deployment environment. Checks return unavailable and do not spawn Docker otherwise. |

No real provider credentials were available during implementation, so provider integration was tested with mocked HTTP responses; a paid/external provider connection is not claimed.

## Project Builder

- Visit `/projects` to submit natural-language requirements. A configured real provider is required; without it, generation fails with a setup message and no project is claimed as generated.
- Provider output is validated and limited to 12 files, 128 KiB total source, and safe relative paths. Each project lives in a separate permission-restricted filesystem directory.
- Source export is a `.tar.gz` containing generated source and a draft `deployment.config.json`. The draft does not deploy. Preview status remains “not started.”
- Lint, type-check, test, and build checks run only inside Docker with a digest-pinned image, no network, no install step, resource limits, and static command choices. Generated project dependencies may be absent, so failed checks are recorded rather than hidden.
- After a failed check, one explicit AI repair attempt is available per project. Updates are diffed and the prior source can be restored using the process-local rollback snapshot.
- Checks are disabled until the operator attests that real sandbox isolation has been verified with `TINAN_SANDBOX_VERIFIED=true`. Projects declaring npm scripts outside the fixed command allowlist are rejected before Docker starts.

## Persistence and deployment limits

The app and APIs require a single-owner HTTP Basic Auth credential configured with `TINAN_AUTH_USERNAME` and a generated 32+ character `TINAN_AUTH_PASSWORD`; requests are challenged before the app runs, unsafe methods require a same-origin `Origin`/`Referer`, and production requests require HTTPS. The username is reduced to an opaque SHA-256 owner ID, which is recorded with projects/tasks and checked for reads, changes, exports, approvals, and cancellation. Existing workspaces without a valid owner ID are not visible through owner-scoped APIs. This is a single shared account, not multi-user authentication: do not expose the service to untrusted users. Project files and metadata use the configured server filesystem (default OS temporary directory); task queues, cancellation state, and rollback snapshots remain process-local and are lost on restart. There is no database or durable shared storage.

## Phase 4 verification status

- Real provider/project generation was not verified in the development environment: `TINAN_AI_PROVIDER`, `TINAN_AI_API_KEY`, and `TINAN_AI_MODEL` were not configured, and no local environment file was present. Configure those server-only values (optionally `TINAN_AI_BASE_URL` and `TINAN_AI_TIMEOUT_MS`) in the deployment secret manager, then run a small generation request and verify its persisted files and archive. Never place the API key in a `NEXT_PUBLIC_` variable, source control, or logs.
- Docker Engine 28.0.4 is available, but there is no Node image in its local image cache and `TINAN_SANDBOX_IMAGE` is unset. Real sandbox project checks remain blocked; `TINAN_SANDBOX_VERIFIED` is also unset, so execution fails closed even if an image is later provided until an operator verifies isolation.
- Tests cover mocked provider responses/failures/timeouts, mock-generated website file export, cross-owner resource filtering, traversal rejection, task cancellation, and mocked sandbox command construction/failure. They do not prove live OpenRouter connectivity, a real model-generated project, or real Docker isolation. Database persistence is not implemented.

### Manual OpenRouter website generation test

Only run this after configuring `TINAN_AI_PROVIDER=openai-compatible`, the OpenRouter key as server-side `TINAN_AI_API_KEY`, the exact OpenRouter model ID as `TINAN_AI_MODEL`, `TINAN_AI_BASE_URL=https://openrouter.ai/api/v1`, and the two `TINAN_AUTH_*` values on the application host. The command below makes a real provider request and may incur charges; it does not pass the OpenRouter key to curl. Set `TINAN_AUTH_USERNAME` locally and curl will prompt for the corresponding Basic Auth password.

```bash
APP_ORIGIN='https://tinaneureka.com'
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

## Production deployment checklist — tinaneureka.com

This repository has no application deployment workflow; the visible GitHub Actions workflows are Copilot automations, not application deployment. Configure the environment on the actual Next.js hosting platform. Do not deploy or change DNS until the owner explicitly approves. All items below remain required before production use:

- [ ] Replace single-owner Basic Auth with the selected production identity provider before multi-user use; preserve server-side ownership checks, origin protections, and HTTPS.
- [ ] Choose a supported database and durable project-file storage. Add migrations, per-user project ownership, transactional task state, access controls, retention policy, encrypted transport/storage, automated backups, and a tested restore procedure. Configure `TINAN_PROJECTS_DIR` only for a durable, access-restricted volume until object storage is implemented.
- [ ] Configure host-side server-only secrets: `TINAN_AUTH_USERNAME`, a strong `TINAN_AUTH_PASSWORD`, `TINAN_AI_PROVIDER=openai-compatible`, `TINAN_AI_API_KEY`, and `TINAN_AI_MODEL`; set `TINAN_AI_BASE_URL=https://openrouter.ai/api/v1` and `TINAN_AI_TIMEOUT_MS` as appropriate. Map the existing OpenRouter secret into `TINAN_AI_API_KEY` in the application host’s secret manager; GitHub Actions secrets do not automatically reach the running app. Keep file reading disabled unless specifically required and authorized.
- [ ] Provision a dedicated sandbox worker/host and approved digest-pinned Node image, then set `TINAN_SANDBOX_IMAGE`. Keep untrusted project execution isolated from the web process and production credentials; do not expose a privileged Docker socket to a publicly reachable application. Verify network denial, filesystem boundaries, resource/time limits, cancellation, and cleanup with a real container, then explicitly set `TINAN_SANDBOX_VERIFIED=true`.
- [ ] Configure HTTPS/TLS for `tinaneureka.com`, force HTTPS, set appropriate security headers, and verify secure cookie settings. Preserve current DNS and hosting assignments unless separately approved.
- [ ] Configure distributed rate limits and execution budgets, provider and sandbox timeouts, structured redacted audit logs, metrics/alerts, error tracking, and operational runbooks. Ensure logs never contain provider keys or sensitive project contents.
- [ ] Validate generation, file persistence, export, authorization/isolation, backup restoration, sandbox checks, cancellation, and failure recovery in staging. Run dependency/security checks and production build before requesting deployment approval.
- [ ] Prepare a rollback plan and verify backups and monitoring before any approved release.

## Dependency audit

The current `npm audit` reports 9 findings (7 high, 2 moderate, 0 critical). The affected dependency paths are:

- High: direct `tailwindcss@3.3.3` → `chokidar@3.6.0` → `braces@3.0.3`; direct `tailwindcss@3.3.3` → `fast-glob@3.3.3` → `micromatch@4.0.8` → `braces@3.0.3`; and `tailwindcss@3.3.3` → `postcss-nested@6.2.0` → `postcss-selector-parser@6.1.4`.
- High: direct `eslint-config-next@15.5.27` → `@next/eslint-plugin-next@15.5.27` → `fast-glob@3.3.1` → `micromatch@4.0.8` → `braces@3.0.3`.
- Moderate: `postcss-nested@6.2.0` → `postcss-selector-parser@6.1.4` is affected by the parser advisory for versions below 7.1.6.

`npm audit fix` had already applied compatible updates before this verification and the current audit remains at 9 findings. npm recommends Tailwind CSS 4.3.3 for the Tailwind-related findings, a major-version migration; its registry currently lists 3.4.19 as the last Tailwind 3 release, which remains in the reported affected range. For `eslint-config-next`, the suggested 14.2.35 remediation is a major downgrade from the installed 15.5.27 and does not match the installed Next.js 15 line. No additional dependency change was made because the available remediations are breaking; plan and validate the Tailwind/Next lint-tooling upgrades separately.

## Local development and validation

```bash
npm ci
npm run dev
npm test
npm run lint
npm run build
```

The earlier audit remediation reduced findings from 19 (3 moderate, 16 high) to 9. Re-run `npm audit` before each deployment; advisories and compatible fixes can change.
