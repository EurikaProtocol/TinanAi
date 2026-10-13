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

No real provider credentials were available during implementation, so provider integration was tested with mocked HTTP responses; a paid/external provider connection is not claimed.

## Persistence and deployment limits

No database or authentication service is configured in this repository. Tasks are retained in a bounded in-memory map (up to 100 tasks) in one Node.js process; history is lost on restart and is not shared across serverless instances. A durable database and authenticated ownership model are required before production task history or multi-user use. Do not deploy the process-local task queue as a production durable execution service.

## Local development and validation

```bash
npm ci
npm run dev
npm test
npm run lint
npm run build
```

`npm audit fix` applied compatible transitive updates and reduced findings from 19 (3 moderate, 16 high) to 9 (2 moderate, 7 high; zero critical). Remaining **high** severity packages: `braces`, `chokidar`, `micromatch`, `fast-glob`, `@next/eslint-plugin-next`, `eslint-config-next`, and `tailwindcss`. Remaining **moderate** severity packages: `postcss-nested` and `postcss-selector-parser`. They are in the existing Tailwind 3 / Next lint-tooling dependency tree; npm's suggested full remediation upgrades Tailwind to v4, a breaking migration. No force upgrade was applied. Revisit after a Tailwind v4 migration or compatible upstream fixes.
