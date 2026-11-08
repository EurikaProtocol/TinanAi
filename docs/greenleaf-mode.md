# Green Leaf Mode

Green Leaf Mode is an optional reasoning and creative-analysis profile for the TINANAI chat assistant. It encourages independent thought, fair consideration of alternatives, systems thinking, and practical ways to validate ideas. It does not require agreement with the user. Speculative, symbolic, and philosophical ideas must be identified as such rather than presented as established facts.

The canonical mode identity and server-side AI instructions are in `artifacts/api-server/src/lib/greenleaf-mode.ts`. Keep additions there so the client help text and developer documentation do not become competing sources of AI instructions. The user-facing command explanations live with the chat command helper in `artifacts/tinanai/src/lib/greenleaf.ts`.

## Commands

Commands are recognized case-insensitively only when the entire trimmed chat input is a command:

- `/greenleaf` or `/greenleaf on` enables the mode.
- `/greenleaf off` disables the mode.
- `/greenleaf status` reports whether it is active.
- `/greenleaf help` explains the commands and core behavior.

The parser does not match commands embedded in prose, quotes, code blocks, or additional text. Commands are handled in the browser before ordinary chat submission; command-only messages are not sent to the model.

## Request and state flow

The active flag belongs to one conversation in the browser-local TINANAI workspace. It is saved with that conversation, restored from the same local workspace after reload, and remains separate from other conversations. Existing exports remain readable because the new property is optional. Mode state is not synced across devices or accounts; TINANAI conversation history is currently browser-local. Browser storage is shared by users of the same browser profile, so it does not provide account-level privacy on a shared device. Account-isolated persistence requires an authenticated server-side conversation model.

For ordinary chat, the client sends the conversation flag as a boolean. OpenAPI and generated Zod validation enforce the request shape. The API appends the Green Leaf profile to the existing base chat instructions only when the request mode is `chat` and the flag is true. The base instructions remain intact; the private system prompt is not returned to the client. Document, builder, and tokenization requests do not receive Green Leaf instructions.

## Extending and troubleshooting

Add model-facing behavior to `greenLeafInstructions`, preserving the existing base instructions and all safety limits. Update the user-facing helper and this guide when commands or user-visible capabilities change.

Run:

```sh
pnpm --filter @workspace/tinanai test
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/tinanai run typecheck
pnpm --filter @workspace/api-server run typecheck
```

If the indicator or state appears stale, check whether the same conversation is selected and whether browser storage is available. Browser data can be cleared or lost and does not sync to another device. API/storage failures continue to use the existing chat error handling; disabling Green Leaf restores the ordinary base chat profile on the next request.

## Security and limitations

Green Leaf Mode does not change authentication, permissions, request limits, or AI provider behavior. Its client flag only selects a server-controlled prompt profile; it cannot supply instructions or override security policy. It does not execute code, deploy contracts, transfer funds, modify infrastructure, or provide live market data unless an existing enabled feature or source supports that action. Local persistence is not server-side account-scoped persistence.
