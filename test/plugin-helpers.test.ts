// Copyright © 2025-2026 OpenVCS Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
/// <reference types="node" />

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asNumber,
  asOptionalBoolean,
  asRecord,
  asString,
  asStringArray,
  asTrimmedString,
  buildCloneArgs,
  buildPushArgs,
  buildSyncArgs,
  findErrorEvents,
  getEventByType,
  getEventsByType,
  parseBranchList,
  parseCommitHistory,
  parseConfigValue,
  parseJsonEvents,
  parseStatusFromEvents,
} from '../src/plugin-helpers.js';

import type { LoreJsonEvent } from '../src/plugin-types.js';

describe('Lore plugin helpers', () => {
  describe('parseJsonEvents', () => {
    it('returns empty array for empty input', () => {
      assert.deepStrictEqual(parseJsonEvents(''), []);
      assert.deepStrictEqual(parseJsonEvents('   '), []);
    });

    it('parses single JSON event line', () => {
      const input = JSON.stringify({ tagName: 'repositoryStatusRevision', data: {} });
      const events = parseJsonEvents(input);
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].tagName, 'repositoryStatusRevision');
    });

    it('parses multiple JSON event lines', () => {
      const input = [
        JSON.stringify({ tagName: 'metadata', data: { key: 'message' } }),
        JSON.stringify({ tagName: 'error', data: { errorInner: 'fail' } }),
      ].join('\n');
      const events = parseJsonEvents(input);
      assert.strictEqual(events.length, 2);
      assert.strictEqual(events[0].tagName, 'metadata');
      assert.strictEqual(events[1].tagName, 'error');
    });

    it('skips empty lines', () => {
      const input = [
        JSON.stringify({ tagName: 'metadata', data: {} }),
        '',
        '   ',
        JSON.stringify({ tagName: 'error', data: {} }),
      ].join('\n');
      const events = parseJsonEvents(input);
      assert.strictEqual(events.length, 2);
    });

    it('skips non-object JSON lines', () => {
      const input = [
        JSON.stringify({ tagName: 'metadata', data: {} }),
        '"just a string"',
        JSON.stringify(42),
      ].join('\n');
      const events = parseJsonEvents(input);
      assert.strictEqual(events.length, 1);
    });

    it('skips objects without tagName', () => {
      const input = [
        JSON.stringify({ tagName: 'metadata', data: {} }),
        JSON.stringify({ event: 'old-style', data: {} }),
      ].join('\n');
      const events = parseJsonEvents(input);
      assert.strictEqual(events.length, 1);
    });

    it('throws on malformed JSON', () => {
      assert.throws(
        () => parseJsonEvents('{invalid json'),
        (err: Error) => {
          assert.ok(err instanceof SyntaxError);
          return true;
        },
      );
    });
  });

  describe('getEventByType', () => {
    const events: LoreJsonEvent[] = [
      { tagName: 'metadata', data: { key: 'a' } },
      { tagName: 'error', data: { errorInner: 'fail' } },
      { tagName: 'metadata', data: { key: 'b' } },
    ];

    it('returns first matching event', () => {
      const result = getEventByType(events, 'error');
      assert.strictEqual(result?.tagName, 'error');
    });

    it('returns undefined when no match', () => {
      const result = getEventByType(events, 'nonexistent');
      assert.strictEqual(result, undefined);
    });
  });

  describe('getEventsByType', () => {
    const events: LoreJsonEvent[] = [
      { tagName: 'metadata', data: { key: 'a' } },
      { tagName: 'error', data: { errorInner: 'fail' } },
      { tagName: 'metadata', data: { key: 'b' } },
    ];

    it('returns all matching events', () => {
      const result = getEventsByType(events, 'metadata');
      assert.strictEqual(result.length, 2);
    });

    it('returns empty array when no match', () => {
      const result = getEventsByType(events, 'nonexistent');
      assert.deepStrictEqual(result, []);
    });
  });

  describe('findErrorEvents', () => {
    it('extracts error messages from error events', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'metadata', data: {} },
        { tagName: 'error', data: { errorInner: 'first error' } },
        { tagName: 'error', data: { errorInner: 'second error' } },
      ];
      const errors = findErrorEvents(events);
      assert.deepStrictEqual(errors, ['first error', 'second error']);
    });

    it('returns empty array when no errors', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'metadata', data: {} },
      ];
      const errors = findErrorEvents(events);
      assert.deepStrictEqual(errors, []);
    });

    it('handles error events with missing data', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'error', data: {} },
      ];
      const errors = findErrorEvents(events);
      assert.deepStrictEqual(errors, []);
    });
  });

  describe('parseStatusFromEvents', () => {
    it('parses revision event for ahead/behind', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'repositoryStatusRevision', data: { isLocalAhead: true, isRemoteAhead: false, remoteBranchExist: true } },
      ];
      const result = parseStatusFromEvents(events);
      assert.strictEqual(result.payload.ahead, 1);
      assert.strictEqual(result.payload.behind, 0);
      assert.strictEqual(result.payload.branch_on_remote, true);
    });

    it('parses file events into status entries', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'repositoryStatusRevision', data: {} },
        { tagName: 'repositoryStatusFile', data: { path: 'test.txt', action: 'Modify', flagDirty: true } },
      ];
      const result = parseStatusFromEvents(events);
      assert.strictEqual(result.payload.files.length, 1);
      assert.strictEqual(result.payload.files[0].path, 'test.txt');
      assert.strictEqual(result.payload.files[0].status, 'M');
      assert.strictEqual(result.summary.modified, 1);
    });

    it('counts staged files', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'repositoryStatusRevision', data: {} },
        { tagName: 'repositoryStatusFile', data: { path: 'staged.txt', action: 'Add', flagStaged: true } },
      ];
      const result = parseStatusFromEvents(events);
      assert.strictEqual(result.summary.staged, 1);
    });

    it('counts conflicted files', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'repositoryStatusRevision', data: {} },
        { tagName: 'repositoryStatusFile', data: { path: 'conflict.txt', action: 'Modify', flagConflict: true, flagConflictUnresolved: true } },
      ];
      const result = parseStatusFromEvents(events);
      assert.strictEqual(result.summary.conflicted, 1);
    });

    it('skips file events without path', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'repositoryStatusRevision', data: {} },
        { tagName: 'repositoryStatusFile', data: { action: 'Modify' } },
      ];
      const result = parseStatusFromEvents(events);
      assert.strictEqual(result.payload.files.length, 0);
    });

    it('handles move actions with old_path', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'repositoryStatusRevision', data: {} },
        { tagName: 'repositoryStatusFile', data: { path: 'new.txt', action: 'Move', fromPath: 'old.txt' } },
      ];
      const result = parseStatusFromEvents(events);
      assert.strictEqual(result.payload.files[0].old_path, 'old.txt');
      assert.strictEqual(result.payload.files[0].status, 'R');
    });
  });

  describe('parseCommitHistory', () => {
    it('parses revision history entries', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'revisionHistoryEntry', data: { revision: 'abc123', parent: ['def456'] } },
      ];
      const entries = parseCommitHistory(events);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].id, 'abc123');
      assert.strictEqual(entries[0].parent_oid, 'def456');
    });

    it('enriches entries with metadata events', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'revisionHistoryEntry', data: { revision: 'abc123', parent: [] } },
        { tagName: 'metadata', data: { key: 'message', value: 'Test commit' } },
        { tagName: 'metadata', data: { key: 'created-by', value: 'Author Name' } },
      ];
      const entries = parseCommitHistory(events);
      assert.strictEqual(entries[0].msg, 'Test commit');
      assert.strictEqual(entries[0].author, 'Author Name');
    });

    it('skips entries without revision', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'revisionHistoryEntry', data: { parent: [] } },
      ];
      const entries = parseCommitHistory(events);
      assert.strictEqual(entries.length, 0);
    });

    it('handles metadata with String wrapper', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'revisionHistoryEntry', data: { revision: 'abc123', parent: [] } },
        { tagName: 'metadata', data: { key: 'message', value: { String: 'Wrapped message' } } },
      ];
      const entries = parseCommitHistory(events);
      assert.strictEqual(entries[0].msg, 'Wrapped message');
    });
  });

  describe('parseBranchList', () => {
    it('parses branch list entries', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'branchListEntry', data: { name: 'main', isCurrent: true } },
        { tagName: 'branchListEntry', data: { name: 'feature', isCurrent: false } },
      ];
      const result = parseBranchList(events);
      assert.strictEqual(result.current, 'main');
      assert.strictEqual(result.branches.length, 2);
      assert.strictEqual(result.branches[0].current, true);
      assert.strictEqual(result.branches[1].current, false);
    });

    it('returns null current when no current branch', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'branchListEntry', data: { name: 'main', isCurrent: false } },
      ];
      const result = parseBranchList(events);
      assert.strictEqual(result.current, null);
    });

    it('skips entries without name', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'branchListEntry', data: { isCurrent: true } },
      ];
      const result = parseBranchList(events);
      assert.strictEqual(result.branches.length, 0);
    });
  });

  describe('parseConfigValue', () => {
    it('extracts string config value', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'metadata', data: { key: 'remote_url', value: 'https://example.com' } },
      ];
      const value = parseConfigValue(events, 'remote_url');
      assert.strictEqual(value, 'https://example.com');
    });

    it('returns null for missing key', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'metadata', data: { key: 'other', value: 'value' } },
      ];
      const value = parseConfigValue(events, 'remote_url');
      assert.strictEqual(value, null);
    });

    it('handles String wrapper value', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'metadata', data: { key: 'remote_url', value: { String: 'https://example.com' } } },
      ];
      const value = parseConfigValue(events, 'remote_url');
      assert.strictEqual(value, 'https://example.com');
    });

    it('handles Numeric wrapper value', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'metadata', data: { key: 'port', value: { Numeric: 8080 } } },
      ];
      const value = parseConfigValue(events, 'port');
      assert.strictEqual(value, '8080');
    });

    it('handles Hash wrapper value', () => {
      const events: LoreJsonEvent[] = [
        { tagName: 'metadata', data: { key: 'hash', value: { Hash: 'abc123' } } },
      ];
      const value = parseConfigValue(events, 'hash');
      assert.strictEqual(value, 'abc123');
    });
  });

  describe('buildCloneArgs', () => {
    it('builds clone with url and dest', () => {
      const args = buildCloneArgs({ url: 'https://example.com', dest: 'repo' });
      assert.deepStrictEqual(args, ['clone', 'https://example.com', 'repo']);
    });

    it('builds clone with shared store flag', () => {
      const args = buildCloneArgs({ url: 'https://example.com', dest: 'repo', use_shared_store: true });
      assert.deepStrictEqual(args, ['clone', '--use-shared-store', 'https://example.com', 'repo']);
    });

    it('builds clone with bare flag', () => {
      const args = buildCloneArgs({ url: 'https://example.com', dest: 'repo', bare: true });
      assert.deepStrictEqual(args, ['clone', '--bare', 'https://example.com', 'repo']);
    });

    it('builds clone with no arguments', () => {
      const args = buildCloneArgs({});
      assert.deepStrictEqual(args, ['clone']);
    });
  });

  describe('buildPushArgs', () => {
    it('builds push with branch', () => {
      const args = buildPushArgs({ branch: 'main' });
      assert.deepStrictEqual(args, ['push', 'main']);
    });

    it('builds push with no arguments', () => {
      const args = buildPushArgs({});
      assert.deepStrictEqual(args, ['push']);
    });
  });

  describe('buildSyncArgs', () => {
    it('builds sync with revision', () => {
      const args = buildSyncArgs({ revision: 'abc123' });
      assert.deepStrictEqual(args, ['sync', 'abc123']);
    });

    it('builds sync with no arguments', () => {
      const args = buildSyncArgs({});
      assert.deepStrictEqual(args, ['sync']);
    });
  });
});

describe('Coercion helpers', () => {
  describe('asRecord', () => {
    it('returns empty object for null input', () => {
      assert.deepStrictEqual(asRecord(null), {});
    });

    it('returns empty object for undefined input', () => {
      assert.deepStrictEqual(asRecord(undefined), {});
    });

    it('returns empty object for non-object input', () => {
      assert.deepStrictEqual(asRecord('string'), {});
      assert.deepStrictEqual(asRecord(42), {});
    });

    it('returns empty object for array input', () => {
      assert.deepStrictEqual(asRecord([1, 2, 3]), {});
    });

    it('passes through plain objects', () => {
      const obj = { key: 'value' };
      assert.strictEqual(asRecord(obj), obj);
    });
  });

  describe('asString', () => {
    it('preserves string values', () => {
      assert.strictEqual(asString('hello'), 'hello');
    });

    it('coerces numbers to string', () => {
      assert.strictEqual(asString(42), '42');
    });

    it('coerces null to empty string', () => {
      assert.strictEqual(asString(null), '');
    });

    it('coerces undefined to empty string', () => {
      assert.strictEqual(asString(undefined), '');
    });

    it('coerces objects to their string representation', () => {
      assert.strictEqual(asString({}), '[object Object]');
    });
  });

  describe('asTrimmedString', () => {
    it('trims whitespace from strings', () => {
      assert.strictEqual(asTrimmedString('  hello  '), 'hello');
    });

    it('returns empty string for null', () => {
      assert.strictEqual(asTrimmedString(null), '');
    });
  });

  describe('asNumber', () => {
    it('preserves finite numbers', () => {
      assert.strictEqual(asNumber(42, 0), 42);
    });

    it('parses numeric strings', () => {
      assert.strictEqual(asNumber('42', 0), 42);
    });

    it('returns fallback for NaN', () => {
      assert.strictEqual(asNumber(NaN, 10), 10);
    });

    it('treats null as 0 (Number(null) is 0)', () => {
      assert.strictEqual(asNumber(null, 10), 0);
    });

    it('returns fallback for undefined', () => {
      assert.strictEqual(asNumber(undefined, 10), 10);
    });

    it('returns fallback for non-numeric strings', () => {
      assert.strictEqual(asNumber('not-a-number', 10), 10);
    });
  });

  describe('asStringArray', () => {
    it('passes through string arrays', () => {
      assert.deepStrictEqual(asStringArray(['a', 'b']), ['a', 'b']);
    });

    it('filters out falsy entries', () => {
      assert.deepStrictEqual(asStringArray(['a', '', null, 'b', undefined]), ['a', 'b']);
    });

    it('returns empty array for non-array input', () => {
      assert.deepStrictEqual(asStringArray('not-array'), []);
      assert.deepStrictEqual(asStringArray(null), []);
    });

    it('coerces non-string elements to string', () => {
      assert.deepStrictEqual(asStringArray([1, true]), ['1', 'true']);
    });
  });

  describe('asOptionalBoolean', () => {
    it('returns true for true', () => {
      assert.strictEqual(asOptionalBoolean(true), true);
    });

    it('returns false for false', () => {
      assert.strictEqual(asOptionalBoolean(false), false);
    });

    it('returns undefined for non-boolean', () => {
      assert.strictEqual(asOptionalBoolean('true'), undefined);
      assert.strictEqual(asOptionalBoolean(1), undefined);
      assert.strictEqual(asOptionalBoolean(null), undefined);
    });
  });
});
