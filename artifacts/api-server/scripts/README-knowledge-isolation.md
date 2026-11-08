# Knowledge Library account-isolation check

This development verification sends authenticated requests as two real Clerk accounts to the Knowledge Library API. It creates uniquely named collections and text documents, checks list/search/grounded-answer behavior, attempts cross-account reads and mutations, confirms the original records remain intact, and removes the test resources.

## Requirements

- A running development API server with its database configured.
- Two separate Clerk development accounts.
- A fresh Clerk session token for each account. Obtain each through the signed-in development app (for example, `await window.Clerk.session.getToken()` in that account's browser console). Treat these as credentials: do not paste them into chat, commit them, or save them in project files.
- The API's existing AI integration for the grounded Q&A request. That request may use AI credits.

## Run

Set the target to the development API's complete Knowledge Library base URL, such as `https://<your-development-domain>/api/tinanai/knowledge`, then run:

```sh
KNOWLEDGE_API_URL='https://<your-development-domain>/api/tinanai/knowledge' \
KNOWLEDGE_TEST_ACCOUNT_A_TOKEN='...' \
KNOWLEDGE_TEST_ACCOUNT_B_TOKEN='...' \
pnpm --filter @workspace/api-server run test:knowledge-isolation
```

The script accepts `localhost`, `127.0.0.1`, `::1`, and Replit development domains by default. It refuses other hosts unless `KNOWLEDGE_TEST_ALLOW_NONDEV_TARGET=true` is explicitly set. Do not use production accounts or a production target for this check.

The test prints only pass/fail summaries, never the supplied tokens or uploaded text. It removes its temporary documents and collections even when a check fails. If cleanup cannot reach the API, the output identifies the temporary record IDs so they can be removed from the corresponding test accounts.
