# Current Replit project → GitHub synchronization

## Source, target, and history

- Target: `https://github.com/EurikaProtocol/TinanAi`.
- Source: the currently open TINANAI Replit workspace, application snapshot `71f59c2`.
- Original default branch: `main`, commit `a322038a750b9b44a9983dc87b56a12955693978`.
- Required remote backup: `backup/before-tinanai-replacement`, verified at the exact original default-branch commit before any application replacement.
- Working branch: `feature/sync-current-tinanai`, based on the original remote `main` so existing Git history is retained.
- Commit message: `chore: synchronize current TINAN AI Replit project`.
- `main` is not modified. No force push, remote-branch deletion, merge, production deployment, DNS change, payment activation, chain transaction, or production database mutation is authorized by this synchronization.

## Included and excluded material

The export includes 626 tracked source/configuration/documentation files from Replit: the frontend, API, current authentication, AI integration, Builder, Knowledge, Launchpad, PostgreSQL schema, tests, API contracts, contract source/ABIs, package manifests, pnpm lockfile, and artifact service configuration.

The previous active Next.js/Cloudflare application is replaced on the working branch, not on `main`. Seventeen useful historical documentation/configuration/authentication/migration files are retained under `docs/legacy-github`; the complete original application remains on the backup branch and in history.

Fifteen tracked operator-memory files were excluded. Untracked uploads, task attachments, environment files containing values, secrets, private keys, seed phrases, databases, personal user data, node_modules, caches, and build outputs were not exported. `.env.example` is retained only as a blank template.

The application code, manifests, lockfile, and API schemas are copied byte-for-byte from the source snapshot. Export-only changes are limited to:

1. A current root README and synchronization/legacy-reference documentation.
2. Node 24 selection, matching the current Replit runtime.
3. Compatible ignore rules for secrets, uploads, operator context, and previous build output directories.
4. A clarification that the earlier audit's GitHub-access blocker is historical; native authenticated Git/GitHub CLI access is available for this synchronization.

The protected `.replit` configuration is copied unchanged, not edited directly. Its existing values are public project/chain settings, not secret credentials. It also retains the source project's post-merge hook, whose script invokes database schema push. That hook was not invoked; before reusing this configuration with production data, review and disable the automatic schema-push behavior through Replit's supported configuration flow. The current Replit project's runtime configuration is not changed.

No Eureka Account SSO implementation exists in the current source snapshot. Current Clerk authentication is retained unchanged; historical EurekaCore authentication references are preserved without presenting them as working SSO.

## Validation

Application validation was run against the installed dependencies in the source workspace. A full hash manifest compares every exported source file with that validated workspace; only the documented export-only configuration/documentation adjustments are allowed to differ.

- `pnpm run typecheck`: passed.
- `pnpm -r --if-present test`: passed — 42 API, 68 TINANAI, and 24 contract tests.
- API payment suites: passed — 22 payment, 10 payment-admin, and 15 local/mock Mainnet tests. Database fixtures used the development database and were cleaned up; no chain transactions were submitted.
- `pnpm run build`: passed, including the enforced TINANAI bundle budget.
- TINANAI initial JavaScript: 678.8 KiB raw / 200.6 KiB gzip; deferred wallet chunk: 1,548.8 KiB raw / 436.6 KiB gzip.
- EURIKA dashboard: the existing approximately 764 kB chunk warning remains.
- Dependency scan: 0 critical, 1 HIGH, 0 moderate, 0 low. The known Zod 3.25.76 advisory remains a release blocker; no incompatible dependency override or scanner suppression was introduced.
- SAST: complete, 0 findings.
- HoundDog privacy/dataflow scan: 0 findings.
- Frozen lockfile consistency: passed using `pnpm install --lockfile-only --frozen-lockfile --offline --ignore-scripts` in the isolated export; the lockfile's SHA-256 matches the source.
- Source-fidelity review: all 626 selected files are present; 623 are byte-identical. Only `.gitignore`, `.replitignore`, and the historical audit's GitHub-status paragraph differ, as described above.
- Exported-tree credential-pattern scan: 647 staged files inspected; no genuine credential matches found. Six matches were manually reviewed as two deliberately synthetic, ordered-alphanumeric strings in secret-redaction tests. These fixtures were retained so the existing tests remain meaningful; no real credentials were logged.
- Complete diff review: source hashes, selected file modes, all added/modified/deleted paths, active root configuration, ignored paths, and legacy archives reviewed. Without rename detection, the change inventory is 642 added, 5 modified, and 55 removed paths.
- Remote tree, backup, and unchanged `main` must be checked after push before synchronization is declared complete. No check is treated as successful merely because a push succeeds.

These scans are not proof that no vulnerability or secret exists. The final synchronization report supplies the pushed commit SHA, exact file-change counts, remote verification outcome, and review PR URL.

## Remaining application limitations

Source synchronization is not production readiness. The unresolved Zod advisory, production-owner verification, authenticated account-isolation/wallet acceptance, missing Eureka Account SSO, and automatic post-merge schema-push hook remain separate work. No legacy D1 migration or current PostgreSQL schema-push command was executed during synchronization.
