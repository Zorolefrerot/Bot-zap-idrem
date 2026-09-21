import { CATEGORIES } from '../config/defaults.js';
import { formatUptime } from './format.js';
import { categoryMeta } from '../bot/loader.js';

/**
 * Construction du menu WhatsApp (texte monospace-safe, caractères Unicode).
 * Le menu est généré dynamiquement depuis les commandes réellement chargées.
 */

const LINE_WIDTH = 22;

function box(title, lines = []) {
  const header = `╭━━━〔 ${title} 〕━━━╮`;
  const footer = `╰${'━'.repeat(LINE_WIDTH)}╯`;
  return [header, '┃', ...lines.map((line) => `┃ ${line}`), '┃', footer].join('\n');
}

function section(meta, commands, prefix) {
  const head = `┌─〔 ${meta.icon} ${meta.label} 〕`;
  const body = commands.map((command) => `│ ${prefix}${command.name} — ${command.description}`);
  const foot = `└${'─'.repeat(Math.max(6, LINE_WIDTH - 4))}`;
  return [head, ...body, foot].join('\n');
}

export function buildMenu({ commands, settings, status, prefix }) {
  const list = [...commands.values()];
  const byCategory = new Map();
  for (const command of list) {
    const key = command.category;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(command);
  }

  const orderedCategories = [
    ...CATEGORIES.map((category) => category.id),
    ...[...byCategory.keys()].filter((id) => !CATEGORIES.some((c) => c.id === id)),
  ].filter((id) => byCategory.has(id));

  const headerLines = [
    `⚡ ${settings.botName}`,
    `👤 Admin : ${settings.adminName || 'non configuré'}`,
    `🔣 Préfixe : ${prefix}`,
    `🎨 Sticker : ${settings.stickerName}`,
    `⏱️ Uptime : ${formatUptime(status?.uptimeMs ?? 0)}`,
    `🧩 Commandes : ${list.length}`,
  ];

  const categorySummary = orderedCategories.map((id) => {
    const meta = categoryMeta(id);
    return `${meta.icon} ${meta.label}`;
  });

  const sections = orderedCategories
    .map((id) => {
      const meta = categoryMeta(id);
      const categoryCommands = byCategory.get(id).sort((a, b) => a.name.localeCompare(b.name));
      return section(meta, categoryCommands, prefix);
    })
    .join('\n\n');

  const footer = [
    `💡 ${prefix}vv — récupérer un média en vue unique`,
    `💡 ${prefix}sticker — image/vidéo → sticker`,
    `💡 ${prefix}help <commande> — aide détaillée`,
    '',
    `© ${new Date().getFullYear()} ${settings.botName}`,
  ].join('\n');

  return `${box(settings.stickerName || settings.botName, [...headerLines, '', ...categorySummary])}\n\n${sections}\n\n${footer}`;
}

export function buildHelp(command, prefix) {
  const meta = categoryMeta(command.category);
  return [
    `${meta.icon} *${prefix}${command.name}*`,
    ``,
    `📝 ${command.description}`,
    ``,
    `📌 Usage : ${command.usage.replace(/^\//, prefix)}`,
    command.aliases?.length ? `🔁 Alias : ${command.aliases.map((a) => prefix + a).join(', ')}` : null,
    `🗂️ Catégorie : ${meta.label}`,
    command.ownerOnly ? '🔒 Réservée à l’administrateur' : null,
    command.adminOnly ? '🔒 Réservée aux admins du groupe' : null,
    command.groupOnly ? '👥 Groupe uniquement' : null,
    command.privateOnly ? '💬 Privé uniquement' : null,
    command.examples?.length ? `\nExemples :\n${command.examples.map((e) => `• ${e.replace(/^\//, prefix)}`).join('\n')}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export { box, section };
