// Copyright © 2025-2026 OpenVCS Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  StatusPayload,
  StatusSummary,
} from '@openvcs/sdk/types';

export type {
  CommitEntry,
  RequestParams,
  StatusFileEntry,
  StatusParseResult,
  StatusPayload,
  StatusSummary,
  VcsConflictDetails,
  VcsDiffFileResponse,
  VcsDiffResult,
} from '@openvcs/sdk/types';

/** Describes one opened Lore repository session. */
export interface LoreSession {
  /** Stores the absolute repository path for the session. */
  path: string;
}

/** Describes the captured result of one lore subprocess. */
export interface LoreCommandResult {
  /** Stores the subprocess exit status. */
  status: number;
  /** Stores captured standard output. */
  stdout: string;
  /** Stores captured standard error. */
  stderr: string;
}

/** Describes the optional stdin payload for one lore subprocess. */
export interface LoreRunOptions {
  /** Supplies content written to stdin before the child exits. */
  stdin?: string;
}

/** Describes the cached status scan result for a session. */
export interface LoreStatusCache {
  /** Stores the timestamp when the last status scan was performed. */
  lastScan: number;
  /** Stores the aggregate status summary counts. */
  summary: StatusSummary;
  /** Stores the detailed status payload with file entries. */
  payload: StatusPayload;
}

/** Describes the in-progress merge, cherry-pick, or revert state. */
export interface LoreMergeState {
  /** Discriminates the type of in-progress operation. */
  type: 'merge' | 'cherry-pick' | 'revert';
  /** Stores the source ref (branch or revision) being applied. */
  sourceRef: string;
  /** Stores the paths involved in the operation. */
  paths: string[];
}

/** Describes one JSON event line from `lore --json` output. */
export interface LoreJsonEvent {
  /** Discriminator — e.g. "repositoryStatusRevision", "error", "metadata". */
  tagName: string;
  /** Stores the optional event payload. */
  data?: Record<string, unknown>;
}

/** Describes the result of parsing all JSON events from one lore command. */
export interface LoreJsonResult {
  /** Stores all parsed JSON events. */
  events: LoreJsonEvent[];
  /** Stores the raw stdout string. */
  raw: string;
}
