// Copyright © 2025-2026 OpenVCS Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import type { PluginModuleDefinition } from '@openvcs/sdk/runtime';
import { getOrCreateMenu, registerAction, invoke } from '@openvcs/sdk/runtime';

import {
  LoreVcsDelegates,
  type LoreRuntimeDependencies,
} from './plugin-request-handler.js';

import {
  allocateSession,
  closeSession,
  requireSession,
} from './plugin-runtime.js';

import { LoreCommand } from './lore.js';

/** Creates a LoreCommand instance for a given repository path. */
/* c8 ignore next 3 */
function createLoreCommand(cwd: string): LoreCommand {
  return new LoreCommand(cwd);
}

/** Returns the runtime services passed to the Lore VCS delegate class. */
function createLoreRuntimeDependencies(): LoreRuntimeDependencies {
  return {
    allocateSession,
    closeSession,
    requireSession,
    createLoreCommand,
  };
}

/** Registers the Lore plugin with the OpenVCS SDK runtime.
 *
 * Provides Lore runtime options up front and defers `vcs.*` delegate registration
 * until `OnPluginStart()` validates the local Lore installation. */
export const PluginDefinition: PluginModuleDefinition = {
  logTarget: 'openvcs.lore.plugin',
};

/** Validates Lore installation and version at plugin startup.
 *
 * Runs before the runtime begins processing requests. Throws if Lore is not
 * installed or version is below 0.8.
 * @throws Error if Lore is not available or version is unsupported */
export function OnPluginStart(): void {
  const lore = new LoreCommand(process.cwd());
  const versionStr = lore.version();

  /* c8 ignore next 5 */
  const versionMatch = versionStr.match(/(\d+)\.(\d+)/);
  if (versionMatch) {
    const major = parseInt(versionMatch[1], 10);
    const minor = parseInt(versionMatch[2], 10);
    if (major < 0 || (major === 0 && minor < 8)) {
      throw new Error(`Lore 0.8+ required, found ${major}.${minor}`);
    }
  }

  const delegates = new LoreVcsDelegates(createLoreRuntimeDependencies());
  PluginDefinition.vcs = delegates.toDelegates();

  const repoMenu = getOrCreateMenu('repository', 'Repository', { surface: 'menubar' });
  if (repoMenu) {
    repoMenu.addItem({ label: 'Edit .loreignore', action: 'repo-edit-loreignore' });
  }

  /* c8 ignore next 4 */
  registerAction('repo-edit-loreignore', async () => {
    await invoke('open_repo_dotfile', { name: '.loreignore' });
  });
}
