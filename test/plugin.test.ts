// Copyright © 2025-2026 OpenVCS Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
/// <reference types="node" />

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PluginDefinition, OnPluginStart } from '../src/plugin.js';

describe('Lore plugin exports', () => {
  describe('PluginDefinition', () => {
    it('is exported with the configured log target', () => {
      assert.ok(PluginDefinition, 'PluginDefinition is exported');
      assert.ok(PluginDefinition.logTarget, 'PluginDefinition has logTarget');
      assert.strictEqual(PluginDefinition.logTarget, 'openvcs.lore.plugin');
    });

    it('registers vcs delegates during plugin startup', () => {
      OnPluginStart();

      const vcs = PluginDefinition.vcs;
      assert.ok(vcs, 'vcs delegates exist');
      assert.ok(vcs['vcs.open'], 'vcs.open delegate exists');
      assert.ok(vcs['vcs.close'], 'vcs.close delegate exists');
      assert.ok(vcs['vcs.get_caps'], 'vcs.get_caps delegate exists');
      assert.ok(vcs['vcs.clone_repo'], 'vcs.clone_repo delegate exists');
      assert.ok(vcs['vcs.get_workdir'], 'vcs.get_workdir delegate exists');
      assert.ok(vcs['vcs.get_current_branch'], 'vcs.get_current_branch delegate exists');
      assert.ok(vcs['vcs.list_branches'], 'vcs.list_branches delegate exists');
      assert.ok(vcs['vcs.list_local_branches'], 'vcs.list_local_branches delegate exists');
      assert.ok(vcs['vcs.create_branch'], 'vcs.create_branch delegate exists');
      assert.ok(vcs['vcs.checkout_branch'], 'vcs.checkout_branch delegate exists');
      assert.ok(vcs['vcs.fetch'], 'vcs.fetch delegate exists');
      assert.ok(vcs['vcs.push'], 'vcs.push delegate exists');
      assert.ok(vcs['vcs.pull_ff_only'], 'vcs.pull_ff_only delegate exists');
      assert.ok(vcs['vcs.commit'], 'vcs.commit delegate exists');
      assert.ok(vcs['vcs.get_status_summary'], 'vcs.get_status_summary delegate exists');
      assert.ok(vcs['vcs.get_status_payload'], 'vcs.get_status_payload delegate exists');
      assert.ok(vcs['vcs.list_commits'], 'vcs.list_commits delegate exists');
    });
  });

  describe('OnPluginStart', () => {
    it('is exported as a function', () => {
      assert.ok(OnPluginStart, 'OnPluginStart is exported');
      assert.strictEqual(typeof OnPluginStart, 'function', 'OnPluginStart is a function');
    });

    it('validates Lore and attaches the delegate map', () => {
      OnPluginStart();
      assert.ok(PluginDefinition.vcs, 'PluginDefinition.vcs is populated at startup');
    });
  });
});
