# TINANAI custom-domain audit and release checklist

Audit date: 2026-10-24

## Storage and production-auth readiness update

Verification date: 2026-11-04

- The API's database client reads only `DATABASE_URL`; there is no external-database fallback. Production configuration reports `DATABASE_URL` as runtime-managed, and no `EXTERNAL_DATABASE_URL` is configured. This is wired for Replit's managed PostgreSQL, not a separately configured external database.
- There is no active deployment or production URL yet. The production database query could not be completed because production database access requires an authenticated user; an earlier read-only check also reported no Replit-managed production database. Therefore the actual production database target, pgvector extension, and Knowledge schema are **not verified**. Do not treat production storage as release-ready.
- The development database was verified read-only: PostgreSQL 16.10, pgvector 0.8.0, and all four Knowledge tables (`knowledge_documents`, `knowledge_chunks`, `knowledge_collections`, and `knowledge_document_collections`) are present.
- The API production command runs the bundled Node service with `PORT` and `NODE_ENV=production`; `@workspace/db` connects using the standard `pg` driver and `DATABASE_URL`. This confirms the runtime wiring, not production database compatibility.
- Knowledge chunks use the PostgreSQL `vector(384)` type and an HNSW cosine index. Drizzle declares the custom column type and index, but does not declare or create the `vector` extension. Production must have pgvector enabled before the Knowledge schema is usable; development verification does not prove that for production.

### Supported schema migration path

- Edit the source schema under `lib/db/src/schema/` and use `pnpm --filter @workspace/db run push` for development only.
- For Replit-managed PostgreSQL, use Replit Publish's development-to-production schema diff and confirmation flow. Publish is the supported production schema migration path; it handles table/column changes and prompts for renames.
- Publish's Drizzle schema diff does not itself establish that the `vector` extension is installed. Confirm pgvector on the actual production target before relying on Knowledge indexing or search. Do not add startup-time DDL, a production `drizzle-kit push`, or a custom production migration script.
- If the production target is later changed to an external PostgreSQL database, Replit Publish will not migrate it. No external database migration workflow is configured in this project; establish and approve that provider's migration process before using such a target.

### Production Clerk checks

Production secret-presence metadata reports `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `VITE_CLERK_PUBLISHABLE_KEY` as present. Secret values were not read. Before release, confirm the frontend and API keys belong to the same production Clerk instance, verify the published host is allowed in that instance, and test sign-in/session cookies and Knowledge API authorization on the actual published URL. The API proxy is enabled only in production when `CLERK_SECRET_KEY` exists; confirm the production Clerk proxy URL is supplied by the publishing environment and resolves through `/api/__clerk`. Do not copy a development proxy URL into production.

**Release decision: hold publication until a production database target is available and its pgvector extension and Knowledge tables can be verified.** Production Clerk keys are present, but the live-host authentication flow still needs verification after a URL exists.

## Current architecture and decision

- TINANAI is configured for Replit autoscale. Its React/Vite frontend is built as a static artifact; the Express API is a separate service mounted at `/api`.
- The API requires PostgreSQL, Replit-managed Clerk for Knowledge Library sessions, and the existing OpenAI integration. This is not a frontend-only site that can be moved to Cloudflare Pages without migrating the backend and its data services.
- Keep Replit as the application host. Use Cloudflare for the existing domain's DNS after Replit Publishing provides the real production records. Do not create a Worker, Pages project, origin address, CNAME target, or redirect as a substitute for that target.
- The root `.replit` configuration selects autoscale. The web artifact already builds to `artifacts/tinanai/dist/public` and has an SPA rewrite to `index.html`; the API artifact has a `/api/healthz` startup check.
- No Wrangler configuration, GitHub Actions deployment workflow, or Git remote was present in this checkout.

## Audit findings and blockers

- Replit deployment metadata reported no active deployment and no production URL. The actual A/TXT values needed for a custom domain therefore do not exist in this workspace yet.
- Replit's custom-domain documentation says an Autoscale deployment provides A and TXT records in the Publishing tool. Use those exact values; do not infer them.
- A read-only production database check reported no Replit-managed production database. The deployed API's database target must be established before release. Do not run production DDL manually; use the supported Publish flow for Replit-managed schema changes.
- The connected Cloudflare account did not expose a zone named `tinaneureka.com`. This does not prove that the zone is absent from another Cloudflare account. The domain also did not resolve from the workspace's DNS resolver during this audit.
- No DNS, registrar, SSL/TLS, or email records were changed.
- The `www` hostname is not configured or verified. Do not add it unless it is explicitly wanted and supported by the selected Replit domain setup.

## Environment and secrets checklist

Secret values were not read or recorded. The production secret-presence check reported the following names as present on 2026-10-24:

| Variable | Use | Release check |
| --- | --- | --- |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Server-side OpenAI integration | Present; verify the published integration works |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Server-side OpenAI integration endpoint | Present; verify the published integration works |
| `CLERK_PUBLISHABLE_KEY` | Server-side Clerk key resolution | Present |
| `CLERK_SECRET_KEY` | API Clerk middleware | Present |
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend Clerk key resolution | Present |
| `SESSION_SECRET` | Server session/security configuration | Present |
| `DATABASE_URL` | PostgreSQL connection used by `@workspace/db` | Runtime-managed; no managed production database was available to inspect |
| `VITE_CLERK_PROXY_URL` | Production Clerk proxy | Replit-managed production value; do not hardcode or set a development value |
| `PORT`, `NODE_ENV`, `BASE_PATH` | Service/build runtime settings | Already declared by the artifact configurations |

Re-check the production settings in Replit after the first publish. Never copy secret values into this file, frontend code, or Cloudflare DNS.

## Implemented routes

The current frontend routes are:

- `/`, `/dashboard`, `/assistant`, `/documents`, `/builder`, `/assets`, `/tokenize`, `/settings`, `/knowledge`
- `/sign-in/*` and `/sign-up/*`

The Vite artifact rewrites nested paths to `index.html`, so client-side route refreshes are supported by the current configuration. The API is served under `/api`, including `/api/healthz`, `/api/tinanai/assist`, Builder endpoints, and `/api/tinanai/knowledge/*`.

The older paths `/ai`, `/create`, `/projects`, `/tokens`, `/contracts`, and `/deploy` are not routes in the current frontend router. Do not report them as working without implementing or explicitly mapping them.

## Verification already completed

- API and frontend TypeScript checks passed.
- API test suite passed: 17 tests.
- Frontend production build passed. It reported a ~1.05 MB minified JavaScript chunk and sourcemap-location warnings; neither prevented the build.
- Local embedding inference returned a 384-dimensional vector.
- Development API health returned HTTP 200; the unsigned Knowledge Library endpoint returned the expected HTTP 401.
- Desktop and mobile signed-out previews rendered. The authenticated UI and two-account isolation flow still require verification.

## Safe domain-connection sequence

1. Finish production database and authenticated-account verification. Publish TINANAI through Replit when the application is ready; do not publish a Cloudflare-only frontend.
2. In Replit Publishing, add `tinaneureka.com` and copy the exact A and TXT values shown there.
3. In the Cloudflare account that owns the zone, inspect current apex and `www` records before editing. Add only the Replit-provided records, preserve existing MX/TXT/verification records, and follow the proxy/TLS instructions shown by Replit.
4. Configure `www.tinaneureka.com` only if it is explicitly desired and separately supported. Do not invent a redirect or origin target.
5. Wait for domain validation and certificate activation. Then verify HTTPS, `/`, nested-route refresh, Clerk sign-in/session cookies, `/api/healthz`, the Knowledge API, assets, and mobile layout.
6. Record the verified production URL and only then set any canonical URL metadata to `https://tinaneureka.com`.

References:

- [Replit custom domains](https://docs.replit.com/features/publishing/custom-domains)
- [Replit Publishing](https://docs.replit.com/learn/projects-and-artifacts/replit-deployments)
