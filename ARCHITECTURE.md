# Lore Plugin Architecture

This document describes the Lore backend implementation in `Lore-Plugin/`.

## Responsibility

The plugin implements the backend JSON-RPC contract (`plugin.*` and `vcs.*`)
through `@openvcs/sdk/runtime` delegates and exposes a single VCS backend id:
`lore`.

## SDK event callback strategy

Unlike the Git plugin which spawns CLI subprocesses and parses stdout, the Lore
plugin connects to the Lore server through the `@lore-vcs/sdk` TypeScript API.
The SDK communicates with the Lore server via gRPC (for streaming events) and
HTTP (for command execution).

### Connection flow

1. `LoreCommand.connect()` establishes a connection to the Lore server using
   `@lore-vcs/sdk`'s `connect()` function.
2. The connection stores both the HTTP `Client` (for commands) and the gRPC
   `WebChannel` (for event streams).
3. Each `LoreCommand` instance maintains its own connection, created lazily on
   first use.

### Event streaming

Lore SDK operations return `AsyncIterable<LoreEvent>` streams. The plugin
consumes these events through a shared `LoreEventStreamConsumer` helper:

```typescript
// Stream events from an async iterable
const consumer = new LoreEventStreamConsumer(stream);
await consumer_drain();
const events = consumer.getEvents();
```

Each event has a discriminated `tagName` property (e.g.,
`"repositoryStatusRevision"`, `"repositoryStatusFile"`, `"error"`) and a
`data` payload. The plugin filters events by tag name to extract the information
needed for each delegate method.

### Error handling

Error events are surfaced by checking for events with `tagName === "error"`.
The plugin converts these into host-facing `pluginError` values with
appropriate error codes.

## Command execution

- Lore operations run through the `@lore-vcs/sdk` TypeScript API.
- The runtime uses a trust model (no per-capability permission prompts).
- TypeScript source lives under `src/` and compiles into the packaged `bin/`
  runtime files.
- Shared transport, JSON-RPC framing, host notifications, and exact-method
  delegate dispatch live in `SDK/`; this module keeps only Lore session
  state, SDK connection management, event parsers, and Lore-specific `vcs.*`
  handlers.
- `src/plugin-request-handler.ts` exports `LoreVcsDelegates`, a
  `VcsDelegateBase` subclass whose ordinary camelCase methods are mapped to the
  exact `vcs.*` JSON-RPC method names consumed by the runtime.
- Status reads use the Lore SDK's `RepositoryStatusRevision` and
  `RepositoryStatusFile` events to build status payloads.
- Commit history uses the Lore SDK's `RevisionHistoryEntry` and `Metadata`
  events to build commit entries.
- Branch listing uses the Lore SDK's `BranchListEntry` events.
- Network commands (push, sync, clone) go through the Lore SDK which handles
  server communication.

## State

The plugin stores lightweight runtime state:

- active session map (`session_id -> workdir`)
- per-session status caches (10-second TTL)
- per-session merge/cherry-pick/revert state tracking

## Manifest

`package.json.openvcs` declares:

- `module.exec`: `openvcs-lore-plugin.js`
- `module.vcs_backends`: `lore`
- `bin/plugin.js`: compiled author module exporting `OnPluginStart()`

## Packaging

This plugin is published and consumed as an npm package with these runtime files:

```text
openvcs.lore/
  package.json
  bin/openvcs-lore-plugin.js  (SDK-generated bootstrap, entry point)
  bin/plugin.js               (authored module with PluginDefinition + OnPluginStart)
  bin/plugin-helpers.js
  bin/plugin-request-handler.js
  bin/plugin-runtime.js
  bin/lore.js
```

`openvcs build` generates `bin/openvcs-lore-plugin.js` as the SDK-owned
bootstrap (referenced by `module.exec` in the manifest). The authored Lore module
lives in `src/plugin.ts` and compiles to `bin/plugin.js`, where `PluginDefinition`
declares runtime options up front and `OnPluginStart()` validates Lore, constructs
`LoreVcsDelegates`, and assigns `PluginDefinition.vcs = delegates.toDelegates()`
before the SDK runtime starts processing requests.
