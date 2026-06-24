// Copyright © 2025-2026 OpenVCS Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VcsDelegateBase,
  pluginError,
  type PluginRuntimeContext,
} from '@openvcs/sdk/runtime';
import type * as OpenVcs from '@openvcs/sdk/types';

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
import type { LoreSession } from './plugin-types.js';

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

  override open(
    params: OpenVcs.VcsOpenParams,
    _context: PluginRuntimeContext,
  ): OpenVcs.VcsSessionResult {
    const repoPath = asTrimmedString(params.path);
    if (!repoPath) {
      throw pluginError('vcs-open-invalid-path', 'path is required');
    }

    // Verify .lore/ directory exists
    const lore = this.deps.createLoreCommand(repoPath);
    lore.runChecked(['status', '--revision-only'], 'vcs-open-not-repository');

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

  override cloneRepo(
    params: OpenVcs.VcsCloneRepoParams,
    context: PluginRuntimeContext,
  ): null {
    const url = asTrimmedString(params.url);
    const destination = asTrimmedString(params.dest);

    if (!url || !destination) {
      throw pluginError('vcs-clone-invalid-args', 'url and dest are required');
    }

    const lore = this.deps.createLoreCommand(process.cwd());
    const output = lore.runChecked(
      ['clone', url, destination],
      'vcs-clone-failed',
    );
    const lines = `${output.stdout}\n${output.stderr}`
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      context.host.info(line);
    }

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

  override getCurrentBranch(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): string | null {
    const lore = this.requireLore(params.session_id);
    const result = lore.status(undefined, false);
    const revisionEvent = result.events.find(
      (e) => e.tagName === 'repositoryStatusRevision',
    );
    if (revisionEvent?.data) {
      return asTrimmedString(revisionEvent.data.branchName) || null;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Branch listing / creation / checkout / deletion
  // -------------------------------------------------------------------------

  override listBranches(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): OpenVcs.VcsBranchEntry[] {
    const lore = this.requireLore(params.session_id);
    const result = lore.listBranches();
    const { branches } = parseBranchList(result.events);

    return branches.map((b) => ({
      name: b.name,
      full_ref: b.name,
      kind: { type: 'Local' } as OpenVcs.VcsBranchKind,
      current: b.current,
    }));
  }

  override listLocalBranches(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): string[] {
    const lore = this.requireLore(params.session_id);
    const result = lore.listBranches();
    const { branches } = parseBranchList(result.events);
    return branches.map((b) => b.name);
  }

  override createBranch(
    params: OpenVcs.VcsCreateBranchParams,
    _context: PluginRuntimeContext,
  ): null {
    const lore = this.requireLore(params.session_id);
    const name = asTrimmedString(params.name);
    lore.createBranch(name);
    if (params.checkout === true) {
      lore.switchBranch(name);
    }
    return null;
  }

  override checkoutBranch(
    params: OpenVcs.VcsCheckoutBranchParams,
    _context: PluginRuntimeContext,
  ): null {
    const lore = this.requireLore(params.session_id);
    lore.switchBranch(asTrimmedString(params.name));
    return null;
  }

  // -------------------------------------------------------------------------
  // Remote management (via config, not lore link)
  // -------------------------------------------------------------------------

  override ensureRemote(
    params: OpenVcs.VcsEnsureRemoteParams,
    _context: PluginRuntimeContext,
  ): null {
    const url = asTrimmedString(params.url);
    const lore = this.requireLore(params.session_id);
    const currentUrl = lore.getRemoteUrl();
    if (currentUrl === url) {
      return null;
    }
    throw pluginError(
      'lore-remote-update-unsupported',
      'Lore v1 does not support changing remote URL. Edit .lore/config.toml manually.',
    );
  }

  override listRemotes(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): OpenVcs.VcsRemoteEntry[] {
    const lore = this.requireLore(params.session_id);
    const url = lore.getRemoteUrl();
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

  override fetch(
    params: OpenVcs.VcsFetchParams,
    _context: PluginRuntimeContext,
  ): null {
    const lore = this.requireLore(params.session_id);
    lore.sync();
    return null;
  }

  override push(
    params: OpenVcs.VcsPushParams,
    _context: PluginRuntimeContext,
  ): null {
    const lore = this.requireLore(params.session_id);
    const branch = asTrimmedString(params.refspec) || undefined;
    lore.push(branch);
    return null;
  }

  override pullFfOnly(
    params: OpenVcs.VcsPullFfOnlyParams,
    _context: PluginRuntimeContext,
  ): null {
    const lore = this.requireLore(params.session_id);
    const revision = asTrimmedString(params.branch) || undefined;
    lore.sync(revision);
    return null;
  }

  // -------------------------------------------------------------------------
  // Commit / Commit index
  // -------------------------------------------------------------------------

  override commit(
    params: OpenVcs.VcsCommitParams,
    _context: PluginRuntimeContext,
  ): string {
    const lore = this.requireLore(params.session_id);
    const message = asTrimmedString(params.message);
    const identity = asTrimmedString(params.name) || undefined;
    lore.commit(message, identity);
    // Return current HEAD after commit — use status to get revision
    const status = lore.status(undefined, false);
    const revEvent = status.events.find(
      (e) => e.tagName === 'repositoryStatusRevision',
    );
    return asTrimmedString(revEvent?.data?.revision) || '';
  }

  override commitIndex(
    params: OpenVcs.VcsCommitParams,
    _context: PluginRuntimeContext,
  ): string {
    return this.commit(params, _context);
  }

  // -------------------------------------------------------------------------
  // Status (with caching)
  // -------------------------------------------------------------------------

  override getStatusSummary(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): OpenVcs.StatusSummary {
    const lore = this.requireLore(params.session_id);
    const result = lore.status(undefined, false);
    const parsed = parseStatusFromEvents(result.events);
    return parsed.summary;
  }

  override getStatusPayload(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): OpenVcs.StatusPayload {
    const lore = this.requireLore(params.session_id);
    const result = lore.status(undefined, false);
    const parsed = parseStatusFromEvents(result.events);
    return parsed.payload;
  }

  // -------------------------------------------------------------------------
  // Commit history / Diff
  // -------------------------------------------------------------------------

  override listCommits(
    params: OpenVcs.VcsListCommitsParams,
    _context: PluginRuntimeContext,
  ): OpenVcs.CommitEntry[] {
    const lore = this.requireLore(params.session_id);
    const query = asRecord(params.query);
    const limit = asNumber(query.limit, 0);
    const rev = asTrimmedString(query.rev) || undefined;
    const result = lore.listCommits(limit || undefined, rev);
    return parseCommitHistory(result.events);
  }

  override diffFile(
    params: OpenVcs.VcsDiffFileParams,
    _context: PluginRuntimeContext,
  ): OpenVcs.VcsDiffFileResponse {
    const lore = this.requireLore(params.session_id);
    const result = lore.diffFile(asTrimmedString(params.path));
    // Extract diff lines from diff events
    const diffLines: string[] = [];
    for (const evt of result.events) {
      if (evt.tagName === 'fileDiffData' && evt.data) {
        const d = evt.data as Record<string, unknown>;
        if (typeof d.line === 'string') {
          diffLines.push(d.line);
        }
      }
    }
    return { lines: diffLines, binary: false };
  }

  override diffCommit(
    params: OpenVcs.VcsDiffCommitParams,
    _context: PluginRuntimeContext,
  ): string[] {
    const lore = this.requireLore(params.session_id);
    const result = lore.diffRevision(asTrimmedString(params.rev));
    const diffLines: string[] = [];
    for (const evt of result.events) {
      if (evt.tagName === 'revisionDiffData' && evt.data) {
        const d = evt.data as Record<string, unknown>;
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

  override checkoutConflictSide(
    params: OpenVcs.VcsCheckoutConflictSideParams,
    _context: PluginRuntimeContext,
  ): null {
    const lore = this.requireLore(params.session_id);
    const side = asTrimmedString(params.side);
    const path = asTrimmedString(params.path);
    if (side !== 'ours' && side !== 'theirs') {
      throw pluginError('vcs-invalid-side', 'side must be "ours" or "theirs"');
    }
    if (side === 'ours') {
      lore.mergeResolveMine([path]);
    } else {
      lore.mergeResolveTheirs([path]);
    }
    return null;
  }

  override writeMergeResult(
    params: OpenVcs.VcsWriteMergeResultParams,
    _context: PluginRuntimeContext,
  ): null {
    const lore = this.requireLore(params.session_id);
    const path = asTrimmedString(params.path);
    const content = Buffer.from(asTrimmedString(params.content_b64), 'base64').toString('utf8');
    // Write content directly to worktree, then stage
    const { writeFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const fullPath = join(this.requireSessionPath(params.session_id), path);
    writeFileSync(fullPath, content, 'utf8');
    lore.stage([path]);
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

  override stageSelections(
    _params: OpenVcs.VcsStageSelectionsParams,
    _context: PluginRuntimeContext,
  ): null {
    throw pluginError(
      'lore-stage-patch-unsupported',
      'Lore does not support patch staging in v1',
    );
  }

  override stagePaths(
    params: OpenVcs.VcsStagePathsParams,
    _context: PluginRuntimeContext,
  ): null {
    const lore = this.requireLore(params.session_id);
    const paths = asStringArray(params.paths);
    if (paths.length === 0) {
      return null;
    }
    lore.stage(paths);
    return null;
  }

  override discardPaths(
    params: OpenVcs.VcsDiscardPathsParams,
    _context: PluginRuntimeContext,
  ): null {
    const lore = this.requireLore(params.session_id);
    const paths = asStringArray(params.paths);
    if (paths.length === 0) {
      return null;
    }
    lore.fileReset(paths);
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

  override deleteBranch(
    params: OpenVcs.VcsDeleteBranchParams,
    _context: PluginRuntimeContext,
  ): null {
    const lore = this.requireLore(params.session_id);
    lore.deleteBranch(asTrimmedString(params.name));
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

  override mergeIntoCurrent(
    params: OpenVcs.VcsMergeIntoCurrentParams,
    _context: PluginRuntimeContext,
  ): null {
    const lore = this.requireLore(params.session_id);
    const name = asTrimmedString(params.name);
    const message = asTrimmedString(params.message) || undefined;
    lore.mergeStart(name, message);
    return null;
  }

  override mergeAbort(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): null {
    const lore = this.requireLore(params.session_id);
    lore.mergeAbort();
    return null;
  }

  override mergeContinue(
    params: OpenVcs.VcsMergeContinueParams,
    _context: PluginRuntimeContext,
  ): null {
    const lore = this.requireLore(params.session_id);
    // In Lore, merge resolve with empty paths finalizes the merge
    lore.mergeResolve([]);
    return null;
  }

  override isMergeInProgress(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): boolean {
    const lore = this.requireLore(params.session_id);
    const result = lore.status(undefined, false);
    const parsed = parseStatusFromEvents(result.events);
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

  override getBranchUpstream(
    params: OpenVcs.VcsGetBranchUpstreamParams,
    _context: PluginRuntimeContext,
  ): string | null {
    const lore = this.requireLore(params.session_id);
    const url = lore.getRemoteUrl();
    return url || null;
  }

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  override hardResetHead(
    params: OpenVcs.VcsHardResetHeadParams,
    _context: PluginRuntimeContext,
  ): null {
    const lore = this.requireLore(params.session_id);
    const ref = asTrimmedString(params.ref);
    if (ref) {
      lore.fileReset(['.'], true);
    } else {
      lore.fileReset(['.'], true);
    }
    return null;
  }

  override resetSoftTo(
    params: OpenVcs.VcsResetSoftToParams,
    _context: PluginRuntimeContext,
  ): null {
    const lore = this.requireLore(params.session_id);
    // Lore branch reset updates the local pointer
    const args = ['--no-pager', '--non-interactive', 'branch', 'reset', asTrimmedString(params.rev)];
    lore.runChecked(args, 'lore-branch-reset-failed');
    return null;
  }

  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  override getIdentity(
    params: OpenVcs.VcsSessionParams,
    _context: PluginRuntimeContext,
  ): OpenVcs.VcsIdentity | null {
    const lore = this.requireLore(params.session_id);
    return lore.getIdentity();
  }

  override setIdentityLocal(
    params: OpenVcs.VcsSetIdentityLocalParams,
    _context: PluginRuntimeContext,
  ): null {
    const lore = this.requireLore(params.session_id);
    lore.setIdentityLocal(
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

  override cherryPick(
    params: OpenVcs.VcsCherryPickParams,
    _context: PluginRuntimeContext,
  ): null {
    const lore = this.requireLore(params.session_id);
    lore.cherryPick(asTrimmedString(params.commit));
    return null;
  }

  override revertCommit(
    params: OpenVcs.VcsRevertCommitParams,
    _context: PluginRuntimeContext,
  ): null {
    const lore = this.requireLore(params.session_id);
    lore.revertCommit(asTrimmedString(params.commit));
    return null;
  }
}
