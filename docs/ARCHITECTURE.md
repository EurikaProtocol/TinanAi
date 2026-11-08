# TINANAI / EUREKA CORE Architecture

## Workspace

The repository is a pnpm workspace with four registered artifacts: the TINANAI React/Vite app, Express API, EURIKA read-only dashboard, and mockup sandbox. Shared packages provide the OpenAPI contract, Zod schemas, generated React API client, Drizzle database access, OpenAI-compatible server integration, and TINANAI contracts.

## Request and data flow

1. The browser app calls generated `/api/...` routes on the same origin.
2. Express applies request logging, Clerk middleware, body limits, and route-specific authentication/authorization.
3. Routes call feature services and, where required, PostgreSQL through `lib/db`.
4. AI provider calls run server-side. Knowledge responses use retrieved records and validate cited source IDs.
5. The EURIKA dashboard calls the read-only overview endpoint. It displays public explorer metadata separately from verified source/ABI facts.

## Feature boundaries

- Builder projects and Knowledge records are account-scoped server data where supported. Some assistant/workspace state remains browser-local.
- Builder previews are static browser content under a restricted iframe/CSP boundary; they are not a process sandbox and do not run backend code.
- Token planning, contract source, local tests, deployment journals, wallet approval and verified on-chain state are distinct states.
- Payment code is present, but code presence does not activate checkout or certify a live token.

## Storage

`lib/db` owns the Drizzle connection and schema modules for Builder projects/runs, Knowledge documents/collections/chunks, payment records, and API cache. Production database contents and migration state were not inspected or changed in this audit.

## Runtime and build

Node.js 24 and pnpm 10 are present in the workspace. Artifact manifests define the API under `/api`, TINANAI at `/`, EURIKA at `/eurika-dashboard/`, and the canvas preview under `/__mockup`. Use the package scripts and Replit-managed artifact workflows rather than starting duplicate services.

