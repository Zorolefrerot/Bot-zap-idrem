'use strict';
/*
 * 🧬 MeR~NeL — core/commandLoader.js
 * Découverte automatique des commandes (dossiers commands/**).
 * Chaque module exporte : { name, description, category, usage, aliases?,
 *                            adminOnly?, cooldownMs?, run(ctx) }
 */

const fs = require('fs');
const path = require('path');

function loadCommands(commandsDir, logger) {
  const map = new Map(); // name → module

  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        let mod;
        try {
          mod = require(full);
        } catch (err) {
          logger.error(`[commands] chargement impossible ${entry.name}:`, err.message);
          continue;
        }
        if (!mod || typeof mod.run !== 'function' || !mod.name) {
          logger.warn(`[commands] ignoré (invalide) : ${full}`);
          continue;
        }
        const name = String(mod.name).toLowerCase();
        mod.category = mod.category || path.basename(path.dirname(full));
        if (map.has(name)) {
          logger.warn(`[commands] doublon ignoré : ${name}`);
          continue;
        }
        map.set(name, mod);
        for (const alias of mod.aliases || []) {
          const a = String(alias).toLowerCase();
          if (!map.has(a)) map.set(a, mod);
        }
      }
    }
  }

  walk(commandsDir);
  logger.info(`[commands] ${map.size} commandes chargées.`);
  return map;
}

module.exports = { loadCommands };
