# TINANAI

This repository contains the current TINANAI Replit project: a pnpm monorepo with a React/Vite frontend, Express API, PostgreSQL/Drizzle schemas, and shared AI, Builder, Knowledge, payment, and Web3 code.

The application source was synchronized from Replit snapshot `71f59c2`. The previous Next.js/OpenNext/Cloudflare application is preserved in Git history and on `backup/before-tinanai-replacement`. Selected historical documentation and configuration are also retained under [`docs/legacy-github`](docs/legacy-github/INDEX.md); they are not the current runtime or deployment instructions.

## Workspace structure

| Path | Purpose |
| --- | --- |
| `artifacts/tinanai` | TINANAI React/Vite frontend |
| `artifacts/api-server` | Express API: authentication, AI, Builder, Knowledge, payments, and Web3 |
| `artifacts/eurika-dashboard` | Separate read-only EURIKA dashboard |
| `artifacts/mockup-sandbox` | Existing component/design preview artifact |
| `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` | API contract and generated clients |
| `lib/db` | Current PostgreSQL/Drizzle schema |
| `lib/tinanai-contracts` | Contract source, ABIs, local tests, and guarded deployment tooling |
| `docs` | Audit, safety, domain, and synchronization documentation |

## Requirements and installation

- Node.js 24.
- pnpm 10; synchronization was validated with pnpm 10.26.1.
- A separately configured development PostgreSQL database for database-backed commands.
- Server-only provider/authentication credentials configured through the environment's secret manager.

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm -r --if-present test
pnpm run build
```

`.env.example` is a blank configuration template, not a populated environment file. Never commit real environment files, provider keys, database URLs containing credentials, private keys, seed phrases, uploads, or user data.

## Development in Replit

Use the existing artifact-managed workflows for the API and frontend. Their service configuration supplies the preview ports and base paths. `replit.md` contains the workspace operation notes.

The repository copy of `.replit` is preserved exactly from the source project, including its existing public project/chain configuration and post-merge hook. It contains no provider key, private key, database password, or session secret. The post-merge script invokes a database schema-push command: **review and disable that hook through Replit's supported configuration flow before using it in any environment connected to production data.** Synchronization did not invoke the hook, run schema push, or change the current project's runtime configuration.

## Current feature boundaries

- Authentication uses the current Clerk integration. **Eureka Account SSO is not implemented in this source snapshot.** Historical EurekaCore Basic Auth/delegation code is archived for reference only; it is not wired into the current application.
- Builder provides reviewable generation, restricted static previews, and export. It is not a privileged full-stack execution worker.
- Knowledge uses account-scoped PostgreSQL storage and retrieval.
- Payments remain disabled pending verified configuration and separate explicit approval.
- Wallet and contract tools do not authorize deployment merely by being present. No chain transaction is part of synchronization.
- The previous Cloudflare D1 migrations are archived as text under `docs/legacy-github/migrations`; they are not PostgreSQL migrations and must not be applied to the current database.

## Verification and remaining blockers

See [`docs/GITHUB_SYNCHRONIZATION.md`](docs/GITHUB_SYNCHRONIZATION.md) for the backup, file-safety checks, validation results, and synchronization scope. See [`docs/MASTER_AUDIT_REPORT.md`](docs/MASTER_AUDIT_REPORT.md) for application readiness.

The dependency scan still reports one HIGH Zod 3.25.76 resource-exhaustion finding. Production owner access and authenticated production acceptance remain unverified; the source project's automatic schema-push hook also needs review before reuse. A successful source synchronization is **not** release approval.

## Release safety

Do not merge, publish, change DNS, modify production data, activate payments, or execute blockchain transactions without the corresponding explicit approval. This synchronization only creates a review branch and pull request; it does not deploy the application or change `main`.
