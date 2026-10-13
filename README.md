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
| `TINAN_ENABLE_FILE_READING` | No | Must be `true` to allow explicitly authorized workspace file reads. |
| `TINAN_PROJECTS_DIR` | No | Root directory for isolated generated project workspaces; defaults to the OS temporary directory at `tinan-ai-projects`. |
| `TINAN_SANDBOX_IMAGE` | For checks | Pre-pulled `node:<tag>@sha256:<64 lowercase hex>` image. Docker runs only fixed npm check commands with network disabled, a read-only container root, resource limits, and the generated project mounted as the only writable workspace. The service never pulls images itself. |

No real provider credentials were available during implementation, so provider integration was tested with mocked HTTP responses; a paid/external provider connection is not claimed.

## Project Builder

- Visit `/projects` to submit natural-language requirements. A configured real provider is required; without it, generation fails with a setup message and no project is claimed as generated.
- Provider output is validated and limited to 12 files, 128 KiB total source, and safe relative paths. Each project lives in a separate permission-restricted filesystem directory.
- Source export is a `.tar.gz` containing generated source and a draft `deployment.config.json`. The draft does not deploy. Preview status remains “not started.”
- Lint, type-check, test, and build checks run only inside Docker with a digest-pinned image, no network, no install step, resource limits, and static command choices. Generated project dependencies may be absent, so failed checks are recorded rather than hidden.
- After a failed check, one explicit AI repair attempt is available per project. Updates are diffed and the prior source can be restored using the process-local rollback snapshot.

## Persistence and deployment limits

No database or authentication service is configured in this repository. Project files and metadata are stored in per-project directories on the configured server filesystem (default OS temporary directory); task queues, cancellation state, and rollback snapshots are process-local and lost on restart. The APIs do not yet enforce user/project ownership. Do not expose this local development service to untrusted users or deploy it for multi-user use before adding authentication, authorization, durable queue state, and storage isolation.

## Dependency audit

The current `npm audit` reports 9 findings (7 high, 2 moderate, 0 critical): `eslint-config-next` and `@next/eslint-plugin-next` (high); `tailwindcss`, `braces`, `chokidar`, `fast-glob`, and `micromatch` (high); and `postcss-nested` and `postcss-selector-parser` (moderate). The reported fixes require a major `eslint-config-next` change or migration from Tailwind CSS 3 to 4. These breaking changes were not applied as part of the Project Builder work; reassess the audit and plan those migrations separately.

## Local development and validation

```bash
npm ci
npm run dev
npm test
npm run lint
npm run build
```

`npm audit fix` applied compatible transitive updates and reduced findings from 19 (3 moderate, 16 high) to 9 (2 moderate, 7 high; zero critical). Remaining **high** severity packages: `braces`, `chokidar`, `micromatch`, `fast-glob`, `@next/eslint-plugin-next`, `eslint-config-next`, and `tailwindcss`. Remaining **moderate** severity packages: `postcss-nested` and `postcss-selector-parser`. They are in the existing Tailwind 3 / Next lint-tooling dependency tree; npm's suggested full remediation upgrades Tailwind to v4, a breaking migration. No force upgrade was applied. Revisit after a Tailwind v4 migration or compatible upstream fixes.
