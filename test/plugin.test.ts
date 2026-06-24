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
  });

  describe('OnPluginStart', () => {
    it('is exported as a function', () => {
      assert.ok(OnPluginStart, 'OnPluginStart is exported');
      assert.strictEqual(typeof OnPluginStart, 'function', 'OnPluginStart is a function');
    });
  });
});
