// Copyright © 2025-2026 OpenVCS Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PluginRuntimeContext } from '@openvcs/sdk/runtime';
import { LoreVcsDelegates } from '../src/plugin-request-handler.js';

function ctx(): PluginRuntimeContext {
  return { host: {} as any, requestId: '1', method: 'vcs.get_caps' };
}

function mockLore() {
  return {
    version: async () => '@lore-vcs/sdk v0.8.3', status: async () => [], stage: async () => {},
    unstage: async () => {}, commit: async () => {}, amend: async () => {},
    listBranches: async () => [], createBranch: async () => {}, switchBranch: async () => {},
    deleteBranch: async () => {}, push: async () => {}, sync: async () => {},
    clone: async () => {}, listCommits: async () => [], diffFile: async () => [],
    diffRevision: async () => [], mergeStart: async () => {}, mergeAbort: async () => {},
    mergeResolve: async () => {}, mergeResolveMine: async () => {}, mergeResolveTheirs: async () => {},
    fileReset: async () => {}, getRemoteUrl: async () => null, getIdentity: () => null,
    setIdentityLocal: () => {}, getConfig: async () => null, cherryPick: async () => {},
    revertCommit: async () => {},
  };
}

function deleg(m: ReturnType<typeof mockLore>) {
  return new LoreVcsDelegates({
    allocateSession: () => 's1', closeSession: () => {},
    requireSession: () => ({ path: '/r' }), createLoreCommand: () => m as any,
  });
}

describe('LoreVcsDelegates', () => {
  it('getCaps', async () => {
    const c = await deleg(mockLore()).getCaps({}, ctx());
    assert.ok(c.commits); assert.strictEqual(c.tags, false);
  });
  it('open', async () => {
    assert.ok((await deleg(mockLore()).open({ path: '/r' }, ctx())).session_id);
    await assert.rejects(deleg(mockLore()).open({ path: '' }, ctx()));
  });
  it('close', async () => { assert.strictEqual(await deleg(mockLore()).close({ session_id: 's1' }, ctx()), null); });
  it('getWorkdir', async () => { assert.strictEqual(await deleg(mockLore()).getWorkdir({ session_id: 's1' }, ctx()), '/r'); });
  it('getCurrentBranch', async () => { assert.strictEqual(await deleg(mockLore()).getCurrentBranch({ session_id: 's1' }, ctx()), null); });
  it('listBranches', async () => { assert.ok(Array.isArray(await deleg(mockLore()).listBranches({ session_id: 's1' }, ctx()))); });
  it('listLocalBranches', async () => { assert.ok(Array.isArray(await deleg(mockLore()).listLocalBranches({ session_id: 's1' }, ctx()))); });
  it('createBranch', async () => { assert.strictEqual(await deleg(mockLore()).createBranch({ session_id: 's1', name: 'x' }, ctx()), null); });
  it('checkoutBranch', async () => { assert.strictEqual(await deleg(mockLore()).checkoutBranch({ session_id: 's1', name: 'main' }, ctx()), null); });
  it('ensureRemote rejects', async () => { await assert.rejects(async () => deleg(mockLore()).ensureRemote({ session_id: 's1', name: 'o', url: 'x' }, ctx())); });
  it('listRemotes', async () => { assert.ok(Array.isArray(await deleg(mockLore()).listRemotes({ session_id: 's1' }, ctx()))); });
  it('removeRemote rejects', async () => { await assert.rejects(async () => deleg(mockLore()).removeRemote({ session_id: 's1', name: 'o' }, ctx())); });
  it('fetch', async () => { assert.strictEqual(await deleg(mockLore()).fetch({ session_id: 's1' }, ctx()), null); });
  it('push', async () => { assert.strictEqual(await deleg(mockLore()).push({ session_id: 's1' }, ctx()), null); });
  it('pullFfOnly', async () => { assert.strictEqual(await deleg(mockLore()).pullFfOnly({ session_id: 's1' }, ctx()), null); });
  it('commit', async () => { assert.strictEqual(await deleg(mockLore()).commit({ session_id: 's1', name: 'T', email: 't@t', message: 'm' }, ctx()), ''); });
  it('commitIndex', async () => { assert.strictEqual(await deleg(mockLore()).commitIndex({ session_id: 's1', name: 'T', email: 't@t', message: 'm' }, ctx()), ''); });
  it('getStatusSummary', async () => { assert.ok(await deleg(mockLore()).getStatusSummary({ session_id: 's1' }, ctx())); });
  it('getStatusPayload', async () => { assert.ok(await deleg(mockLore()).getStatusPayload({ session_id: 's1' }, ctx())); });
  it('listCommits', async () => { assert.ok(Array.isArray(await deleg(mockLore()).listCommits({ session_id: 's1', query: { limit: 10 } }, ctx()))); });
  it('diffFile', async () => { assert.ok(await deleg(mockLore()).diffFile({ session_id: 's1', path: 'f' }, ctx())); });
  it('diffCommit', async () => { assert.ok(Array.isArray(await deleg(mockLore()).diffCommit({ session_id: 's1', rev: 'a' }, ctx()))); });
  it('mergeIntoCurrent', async () => { assert.strictEqual(await deleg(mockLore()).mergeIntoCurrent({ session_id: 's1', name: 'f' }, ctx()), null); });
  it('mergeAbort', async () => { assert.strictEqual(await deleg(mockLore()).mergeAbort({ session_id: 's1' }, ctx()), null); });
  it('mergeContinue', async () => { assert.strictEqual(await deleg(mockLore()).mergeContinue({ session_id: 's1' }, ctx()), null); });
  it('stagePaths', async () => { assert.strictEqual(await deleg(mockLore()).stagePaths({ session_id: 's1', paths: ['f'] }, ctx()), null); });
  it('discardPaths', async () => { assert.strictEqual(await deleg(mockLore()).discardPaths({ session_id: 's1', paths: ['f'] }, ctx()), null); });

  const stubs = ['listStashes', 'stashPush', 'stashApply', 'stashPop', 'stashDrop', 'stashShow',
    'renameBranch', 'stagePatch', 'applyReversePatch'];
  for (const m of stubs) {
    it(`${m} throws`, async () => { await assert.rejects(async () => (deleg(mockLore()) as any)[m]({ session_id: 's1' }, ctx())); });
  }
  it('stageSelections falls back to staging whole files', async () => {
    let stagedPaths: string[] = [];
    const mock = mockLore();
    mock.stage = async (paths: string[]) => { stagedPaths = paths; };
    const d = deleg(mock);
    await d.stageSelections({ session_id: 's1', selections: [{ path: 'a.txt', whole_hunks: [0], partial_hunks: {} }, { path: 'b.txt', whole_hunks: [], partial_hunks: { 0: [1, 2] } }] } as any, ctx());
    assert.deepStrictEqual(stagedPaths, ['a.txt', 'b.txt']);
  });
  describe('validateUrl', () => {
    it('accepts http URL', () => {
      const result = deleg(mockLore()).validateUrl({ url: 'http://lore.example.com/repo' }, ctx());
      assert.strictEqual(result.ok, true);
    });

    it('accepts https URL', () => {
      const result = deleg(mockLore()).validateUrl({ url: 'https://lore.example.com/repo' }, ctx());
      assert.strictEqual(result.ok, true);
    });

    it('rejects empty URL', () => {
      const result = deleg(mockLore()).validateUrl({ url: '' }, ctx());
      assert.strictEqual(result.ok, false);
      assert.ok(result.reason);
    });

    it('rejects non-http URL', () => {
      const result = deleg(mockLore()).validateUrl({ url: 'ssh://git@example.com/repo' }, ctx());
      assert.strictEqual(result.ok, false);
      assert.ok(result.reason);
    });
  });

  describe('validatePath', () => {
    it('rejects empty path', () => {
      const result = deleg(mockLore()).validatePath({ path: '' }, ctx());
      assert.strictEqual(result.ok, false);
      assert.ok(result.reason);
    });

    it('rejects non-existent path', () => {
      const result = deleg(mockLore()).validatePath({ path: '/nonexistent/path' }, ctx());
      assert.strictEqual(result.ok, false);
      assert.ok(result.reason);
    });
  });
});
