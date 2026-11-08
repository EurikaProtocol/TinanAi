# Previous GitHub application — historical references

These files were retained from `EurikaProtocol/TinanAi` at commit `a322038a750b9b44a9983dc87b56a12955693978`, before synchronization from the current Replit project.

The complete previous application and all existing history are preserved on `backup/before-tinanai-replacement`. No remote branch or history was deleted or rewritten.

## Retained references

- `README.md`: the previous application's documentation, including its unverified integration and release limitations. Statements about a clean dependency audit or runtime capabilities describe the old application only.
- `next.config.js.txt`, `open-next.config.ts.txt`, `wrangler.jsonc.txt`, and other configuration snapshots: historical Next.js/OpenNext/Cloudflare settings. They are not executable deployment configuration for the current monorepo.
- `migrations/*.sql.txt`: historical Cloudflare D1 schema, not current PostgreSQL migrations. Do not run these against the current database.
- `lib/auth.ts.txt`, `lib/delegation.ts.txt`, and `proxy.ts.txt`: historical EurekaCore authentication/delegation references. They are not an active Eureka Account SSO client and are not imported by the current application.
- `package.json.txt`: previous package/script documentation. The old npm lockfile was not copied into the active pnpm workspace.

There were no tracked `.github` workflow or security configuration files on the original default branch to reconcile. Repository-hosted dynamic Copilot workflows are not application deployment workflows.

All retained code/configuration snippets use `.txt` extensions so they cannot be discovered as active TypeScript, migrations, or deployment configuration.
