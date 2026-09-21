import { capabilities, systemInfo, versions } from '../../utils/system.js';
import { formatBytes, formatUptime } from '../../utils/format.js';

export default {
  name: 'info',
  aliases: ['botinfo', 'infos', 'about'],
  category: 'bot',
  description: 'Informations techniques sur le bot',
  usage: '/info',
  examples: ['/info'],

  async execute(ctx) {
    const status = ctx.manager.getStatus();
    const caps = await capabilities();
    const sys = systemInfo();
    const v = versions();

    const lines = [
      `🤖 *${status.bot.name}*`,
      ``,
      `🔣 Préfixe : ${status.bot.prefix}`,
      `🎨 Sticker : ${status.bot.stickerName} • ${status.bot.stickerAuthor || '—'}`,
      `👑 Admin : ${status.admin.name || 'non configuré'}${status.admin.number ? ` • ${status.admin.number}` : ''}`,
      ``,
      `📡 WhatsApp : ${status.whatsapp.connected ? '🟢 Connecté' : `⚪ ${status.whatsapp.status}`}`,
      status.whatsapp.phoneFormatted ? `📱 Numéro : ${status.whatsapp.phoneFormatted}` : null,
      `⏱️ Uptime : ${status.whatsapp.uptimeMs ? formatUptime(status.whatsapp.uptimeMs) : '—'}`,
      `🔐 Session : ${status.session.sessionId ? 'générée' : 'aucune'}`,
      ``,
      `🧩 Commandes : ${status.commands.total}`,
      `💬 Messages traités : ${status.stats.messagesProcessed}`,
      `⚙️ Exécutions : ${status.stats.commandsExecuted}`,
      ``,
      `📦 Baileys ${v.baileys} • Node ${v.node}`,
      `🎞️ ffmpeg : ${caps.ffmpeg ? '✅ disponible' : '❌ absent (stickers animés, /tovideo et /toaudio désactivés)'}`,
      `🖼️ sharp : ${caps.sharp ? '✅ disponible' : '❌ absent'}`,
      `💾 Mémoire : ${formatBytes(sys.processMemory.rss)} / ${formatBytes(sys.memoryTotal)}`,
    ].filter(Boolean);

    await ctx.reply(lines.join('\n'));
  },
};
