// Copyright © 2025-2026 OpenVCS Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { pluginError } from '@openvcs/sdk/runtime';

import {
  asString,
  findErrorEvents,
  parseJsonEvents,
} from './plugin-helpers.js';
import type {
  LoreCommandResult,
  LoreJsonResult,
  LoreRunOptions,
} from './plugin-types.js';

/** Maximum buffer size for subprocess stdout/stderr (16 MiB). */
const MAX_BUFFER = 16 * 1024 * 1024;

/** Shared base flags appended to every lore invocation. */
const BASE_FLAGS = ['--no-pager', '--non-interactive'];

/** Wraps the `lore` CLI with synchronous subprocess calls and JSON parsing. */
export class LoreCommand {
  /** Stores the working directory for lore operations. */
  private readonly cwd: string;

  /** Creates a lore command targeting the given working directory. */
  constructor(cwd: string) {
    this.cwd = cwd;
  }

  /** Runs a lore command and returns the raw result. */
  run(args: string[], options: LoreRunOptions = {}): LoreCommandResult {
    const result = spawnSync('lore', args, {
      cwd: this.cwd,
      input: typeof options.stdin === 'string' ? options.stdin : undefined,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
    });

    /* c8 ignore next 9 */
    if (result.status === null) {
      const signal = result.signal ?? 'unknown';
      console.warn(`lore process killed/crashed (signal: ${signal}) in ${this.cwd}: ${args.join(' ')}`);
      return {
        status: -2,
        stdout: asString(result.stdout),
        stderr: asString(result.stderr) || `Process terminated by signal: ${signal}`,
      };
    }

    return {
      status: result.status,
      stdout: asString(result.stdout),
      stderr: asString(result.stderr),
    };
  }

  /** Runs a lore command and throws if the exit code is non-zero. */
  runChecked(args: string[], errorCode: string, options: LoreRunOptions = {}): LoreCommandResult {
    const output = this.run(args, options);

    if (output.status !== 0) {
      const exitInfo = output.status === -2 ? ` (signal: ${output.stderr})` : ` (exit code: ${output.status})`;
      const message =
        output.stderr.trim() ||
        output.stdout.trim() ||
        `lore ${args.join(' ')}${exitInfo}`;
      throw pluginError(errorCode, message);
    }

    return output;
  }

  /** Runs a lore command with --json and parses JSON event lines from stdout. */
  runJson(args: string[], errorCode: string, options: LoreRunOptions = {}): LoreJsonResult {
    const output = this.runChecked(args, errorCode, options);
    const events = parseJsonEvents(output.stdout);

    const errorMessages = findErrorEvents(events);
    if (errorMessages.length > 0) {
      throw pluginError(errorCode, errorMessages.join('; '));
    }

    return { events, raw: output.stdout };
  }

  /** Returns the lore version string. */
  version(): string {
    const result = this.run([...BASE_FLAGS, '--version']);
    const versionMatch = result.stdout.match(/lore\s+(v?\d+\.\d+[\.\d]*)/i);
    if (versionMatch) {
      return versionMatch[1];
    }
    return result.stdout.trim();
  }

  /** Returns repository status via JSON events. */
  status(paths?: string[], scan?: boolean): LoreJsonResult {
    const args = [...BASE_FLAGS, '--json', '--offline', 'status'];
    if (scan) {
      args.push('--scan');
    } else {
      args.push('--check-dirty');
    }
    if (paths && paths.length > 0) {
      args.push(...paths);
    }
    return this.runJson(args, 'lore-status-failed');
  }

  /** Stages the given repository-relative paths. */
  stage(paths: string[], scan?: boolean): void {
    const args = [...BASE_FLAGS, 'stage'];
    if (scan) {
      args.push('--scan');
    }
    args.push(...paths);
    this.runChecked(args, 'lore-stage-failed');
  }

  /** Unstages the given repository-relative paths. */
  unstage(paths: string[]): void {
    const args = [...BASE_FLAGS, 'unstage', ...paths];
    this.runChecked(args, 'lore-unstage-failed');
  }

  /** Creates a commit with the given message. */
  commit(message: string, identity?: string): void {
    const args = [...BASE_FLAGS, '--offline', 'commit', message];
    if (identity) {
      args.push('--identity', identity);
    }
    this.runChecked(args, 'lore-commit-failed');
  }

  /** Amends the most recent revision with a new message. */
  amend(message: string): void {
    const args = [...BASE_FLAGS, '--offline', 'revision', 'amend', message];
    this.runChecked(args, 'lore-amend-failed');
  }

  /** Lists branches including archived. */
  listBranches(): LoreJsonResult {
    const args = [...BASE_FLAGS, '--json', '--offline', 'branch', 'list', '--archived'];
    return this.runJson(args, 'lore-branch-list-failed');
  }

  /** Creates a new branch. */
  createBranch(name: string): void {
    const args = [...BASE_FLAGS, 'branch', 'create', name];
    this.runChecked(args, 'lore-branch-create-failed');
  }

  /** Switches to an existing branch, optionally resetting. */
  switchBranch(name: string, reset?: boolean, revision?: string): void {
    const args = [...BASE_FLAGS, 'branch', 'switch'];
    if (reset) {
      args.push('--reset');
    }
    args.push(name);
    if (revision) {
      args.push(revision);
    }
    this.runChecked(args, 'lore-branch-switch-failed');
  }

  /** Archives (deletes) a branch. */
  deleteBranch(name: string): void {
    const args = [...BASE_FLAGS, 'branch', 'archive', name];
    this.runChecked(args, 'lore-branch-delete-failed');
  }

  /** Pushes the current or specified branch to the remote. */
  push(branch?: string): void {
    if (branch) {
      const args = [...BASE_FLAGS, 'branch', 'push', branch];
      this.runChecked(args, 'lore-push-failed');
    } else {
      const args = [...BASE_FLAGS, 'push'];
      this.runChecked(args, 'lore-push-failed');
    }
  }

  /** Syncs (fetches + applies) from the remote, optionally to a specific revision. */
  sync(revision?: string): void {
    const args = [...BASE_FLAGS, 'sync'];
    if (revision) {
      args.push(revision);
    }
    this.runChecked(args, 'lore-sync-failed');
  }

  /** Clones a remote repository to the given destination. */
  clone(url: string, dest: string, opts?: { sharedStore?: boolean; bare?: boolean }): void {
    const args = [...BASE_FLAGS, 'clone'];
    if (opts?.sharedStore) {
      args.push('--use-shared-store');
    }
    if (opts?.bare) {
      args.push('--bare');
    }
    args.push(url, dest);
    this.runChecked(args, 'lore-clone-failed');
  }

  /** Lists commit history via JSON events. */
  listCommits(limit?: number, rev?: string): LoreJsonResult {
    const args = [...BASE_FLAGS, '--json', '--offline', 'revision', 'history'];
    if (rev) {
      args.push('--revision', rev);
    }
    if (limit !== undefined && limit > 0) {
      args.push(String(limit));
    }
    return this.runJson(args, 'lore-history-failed');
  }

  /** Returns the diff for a single file. */
  diffFile(path: string, rev?: string): LoreJsonResult {
    const args = [...BASE_FLAGS, '--json', '--offline', 'file', 'diff', '--path', path];
    if (rev) {
      args.push('--revision', rev);
    }
    return this.runJson(args, 'lore-diff-file-failed');
  }

  /** Returns the diff for a revision against its parent or a target. */
  diffRevision(rev: string, target?: string): LoreJsonResult {
    const args = [...BASE_FLAGS, '--json', '--offline', 'revision', 'diff', rev];
    if (target) {
      args.push('--target', target);
    }
    return this.runJson(args, 'lore-diff-revision-failed');
  }

  /** Cherry-picks a revision, optionally with a custom message. */
  cherryPick(rev: string, opts?: { message?: string }): void {
    const args = [...BASE_FLAGS, 'revision', 'cherry-pick'];
    if (opts?.message) {
      args.push('--message', opts.message);
    }
    args.push(rev);
    this.runChecked(args, 'lore-cherry-pick-failed');
  }

  /** Reverts a revision, optionally with a custom message. */
  revertCommit(rev: string, opts?: { message?: string }): void {
    const args = [...BASE_FLAGS, 'revision', 'revert'];
    if (opts?.message) {
      args.push('--message', opts.message);
    }
    args.push(rev);
    this.runChecked(args, 'lore-revert-failed');
  }

  /** Starts a merge of the given branch, optionally with a message. */
  mergeStart(branch: string, message?: string): void {
    const args = [...BASE_FLAGS, 'branch', 'merge', 'start'];
    if (message) {
      args.push('--message', message);
    }
    args.push(branch);
    this.runChecked(args, 'lore-merge-start-failed');
  }

  /** Aborts an in-progress merge. */
  mergeAbort(): void {
    const args = [...BASE_FLAGS, 'branch', 'merge', 'abort'];
    this.runChecked(args, 'lore-merge-abort-failed');
  }

  /** Resolves conflicts for the given paths by accepting both sides. */
  mergeResolve(paths: string[]): void {
    const args = [...BASE_FLAGS, 'branch', 'merge', 'resolve', ...paths];
    this.runChecked(args, 'lore-merge-resolve-failed');
  }

  /** Resolves conflicts by keeping the current branch (ours) version. */
  mergeResolveMine(paths: string[]): void {
    const args = [...BASE_FLAGS, 'branch', 'merge', 'resolve', 'mine', ...paths];
    this.runChecked(args, 'lore-merge-resolve-mine-failed');
  }

  /** Resolves conflicts by keeping the incoming branch (theirs) version. */
  mergeResolveTheirs(paths: string[]): void {
    const args = [...BASE_FLAGS, 'branch', 'merge', 'resolve', 'theirs', ...paths];
    this.runChecked(args, 'lore-merge-resolve-theirs-failed');
  }

  /** Resets file(s) to their clean state, optionally purging untracked files. */
  fileReset(paths: string[], purge?: boolean): void {
    const args = [...BASE_FLAGS, '--offline', 'file', 'reset'];
    if (purge) {
      args.push('--purge');
    }
    args.push(...paths);
    this.runChecked(args, 'lore-file-reset-failed');
  }

  /** Reads a configuration key from the lore repository config. */
  getConfig(key: string): string | null {
    const result = this.runJson(
      [...BASE_FLAGS, '--json', '--offline', 'repository', 'config', 'get', key],
      'lore-config-get-failed',
    );
    const configEvent = result.events.find(
      (e) => e.tagName === 'repositoryConfigValue' || e.tagName === 'configValue',
    );
    if (configEvent?.data && typeof configEvent.data.value === 'string') {
      return configEvent.data.value;
    }
    return null;
  }

  /** Reads the remote_url from the lore config. */
  getRemoteUrl(): string | null {
    return this.getConfig('remote_url');
  }

  /** Reads the identity from the .lore/config.toml file. */
  getIdentity(): { name: string; email: string } | null {
    const configPath = join(this.cwd, '.lore', 'config.toml');
    try {
      const content = readFileSync(configPath, 'utf8');
      const identityMatch = content.match(/^identity\s*=\s*"?(.+?)"?\s*$/m);
      if (!identityMatch) {
        return null;
      }
      const identity = identityMatch[1].trim();
      if (!identity) {
        return null;
      }
      const angleMatch = identity.match(/^(.+?)\s*<(.+?)>$/);
      if (angleMatch) {
        return { name: angleMatch[1].trim(), email: angleMatch[2].trim() };
      }
      if (identity.includes('@')) {
        return { name: '', email: identity };
      }
      return { name: identity, email: '' };
    } catch {
      return null;
    }
  }

  /** Writes the identity to the .lore/config.toml file. */
  setIdentityLocal(name: string, email: string): void {
    const configPath = join(this.cwd, '.lore', 'config.toml');
    let content: string;
    try {
      content = readFileSync(configPath, 'utf8');
    } catch {
      content = '';
    }
    const identity = email ? (name ? `${name} <${email}>` : email) : name;
    const identityLine = `identity = "${identity}"`;
    if (/^identity\s*=/m.test(content)) {
      content = content.replace(/^identity\s*=\s*".*?"$/m, identityLine);
    } else {
      content = content.trimEnd() + (content.endsWith('\n') ? '' : '\n') + identityLine + '\n';
    }
    writeFileSync(configPath, content, 'utf8');
  }
}

