// Copyright © 2025-2026 OpenVCS Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VcsDelegateBase,
  pluginError,
  type PluginRuntimeContext,
} from '@openvcs/sdk/runtime';
import type * as OpenVcs from '@openvcs/sdk/types';
import { LoreEventTag } from '@lore-vcs/sdk/types/enums';

import {
  asNumber,
  asRecord,
  asString,
  asStringArray,
  asTrimmedString,
  parseBranchList,
  parseCommitHistory,
  parseStatusFromEvents,
} from './plugin-helpers.js';
import { LoreCommand } from './lore.js';
import type { LoreSession, LoreJsonEvent } from './plugin-types.js';

// ---------------------------------------------------------------------------
// Runtime dependencies
// ---------------------------------------------------------------------------

/** Describes the Lore runtime services consumed by the VCS delegates. */
export interface LoreRuntimeDependencies {
  /** Allocates a new repository session and returns its id. */
  allocateSession: (session: LoreSession) => string;
  /** Removes a repository session by id. */
  closeSession: (sessionId: unknown) => void;
  /** Resolves an active session or raises a plugin error. */
  requireSession: (sessionId: unknown) => LoreSession;
  /** Creates a LoreCommand instance for a given repository path. */
  createLoreCommand: (cwd: string) => LoreCommand;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns an optional boolean only when the input is already a boolean. */
function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/** Splits diff output into lines without manufacturing a blank entry for empty output. */
function splitDiffLines(output: string): string[] {
  const normalized = output.trimEnd();
  return normalized.length > 0 ? normalized.split('\n') : [];
}

/** Converts a SNAKE_CASE LoreEventTag enum name to camelCase. */
function sdkTagToLegacyName(tag: LoreEventTag): string {
  const name = LoreEventTag[tag];
  if (!name) return String(tag);
  const parts = name.toLowerCase().split('_');
  return parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

/** Converts SDK LoreEventFFI[] to the legacy LoreJsonEvent[] format for parsing helpers. */
function toLegacyEvents(events: Array<{ tag: LoreEventTag; data?: unknown }>): LoreJsonEvent[] {
  return events.map((e) => ({
    tagName: sdkTagToLegacyName(e.tag),
    data: (e.data != null && typeof e.data === 'object')
      ? e.data as Record<string, unknown>
      : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Delegate implementation
// ---------------------------------------------------------------------------

/** Implements the Lore-backed `vcs.*` delegate surface for the SDK runtime. */
export class LoreVcsDelegates extends VcsDelegateBase<LoreRuntimeDependencies> {
  /** Returns the required repository worktree path for a session id. */
  protected requireSessionPath(sessionId: unknown): string {
    return this.deps.requireSession(sessionId).path;
  }

  /** Returns a Lore command helper bound to a required session. */
  protected requireLore(sessionId: unknown): LoreCommand {
    const cwd = this.requireSessionPath(sessionId);
    return this.deps.createLoreCommand(cwd);
  }

  // -------------------------------------------------------------------------
  // Capabilities
  // -------------------------------------------------------------------------

  override getCaps(
    _params: OpenVcs.RequestParams,
    _context: PluginRuntimeContext,
  ): OpenVcs.VcsCapabilities {
    return {
      commits: true,
      branches: true,
      tags: false,
      staging: true,
      push_pull: true,
      fast_forward: true,
    };
  }

  // -------------------------------------------------------------------------
  // Open / Close / Clone
  // -------------------------------------------------------------------------

  override async open(
    params: OpenVcs.VcsOpenParams,
    _context: PluginRuntimeContext,
  ): Promise<OpenVcs.VcsSessionResult> {
    const repoPath = asTrimmedString(params.path);
    if (!repoPath) {
      throw pluginError('vcs-open-invalid-path', 'path is required');
    }

    // Verify the repository is accessible
    const lore = this.deps.createLoreCommand(repoPath);
    try {
      await lore.status([], false);
    } catch {
      throw pluginError('vcs-open-not-repository', 'Not a Lore repository');
    }

    const sessionId = this.deps.allocateSession({ path: repoPath });
    return { session_id: sessionId };
  }

  override close(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): null {
    this.deps.closeSession(params.session_id);
    return null;
  }

  override async cloneRepo(
    params: OpenVcs.VcsCloneRepoParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const url = asTrimmedString(params.url);
    const destination = asTrimmedString(params.dest);

    if (!url || !destination) {
      throw pluginError('vcs-clone-invalid-args', 'url and dest are required');
    }

    const lore = this.deps.createLoreCommand(process.cwd());
    await lore.clone(url, destination);

    return null;
  }

  // -------------------------------------------------------------------------
  // Workdir / Branch info
  // -------------------------------------------------------------------------

  override getWorkdir(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): string {
    return this.requireSessionPath(params.session_id);
  }

  override async getCurrentBranch(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): Promise<string | null> {
    const lore = this.requireLore(params.session_id);
    const events = await lore.status(undefined, false);
    const revisionEvent = events.find(
      (e) => e.tag === LoreEventTag.REPOSITORY_STATUS_REVISION,
    );
    if (revisionEvent?.data) {
      const data = revisionEvent.data as unknown as Record<string, unknown>;
      return asTrimmedString(data.branchName) || null;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Branch listing / creation / checkout / deletion
  // -------------------------------------------------------------------------

  override async listBranches(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): Promise<OpenVcs.VcsBranchEntry[]> {
    const lore = this.requireLore(params.session_id);
    const events = await lore.listBranches();
    const { branches } = parseBranchList(toLegacyEvents(events));

    return branches.map((b) => ({
      name: b.name,
      full_ref: b.name,
      kind: { type: 'Local' } as OpenVcs.VcsBranchKind,
      current: b.current,
    }));
  }

  override async listLocalBranches(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): Promise<string[]> {
    const lore = this.requireLore(params.session_id);
    const events = await lore.listBranches();
    const { branches } = parseBranchList(toLegacyEvents(events));
    return branches.map((b) => b.name);
  }

  override async createBranch(
    params: OpenVcs.VcsCreateBranchParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    const name = asTrimmedString(params.name);
    await lore.createBranch(name);
    if (params.checkout === true) {
      await lore.switchBranch(name);
    }
    return null;
  }

  override async checkoutBranch(
    params: OpenVcs.VcsCheckoutBranchParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    await lore.switchBranch(asTrimmedString(params.name));
    return null;
  }

  // -------------------------------------------------------------------------
  // Remote management (via config, not lore link)
  // -------------------------------------------------------------------------

  override async ensureRemote(
    params: OpenVcs.VcsEnsureRemoteParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const url = asTrimmedString(params.url);
    const lore = this.requireLore(params.session_id);
    const currentUrl = await lore.getRemoteUrl();
    if (currentUrl === url) {
      return null;
    }
    throw pluginError(
      'lore-remote-update-unsupported',
      'Lore v1 does not support changing remote URL. Edit .lore/config.toml manually.',
    );
  }

  override async listRemotes(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): Promise<OpenVcs.VcsRemoteEntry[]> {
    const lore = this.requireLore(params.session_id);
    const url = await lore.getRemoteUrl();
    if (url) {
      return [{ name: 'origin', url }];
    }
    return [];
  }

  override removeRemote(
    _params: OpenVcs.VcsRemoveRemoteParams,
    _context: PluginRuntimeContext,
  ): null {
    throw pluginError(
      'lore-remote-management-unsupported',
      'Lore v1 does not support removing remote.',
    );
  }

  // -------------------------------------------------------------------------
  // Fetch / Push / Pull
  // -------------------------------------------------------------------------

  override async fetch(
    params: OpenVcs.VcsFetchParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    await lore.sync();
    return null;
  }

  override async push(
    params: OpenVcs.VcsPushParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    const branch = asTrimmedString(params.refspec) || undefined;
    await lore.push(branch);
    return null;
  }

  override async pullFfOnly(
    params: OpenVcs.VcsPullFfOnlyParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    const revision = asTrimmedString(params.branch) || undefined;
    await lore.sync(revision);
    return null;
  }

  // -------------------------------------------------------------------------
  // Commit / Commit index
  // -------------------------------------------------------------------------

  override async commit(
    params: OpenVcs.VcsCommitParams,
    _context: PluginRuntimeContext,
  ): Promise<string> {
    const lore = this.requireLore(params.session_id);
    const message = asTrimmedString(params.message);
    await lore.commit(message);
    // Return current HEAD after commit — use status to get revision
    const events = await lore.status(undefined, false);
    const revEvent = events.find(
      (e) => e.tag === LoreEventTag.REPOSITORY_STATUS_REVISION,
    );
    if (revEvent?.data) {
      const data = revEvent.data as unknown as Record<string, unknown>;
      return asTrimmedString(data.revision) || '';
    }
    return '';
  }

  override async commitIndex(
    params: OpenVcs.VcsCommitParams,
    _context: PluginRuntimeContext,
  ): Promise<string> {
    return this.commit(params, _context);
  }

  // -------------------------------------------------------------------------
  // Status (with caching)
  // -------------------------------------------------------------------------

  override async getStatusSummary(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): Promise<OpenVcs.StatusSummary> {
    const lore = this.requireLore(params.session_id);
    const events = await lore.status(undefined, false);
    const parsed = parseStatusFromEvents(toLegacyEvents(events));
    return parsed.summary;
  }

  override async getStatusPayload(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): Promise<OpenVcs.StatusPayload> {
    const lore = this.requireLore(params.session_id);
    const events = await lore.status(undefined, false);
    const parsed = parseStatusFromEvents(toLegacyEvents(events));
    return parsed.payload;
  }

  // -------------------------------------------------------------------------
  // Commit history / Diff
  // -------------------------------------------------------------------------

  override async listCommits(
    params: OpenVcs.VcsListCommitsParams,
    _context: PluginRuntimeContext,
  ): Promise<OpenVcs.CommitEntry[]> {
    const lore = this.requireLore(params.session_id);
    const query = asRecord(params.query);
    const limit = asNumber(query.limit, 0);
    const rev = asTrimmedString(query.rev) || undefined;
    const events = await lore.listCommits(limit || undefined, rev);
    return parseCommitHistory(toLegacyEvents(events));
  }

  override async diffFile(
    params: OpenVcs.VcsDiffFileParams,
    _context: PluginRuntimeContext,
  ): Promise<OpenVcs.VcsDiffFileResponse> {
    const lore = this.requireLore(params.session_id);
    const events = await lore.diffFile(asTrimmedString(params.path));
    // Extract diff lines from FILE_DIFF events — SDK returns 'patch' (unified diff string)
    const diffLines: string[] = [];
    for (const evt of events) {
      if (evt.tag === LoreEventTag.FILE_DIFF && evt.data) {
        const d = evt.data as unknown as Record<string, unknown>;
        const patch = d.patch;
        if (typeof patch === 'string') {
          diffLines.push(...patch.split('\n'));
        }
      }
    }
    return { lines: diffLines, binary: false };
  }

  override async diffCommit(
    params: OpenVcs.VcsDiffCommitParams,
    _context: PluginRuntimeContext,
  ): Promise<string[]> {
    const lore = this.requireLore(params.session_id);
    const events = await lore.diffRevision(asTrimmedString(params.rev));
    const diffLines: string[] = [];
    for (const evt of events) {
      if (evt.tag === LoreEventTag.REVISION_DIFF_FILE && evt.data) {
        const d = evt.data as unknown as Record<string, unknown>;
        if (typeof d.line === 'string') {
          diffLines.push(d.line);
        }
      }
    }
    return diffLines;
  }

  // -------------------------------------------------------------------------
  // Conflict handling
  // -------------------------------------------------------------------------

  override getConflictDetails(
    params: OpenVcs.VcsGetConflictDetailsParams,
    _context: PluginRuntimeContext,
  ): OpenVcs.VcsConflictDetails {
    // Lore v1 does not provide full conflict detail content
    return {
      path: asTrimmedString(params.path),
      base: null,
      ours: null,
      theirs: null,
      binary: true,
    };
  }

  override async checkoutConflictSide(
    params: OpenVcs.VcsCheckoutConflictSideParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    const side = asTrimmedString(params.side);
    const path = asTrimmedString(params.path);
    if (side !== 'ours' && side !== 'theirs') {
      throw pluginError('vcs-invalid-side', 'side must be "ours" or "theirs"');
    }
    if (side === 'ours') {
      await lore.mergeResolveMine([path]);
    } else {
      await lore.mergeResolveTheirs([path]);
    }
    return null;
  }

  override async writeMergeResult(
    params: OpenVcs.VcsWriteMergeResultParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    const path = asTrimmedString(params.path);
    const content = Buffer.from(asTrimmedString(params.content_b64), 'base64').toString('utf8');
    // Write content directly to worktree, then stage
    const { writeFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const fullPath = join(this.requireSessionPath(params.session_id), path);
    writeFileSync(fullPath, content, 'utf8');
    await lore.stage([path]);
    return null;
  }

  // -------------------------------------------------------------------------
  // Staging / Discard
  // -------------------------------------------------------------------------

  override stagePatch(
    _params: OpenVcs.VcsStagePatchParams,
    _context: PluginRuntimeContext,
  ): null {
    throw pluginError(
      'lore-stage-patch-unsupported',
      'Lore does not support patch staging in v1',
    );
  }

  /** Lore v1 does not support partial hunk staging.
   *  Falls back to staging the entire file for each selection. */
  override async stageSelections(
    params: OpenVcs.VcsStageSelectionsParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    const selections = Array.isArray(params.selections) ? params.selections : [];
    const paths = selections.map((s) => asTrimmedString(s.path)).filter(Boolean);
    if (paths.length === 0) {
      return null;
    }
    await lore.stage(paths);
    return null;
  }

  override async stagePaths(
    params: OpenVcs.VcsStagePathsParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    const paths = asStringArray(params.paths);
    if (paths.length === 0) {
      return null;
    }
    await lore.stage(paths);
    return null;
  }

  override async discardPaths(
    params: OpenVcs.VcsDiscardPathsParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    const paths = asStringArray(params.paths);
    if (paths.length === 0) {
      return null;
    }
    await lore.fileReset(paths);
    return null;
  }

  override applyReversePatch(
    _params: OpenVcs.VcsApplyReversePatchParams,
    _context: PluginRuntimeContext,
  ): null {
    throw pluginError(
      'lore-apply-reverse-patch-unsupported',
      'Lore does not support reverse patch in v1',
    );
  }

  // -------------------------------------------------------------------------
  // Branch management
  // -------------------------------------------------------------------------

  override async deleteBranch(
    params: OpenVcs.VcsDeleteBranchParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    await lore.deleteBranch(asTrimmedString(params.name));
    return null;
  }

  override renameBranch(
    _params: OpenVcs.VcsRenameBranchParams,
    _context: PluginRuntimeContext,
  ): null {
    throw pluginError(
      'lore-branch-rename-unsupported',
      'Lore does not support branch renaming',
    );
  }

  // -------------------------------------------------------------------------
  // Merge
  // -------------------------------------------------------------------------

  override async mergeIntoCurrent(
    params: OpenVcs.VcsMergeIntoCurrentParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    const name = asTrimmedString(params.name);
    const message = asTrimmedString(params.message) || undefined;
    await lore.mergeStart(name, message);
    return null;
  }

  override async mergeAbort(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    await lore.mergeAbort();
    return null;
  }

  override async mergeContinue(
    params: OpenVcs.VcsMergeContinueParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    // In Lore, merge resolve with empty paths finalizes the merge
    await lore.mergeResolve([]);
    return null;
  }

  override async isMergeInProgress(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): Promise<boolean> {
    const lore = this.requireLore(params.session_id);
    const events = await lore.status(undefined, false);
    const parsed = parseStatusFromEvents(toLegacyEvents(events));
    return parsed.summary.conflicted > 0;
  }

  // -------------------------------------------------------------------------
  // Upstream
  // -------------------------------------------------------------------------

  override setBranchUpstream(
    _params: OpenVcs.VcsSetBranchUpstreamParams,
    _context: PluginRuntimeContext,
  ): null {
    // Lore handles upstream implicitly (single remote)
    return null;
  }

  override async getBranchUpstream(
    params: OpenVcs.VcsGetBranchUpstreamParams,
    _context: PluginRuntimeContext,
  ): Promise<string | null> {
    const lore = this.requireLore(params.session_id);
    const url = await lore.getRemoteUrl();
    return url || null;
  }

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  override async hardResetHead(
    params: OpenVcs.VcsHardResetHeadParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    const ref = asTrimmedString(params.ref);
    if (ref) {
      await lore.fileReset(['.'], true);
    } else {
      await lore.fileReset(['.'], true);
    }
    return null;
  }

  override async resetSoftTo(
    params: OpenVcs.VcsResetSoftToParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    // Lore branch reset updates the local pointer
    await lore.branchReset(asTrimmedString(params.rev));
    return null;
  }

  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  override async getIdentity(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): Promise<OpenVcs.VcsIdentity | null> {
    const lore = this.requireLore(params.session_id);
    return lore.getIdentity();
  }

  override async setIdentityLocal(
    params: OpenVcs.VcsSetIdentityLocalParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    await lore.setIdentityLocal(
      asTrimmedString(params.name),
      asTrimmedString(params.email),
    );
    return null;
  }

  // -------------------------------------------------------------------------
  // Stashes (all unsupported stubs)
  // -------------------------------------------------------------------------

  override listStashes(
    _params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): OpenVcs.StashEntry[] {
    throw pluginError('lore-stash-not-supported', 'Lore does not support stashing');
  }

  override stashPush(
    _params: OpenVcs.VcsStashPushParams,
    _context: PluginRuntimeContext,
  ): string {
    throw pluginError('lore-stash-not-supported', 'Lore does not support stashing');
  }

  override stashApply(
    _params: OpenVcs.VcsStashSelectorParams,
    _context: PluginRuntimeContext,
  ): null {
    throw pluginError('lore-stash-not-supported', 'Lore does not support stashing');
  }

  override stashPop(
    _params: OpenVcs.VcsStashSelectorParams,
    _context: PluginRuntimeContext,
  ): null {
    throw pluginError('lore-stash-not-supported', 'Lore does not support stashing');
  }

  override stashDrop(
    _params: OpenVcs.VcsStashSelectorParams,
    _context: PluginRuntimeContext,
  ): null {
    throw pluginError('lore-stash-not-supported', 'Lore does not support stashing');
  }

  override stashShow(
    _params: OpenVcs.VcsStashSelectorParams,
    _context: PluginRuntimeContext,
  ): string {
    throw pluginError('lore-stash-not-supported', 'Lore does not support stashing');
  }

  // -------------------------------------------------------------------------
  // Cherry-pick / Revert
  // -------------------------------------------------------------------------

  override async cherryPick(
    params: OpenVcs.VcsCherryPickParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    await lore.cherryPick(asTrimmedString(params.commit));
    return null;
  }

  override async revertCommit(
    params: OpenVcs.VcsRevertCommitParams,
    _context: PluginRuntimeContext,
  ): Promise<null> {
    const lore = this.requireLore(params.session_id);
    await lore.revertCommit(asTrimmedString(params.commit));
    return null;
  }

  override validateUrl(
    params: OpenVcs.VcsValidateUrlParams,
    _context: PluginRuntimeContext,
  ): OpenVcs.VcsValidationResult {
    const url = asTrimmedString(params.url);
    if (!url) {
      return { ok: false, reason: 'URL is required' };
    }

    // Check for Lore URL patterns (http/https pointing to Lore servers)
    const isHttp = url.startsWith('http://') || url.startsWith('https://');

    if (isHttp) {
      return { ok: true };
    }

    return {
      ok: false,
      reason: 'Not a recognized Lore URL (http or https URL expected)',
    };
  }

  override validatePath(
    params: OpenVcs.VcsValidatePathParams,
    _context: PluginRuntimeContext,
  ): OpenVcs.VcsValidationResult {
    const path = asTrimmedString(params.path);
    if (!path) {
      return { ok: false, reason: 'Path is required' };
    }

    // Check if path exists and contains .lore directory

    if (!existsSync(path)) {
      return { ok: false, reason: 'Path does not exist' };
    }

    const stat = statSync(path);
    if (!stat.isDirectory()) {
      return { ok: false, reason: 'Path is not a directory' };
    }

    const loreDir = join(path, '.lore');
    if (!existsSync(loreDir)) {
      return { ok: false, reason: 'Not a Lore repository (.lore directory not found)' };
    }

    return { ok: true };
  }
}
