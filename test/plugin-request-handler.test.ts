// Copyright © 2025-2026 OpenVCS Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
/// <reference types="node" />

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PluginRuntimeContext } from '@openvcs/sdk/runtime';
import { LoreVcsDelegates } from '../src/plugin-request-handler.js';

function createRuntimeContext(): PluginRuntimeContext {
  return {
    host: {} as PluginRuntimeContext['host'],
    requestId: '1',
    method: 'vcs.get_caps',
  };
}

function createMockLore() {
  return {
    version: async () => '@lore-vcs/sdk v0.8.3',
    status: async () => [],
    stage: async () => {},
    unstage: async () => {},
    commit: async () => {},
    amend: async () => {},
    listBranches: async () => [],
    createBranch: async () => {},
    switchBranch: async () => {},
    deleteBranch: async () => {},
    push: async () => {},
    sync: async () => {},
    clone: async () => {},
    listCommits: async () => [],
    diffFile: async () => [],
    diffRevision: async () => [],
    mergeStart: async () => {},
    mergeAbort: async () => {},
    mergeResolve: async () => {},
    mergeResolveMine: async () => {},
    mergeResolveTheirs: async () => {},
    fileReset: async () => {},
  };
}

function createMockDelegate(mockLore: ReturnType<typeof createMockLore>) {
  return new LoreVcsDelegates({
    allocateSession: () => 'session-1',
    closeSession: () => {},
    requireSession: () => ({ path: '/tmp/mock-repo' }),
    createLoreCommand: () => mockLore as any,
  });
}

describe('LoreVcsDelegates', () => {
  describe('getCaps', () => {
    it('returns Lore capabilities', () => {
      const d = createMockDelegate(createMockLore());
      const caps = d.getCaps({}, createRuntimeContext());
      assert.ok(caps.commits);
      assert.ok(caps.branches);
      assert.ok(caps.staging);
      assert.ok(caps.push_pull);
      assert.ok(caps.fast_forward);
      assert.strictEqual(caps.tags, false);
    });
  });

  describe('open', () => {
    it('opens a valid repository', () => {
      const d = createMockDelegate(createMockLore());
      const result = d.open({ path: '/tmp/repo' }, createRuntimeContext());
      assert.ok(result.session_id);
    });

    it('throws when path is empty', () => {
      const d = createMockDelegate(createMockLore());
      assert.throws(() => d.open({ path: '' }, createRuntimeContext()));
    });
  });

  describe('close', () => {
    it('closes session', () => {
      const d = createMockDelegate(createMockLore());
      assert.strictEqual(d.close({ session_id: 'session-1' }, createRuntimeContext()), null);
    });
  });

  describe('getWorkdir', () => {
    it('returns session path', () => {
      const d = createMockDelegate(createMockLore());
      assert.strictEqual(d.getWorkdir({ session_id: 'session-1' }, createRuntimeContext()), '/tmp/mock-repo');
    });
  });

  describe('getCurrentBranch', () => {
    it('returns branch name from status', () => {
      const d = createMockDelegate(createMockLore());
      const branch = d.getCurrentBranch({ session_id: 'session-1' }, createRuntimeContext());
      assert.strictEqual(branch, null);
    });
  });

  describe('listBranches', () => {
    it('returns branch entries', () => {
      const d = createMockDelegate(createMockLore());
      const branches = d.listBranches({ session_id: 'session-1' }, createRuntimeContext());
      assert.ok(Array.isArray(branches));
    });
  });

  describe('listLocalBranches', () => {
    it('returns branch names', () => {
      const d = createMockDelegate(createMockLore());
      const branches = d.listLocalBranches({ session_id: 'session-1' }, createRuntimeContext());
      assert.ok(Array.isArray(branches));
    });
  });

  describe('createBranch', () => {
    it('creates branch', () => {
      const d = createMockDelegate(createMockLore());
      assert.strictEqual(d.createBranch({ session_id: 'session-1', name: 'test' }, createRuntimeContext()), null);
    });
  });

  describe('checkoutBranch', () => {
    it('switches branch', () => {
      const d = createMockDelegate(createMockLore());
      assert.strictEqual(d.checkoutBranch({ session_id: 'session-1', name: 'main' }, createRuntimeContext()), null);
    });
  });

  describe('ensureRemote', () => {
    it('throws when URL differs', () => {
      const d = createMockDelegate(createMockLore());
      assert.throws(() => d.ensureRemote({ session_id: 'session-1', name: 'origin', url: 'lore://diff' }, createRuntimeContext()));
    });
  });

  describe('listRemotes', () => {
    it('returns empty when no remote URL', () => {
      const d = createMockDelegate(createMockLore());
      const remotes = d.listRemotes({ session_id: 'session-1' }, createRuntimeContext());
      assert.ok(Array.isArray(remotes));
    });
  });

  describe('removeRemote', () => {
    it('throws unsupported error', () => {
      const d = createMockDelegate(createMockLore());
      assert.throws(() => d.removeRemote({ session_id: 'session-1', name: 'origin' }, createRuntimeContext()));
    });
  });

  describe('fetch', () => {
    it('completes', () => {
      const d = createMockDelegate(createMockLore());
      assert.strictEqual(d.fetch({ session_id: 'session-1' }, createRuntimeContext()), null);
    });
  });

  describe('push', () => {
    it('completes', () => {
      const d = createMockDelegate(createMockLore());
      assert.strictEqual(d.push({ session_id: 'session-1' }, createRuntimeContext()), null);
    });
  });

  describe('pullFfOnly', () => {
    it('completes', () => {
      const d = createMockDelegate(createMockLore());
      assert.strictEqual(d.pullFfOnly({ session_id: 'session-1', remote: 'origin' }, createRuntimeContext()), null);
    });
  });

  describe('commit', () => {
    it('returns revision after commit', () => {
      const d = createMockDelegate(createMockLore());
      assert.strictEqual(d.commit({ session_id: 'session-1', name: 'Test', email: 'test@test.com', message: 'test' }, createRuntimeContext()), '');
    });
  });

  describe('commitIndex', () => {
    it('delegates to commit', () => {
      const d = createMockDelegate(createMockLore());
      assert.strictEqual(d.commitIndex({ session_id: 'session-1', name: 'Test', email: 'test@test.com', message: 'test' }, createRuntimeContext()), '');
    });
  });

  describe('getStatusSummary', () => {
    it('returns status summary', () => {
      const d = createMockDelegate(createMockLore());
      const summary = d.getStatusSummary({ session_id: 'session-1' }, createRuntimeContext());
      assert.ok(summary);
    });
  });

  describe('getStatusPayload', () => {
    it('returns status payload', () => {
      const d = createMockDelegate(createMockLore());
      const payload = d.getStatusPayload({ session_id: 'session-1' }, createRuntimeContext());
      assert.ok(payload);
    });
  });

  describe('listCommits', () => {
    it('returns commit entries', () => {
      const d = createMockDelegate(createMockLore());
      const commits = d.listCommits({ session_id: 'session-1', query: { limit: 10 } }, createRuntimeContext());
      assert.ok(Array.isArray(commits));
    });
  });

  describe('diffFile', () => {
    it('returns diff lines', () => {
      const d = createMockDelegate(createMockLore());
      const diff = d.diffFile({ session_id: 'session-1', path: 'file.txt' }, createRuntimeContext());
      assert.ok(diff);
    });
  });

  describe('diffCommit', () => {
    it('returns diff lines', () => {
      const d = createMockDelegate(createMockLore());
      const diff = d.diffCommit({ session_id: 'session-1', rev: 'abc' }, createRuntimeContext());
      assert.ok(Array.isArray(diff));
    });
  });

  describe('mergeIntoCurrent', () => {
    it('starts merge', () => {
      const d = createMockDelegate(createMockLore());
      assert.strictEqual(d.mergeIntoCurrent({ session_id: 'session-1', name: 'feature' }, createRuntimeContext()), null);
    });
  });

  describe('mergeAbort', () => {
    it('aborts merge', () => {
      const d = createMockDelegate(createMockLore());
      assert.strictEqual(d.mergeAbort({ session_id: 'session-1' }, createRuntimeContext()), null);
    });
  });

  describe('mergeContinue', () => {
    it('continues merge', () => {
      const d = createMockDelegate(createMockLore());
      assert.strictEqual(d.mergeContinue({ session_id: 'session-1' }, createRuntimeContext()), null);
    });
  });

  describe('stagePaths', () => {
    it('stages paths', () => {
      const d = createMockDelegate(createMockLore());
      assert.strictEqual(d.stagePaths({ session_id: 'session-1', paths: ['file.txt'] }, createRuntimeContext()), null);
    });
  });

  describe('discardPaths', () => {
    it('resets paths', () => {
      const d = createMockDelegate(createMockLore());
      assert.strictEqual(d.discardPaths({ session_id: 'session-1', paths: ['file.txt'] }, createRuntimeContext()), null);
    });
  });

  describe('stub methods', () => {
    const stubMethods = [
      'listStashes', 'stashPush', 'stashApply', 'stashPop', 'stashDrop', 'stashShow',
      'renameBranch', 'stagePatch', 'stageSelections', 'applyReversePatch',
    ] as const;

    for (const method of stubMethods) {
      it(`${method} throws unsupported`, () => {
        const d = createMockDelegate(createMockLore());
        assert.throws(() => (d as any)[method]({ session_id: 'session-1' }, createRuntimeContext()));
      });
    }
  });
});
