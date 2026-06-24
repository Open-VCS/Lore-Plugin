# Lore Plugin

This directory contains the Lore VCS backend plugin for OpenVCS.

## Runtime model

- The plugin runs as a long-lived Node.js process.
- The plugin implements the JSON-RPC contract used by the backend runtime (`plugin.*` and `vcs.*`) through the shared SDK runtime delegates.
- The plugin can add top-level app menus and items through `@openvcs/sdk/runtime` helpers.
- The Repository menu includes a Lore-specific `.loreignore` editor.
- Lore operations are executed through the `@lore-vcs/sdk` TypeScript API, which connects to the Lore server via gRPC and HTTP.
- The runtime uses a trust model (no per-capability permission prompts).

## Install

```bash
npm install
```

- The OpenVCS SDK dependency tracks the `edge` tag so it always follows the latest SDK commit.
- The Lore SDK dependency (`@lore-vcs/sdk`) is pinned to the latest version that supports the TypeScript API.

## Validate

```bash
npm run lint
```

## Build

```bash
npm run build
```

- TypeScript sources live in `src/`.
- `npm run build` runs `openvcs build`, which invokes `build:plugin` and writes the runtime into `bin/`.

## Test

```bash
npm test
```

## Pack For Config Use

```bash
npm pack
```

- `npm pack` uses the package `files` list and `prepack` hook.
- OpenVCS resolves published packages and local path plugins through npm package semantics.

## Release Channels

CI publishes prereleases with these dist-tags:

- `latest`: stable releases from `Stable`
- `beta`: builds from the `Beta` branch
- `nightly`: scheduled builds from `Dev` when changes exist since the last nightly
- `edge`: working builds from `Dev` push commits

Examples:

```bash
npm install @openvcs/lore@edge
npm install @openvcs/lore@beta
npm install @openvcs/lore@nightly
```

## Known limitations

- **No stash support**: Lore does not have stash operations. All stash-related delegate methods throw an error.
- **No tag support**: Lore does not have tags. The `tags` capability is reported as `false`.
- **No branch rename**: Lore does not support renaming branches. This operation throws an error.
- **No patch staging**: Lore does not support staging individual patches or reverse patches. These operations throw errors.
- **Single remote model**: Lore uses a single `remote_url` configuration field rather than named remotes like Git. Remote management is read-only through the plugin.
- **Server-backed**: Network operations (push, sync, clone) require a Lore server. Local operations (status, stage, commit, branch, diff) use offline mode.
