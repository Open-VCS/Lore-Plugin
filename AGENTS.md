# Lore Plugin Guidelines

## Overview
`Lore-Plugin/` is the Lore VCS plugin package. It runs as a long-lived Node.js process, uses the shared SDK runtime, and ships runtime output in `bin/`.

## Structure
- `src/` — TypeScript source for the plugin, runtime glue, Lore helpers, and event stream consumer.
- `test/` — Node test files for plugin behavior.
- `bin/` — generated runtime bundle; do not edit manually.

## Where to look
| Task | Location | Notes |
|---|---|---|
| Plugin startup or menu wiring | `src/plugin.ts` | Entry point for the plugin definition. |
| Runtime/host plumbing | `src/plugin-runtime.ts`, `src/plugin-request-handler.ts` | JSON-RPC and Node process integration. |
| Lore SDK command handling | `src/lore.ts` | SDK connection management and command execution. |
| Event stream consumer | `src/lore-event-stream-consumer.ts` | Drains async iterables into typed event arrays. |
| Behavior tests | `test/*.test.ts` | Keep scenarios close to the code. |

## Conventions
- Keep the plugin contract aligned with `Client/Backend/src/plugin_runtime/protocol.rs` and `SDK/` runtime/types.
- Keep `src/` as the source of truth; generated `bin/` files follow from `npm run build`.
- All Lore SDK operations return `AsyncIterable<LoreEvent>` — always drain streams completely before reading events.
- Use error codes with `lore-` prefix for host-facing errors.

## Anti-patterns
- Editing generated files under `bin/`.
- Changing host-facing labels, actions, or JSON-RPC method names without coordinating the client and SDK.
- Mixing template/plugin scaffolding concerns into Lore-specific runtime code.
- Leaving gRPC connections open after operations complete.

## Commands
```bash
npm install
npm run lint
npm test
npm run build
npm pack
```

## Notes
- This package has its own release channels and packaging metadata; keep README and `package.json` consistent.
- Lore uses a single `remote_url` config field instead of named remotes — remote management is read-only.
- The Lore SDK communicates with a Lore server via gRPC (events) and HTTP (commands).
