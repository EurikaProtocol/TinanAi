# TINAN AI

TINAN AI is an early-stage agent workspace built on the repository's existing Next.js App Router, React, and TypeScript foundation.

## Current foundation

- The dashboard and AI workspace provide an interactive objective-to-plan flow.
- `POST /api/agent/tasks` validates an objective and returns a structured task plan from the server-side demo planner.
- Demo mode is explicitly simulated: it does not call an AI provider, execute tools, change files, run tests, or persist task history.
- Objectives are limited to 2,000 characters. Plans flag common production, financial, deployment, and destructive actions as requiring explicit approval before any future execution.
- Planned sections are visibly marked unavailable; they do not imply connected wallet, provider, database, or blockchain services.

## Local development

Install dependencies and start the development server:

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to use the workspace. No provider credentials or database configuration are required for the current demo planner.

Available validation commands:

```bash
npm run lint
npm run build
```

## Current limitations and next steps

- Authentication, database persistence, real model providers, tool execution, tests, wallet adapters, and blockchain integrations are not configured.
- Conversation state exists only in the current browser session and is lost on reload.
- The demo planner is deterministic scaffolding, not a language model or autonomous agent. A returned task has `planned` status and no execution results.
- Production integrations will require server-side provider credentials, authorization, persistence, rate limiting, an isolated execution environment, and explicit approval workflows.
