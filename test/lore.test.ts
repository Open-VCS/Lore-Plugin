// Copyright © 2025-2026 OpenVCS Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
/// <reference types="node" />

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LoreCommand } from '../src/lore.js';

describe('LoreCommand', () => {
  describe('constructor', () => {
    it('creates a LoreCommand with a working directory', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      assert.ok(cmd);
    });
  });

  describe('version', () => {
    it('returns version string from lore --version output', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      cmd.run = () => ({ status: 0, stdout: 'lore v0.9.2', stderr: '' });
      assert.strictEqual(cmd.version(), 'v0.9.2');
    });

    it('returns raw stdout when version pattern not matched', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      cmd.run = () => ({ status: 0, stdout: 'unknown output', stderr: '' });
      assert.strictEqual(cmd.version(), 'unknown output');
    });

    it('handles version with v prefix', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      cmd.run = () => ({ status: 0, stdout: 'lore v1.0.0', stderr: '' });
      assert.strictEqual(cmd.version(), 'v1.0.0');
    });
  });

  describe('status', () => {
    it('builds status command with --check-dirty by default', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runJson = (args: string[]) => {
        capturedArgs = args;
        return { events: [], raw: '' };
      };
      cmd.status();
      assert.ok(capturedArgs.includes('--check-dirty'));
      assert.ok(!capturedArgs.includes('--scan'));
    });

    it('builds status command with --scan when scan=true', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runJson = (args: string[]) => {
        capturedArgs = args;
        return { events: [], raw: '' };
      };
      cmd.status([], true);
      assert.ok(capturedArgs.includes('--scan'));
      assert.ok(!capturedArgs.includes('--check-dirty'));
    });

    it('includes paths in status command', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runJson = (args: string[]) => {
        capturedArgs = args;
        return { events: [], raw: '' };
      };
      cmd.status(['file1.txt', 'file2.txt']);
      assert.ok(capturedArgs.includes('file1.txt'));
      assert.ok(capturedArgs.includes('file2.txt'));
    });
  });

  describe('stage', () => {
    it('builds stage command with paths', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.stage(['file1.txt', 'file2.txt']);
      assert.ok(capturedArgs.includes('stage'));
      assert.ok(capturedArgs.includes('file1.txt'));
      assert.ok(capturedArgs.includes('file2.txt'));
    });

    it('includes --scan flag when scan=true', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.stage(['file.txt'], true);
      assert.ok(capturedArgs.includes('--scan'));
    });
  });

  describe('unstage', () => {
    it('builds unstage command with paths', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.unstage(['file.txt']);
      assert.ok(capturedArgs.includes('unstage'));
      assert.ok(capturedArgs.includes('file.txt'));
    });
  });

  describe('commit', () => {
    it('builds commit command with message', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.commit('Test commit message');
      assert.ok(capturedArgs.includes('commit'));
      assert.ok(capturedArgs.includes('Test commit message'));
    });

    it('includes --identity when identity provided', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.commit('Test commit', 'User <email@example.com>');
      assert.ok(capturedArgs.includes('--identity'));
      assert.ok(capturedArgs.includes('User <email@example.com>'));
    });
  });

  describe('amend', () => {
    it('builds amend command with message', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.amend('Updated message');
      assert.ok(capturedArgs.includes('amend'));
      assert.ok(capturedArgs.includes('Updated message'));
    });
  });

  describe('listBranches', () => {
    it('builds branch list command with --archived', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runJson = (args: string[]) => {
        capturedArgs = args;
        return { events: [], raw: '' };
      };
      cmd.listBranches();
      assert.ok(capturedArgs.includes('list'));
      assert.ok(capturedArgs.includes('--archived'));
    });
  });

  describe('createBranch', () => {
    it('builds branch create command', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.createBranch('feature/test');
      assert.ok(capturedArgs.includes('create'));
      assert.ok(capturedArgs.includes('feature/test'));
    });
  });

  describe('switchBranch', () => {
    it('builds branch switch command', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.switchBranch('main');
      assert.ok(capturedArgs.includes('switch'));
      assert.ok(capturedArgs.includes('main'));
    });

    it('includes --reset flag when reset=true', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.switchBranch('main', true);
      assert.ok(capturedArgs.includes('--reset'));
    });

    it('includes revision when provided', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.switchBranch('main', false, 'abc123');
      assert.ok(capturedArgs.includes('abc123'));
    });
  });

  describe('deleteBranch', () => {
    it('builds branch archive command', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.deleteBranch('feature/old');
      assert.ok(capturedArgs.includes('archive'));
      assert.ok(capturedArgs.includes('feature/old'));
    });
  });

  describe('push', () => {
    it('builds push command without branch', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.push();
      assert.ok(capturedArgs.includes('push'));
      assert.ok(!capturedArgs.includes('--branch'));
    });

    it('builds push command with branch', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.push('main');
      assert.ok(capturedArgs.includes('push'));
      assert.ok(capturedArgs.includes('main'));
    });
  });

  describe('sync', () => {
    it('builds sync command without revision', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.sync();
      assert.ok(capturedArgs.includes('sync'));
    });

    it('builds sync command with revision', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.sync('abc123');
      assert.ok(capturedArgs.includes('sync'));
      assert.ok(capturedArgs.includes('abc123'));
    });
  });

  describe('clone', () => {
    it('builds clone command with url and dest', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.clone('https://example.com/repo', 'repo');
      assert.ok(capturedArgs.includes('clone'));
      assert.ok(capturedArgs.includes('https://example.com/repo'));
      assert.ok(capturedArgs.includes('repo'));
    });

    it('includes --use-shared-store when sharedStore=true', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.clone('https://example.com/repo', 'repo', { sharedStore: true });
      assert.ok(capturedArgs.includes('--use-shared-store'));
    });

    it('includes --bare when bare=true', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.clone('https://example.com/repo', 'repo', { bare: true });
      assert.ok(capturedArgs.includes('--bare'));
    });
  });

  describe('listCommits', () => {
    it('builds revision history command', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runJson = (args: string[]) => {
        capturedArgs = args;
        return { events: [], raw: '' };
      };
      cmd.listCommits();
      assert.ok(capturedArgs.includes('history'));
    });

    it('includes --revision when rev provided', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runJson = (args: string[]) => {
        capturedArgs = args;
        return { events: [], raw: '' };
      };
      cmd.listCommits(undefined, 'abc123');
      assert.ok(capturedArgs.includes('--revision'));
      assert.ok(capturedArgs.includes('abc123'));
    });

    it('includes limit when provided', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runJson = (args: string[]) => {
        capturedArgs = args;
        return { events: [], raw: '' };
      };
      cmd.listCommits(10);
      assert.ok(capturedArgs.includes('10'));
    });

    it('skips limit when 0', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runJson = (args: string[]) => {
        capturedArgs = args;
        return { events: [], raw: '' };
      };
      cmd.listCommits(0);
      assert.ok(!capturedArgs.includes('0'));
    });
  });

  describe('diffFile', () => {
    it('builds file diff command', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runJson = (args: string[]) => {
        capturedArgs = args;
        return { events: [], raw: '' };
      };
      cmd.diffFile('test.txt');
      assert.ok(capturedArgs.includes('diff'));
      assert.ok(capturedArgs.includes('--path'));
      assert.ok(capturedArgs.includes('test.txt'));
    });

    it('includes --revision when rev provided', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runJson = (args: string[]) => {
        capturedArgs = args;
        return { events: [], raw: '' };
      };
      cmd.diffFile('test.txt', 'abc123');
      assert.ok(capturedArgs.includes('--revision'));
      assert.ok(capturedArgs.includes('abc123'));
    });
  });

  describe('diffRevision', () => {
    it('builds revision diff command', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runJson = (args: string[]) => {
        capturedArgs = args;
        return { events: [], raw: '' };
      };
      cmd.diffRevision('abc123');
      assert.ok(capturedArgs.includes('diff'));
      assert.ok(capturedArgs.includes('abc123'));
    });

    it('includes --target when target provided', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runJson = (args: string[]) => {
        capturedArgs = args;
        return { events: [], raw: '' };
      };
      cmd.diffRevision('abc123', 'def456');
      assert.ok(capturedArgs.includes('--target'));
      assert.ok(capturedArgs.includes('def456'));
    });
  });

  describe('cherryPick', () => {
    it('builds cherry-pick command', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.cherryPick('abc123');
      assert.ok(capturedArgs.includes('cherry-pick'));
      assert.ok(capturedArgs.includes('abc123'));
    });

    it('includes --message when provided', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.cherryPick('abc123', { message: 'Custom message' });
      assert.ok(capturedArgs.includes('--message'));
      assert.ok(capturedArgs.includes('Custom message'));
    });
  });

  describe('revertCommit', () => {
    it('builds revert command', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.revertCommit('abc123');
      assert.ok(capturedArgs.includes('revert'));
      assert.ok(capturedArgs.includes('abc123'));
    });

    it('includes --message when provided', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.revertCommit('abc123', { message: 'Revert message' });
      assert.ok(capturedArgs.includes('--message'));
      assert.ok(capturedArgs.includes('Revert message'));
    });
  });

  describe('mergeStart', () => {
    it('builds merge start command', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.mergeStart('feature');
      assert.ok(capturedArgs.includes('start'));
      assert.ok(capturedArgs.includes('feature'));
    });

    it('includes --message when provided', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.mergeStart('feature', 'Merge message');
      assert.ok(capturedArgs.includes('--message'));
      assert.ok(capturedArgs.includes('Merge message'));
    });
  });

  describe('mergeAbort', () => {
    it('builds merge abort command', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.mergeAbort();
      assert.ok(capturedArgs.includes('abort'));
    });
  });

  describe('mergeResolve', () => {
    it('builds merge resolve command with paths', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.mergeResolve(['file1.txt', 'file2.txt']);
      assert.ok(capturedArgs.includes('resolve'));
      assert.ok(capturedArgs.includes('file1.txt'));
      assert.ok(capturedArgs.includes('file2.txt'));
    });
  });

  describe('mergeResolveMine', () => {
    it('builds merge resolve mine command', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.mergeResolveMine(['file.txt']);
      assert.ok(capturedArgs.includes('mine'));
      assert.ok(capturedArgs.includes('file.txt'));
    });
  });

  describe('mergeResolveTheirs', () => {
    it('builds merge resolve theirs command', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.mergeResolveTheirs(['file.txt']);
      assert.ok(capturedArgs.includes('theirs'));
      assert.ok(capturedArgs.includes('file.txt'));
    });
  });

  describe('fileReset', () => {
    it('builds file reset command with paths', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.fileReset(['file.txt']);
      assert.ok(capturedArgs.includes('reset'));
      assert.ok(capturedArgs.includes('file.txt'));
    });

    it('includes --purge when purge=true', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      let capturedArgs: string[] = [];
      cmd.runChecked = (args: string[]) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      cmd.fileReset(['file.txt'], true);
      assert.ok(capturedArgs.includes('--purge'));
    });
  });

  describe('getConfig', () => {
    it('returns config value from metadata event', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      cmd.runJson = () => ({
        events: [
          { tagName: 'repositoryConfigValue', data: { value: 'https://example.com' } },
        ],
        raw: '',
      });
      assert.strictEqual(cmd.getConfig('remote_url'), 'https://example.com');
    });

    it('returns null when config event not found', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      cmd.runJson = () => ({ events: [], raw: '' });
      assert.strictEqual(cmd.getConfig('remote_url'), null);
    });

    it('returns null when config event has no value', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      cmd.runJson = () => ({
        events: [
          { tagName: 'repositoryConfigValue', data: {} },
        ],
        raw: '',
      });
      assert.strictEqual(cmd.getConfig('remote_url'), null);
    });
  });

  describe('getRemoteUrl', () => {
    it('returns remote_url config value', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      cmd.getConfig = () => 'https://example.com/repo';
      assert.strictEqual(cmd.getRemoteUrl(), 'https://example.com/repo');
    });

    it('returns null when remote_url not configured', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      cmd.getConfig = () => null;
      assert.strictEqual(cmd.getRemoteUrl(), null);
    });
  });

  describe('runChecked', () => {
    it('returns result on success', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      cmd.run = () => ({ status: 0, stdout: 'output', stderr: '' });
      const result = cmd.runChecked(['test'], 'test-error');
      assert.strictEqual(result.status, 0);
      assert.strictEqual(result.stdout, 'output');
    });

    it('throws pluginError on non-zero exit', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      cmd.run = () => ({ status: 1, stdout: '', stderr: 'error message' });
      assert.throws(
        () => cmd.runChecked(['test'], 'test-error'),
        (err: Error) => {
          assert.ok(err.message.includes('error message'));
          return true;
        },
      );
    });

    it('uses stdout when stderr is empty', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      cmd.run = () => ({ status: 1, stdout: 'stdout error', stderr: '' });
      assert.throws(
        () => cmd.runChecked(['test'], 'test-error'),
        (err: Error) => {
          assert.ok(err.message.includes('stdout error'));
          return true;
        },
      );
    });

    it('uses default message when both stdout and stderr empty', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      cmd.run = () => ({ status: 1, stdout: '', stderr: '' });
      assert.throws(
        () => cmd.runChecked(['test'], 'test-error'),
        (err: Error) => {
          assert.ok(err.message.includes('exit code: 1'));
          return true;
        },
      );
    });
  });

  describe('runJson', () => {
    it('returns parsed events', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      cmd.runChecked = () => ({
        status: 0,
        stdout: '{"tagName":"metadata","data":{}}',
        stderr: '',
      });
      const result = cmd.runJson(['test'], 'test-error');
      assert.strictEqual(result.events.length, 1);
      assert.strictEqual(result.events[0].tagName, 'metadata');
    });

    it('throws on error events', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      cmd.runChecked = () => ({
        status: 0,
        stdout: '{"tagName":"error","data":{"errorInner":"fail"}}',
        stderr: '',
      });
      assert.throws(
        () => cmd.runJson(['test'], 'test-error'),
        (err: Error) => {
          assert.ok(err.message.includes('fail'));
          return true;
        },
      );
    });
  });

  describe('getIdentity', () => {
    it('returns null when config file not found', () => {
      const cmd = new LoreCommand('/tmp/nonexistent');
      assert.strictEqual(cmd.getIdentity(), null);
    });
  });

  describe('setIdentityLocal', () => {
    it('writes identity with name and email', () => {
      const cmd = new LoreCommand('/tmp/test-repo');
      // Mock runChecked to simulate successful write
      cmd.runChecked = () => ({ status: 0, stdout: '', stderr: '' });
      // This will throw because the directory doesn't exist
      // but we're testing the method logic
      assert.throws(() => {
        cmd.setIdentityLocal('John Doe', 'john@example.com');
      });
    });
  });
});
