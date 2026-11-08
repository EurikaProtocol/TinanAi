# TINANAI

TINANAI — Intelligence. Data. Creation. A responsive AI workspace powered by EUREKA CORE for documents, app prototypes, digital assets, and tokenization plans.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the shared API server through its managed workflow
- `pnpm --filter @workspace/tinanai run dev` — run the web app through its managed workflow
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Managed AI secrets: `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` — server-only OpenAI access through Replit AI Integrations

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, served as a static production artifact
- API: Express 5, deployed with the Replit app
- DB: PostgreSQL + Drizzle ORM
- Authentication: Replit-managed Clerk for Knowledge Library only
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/tinanai/src/pages/` — dashboard, assistant, documents, builder, assets, tokenization, and settings
- `artifacts/tinanai/src/lib/store.tsx` — validated browser-local workspace storage
- `artifacts/tinanai/src/index.css` — shared dark/gold visual tokens
- `lib/api-spec/openapi.yaml` — assistant, Builder, and Knowledge API contracts
- `artifacts/api-server/src/routes/tinanai.ts` — live AI endpoint, validation, and request limits
- `artifacts/api-server/src/routes/knowledge.ts` — owner-scoped Knowledge Library endpoints

## Architecture decisions

- The main workspace remains browser-local and can be exported/imported as JSON. The Knowledge Library is the exception: it uses Replit-managed Clerk and stores extracted, secret-redacted text, metadata, and embeddings per account; uploaded originals are discarded.
- Knowledge search uses local embeddings and retrieval-augmented generation. Only retrieved excerpts are sent to the existing OpenAI integration, and citations are checked against retrieved source IDs.
- Generated apps are self-contained HTML prototypes, previewed in a restricted iframe with network and form access blocked.
- Document uploads support TXT, MD, and CSV, or pasted text. Only explicitly submitted text is sent to the AI provider.

## Product

- Persistent workspace navigation and separately adapted mobile navigation.
- Live AI conversations, document analysis, and app generation.
- Account-scoped Knowledge Library with collections, semantic search, re-indexing, and excerpt-grounded answers.
- Digital-asset catalogue with create, edit, search, filter, and delete.
- Four-step tokenization planning with saved plans and JSON export; no blockchain transaction submission.
- Launchpad Contract Studio (`/launchpad/contracts`) prepares a fixed OpenZeppelin ERC-20 template with constructor settings, source/ABI/compiler-input downloads, and browser-local draft storage. Generation does not deploy or designate an official platform token.
- Launchpad draft review supports wallet-approved Sepolia-only ERC-20 deployment with 18 decimals, saved optional mint/burn settings, receipt read-back and wallet-local deployment history. No server-held keys or automatic Mainnet deployment.
- Separate Hardhat suite: `lib/tinanai-contracts/README.md` documents the fixed 100M TINAN token, linked Ownable proof registry, EVM tests, ABI exports and wallet-approved Sepolia CLI deployment. It does not replace the existing frontend template or EUREKA Mainnet integration.
- Shared wagmi/AppKit header wallet supports Ethereum and Sepolia; the legacy Launchpad remains Sepolia-only. `/contracts` reads real Token/Core data only from configured addresses; no public TINAN deployment is preconfigured.
- `/data-tokenization` saves wallet-separated browser-local project proposals, with metadata, rights, supply, decimals and royalty/reward settings. Factory deployment is blocked pending contract/permission review and explicit approval; Core is not a data-token factory.
- See `docs/tinanai-web3-integration.md` and `docs/tinanai-data-token-factory-design.md` for feature boundaries and verification commands.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Frontend builds need the artifact's `PORT` and `BASE_PATH` values because the shared Vite configuration validates them.
- AI usage is billed to Replit credits. Do not expose provider secrets in frontend code.
- Browser storage is not a backup. Invalid imports are rejected before replacement, and failed local saves show a warning.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `docs/cloudflare-custom-domain-checklist.md` before changing domain or production deployment settings.
