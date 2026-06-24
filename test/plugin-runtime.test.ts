// Copyright © 2025-2026 OpenVCS Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
/// <reference types="node" />

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  allocateSession,
  clearMergeState,
  closeSession,
  getMergeState,
  getStatusCache,
  invalidateStatusCache,
  isStatusCacheFresh,
  requireLoreCommand,
  requireSession,
  resetSessions,
  setMergeState,
  setStatusCache,
} from '../src/plugin-runtime.js';

describe('plugin runtime session management', () => {
  beforeEach(() => {
    resetSessions();
  });

  it('allocates sequential session ids starting from 1', () => {
    const id1 = allocateSession({ path: '/repo1' });
    const id2 = allocateSession({ path: '/repo2' });
    const id3 = allocateSession({ path: '/repo3' });

    assert.strictEqual(id1, '1');
    assert.strictEqual(id2, '2');
    assert.strictEqual(id3, '3');
  });

  it('requires an existing session and returns it', () => {
    allocateSession({ path: '/my-repo' });
    const session = requireSession('1');
    assert.deepStrictEqual(session, { path: '/my-repo' });
  });

  it('throws vcs-invalid-session when requiring a missing session', () => {
    assert.throws(
      () => requireSession('nonexistent'),
      (err: Error) => {
        assert.match(err.message, /unknown session/);
        return true;
      },
    );
  });

  it('closes an existing session', () => {
    allocateSession({ path: '/repo' });
    closeSession('1');
    assert.throws(
      () => requireSession('1'),
      (err: Error) => {
        assert.match(err.message, /unknown session/);
        return true;
      },
    );
  });

  it('throws when closing a missing session', () => {
    assert.throws(
      () => closeSession('missing'),
      (err: Error) => {
        assert.match(err.message, /session.*not found/);
        return true;
      },
    );
  });

  it('handles closeSession with non-string session id', () => {
    allocateSession({ path: '/repo' });
    closeSession(1);
    assert.throws(
      () => requireSession('1'),
      (err: Error) => {
        assert.match(err.message, /unknown session/);
        return true;
      },
    );
  });

  it('resets sessions completely', () => {
    allocateSession({ path: '/repo' });
    resetSessions();
    assert.throws(
      () => requireSession('1'),
      (err: Error) => {
        assert.match(err.message, /unknown session/);
        return true;
      },
    );

    // After reset, new sessions start at 1 again
    const id = allocateSession({ path: '/new-repo' });
    assert.strictEqual(id, '1');
  });

  it('creates LoreCommand from session', () => {
    allocateSession({ path: '/my-repo' });
    const cmd = requireLoreCommand('1');
    assert.ok(cmd);
    assert.ok(typeof cmd.run === 'function');
  });
});

describe('plugin runtime status cache', () => {
  beforeEach(() => {
    resetSessions();
  });

  it('returns undefined for missing cache', () => {
    const cache = getStatusCache('nonexistent');
    assert.strictEqual(cache, undefined);
  });

  it('stores and retrieves status cache', () => {
    allocateSession({ path: '/repo' });
    const cache = {
      lastScan: Date.now(),
      summary: { untracked: 0, modified: 1, staged: 0, conflicted: 0 },
      payload: { files: [], ahead: 0, behind: 0, branch_on_remote: false },
    };
    setStatusCache('1', cache);
    const retrieved = getStatusCache('1');
    assert.deepStrictEqual(retrieved, cache);
  });

  it('invalidates status cache', () => {
    allocateSession({ path: '/repo' });
    const cache = {
      lastScan: Date.now(),
      summary: { untracked: 0, modified: 0, staged: 0, conflicted: 0 },
      payload: { files: [], ahead: 0, behind: 0, branch_on_remote: false },
    };
    setStatusCache('1', cache);
    invalidateStatusCache('1');
    assert.strictEqual(getStatusCache('1'), undefined);
  });

  it('reports cache as fresh when less than 10 seconds old', () => {
    allocateSession({ path: '/repo' });
    const cache = {
      lastScan: Date.now(),
      summary: { untracked: 0, modified: 0, staged: 0, conflicted: 0 },
      payload: { files: [], ahead: 0, behind: 0, branch_on_remote: false },
    };
    setStatusCache('1', cache);
    assert.strictEqual(isStatusCacheFresh('1'), true);
  });

  it('reports cache as stale when more than 10 seconds old', () => {
    allocateSession({ path: '/repo' });
    const cache = {
      lastScan: Date.now() - 15_000,
      summary: { untracked: 0, modified: 0, staged: 0, conflicted: 0 },
      payload: { files: [], ahead: 0, behind: 0, branch_on_remote: false },
    };
    setStatusCache('1', cache);
    assert.strictEqual(isStatusCacheFresh('1'), false);
  });

  it('reports cache as not fresh when missing', () => {
    assert.strictEqual(isStatusCacheFresh('nonexistent'), false);
  });

  it('clears cache on session close', () => {
    allocateSession({ path: '/repo' });
    const cache = {
      lastScan: Date.now(),
      summary: { untracked: 0, modified: 0, staged: 0, conflicted: 0 },
      payload: { files: [], ahead: 0, behind: 0, branch_on_remote: false },
    };
    setStatusCache('1', cache);
    closeSession('1');
    assert.strictEqual(getStatusCache('1'), undefined);
  });
});

describe('plugin runtime merge state', () => {
  beforeEach(() => {
    resetSessions();
  });

  it('returns undefined for missing merge state', () => {
    const state = getMergeState('nonexistent');
    assert.strictEqual(state, undefined);
  });

  it('stores and retrieves merge state', () => {
    allocateSession({ path: '/repo' });
    const state = {
      type: 'merge' as const,
      sourceRef: 'feature',
      paths: ['file1.txt', 'file2.txt'],
    };
    setMergeState('1', state);
    const retrieved = getMergeState('1');
    assert.deepStrictEqual(retrieved, state);
  });

  it('clears merge state', () => {
    allocateSession({ path: '/repo' });
    const state = {
      type: 'cherry-pick' as const,
      sourceRef: 'abc123',
      paths: [],
    };
    setMergeState('1', state);
    clearMergeState('1');
    assert.strictEqual(getMergeState('1'), undefined);
  });

  it('clears merge state on session close', () => {
    allocateSession({ path: '/repo' });
    const state = {
      type: 'revert' as const,
      sourceRef: 'def456',
      paths: ['reverted.txt'],
    };
    setMergeState('1', state);
    closeSession('1');
    assert.strictEqual(getMergeState('1'), undefined);
  });

  it('overwrites existing merge state', () => {
    allocateSession({ path: '/repo' });
    const state1 = {
      type: 'merge' as const,
      sourceRef: 'feature-a',
      paths: [],
    };
    const state2 = {
      type: 'cherry-pick' as const,
      sourceRef: 'abc123',
      paths: ['file.txt'],
    };
    setMergeState('1', state1);
    setMergeState('1', state2);
    assert.deepStrictEqual(getMergeState('1'), state2);
  });
});
