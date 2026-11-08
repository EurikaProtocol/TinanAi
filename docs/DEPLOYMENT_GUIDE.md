# Deployment and Local Verification

## Prerequisites

- Use the Node.js version managed by the workspace and pnpm; do not use npm for this monorepo.
- Install dependencies with `pnpm install --frozen-lockfile`.
- Put credentials in Replit Secrets. `.env.example` contains blank placeholders only and must never be populated with real credentials before committing.

## Checks

```sh
pnpm run typecheck
pnpm run build
pnpm -r --if-present test
pnpm --filter @workspace/tinanai-contracts test
```

The EURIKA dashboard build uses its artifact port/base-path defaults. TINANAI has a large JavaScript chunk warning that should be addressed before optimizing for public load performance.

## CORS

The TINANAI browser app and API are routed under the same site origin, so the default empty allowlist is sufficient for that flow. If another browser origin must call the API, set `TINANAI_CORS_ALLOWED_ORIGINS` to exact comma-separated HTTPS origins in the relevant environment. HTTP is accepted only for localhost development. Wildcards and URL paths are rejected.

## Replit services

Use the managed workflows/artifact services:

- `artifacts/tinanai: web`
- `artifacts/api-server: API Server`
- `artifacts/eurika-dashboard: web`
- `artifacts/mockup-sandbox: Component Preview Server`

The API is mounted at `/api`; the EURIKA dashboard is mounted at `/eurika-dashboard/`.

## Database and chain boundaries

Do not run `push-force`, production DDL, public-chain transactions, contract deployments, checkout activation or publishing as part of routine verification. Review the target environment and rollback plan first. Mainnet preparation is read-only; deployment and payments require separate explicit approval.

