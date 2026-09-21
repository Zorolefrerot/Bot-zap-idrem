import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CATEGORIES } from '../config/defaults.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('commands-loader');

export const COMMANDS_DIR = path.resolve(import.meta.dirname, '..', 'commands');
const VALID_CATEGORIES = new Set([...CATEGORIES.map((c) => c.id), 'other']);

async function collectFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
      out.push(full);
    }
  }
  return out.sort();
}

function normalizeCommand(raw, file) {
  const name = String(raw.name || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{1,24}$/.test(name)) {
    throw new Error(`nom de commande invalide : "${name}"`);
  }
  if (typeof raw.execute !== 'function') throw new Error(`la commande "${name}" n'a pas de fonction execute()`);

  const category = VALID_CATEGORIES.has(raw.category) ? raw.category : 'other';

  return {
    name,
    aliases: Array.isArray(raw.aliases)
      ? [...new Set(raw.aliases.map((a) => String(a).trim().toLowerCase()).filter((a) => /^[a-z0-9-]{1,24}$/.test(a)))]
      : [],
    category,
    description: String(raw.description || '—').slice(0, 200),
    usage: String(raw.usage || `/${name}`),
    examples: Array.isArray(raw.examples) ? raw.examples.map(String).slice(0, 6) : [],
    ownerOnly: Boolean(raw.ownerOnly),
    adminOnly: Boolean(raw.adminOnly),
    groupOnly: Boolean(raw.groupOnly),
    privateOnly: Boolean(raw.privateOnly),
    usesMedia: Boolean(raw.usesMedia),
    cooldownMs: Number.isFinite(raw.cooldownMs) ? raw.cooldownMs : 0,
    file,
    execute: raw.execute,
  };
}

/**
 * Charge toutes les commandes de `src/commands` (récursif).
 * Ajouter une commande = ajouter un fichier : aucun registre à éditer.
 */
export async function loadCommands(dir = COMMANDS_DIR) {
  const commands = new Map();
  const aliases = new Map();
  const errors = [];

  for (const file of await collectFiles(dir)) {
    try {
      const module = await import(`${pathToFileURL(file).href}?v=${Date.now()}`);
      const seen = new Set();
      const candidates = [module.default, ...Object.values(module)].filter((value) => {
        if (!value || typeof value !== 'object') return false;
        if (typeof value.execute !== 'function') return false;
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
      });
      for (const candidate of candidates) {
        const command = normalizeCommand(candidate, file);
        if (commands.has(command.name)) {
          logger.warn('commande dupliquée ignorée', { name: command.name, file: path.basename(file) });
          continue;
        }
        commands.set(command.name, command);
        for (const alias of command.aliases) {
          if (!commands.has(alias)) aliases.set(alias, command.name);
        }
      }
    } catch (error) {
      errors.push({ file: path.relative(COMMANDS_DIR, file), message: error.message });
      logger.error('commande impossible à charger', { file: path.basename(file), reason: error.message });
    }
  }

  logger.info('commandes chargées', { total: commands.size, aliases: aliases.size, errors: errors.length });
  return { commands, aliases, errors };
}

export function categoryMeta(id) {
  return CATEGORIES.find((category) => category.id === id) || { id, label: String(id).toUpperCase(), icon: '📦', order: 99 };
}

export default loadCommands;
