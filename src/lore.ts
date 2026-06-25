// Copyright © 2025-2026 OpenVCS Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { isAbsolute, resolve } from 'node:path';

import { lore } from '@lore-vcs/sdk';
import { LoreEventTag } from '@lore-vcs/sdk/types/enums';
import type { LoreEventFFI } from '@lore-vcs/sdk/types/events';
import type {
  LoreGlobalArgs,
  LoreBranchListArgs,
  LoreBranchCreateArgs,
  LoreBranchSwitchArgs,
  LoreBranchArchiveArgs,
  LoreBranchPushArgs,
  LoreBranchMergeStartArgs,
  LoreBranchMergeAbortArgs,
  LoreBranchMergeResolveArgs,
  LoreBranchMergeResolveMineArgs,
  LoreBranchMergeResolveTheirsArgs,
  LoreBranchResetArgs,
  LoreRepositoryCloneArgs,
  LoreRepositoryStatusArgs,
  LoreRepositoryConfigGetArgs,
  LoreRevisionCommitArgs,
  LoreRevisionHistoryArgs,
  LoreRevisionSyncArgs,
  LoreRevisionRevertArgs,
  LoreRevisionAmendArgs,
  LoreFileStageArgs,
  LoreFileUnstageArgs,
  LoreFileResetArgs,
  LoreFileDiffArgs,
} from '@lore-vcs/sdk/types/args';

/** Wraps the Lore JavaScript SDK with typed methods for the OpenVCS plugin. */
export class LoreCommand {
  private readonly repositoryPath: string;

  constructor(cwd: string) {
    this.repositoryPath = cwd;
  }

  private globals(): LoreGlobalArgs {
    return { repositoryPath: this.repositoryPath };
  }

  private absolutizeUserPath(path: string): string {
    if (!path || path === '.') {
      return this.repositoryPath;
    }
    return isAbsolute(path) ? path : resolve(this.repositoryPath, path);
  }

  private absolutizeUserPaths(paths: readonly string[]): string[] {
    return paths.map((path) => this.absolutizeUserPath(path));
  }

  /** Runs an SDK method and collects all events. */
  private async collect<TArgs>(fn: (globals: LoreGlobalArgs, args: TArgs) => ReturnType<typeof lore.branchList>, args: TArgs): Promise<LoreEventFFI[]> {
    // collectAsync() returns LoreEvent[] which is structurally compatible at runtime
    return await fn(this.globals(), args as any).collectAsync() as unknown as LoreEventFFI[];
  }
  /** Runs an SDK method and waits for completion. */
  private async wait<TArgs>(fn: (globals: LoreGlobalArgs, args: TArgs) => ReturnType<typeof lore.branchList>, args: TArgs): Promise<void> {
    await fn(this.globals(), args as any).waitAsync();
  }

  /** Returns the lore version string. */
  async version(): Promise<string> {
    return '@lore-vcs/sdk v0.8.3';
  }

  /** Get repository status. */
  async status(paths?: string[], scan?: boolean): Promise<LoreEventFFI[]> {
    const args: LoreRepositoryStatusArgs = {
      staged: true,
      scan: scan ?? true,
      paths: paths ?? [],
    };
    return this.collect(lore.repositoryStatus as any, args);
  }

  /** Stage files. */
  async stage(paths: string[], scan?: boolean): Promise<void> {
    const args: LoreFileStageArgs = {
      paths: this.absolutizeUserPaths(paths),
      scan: scan ?? false,
    };
    await this.wait(lore.fileStage as any, args);
  }

  /** Unstage files. */
  async unstage(paths: string[]): Promise<void> {
    const args: LoreFileUnstageArgs = { paths: this.absolutizeUserPaths(paths) };
    await this.wait(lore.fileUnstage as any, args);
  }

  /** Commit staged changes with optional identity in globals. */
  async commit(message: string, identity?: string): Promise<void> {
    const args: LoreRevisionCommitArgs = { message };
    const globals: LoreGlobalArgs = { repositoryPath: this.repositoryPath };
    if (identity) {
      globals.identity = identity;
    }
    await lore.revisionCommit(globals, args as any).collectAsync();
  }

  /** Amend commit message. */
  async amend(message: string): Promise<void> {
    const args: LoreRevisionAmendArgs = { message };
    await this.wait(lore.revisionAmend as any, args);
  }

  /** List branches. */
  async listBranches(): Promise<LoreEventFFI[]> {
    const args: LoreBranchListArgs = { archived: false };
    return this.collect(lore.branchList as any, args);
  }

  /** Create a branch. */
  async createBranch(name: string): Promise<void> {
    const args: LoreBranchCreateArgs = { branch: name, category: '' };
    await this.wait(lore.branchCreate as any, args);
  }

  /** Switch to a branch. */
  async switchBranch(name: string, reset?: boolean, revision?: string): Promise<void> {
    const args: LoreBranchSwitchArgs = {
      branch: name,
      revision: revision ?? '',
      reset: reset ?? false,
      bare: false,
    };
    await this.wait(lore.branchSwitch as any, args);
  }

  /** Archive (delete) a branch. */
  async deleteBranch(name: string): Promise<void> {
    const args: LoreBranchArchiveArgs = { branch: name };
    await this.wait(lore.branchArchive as any, args);
  }

  /** Push to remote. */
  async push(branch?: string): Promise<void> {
    const args: LoreBranchPushArgs = {
      branch: branch ?? '',
      fastForwardMerge: false,
    };
    await this.wait(lore.branchPush as any, args);
  }

  /** Sync (pull/fetch) from remote. */
  async sync(revision?: string): Promise<void> {
    const args: LoreRevisionSyncArgs = {
      revision: revision ?? '',
    };
    await this.wait(lore.revisionSync as any, args);
  }

  /** Clone a repository. */
  async clone(url: string, dest: string, opts?: { sharedStore?: boolean; bare?: boolean }): Promise<void> {
    const args: LoreRepositoryCloneArgs = {
      repositoryUrl: url,
      bare: opts?.bare ?? false,
      useSharedStore: opts?.sharedStore ?? false,
      sharedStorePath: '',
      virtually: false,
      directFileWrite: false,
      directFileIo: false,
      noTracking: false,
      dependencyRecursive: false,
      dependencyDepthLimit: 0,
      layer: '',
      layerMetadata: '',
      prefetch: '',
      view: '',
      revision: '',
      rootFiles: [],
      dependencyTags: [],
    };
    await this.wait(lore.repositoryClone as any, args);
  }

  /** List commit history. Returns empty array for repos with no commits. */
  async listCommits(limit?: number, rev?: string): Promise<LoreEventFFI[]> {
    const args: LoreRevisionHistoryArgs = {
      length: limit ?? 0,
      revision: rev ?? '',
      branch: '',
      onlyBranch: false,
    };
    try {
      return await this.collect(lore.revisionHistory as any, args);
    } catch (err: any) {
      // Empty repos have no HEAD — return empty list instead of crashing
      if (err?.message?.includes('revision not found')) {
        return [];
      }
      throw err;
    }
  }

  /** Diff a file. Lore SDK fileDiff requires absolute paths. */
  async diffFile(path: string, rev?: string): Promise<LoreEventFFI[]> {
    // Build absolute path — Lore SDK fileDiff ignores repositoryPath from globals
    const absolutePath = path.startsWith('/')
      ? path
      : `${this.repositoryPath}/${path}`;
    const args: LoreFileDiffArgs = {
      paths: [absolutePath],
      sourceRevision: rev ?? '',
      targetRevision: '',
      diff3: false,
      contextLines: 3,
      ignoreWhitespaceEol: false,
      ignoreWhitespaceInline: false,
    };
    return this.collect(lore.fileDiff as any, args);
  }

  /** Diff a revision. */
  async diffRevision(rev: string): Promise<LoreEventFFI[]> {
    return [];
  }

  /** Start a merge. */
  async mergeStart(branch: string, message?: string): Promise<void> {
    const args: LoreBranchMergeStartArgs = {
      branch,
      message: message ?? '',
      noCommit: false,
      link: '',
      ignoreLinks: false,
    };
    await this.wait(lore.branchMergeStart as any, args);
  }

  /** Abort a merge. */
  async mergeAbort(): Promise<void> {
    const args: LoreBranchMergeAbortArgs = {
      link: '',
      ignoreLinks: false,
    };
    await this.wait(lore.branchMergeAbort as any, args);
  }

  /** Resolve merge conflicts. */
  async mergeResolve(paths: string[]): Promise<void> {
    const args: LoreBranchMergeResolveArgs = { paths: this.absolutizeUserPaths(paths) };
    await this.wait(lore.branchMergeResolve as any, args);
  }

  /** Resolve merge conflicts with "mine" version. */
  async mergeResolveMine(paths: string[]): Promise<void> {
    const args: LoreBranchMergeResolveMineArgs = { paths: this.absolutizeUserPaths(paths) };
    await this.wait(lore.branchMergeResolveMine as any, args);
  }

  /** Resolve merge conflicts with "theirs" version. */
  async mergeResolveTheirs(paths: string[]): Promise<void> {
    const args: LoreBranchMergeResolveTheirsArgs = { paths: this.absolutizeUserPaths(paths) };
    await this.wait(lore.branchMergeResolveTheirs as any, args);
  }

  /** Reset files to revision. */
  async fileReset(paths: string[], purge?: boolean): Promise<void> {
    const args: LoreFileResetArgs = {
      paths: this.absolutizeUserPaths(paths),
      purge: purge ?? false,
      revision: '',
    };
    await this.wait(lore.fileReset as any, args);
  }

  /** Read a config value from the repository config. */
  async getConfig(key: string): Promise<string | null> {
    try {
      const args: LoreRepositoryConfigGetArgs = { key };
      const events = await this.collect(lore.repositoryConfigGet as any, args);
      for (const evt of events) {
        if (evt.tag === LoreEventTag.METADATA) {
          const data = evt.data as unknown as Record<string, unknown> | undefined;
          if (data?.key === key) {
            const val = data.value;
            if (typeof val === 'string') return val;
            if (val && typeof val === 'object' && 'String' in val) return String((val as Record<string, unknown>).String);
            if (val && typeof val === 'object' && 'Numeric' in val) return String((val as Record<string, unknown>).Numeric);
            if (val && typeof val === 'object' && 'Hash' in val) return String((val as Record<string, unknown>).Hash);
            return String(val);
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Read the remote URL from repository config. */
  async getRemoteUrl(): Promise<string | null> {
    return this.getConfig('remote_url');
  }

  /** Read the configured author identity from repository config. */
  async getIdentity(): Promise<{ name: string; email: string } | null> {
    const name = await this.getConfig('identity.name');
    const email = await this.getConfig('identity.email');
    if (name && email) {
      return { name, email };
    }
    return null;
  }

  /** Set identity locally.
   *  Lore v1 does not support writing config via the SDK — throws. */
  async setIdentityLocal(_name: string, _email: string): Promise<void> {
    throw new Error('Lore v1 does not support setting identity via config. Use the identity field in global args when committing.');
  }

  /** Cherry-pick a commit — unsupported in Lore v1 SDK. */
  async cherryPick(_commit: string): Promise<void> {
    throw new Error('Cherry-pick is not supported in Lore v1');
  }

  /** Revert a commit. */
  async revertCommit(commit: string): Promise<void> {
    const args: LoreRevisionRevertArgs = { revision: commit };
    await this.wait(lore.revisionRevert as any, args);
  }

  /** Reset the current branch pointer to a specific revision. */
  async branchReset(revision: string): Promise<void> {
    const args: LoreBranchResetArgs = { revision };
    await this.wait(lore.branchReset as any, args);
  }
}
