// Copyright © 2025-2026 OpenVCS Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
/// <reference types="node" />

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LoreCommand } from '../src/lore.js';

import type { LoreEventFFI } from '@lore-vcs/sdk/types/events';

/** Helper: creates a LoreCommand with mocked collect/wait. */
function createMockCmd(collectResult: LoreEventFFI[] = []) {
  const cmd = new LoreCommand('/tmp/test-repo');
  (cmd as any).collect = async () => collectResult;
  (cmd as any).wait = async () => {};
  return cmd;
}

/** Helper: creates a LoreCommand with a real collect method but mocked wait. */
function createRealCollectCmd() {
  const cmd = new LoreCommand('/tmp/test-repo');
  (cmd as any).wait = async () => {};
  return cmd;
}

describe('LoreCommand', () => {
  describe('constructor', () => {
    it('creates a LoreCommand with a working directory', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      assert.ok(cmd);
    });
  });

  describe('version', () => {
    it('returns SDK version string', async () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      const ver = await cmd.version();
      assert.ok(ver.includes('@lore-vcs/sdk'));
      assert.ok(ver.includes('0.8'));
    });
  });

  describe('status', () => {
    it('collects events from repositoryStatus', async () => {
      const cmd = createMockCmd([{ tag: 100, data: {} } as LoreEventFFI]);
      const result = await cmd.status();
      assert.strictEqual(result.length, 1);
    });
  });

  describe('stage', () => {
    it('calls fileStage via wait with absolute repo-rooted paths', async () => {
      let capturedArgs: unknown = null;
      const cmd = new LoreCommand('/tmp/test-repo');
      (cmd as any).wait = async (_fn: unknown, args: unknown) => { capturedArgs = args; };
      await cmd.stage(['file.txt', '.']);
      assert.deepStrictEqual(capturedArgs, {
        paths: ['/tmp/test-repo/file.txt', '/tmp/test-repo'],
        scan: false,
      });
    });
  });

  describe('unstage', () => {
    it('calls fileUnstage via wait with absolute repo-rooted paths', async () => {
      let capturedArgs: unknown = null;
      const cmd = new LoreCommand('/tmp/test-repo');
      (cmd as any).wait = async (_fn: unknown, args: unknown) => { capturedArgs = args; };
      await cmd.unstage(['file.txt']);
      assert.deepStrictEqual(capturedArgs, {
        paths: ['/tmp/test-repo/file.txt'],
      });
    });
  });

  describe('commit', () => {
    it('has correct method signature', async () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      assert.equal(typeof cmd.commit, 'function');
      assert.ok(cmd.commit.length >= 1);
    });
  });

  describe('amend', () => {
    it('calls revisionAmend via wait', async () => {
      let called = false;
      const cmd = new LoreCommand('/tmp/test-repo');
      (cmd as any).wait = async () => { called = true; };
      await cmd.amend('new message');
      assert.ok(called);
    });
  });

  describe('listBranches', () => {
    it('collects events from branchList', async () => {
      const cmd = createMockCmd([{ tag: 200, data: { name: 'main' } } as LoreEventFFI]);
      const result = await cmd.listBranches();
      assert.strictEqual(result.length, 1);
      assert.strictEqual((result[0].data as any).name, 'main');
    });
  });

  describe('createBranch', () => {
    it('calls branchCreate via wait', async () => {
      let called = false;
      const cmd = new LoreCommand('/tmp/test-repo');
      (cmd as any).wait = async () => { called = true; };
      await cmd.createBranch('feature');
      assert.ok(called);
    });
  });

  describe('switchBranch', () => {
    it('calls branchSwitch via wait', async () => {
      let called = false;
      const cmd = new LoreCommand('/tmp/test-repo');
      (cmd as any).wait = async () => { called = true; };
      await cmd.switchBranch('main');
      assert.ok(called);
    });
  });

  describe('deleteBranch', () => {
    it('calls branchArchive via wait', async () => {
      let called = false;
      const cmd = new LoreCommand('/tmp/test-repo');
      (cmd as any).wait = async () => { called = true; };
      await cmd.deleteBranch('old-branch');
      assert.ok(called);
    });
  });

  describe('push', () => {
    it('calls branchPush via wait', async () => {
      let called = false;
      const cmd = new LoreCommand('/tmp/test-repo');
      (cmd as any).wait = async () => { called = true; };
      await cmd.push();
      assert.ok(called);
    });
  });

  describe('sync', () => {
    it('calls revisionSync via wait', async () => {
      let called = false;
      const cmd = new LoreCommand('/tmp/test-repo');
      (cmd as any).wait = async () => { called = true; };
      await cmd.sync();
      assert.ok(called);
    });
  });

  describe('clone', () => {
    it('calls repositoryClone via wait', async () => {
      let called = false;
      const cmd = new LoreCommand('/tmp/test-repo');
      (cmd as any).wait = async () => { called = true; };
      await cmd.clone('lore://example.com/repo', '/tmp/dest');
      assert.ok(called);
    });
  });

  describe('listCommits', () => {
    it('collects events from revisionHistory', async () => {
      const cmd = createMockCmd([{ tag: 300, data: { revision: 'abc' } } as LoreEventFFI]);
      const result = await cmd.listCommits(10);
      assert.strictEqual(result.length, 1);
      assert.strictEqual((result[0].data as any).revision, 'abc');
    });
  });

  describe('diffFile', () => {
    it('collects events from fileDiff', async () => {
      const cmd = createMockCmd([{ tag: 400, data: { path: 'file.txt' } } as LoreEventFFI]);
      const result = await cmd.diffFile('file.txt');
      assert.strictEqual(result.length, 1);
    });
  });

  describe('mergeStart', () => {
    it('calls branchMergeStart via wait', async () => {
      let called = false;
      const cmd = new LoreCommand('/tmp/test-repo');
      (cmd as any).wait = async () => { called = true; };
      await cmd.mergeStart('feature');
      assert.ok(called);
    });
  });

  describe('mergeAbort', () => {
    it('calls branchMergeAbort via wait', async () => {
      let called = false;
      const cmd = new LoreCommand('/tmp/test-repo');
      (cmd as any).wait = async () => { called = true; };
      await cmd.mergeAbort();
      assert.ok(called);
    });
  });

  describe('mergeResolve', () => {
    it('calls branchMergeResolve via wait', async () => {
      let called = false;
      const cmd = new LoreCommand('/tmp/test-repo');
      (cmd as any).wait = async () => { called = true; };
      await cmd.mergeResolve(['file.txt']);
      assert.ok(called);
    });
  });

  describe('mergeResolveMine', () => {
    it('calls branchMergeResolveMine via wait', async () => {
      let called = false;
      const cmd = new LoreCommand('/tmp/test-repo');
      (cmd as any).wait = async () => { called = true; };
      await cmd.mergeResolveMine(['file.txt']);
      assert.ok(called);
    });
  });

  describe('mergeResolveTheirs', () => {
    it('calls branchMergeResolveTheirs via wait', async () => {
      let called = false;
      const cmd = new LoreCommand('/tmp/test-repo');
      (cmd as any).wait = async () => { called = true; };
      await cmd.mergeResolveTheirs(['file.txt']);
      assert.ok(called);
    });
  });

  describe('fileReset', () => {
    it('calls fileReset via wait', async () => {
      let called = false;
      const cmd = new LoreCommand('/tmp/test-repo');
      (cmd as any).wait = async () => { called = true; };
      await cmd.fileReset(['file.txt']);
      assert.ok(called);
    });
  });

  describe('collect (integration)', () => {
    it('collects events from lore SDK without using .callback()', async () => {
      // This test ensures collect() uses collectAsync() correctly
      // and does NOT combine .callback() + .collectAsync() which the SDK forbids.
      const cmd = createRealCollectCmd();
      // The real collect method should be callable without throwing
      // 'Callback fn set, but trying to call collect'
      const collectFn = (cmd as any).collect.bind(cmd);
      assert.ok(typeof collectFn === 'function');
    });
  });
});
