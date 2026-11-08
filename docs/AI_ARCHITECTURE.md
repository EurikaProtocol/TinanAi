# AI Architecture

## Current request path

AI requests are served through `artifacts/api-server` and its feature routes. Provider calls are server-side through the configured OpenAI-compatible Replit integration; credentials must remain in Secrets. The repository includes assistant, document/research, Builder and Knowledge-specific prompt and response flows.

Knowledge requests retrieve account-scoped stored content and validate citation IDs against the retrieved sources. Research displays provider-returned citations and does not claim that HTTPS alone proves a source is reachable or correct.

## Builder boundary

Builder generation creates bounded static project files. Inputs are inspected and sensitive text is redacted where supported. The preview is a restricted browser iframe and does not execute generated backend code or provide CPU/memory quotas. Generated files are reviewed before replacing an open project.

There is no protected worker for arbitrary framework builds, test execution or full-stack publishing. Do not run untrusted generated code inside the API service.

## EUREKA CORE status

The repository has AI-oriented UI and feature routes, but the available evidence does not establish a single central orchestration layer that safely executes every platform tool end-to-end. Treat feature capabilities as route-specific and report unavailable integrations explicitly.

## Operational limits

Provider availability, request limits and credentials must be configured and observed separately. Do not make paid provider calls during verification without approval, and do not show simulated success when a provider is unavailable.

