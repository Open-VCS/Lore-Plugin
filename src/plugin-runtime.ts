// Copyright © 2025-2026 OpenVCS Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { pluginError } from '@openvcs/sdk/runtime';

import { LoreCommand } from './lore.js';
import { asString } from './plugin-helpers.js';
import type {
  LoreMergeState,
  LoreSession,
  LoreStatusCache,
} from './plugin-types.js';

/** Stores the next session id allocated for `vcs.open`. Allocated once per plugin runtime instance
 * and persists for the lifetime of the process. Session IDs are opaque integers assigned
 * sequentially starting from 1. */
let nextSessionId = 1;

/** Stores all active repository sessions keyed by session id. */
const sessions = new Map<string, LoreSession>();

/** Stores per-session status caches keyed by session id. */
const statusCaches = new Map<string, LoreStatusCache>();

/** Stores per-session merge state keyed by session id. */
const mergeStates = new Map<string, LoreMergeState>();

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

/** Allocates a new repository session and returns its generated id. */
export function allocateSession(session: LoreSession): string {
  const sessionId = String(nextSessionId);
  nextSessionId += 1;
  sessions.set(sessionId, session);
  return sessionId;
}

/** Removes an existing repository session and its associated caches. */
export function closeSession(sessionId: unknown): void {
  const key = asString(sessionId);
  if (!sessions.has(key)) {
    throw pluginError('vcs-invalid-session', `session '${key}' not found`);
  }
  sessions.delete(key);
  statusCaches.delete(key);
  mergeStates.delete(key);
}

/** Resets all session state. Useful for testing to ensure clean state between test runs. */
export function resetSessions(): void {
  nextSessionId = 1;
  sessions.clear();
  statusCaches.clear();
  mergeStates.clear();
}

/** Resolves a required session or throws a host-facing plugin error. */
export function requireSession(sessionId: unknown): LoreSession {
  const session = sessions.get(asString(sessionId));

  if (!session) {
    throw pluginError(
      'vcs-invalid-session',
      `unknown session '${asString(sessionId)}'`,
    );
  }

  return session;
}

/** Convenience helper that creates a LoreCommand from a session id. */
export function requireLoreCommand(sessionId: unknown): LoreCommand {
  const session = requireSession(sessionId);
  return new LoreCommand(session.path);
}

// ---------------------------------------------------------------------------
// Status cache
// ---------------------------------------------------------------------------

/** Returns the cached status scan result for a session, or undefined if not cached. */
export function getStatusCache(sessionId: unknown): LoreStatusCache | undefined {
  return statusCaches.get(asString(sessionId));
}

/** Stores a status scan result in the cache for a session. */
export function setStatusCache(sessionId: unknown, cache: LoreStatusCache): void {
  statusCaches.set(asString(sessionId), cache);
}

/** Removes the cached status scan result for a session. */
export function invalidateStatusCache(sessionId: unknown): void {
  statusCaches.delete(asString(sessionId));
}

/** Returns true when the cached status scan is less than 10 seconds old. */
export function isStatusCacheFresh(sessionId: unknown): boolean {
  const cache = statusCaches.get(asString(sessionId));
  if (!cache) {
    return false;
  }
  return Date.now() - cache.lastScan < 10_000;
}

// ---------------------------------------------------------------------------
// Merge state
// ---------------------------------------------------------------------------

/** Returns the in-progress merge/cherry-pick/revert state for a session, or undefined. */
export function getMergeState(sessionId: unknown): LoreMergeState | undefined {
  return mergeStates.get(asString(sessionId));
}

/** Stores an in-progress merge/cherry-pick/revert state for a session. */
export function setMergeState(sessionId: unknown, state: LoreMergeState): void {
  mergeStates.set(asString(sessionId), state);
}

/** Clears the in-progress merge/cherry-pick/revert state for a session. */
export function clearMergeState(sessionId: unknown): void {
  mergeStates.delete(asString(sessionId));
}
