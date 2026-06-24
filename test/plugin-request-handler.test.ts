// Copyright © 2025-2026 OpenVCS Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
/// <reference types="node" />

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PluginRuntimeContext } from '@openvcs/sdk/runtime';

import { LoreVcsDelegates } from '../src/plugin-request-handler.js';
import type { LoreCommand } from '../src/lore.js';

/** Creates a minimal runtime context for direct delegate invocation. */
function createRuntimeContext(): PluginRuntimeContext {
  return {
    host: {} as PluginRuntimeContext['host'],
    requestId: '1',
    method: 'vcs.get_caps',
  };
}

/** Creates delegate dependencies backed by one mock lore command. */
function createMockDelegate(mockLore: Partial<LoreCommand>) {
  return new LoreVcsDelegates({
    allocateSession: () => 'session-1',
    closeSession: () => {},
    requireSession: () => ({ path: '/tmp/mock-repo' }),
    createLoreCommand: () => mockLore as LoreCommand,
  });
}

describe('LoreVcsDelegates', () => {
  describe('getCaps', () => {
    it('returns Lore capabilities', () => {
      const delegates = createMockDelegate({});
      const caps = delegates.getCaps({}, createRuntimeContext());
      assert.strictEqual(caps.commits, true);
      assert.strictEqual(caps.branches, true);
      assert.strictEqual(caps.tags, false);
      assert.strictEqual(caps.staging, true);
      assert.strictEqual(caps.push_pull, true);
      assert.strictEqual(caps.fast_forward, true);
    });
  });

  describe('open', () => {
    it('opens a valid repository', () => {
      const delegates = createMockDelegate({
        runChecked: () => ({ status: 0, stdout: '', stderr: '' }),
      });
      const result = delegates.open({ path: '/tmp/repo' }, createRuntimeContext());
      assert.ok(result.session_id);
    });

    it('throws when path is empty', () => {
      const delegates = createMockDelegate({});
      assert.throws(
        () => delegates.open({ path: '' }, createRuntimeContext()),
        (err: Error) => {
          assert.ok(err.message.includes('path is required'));
          return true;
        },
      );
    });
  });

  describe('close', () => {
    it('closes session', () => {
      const delegates = createMockDelegate({});
      const result = delegates.close({ session_id: '1' }, createRuntimeContext());
      assert.strictEqual(result, null);
    });
  });

  describe('getWorkdir', () => {
    it('returns session path', () => {
      const delegates = createMockDelegate({});
      const result = delegates.getWorkdir({ session_id: '1' }, createRuntimeContext());
      assert.strictEqual(result, '/tmp/mock-repo');
    });
  });

  describe('getCurrentBranch', () => {
    it('returns branch name from status', () => {
      const delegates = createMockDelegate({
        status: () => ({
          events: [
            { tagName: 'repositoryStatusRevision', data: { branchName: 'main' } },
          ],
          raw: '',
        }),
      });
      const result = delegates.getCurrentBranch({ session_id: '1' }, createRuntimeContext());
      assert.strictEqual(result, 'main');
    });

    it('returns null when no branch in status', () => {
      const delegates = createMockDelegate({
        status: () => ({ events: [], raw: '' }),
      });
      const result = delegates.getCurrentBranch({ session_id: '1' }, createRuntimeContext());
      assert.strictEqual(result, null);
    });
  });

  describe('listBranches', () => {
    it('returns branch entries', () => {
      const delegates = createMockDelegate({
        listBranches: () => ({
          events: [
            { tagName: 'branchListEntry', data: { name: 'main', isCurrent: true } },
            { tagName: 'branchListEntry', data: { name: 'feature', isCurrent: false } },
          ],
          raw: '',
        }),
      });
      const result = delegates.listBranches({ session_id: '1' }, createRuntimeContext());
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].name, 'main');
      assert.strictEqual(result[0].current, true);
      assert.strictEqual(result[1].name, 'feature');
      assert.strictEqual(result[1].current, false);
    });
  });

  describe('listLocalBranches', () => {
    it('returns branch names', () => {
      const delegates = createMockDelegate({
        listBranches: () => ({
          events: [
            { tagName: 'branchListEntry', data: { name: 'main', isCurrent: true } },
            { tagName: 'branchListEntry', data: { name: 'feature', isCurrent: false } },
          ],
          raw: '',
        }),
      });
      const result = delegates.listLocalBranches({ session_id: '1' }, createRuntimeContext());
      assert.deepStrictEqual(result, ['main', 'feature']);
    });
  });

  describe('createBranch', () => {
    it('creates branch', () => {
      let called = false;
      const delegates = createMockDelegate({
        createBranch: () => { called = true; },
      });
      delegates.createBranch(
        { session_id: '1', name: 'feature' },
        createRuntimeContext(),
      );
      assert.strictEqual(called, true);
    });

    it('checks out branch when checkout=true', () => {
      const calls: string[] = [];
      const delegates = createMockDelegate({
        createBranch: (name: string) => { calls.push(`create:${name}`); },
        switchBranch: (name: string) => { calls.push(`switch:${name}`); },
      });
      delegates.createBranch(
        { session_id: '1', name: 'feature', checkout: true },
        createRuntimeContext(),
      );
      assert.deepStrictEqual(calls, ['create:feature', 'switch:feature']);
    });
  });

  describe('checkoutBranch', () => {
    it('switches branch', () => {
      let called = false;
      const delegates = createMockDelegate({
        switchBranch: () => { called = true; },
      });
      delegates.checkoutBranch(
        { session_id: '1', name: 'main' },
        createRuntimeContext(),
      );
      assert.strictEqual(called, true);
    });
  });

  describe('ensureRemote', () => {
    it('returns null when URL matches', () => {
      const delegates = createMockDelegate({
        getRemoteUrl: () => 'https://example.com/repo',
      });
      const result = delegates.ensureRemote(
        { session_id: '1', name: 'origin', url: 'https://example.com/repo' },
        createRuntimeContext(),
      );
      assert.strictEqual(result, null);
    });

    it('throws when URL differs', () => {
      const delegates = createMockDelegate({
        getRemoteUrl: () => 'https://example.com/old',
      });
      assert.throws(
        () => delegates.ensureRemote(
          { session_id: '1', name: 'origin', url: 'https://example.com/new' },
          createRuntimeContext(),
        ),
        (err: Error) => {
          assert.ok(err.message.includes('not support changing remote URL'));
          return true;
        },
      );
    });
  });

  describe('listRemotes', () => {
    it('returns remote when URL exists', () => {
      const delegates = createMockDelegate({
        getRemoteUrl: () => 'https://example.com/repo',
      });
      const result = delegates.listRemotes({ session_id: '1' }, createRuntimeContext());
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'origin');
      assert.strictEqual(result[0].url, 'https://example.com/repo');
    });

    it('returns empty when no remote URL', () => {
      const delegates = createMockDelegate({
        getRemoteUrl: () => null,
      });
      const result = delegates.listRemotes({ session_id: '1' }, createRuntimeContext());
      assert.deepStrictEqual(result, []);
    });
  });

  describe('removeRemote', () => {
    it('throws unsupported error', () => {
      const delegates = createMockDelegate({});
      assert.throws(
        () => delegates.removeRemote(
          { session_id: '1', name: 'origin' },
          createRuntimeContext(),
        ),
        (err: Error) => {
          assert.ok(err.message.includes('not support removing remote'));
          return true;
        },
      );
    });
  });

  describe('fetch', () => {
    it('calls sync', () => {
      let called = false;
      const delegates = createMockDelegate({
        sync: () => { called = true; },
      });
      delegates.fetch({ session_id: '1' }, createRuntimeContext());
      assert.strictEqual(called, true);
    });
  });

  describe('push', () => {
    it('calls push without branch', () => {
      let calledWith: string | undefined;
      const delegates = createMockDelegate({
        push: (branch?: string) => { calledWith = branch; },
      });
      delegates.push({ session_id: '1' }, createRuntimeContext());
      assert.strictEqual(calledWith, undefined);
    });

    it('calls push with branch from refspec', () => {
      let calledWith: string | undefined;
      const delegates = createMockDelegate({
        push: (branch?: string) => { calledWith = branch; },
      });
      delegates.push(
        { session_id: '1', refspec: 'main' },
        createRuntimeContext(),
      );
      assert.strictEqual(calledWith, 'main');
    });
  });

  describe('pullFfOnly', () => {
    it('calls sync without revision', () => {
      let calledWith: string | undefined;
      const delegates = createMockDelegate({
        sync: (rev?: string) => { calledWith = rev; },
      });
      delegates.pullFfOnly({ session_id: '1' }, createRuntimeContext());
      assert.strictEqual(calledWith, undefined);
    });

    it('calls sync with branch as revision', () => {
      let calledWith: string | undefined;
      const delegates = createMockDelegate({
        sync: (rev?: string) => { calledWith = rev; },
      });
      delegates.pullFfOnly(
        { session_id: '1', branch: 'main' },
        createRuntimeContext(),
      );
      assert.strictEqual(calledWith, 'main');
    });
  });

  describe('commit', () => {
    it('returns revision after commit', () => {
      const delegates = createMockDelegate({
        commit: () => {},
        status: () => ({
          events: [
            { tagName: 'repositoryStatusRevision', data: { revision: 'abc123' } },
          ],
          raw: '',
        }),
      });
      const result = delegates.commit(
        { session_id: '1', message: 'Test', name: 'User', email: 'test@test.com' },
        createRuntimeContext(),
      );
      assert.strictEqual(result, 'abc123');
    });

    it('returns empty string when no revision in status', () => {
      const delegates = createMockDelegate({
        commit: () => {},
        status: () => ({ events: [], raw: '' }),
      });
      const result = delegates.commit(
        { session_id: '1', message: 'Test', name: 'User', email: 'test@test.com' },
        createRuntimeContext(),
      );
      assert.strictEqual(result, '');
    });
  });

  describe('commitIndex', () => {
    it('delegates to commit', () => {
      const delegates = createMockDelegate({
        commit: () => {},
        status: () => ({
          events: [
            { tagName: 'repositoryStatusRevision', data: { revision: 'def456' } },
          ],
          raw: '',
        }),
      });
      const result = delegates.commitIndex(
        { session_id: '1', message: 'Test', name: 'User', email: 'test@test.com' },
        createRuntimeContext(),
      );
      assert.strictEqual(result, 'def456');
    });
  });

  describe('getStatusSummary', () => {
    it('returns status summary', () => {
      const delegates = createMockDelegate({
        status: () => ({
          events: [
            { tagName: 'repositoryStatusRevision', data: {} },
            { tagName: 'repositoryStatusFile', data: { path: 'test.txt', action: 'Modify', flagDirty: true } },
          ],
          raw: '',
        }),
      });
      const result = delegates.getStatusSummary({ session_id: '1' }, createRuntimeContext());
      assert.strictEqual(result.modified, 1);
    });
  });

  describe('getStatusPayload', () => {
    it('returns status payload', () => {
      const delegates = createMockDelegate({
        status: () => ({
          events: [
            { tagName: 'repositoryStatusRevision', data: {} },
            { tagName: 'repositoryStatusFile', data: { path: 'test.txt', action: 'Add', flagStaged: true } },
          ],
          raw: '',
        }),
      });
      const result = delegates.getStatusPayload({ session_id: '1' }, createRuntimeContext());
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0].path, 'test.txt');
    });
  });

  describe('listCommits', () => {
    it('returns commit entries', () => {
      const delegates = createMockDelegate({
        listCommits: () => ({
          events: [
            { tagName: 'revisionHistoryEntry', data: { revision: 'abc123', parent: [] } },
          ],
          raw: '',
        }),
      });
      const result = delegates.listCommits(
        { session_id: '1', query: { limit: 10 } },
        createRuntimeContext(),
      );
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'abc123');
    });
  });

  describe('diffFile', () => {
    it('returns diff lines', () => {
      const delegates = createMockDelegate({
        diffFile: () => ({
          events: [
            { tagName: 'fileDiffData', data: { line: '+added line' } },
            { tagName: 'fileDiffData', data: { line: '-removed line' } },
          ],
          raw: '',
        }),
      });
      const result = delegates.diffFile(
        { session_id: '1', path: 'test.txt' },
        createRuntimeContext(),
      );
      assert.deepStrictEqual(result.lines, ['+added line', '-removed line']);
      assert.strictEqual(result.binary, false);
    });
  });

  describe('diffCommit', () => {
    it('returns diff lines', () => {
      const delegates = createMockDelegate({
        diffRevision: () => ({
          events: [
            { tagName: 'revisionDiffData', data: { line: '+change' } },
          ],
          raw: '',
        }),
      });
      const result = delegates.diffCommit(
        { session_id: '1', rev: 'abc123' },
        createRuntimeContext(),
      );
      assert.deepStrictEqual(result, ['+change']);
    });
  });

  describe('getConflictDetails', () => {
    it('returns stub conflict details', () => {
      const delegates = createMockDelegate({});
      const result = delegates.getConflictDetails(
        { session_id: '1', path: 'conflict.txt' },
        createRuntimeContext(),
      );
      assert.strictEqual(result.path, 'conflict.txt');
      assert.strictEqual(result.base, null);
      assert.strictEqual(result.ours, null);
      assert.strictEqual(result.theirs, null);
      assert.strictEqual(result.binary, true);
    });
  });

  describe('checkoutConflictSide', () => {
    it('calls mergeResolveMine for ours side', () => {
      let calledWith: string[] = [];
      const delegates = createMockDelegate({
        mergeResolveMine: (paths: string[]) => { calledWith = paths; },
      });
      delegates.checkoutConflictSide(
        { session_id: '1', side: 'ours', path: 'file.txt' },
        createRuntimeContext(),
      );
      assert.deepStrictEqual(calledWith, ['file.txt']);
    });

    it('calls mergeResolveTheirs for theirs side', () => {
      let calledWith: string[] = [];
      const delegates = createMockDelegate({
        mergeResolveTheirs: (paths: string[]) => { calledWith = paths; },
      });
      delegates.checkoutConflictSide(
        { session_id: '1', side: 'theirs', path: 'file.txt' },
        createRuntimeContext(),
      );
      assert.deepStrictEqual(calledWith, ['file.txt']);
    });

    it('throws for invalid side', () => {
      const delegates = createMockDelegate({});
      assert.throws(
        () => delegates.checkoutConflictSide(
          { session_id: '1', side: 'invalid', path: 'file.txt' },
          createRuntimeContext(),
        ),
        (err: Error) => {
          assert.ok(err.message.includes('side must be'));
          return true;
        },
      );
    });
  });

  describe('stagePatch', () => {
    it('throws unsupported error', () => {
      const delegates = createMockDelegate({});
      assert.throws(
        () => delegates.stagePatch(
          { session_id: '1', patch: '' },
          createRuntimeContext(),
        ),
        (err: Error) => {
          assert.ok(err.message.includes('not support patch staging'));
          return true;
        },
      );
    });
  });

  describe('stageSelections', () => {
    it('throws unsupported error', () => {
      const delegates = createMockDelegate({});
      assert.throws(
        () => delegates.stageSelections(
          { session_id: '1', selections: [] },
          createRuntimeContext(),
        ),
        (err: Error) => {
          assert.ok(err.message.includes('not support patch staging'));
          return true;
        },
      );
    });
  });

  describe('stagePaths', () => {
    it('stages paths', () => {
      let calledWith: string[] = [];
      const delegates = createMockDelegate({
        stage: (paths: string[]) => { calledWith = paths; },
      });
      delegates.stagePaths(
        { session_id: '1', paths: ['file.txt'] },
        createRuntimeContext(),
      );
      assert.deepStrictEqual(calledWith, ['file.txt']);
    });

    it('returns null for empty paths', () => {
      const delegates = createMockDelegate({});
      const result = delegates.stagePaths(
        { session_id: '1', paths: [] },
        createRuntimeContext(),
      );
      assert.strictEqual(result, null);
    });
  });

  describe('discardPaths', () => {
    it('resets paths', () => {
      let calledWith: string[] = [];
      const delegates = createMockDelegate({
        fileReset: (paths: string[]) => { calledWith = paths; },
      });
      delegates.discardPaths(
        { session_id: '1', paths: ['file.txt'] },
        createRuntimeContext(),
      );
      assert.deepStrictEqual(calledWith, ['file.txt']);
    });

    it('returns null for empty paths', () => {
      const delegates = createMockDelegate({});
      const result = delegates.discardPaths(
        { session_id: '1', paths: [] },
        createRuntimeContext(),
      );
      assert.strictEqual(result, null);
    });
  });

  describe('applyReversePatch', () => {
    it('throws unsupported error', () => {
      const delegates = createMockDelegate({});
      assert.throws(
        () => delegates.applyReversePatch(
          { session_id: '1', patch: '' },
          createRuntimeContext(),
        ),
        (err: Error) => {
          assert.ok(err.message.includes('not support reverse patch'));
          return true;
        },
      );
    });
  });

  describe('deleteBranch', () => {
    it('deletes branch', () => {
      let calledWith: string = '';
      const delegates = createMockDelegate({
        deleteBranch: (name: string) => { calledWith = name; },
      });
      delegates.deleteBranch(
        { session_id: '1', name: 'feature' },
        createRuntimeContext(),
      );
      assert.strictEqual(calledWith, 'feature');
    });
  });

  describe('renameBranch', () => {
    it('throws unsupported error', () => {
      const delegates = createMockDelegate({});
      assert.throws(
        () => delegates.renameBranch(
          { session_id: '1', old: 'old', new: 'new' },
          createRuntimeContext(),
        ),
        (err: Error) => {
          assert.ok(err.message.includes('not support branch renaming'));
          return true;
        },
      );
    });
  });

  describe('mergeIntoCurrent', () => {
    it('starts merge', () => {
      let calledWith: { branch: string; message?: string } = { branch: '' };
      const delegates = createMockDelegate({
        mergeStart: (branch: string, message?: string) => { calledWith = { branch, message }; },
      });
      delegates.mergeIntoCurrent(
        { session_id: '1', name: 'feature' },
        createRuntimeContext(),
      );
      assert.strictEqual(calledWith.branch, 'feature');
    });

    it('passes message when provided', () => {
      let calledWith: { branch: string; message?: string } = { branch: '' };
      const delegates = createMockDelegate({
        mergeStart: (branch: string, message?: string) => { calledWith = { branch, message }; },
      });
      delegates.mergeIntoCurrent(
        { session_id: '1', name: 'feature', message: 'Merge message' },
        createRuntimeContext(),
      );
      assert.strictEqual(calledWith.message, 'Merge message');
    });
  });

  describe('mergeAbort', () => {
    it('aborts merge', () => {
      let called = false;
      const delegates = createMockDelegate({
        mergeAbort: () => { called = true; },
      });
      delegates.mergeAbort({ session_id: '1' }, createRuntimeContext());
      assert.strictEqual(called, true);
    });
  });

  describe('mergeContinue', () => {
    it('continues merge', () => {
      let called = false;
      const delegates = createMockDelegate({
        mergeResolve: () => { called = true; },
      });
      delegates.mergeContinue({ session_id: '1' }, createRuntimeContext());
      assert.strictEqual(called, true);
    });
  });

  describe('isMergeInProgress', () => {
    it('returns true when conflicts exist', () => {
      const delegates = createMockDelegate({
        status: () => ({
          events: [
            { tagName: 'repositoryStatusFile', data: { path: 'conflict.txt', action: 'Modify', flagConflict: true, flagConflictUnresolved: true } },
          ],
          raw: '',
        }),
      });
      const result = delegates.isMergeInProgress({ session_id: '1' }, createRuntimeContext());
      assert.strictEqual(result, true);
    });

    it('returns false when no conflicts', () => {
      const delegates = createMockDelegate({
        status: () => ({
          events: [
            { tagName: 'repositoryStatusRevision', data: {} },
          ],
          raw: '',
        }),
      });
      const result = delegates.isMergeInProgress({ session_id: '1' }, createRuntimeContext());
      assert.strictEqual(result, false);
    });
  });

  describe('setBranchUpstream', () => {
    it('returns null (Lore handles upstream implicitly)', () => {
      const delegates = createMockDelegate({});
      const result = delegates.setBranchUpstream(
        { session_id: '1', branch: 'main', upstream: 'origin/main' },
        createRuntimeContext(),
      );
      assert.strictEqual(result, null);
    });
  });

  describe('getBranchUpstream', () => {
    it('returns remote URL', () => {
      const delegates = createMockDelegate({
        getRemoteUrl: () => 'https://example.com/repo',
      });
      const result = delegates.getBranchUpstream(
        { session_id: '1', branch: 'main' },
        createRuntimeContext(),
      );
      assert.strictEqual(result, 'https://example.com/repo');
    });

    it('returns null when no remote URL', () => {
      const delegates = createMockDelegate({
        getRemoteUrl: () => null,
      });
      const result = delegates.getBranchUpstream(
        { session_id: '1', branch: 'main' },
        createRuntimeContext(),
      );
      assert.strictEqual(result, null);
    });
  });

  describe('hardResetHead', () => {
    it('resets files', () => {
      let called = false;
      const delegates = createMockDelegate({
        fileReset: () => { called = true; },
      });
      delegates.hardResetHead({ session_id: '1' }, createRuntimeContext());
      assert.strictEqual(called, true);
    });
  });

  describe('resetSoftTo', () => {
    it('resets to revision', () => {
      let capturedArgs: string[] = [];
      const delegates = createMockDelegate({
        runChecked: (args: string[]) => {
          capturedArgs = args;
          return { status: 0, stdout: '', stderr: '' };
        },
      });
      delegates.resetSoftTo(
        { session_id: '1', rev: 'abc123' },
        createRuntimeContext(),
      );
      assert.ok(capturedArgs.includes('abc123'));
    });
  });

  describe('getIdentity', () => {
    it('returns identity', () => {
      const delegates = createMockDelegate({
        getIdentity: () => ({ name: 'User', email: 'test@test.com' }),
      });
      const result = delegates.getIdentity({ session_id: '1' }, createRuntimeContext());
      assert.deepStrictEqual(result, { name: 'User', email: 'test@test.com' });
    });

    it('returns null when no identity', () => {
      const delegates = createMockDelegate({
        getIdentity: () => null,
      });
      const result = delegates.getIdentity({ session_id: '1' }, createRuntimeContext());
      assert.strictEqual(result, null);
    });
  });

  describe('setIdentityLocal', () => {
    it('sets identity', () => {
      let calledWith: { name: string; email: string } = { name: '', email: '' };
      const delegates = createMockDelegate({
        setIdentityLocal: (name: string, email: string) => { calledWith = { name, email }; },
      });
      delegates.setIdentityLocal(
        { session_id: '1', name: 'User', email: 'test@test.com' },
        createRuntimeContext(),
      );
      assert.deepStrictEqual(calledWith, { name: 'User', email: 'test@test.com' });
    });
  });

  describe('stash operations', () => {
    it('listStashes throws unsupported', () => {
      const delegates = createMockDelegate({});
      assert.throws(
        () => delegates.listStashes({ session_id: '1' }, createRuntimeContext()),
        (err: Error) => {
          assert.ok(err.message.includes('not support stashing'));
          return true;
        },
      );
    });

    it('stashPush throws unsupported', () => {
      const delegates = createMockDelegate({});
      assert.throws(
        () => delegates.stashPush({ session_id: '1' }, createRuntimeContext()),
        (err: Error) => {
          assert.ok(err.message.includes('not support stashing'));
          return true;
        },
      );
    });

    it('stashApply throws unsupported', () => {
      const delegates = createMockDelegate({});
      assert.throws(
        () => delegates.stashApply({ session_id: '1', selector: 'stash@{0}' }, createRuntimeContext()),
        (err: Error) => {
          assert.ok(err.message.includes('not support stashing'));
          return true;
        },
      );
    });

    it('stashPop throws unsupported', () => {
      const delegates = createMockDelegate({});
      assert.throws(
        () => delegates.stashPop({ session_id: '1', selector: 'stash@{0}' }, createRuntimeContext()),
        (err: Error) => {
          assert.ok(err.message.includes('not support stashing'));
          return true;
        },
      );
    });

    it('stashDrop throws unsupported', () => {
      const delegates = createMockDelegate({});
      assert.throws(
        () => delegates.stashDrop({ session_id: '1', selector: 'stash@{0}' }, createRuntimeContext()),
        (err: Error) => {
          assert.ok(err.message.includes('not support stashing'));
          return true;
        },
      );
    });

    it('stashShow throws unsupported', () => {
      const delegates = createMockDelegate({});
      assert.throws(
        () => delegates.stashShow({ session_id: '1', selector: 'stash@{0}' }, createRuntimeContext()),
        (err: Error) => {
          assert.ok(err.message.includes('not support stashing'));
          return true;
        },
      );
    });
  });

  describe('cherryPick', () => {
    it('cherry-picks commit', () => {
      let calledWith: string = '';
      const delegates = createMockDelegate({
        cherryPick: (rev: string) => { calledWith = rev; },
      });
      delegates.cherryPick(
        { session_id: '1', commit: 'abc123' },
        createRuntimeContext(),
      );
      assert.strictEqual(calledWith, 'abc123');
    });
  });

  describe('revertCommit', () => {
    it('reverts commit', () => {
      let calledWith: string = '';
      const delegates = createMockDelegate({
        revertCommit: (rev: string) => { calledWith = rev; },
      });
      delegates.revertCommit(
        { session_id: '1', commit: 'abc123' },
        createRuntimeContext(),
      );
      assert.strictEqual(calledWith, 'abc123');
    });
  });
});
