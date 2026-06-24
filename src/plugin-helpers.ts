// Copyright © 2025-2026 OpenVCS Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  CommitEntry,
  LoreJsonEvent,
  RequestParams,
  StatusFileEntry,
  StatusParseResult,
  StatusSummary,
} from './plugin-types.js';

export type { LoreJsonEvent } from './plugin-types.js';


// ---------------------------------------------------------------------------
// Type coercion helpers
// ---------------------------------------------------------------------------

/** Returns a plain object parameter map or an empty object for invalid input. */
export function asRecord(value: unknown): RequestParams {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as RequestParams;
}

/** Coerces any value into a string while preserving empty defaults. */
export function asString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

/** Coerces any value into a trimmed string. */
export function asTrimmedString(value: unknown): string {
  return asString(value).trim();
}

/** Coerces any value into a finite number or returns a fallback. */
export function asNumber(value: unknown, fallback: number): number {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

/** Coerces an unknown value into a filtered list of non-empty strings. */
export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => asString(entry)).filter(Boolean);
}

/** Returns an optional boolean only when the input is already a boolean. */
export function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

// ---------------------------------------------------------------------------
// JSON event parsing
// ---------------------------------------------------------------------------

/** Parses raw stdout (one JSON object per line) into LoreJsonEvent[].
 *  Filters empty lines and throws on malformed JSON. */
export function parseJsonEvents(stdout: string): LoreJsonEvent[] {
  if (!stdout || !stdout.trim()) {
    return [];
  }

  const events: LoreJsonEvent[] = [];
  const lines = stdout.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const parsed: unknown = JSON.parse(trimmed);

    if (parsed && typeof parsed === 'object' && 'tagName' in parsed) {
      events.push(parsed as unknown as LoreJsonEvent);
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Event lookup helpers
// ---------------------------------------------------------------------------

/** Returns the first event matching the given event type, or undefined. */
export function getEventByType(
  events: LoreJsonEvent[],
  eventType: string,
): LoreJsonEvent | undefined {
  return events.find((e) => e.tagName === eventType);
}

/** Returns all events matching the given event type. */
export function getEventsByType(
  events: LoreJsonEvent[],
  eventType: string,
): LoreJsonEvent[] {
  return events.filter((e) => e.tagName === eventType);
}

/** Scans for Error events and returns their inner messages. */
export function findErrorEvents(events: LoreJsonEvent[]): string[] {
  return events
    .filter((e) => e.tagName === 'error')
    .map((e) => {
      const data = e.data as Record<string, unknown> | undefined;
      return asString(data?.errorInner);
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Status event parsing
// ---------------------------------------------------------------------------

/** Maps a Lore file action string to a short status code for the host. */
function mapActionToStatus(action: string, fileData: Record<string, unknown>): string {
  switch (action) {
    case 'Add':
      return 'A';
    case 'Delete':
      return 'D';
    case 'Move':
      return 'R';
    case 'Copy':
      return 'C';
    case 'Modify':
    default:
      return 'M';
  }
}

/** Parses RepositoryStatusRevision + RepositoryStatusFile events into
 *  the StatusSummary + StatusPayload expected by the host. */
export function parseStatusFromEvents(events: LoreJsonEvent[]): StatusParseResult {
  const summary: StatusSummary = {
    untracked: 0,
    modified: 0,
    staged: 0,
    conflicted: 0,
  };

  const files: StatusFileEntry[] = [];
  let ahead = 0;
  let behind = 0;
  let branchOnRemote = false;

  // Parse revision-level info for ahead/behind
  const revisionEvent = getEventByType(events, 'repositoryStatusRevision');
  if (revisionEvent?.data) {
    const d = revisionEvent.data;
    ahead = d.isLocalAhead ? 1 : 0;
    behind = d.isRemoteAhead ? 1 : 0;
    branchOnRemote = d.remoteBranchExist === true || d.remoteBranchExist === 1;
  }

  // Parse file-level status events
  const fileEvents = getEventsByType(events, 'repositoryStatusFile');

  for (const evt of fileEvents) {
    const d = (evt.data ?? {}) as Record<string, unknown>;
    const path = asTrimmedString(d.path);
    if (!path) continue;

    const action = asTrimmedString(d.action);
    const flagStaged = d.flagStaged === true || d.flagStaged === 1;
    const flagDirty = d.flagDirty === true || d.flagDirty === 1;
    const flagConflict = d.flagConflict === true || d.flagConflict === 1;
    const flagConflictUnresolved =
      d.flagConflictUnresolved === true || d.flagConflictUnresolved === 1;

    const status = mapActionToStatus(action, d);
    const conflicted = flagConflict && flagConflictUnresolved;

    if (conflicted) {
      summary.conflicted += 1;
    } else if (flagStaged) {
      summary.staged += 1;
    } else if (flagDirty || action === 'Add') {
      summary.modified += 1;
    }

    const oldPath = asTrimmedString(d.fromPath) || null;

    files.push({
      path,
      old_path: action === 'Move' || action === 'Copy' ? oldPath : null,
      status,
      staged: flagStaged,
      resolved_conflict: flagConflict && !flagConflictUnresolved,
      hunks: [],
    });
  }

  return {
    summary,
    payload: {
      files,
      ahead,
      behind,
      branch_on_remote: branchOnRemote,
    },
  };
}

// ---------------------------------------------------------------------------
// Commit history parsing
// ---------------------------------------------------------------------------

/** Parses RevisionHistoryEntry + Metadata events into CommitEntry[].
 *
 *  Each RevisionHistoryEntry carries: revision, revisionNumber, parent[2].
 *  Each following Metadata event carries key/value pairs including
 *  "message", "created-by", "committed-by", and timestamp info. */
export function parseCommitHistory(events: LoreJsonEvent[]): CommitEntry[] {
  const entries: CommitEntry[] = [];
  const historyEvents = getEventsByType(events, 'revisionHistoryEntry');

  for (const evt of historyEvents) {
    const d = (evt.data ?? {}) as Record<string, unknown>;
    const revision = asTrimmedString(d.revision);
    if (!revision) continue;

    const parents = Array.isArray(d.parent) ? d.parent : [];
    const parentOid = asTrimmedString(parents[0]) || undefined;

    entries.push({
      id: revision,
      msg: '',
      author: '',
      meta: '',
      parent_oid: parentOid,
    });
  }

  // Enrich with metadata events that follow history entries
  const metadataEvents = getEventsByType(events, 'metadata');
  for (const metaEvt of metadataEvents) {
    const d = (metaEvt.data ?? {}) as Record<string, unknown>;
    const key = asTrimmedString(d.key);
    const valueData = d.value;

    // Value can be various types; extract string representation
    let valueStr = '';
    if (typeof valueData === 'string') {
      valueStr = valueData;
    } else if (valueData && typeof valueData === 'object' && 'String' in valueData) {
      valueStr = asString((valueData as Record<string, unknown>).String);
    } else if (valueData && typeof valueData === 'object' && 'Numeric' in valueData) {
      valueStr = asString((valueData as Record<string, unknown>).Numeric);
    } else if (valueData && typeof valueData === 'object' && 'Hash' in valueData) {
      valueStr = asString((valueData as Record<string, unknown>).Hash);
    }

    if (!valueStr) continue;

    // Match metadata to the last commit entry by common keys
    if (key === 'message' && entries.length > 0) {
      entries[entries.length - 1].msg = valueStr;
    } else if ((key === 'created-by' || key === 'committed-by') && entries.length > 0) {
      entries[entries.length - 1].author = valueStr;
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Branch list parsing
// ---------------------------------------------------------------------------

/** Parses BranchListEntry events into branch name list + current marker. */
export function parseBranchList(
  events: LoreJsonEvent[],
): { current: string | null; branches: Array<{ name: string; current: boolean }> } {
  const entries = getEventsByType(events, 'branchListEntry');
  let current: string | null = null;
  const branches: Array<{ name: string; current: boolean }> = [];

  for (const evt of entries) {
    const d = (evt.data ?? {}) as Record<string, unknown>;
    const name = asTrimmedString(d.name);
    if (!name) continue;

    const isCurrent = d.isCurrent === true || d.isCurrent === 1;
    if (isCurrent) {
      current = name;
    }

    branches.push({ name, current: isCurrent });
  }

  return { current, branches };
}

// ---------------------------------------------------------------------------
// Config value parsing
// ---------------------------------------------------------------------------

/** Extracts a string config value from Metadata events. */
export function parseConfigValue(
  events: LoreJsonEvent[],
  key: string,
): string | null {
  for (const evt of events) {
    if (evt.tagName !== 'metadata') continue;
    const d = (evt.data ?? {}) as Record<string, unknown>;
    if (asTrimmedString(d.key) !== key) continue;

    const valueData = d.value;
    if (typeof valueData === 'string') return valueData;
    if (valueData && typeof valueData === 'object' && 'String' in valueData) {
      return asString((valueData as Record<string, unknown>).String);
    }
    if (valueData && typeof valueData === 'object' && 'Numeric' in valueData) {
      return asString((valueData as Record<string, unknown>).Numeric);
    }
    if (valueData && typeof valueData === 'object' && 'Hash' in valueData) {
      return asString((valueData as Record<string, unknown>).Hash);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Argument builders
// ---------------------------------------------------------------------------

/** Adds a trimmed string argument when a value is present. */
function pushOptionalArg(args: string[], value: unknown): void {
  const candidate = asTrimmedString(value);
  if (candidate) {
    args.push(candidate);
  }
}

/** Builds `lore clone` arguments. */
export function buildCloneArgs(params: RequestParams): string[] {
  const args = ['clone'];
  if (params.use_shared_store === true) {
    args.push('--use-shared-store');
  }
  if (params.bare === true) {
    args.push('--bare');
  }
  pushOptionalArg(args, params.url);
  pushOptionalArg(args, params.dest);
  return args;
}

/** Builds `lore push` arguments. */
export function buildPushArgs(params: RequestParams): string[] {
  const args = ['push'];
  pushOptionalArg(args, params.branch);
  return args;
}

/** Builds `lore sync` arguments. */
export function buildSyncArgs(params: RequestParams): string[] {
  const args = ['sync'];
  pushOptionalArg(args, params.revision);
  return args;
}
