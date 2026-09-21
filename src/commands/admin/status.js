import { formatUptime } from '../../utils/format.js';
import { capabilities } from '../../utils/system.js';

export default {
  name: 'status',
  aliases: ['state', 'etat', 'panel'],
  category: 'admin',
  description: 'Panneau d’état complet du bot (administrateur)',
  usage: '/status',
  ownerOnly: true,
  examples: ['/status'],

  async execute(ctx) {
    const status = ctx.manager.getStatus();
    const caps = await capabilities();

    const lines = [
      `📊 *État du bot — ${status.bot.name}*`,
      ``,
      `${status.whatsapp.connected ? '🟢 WhatsApp : Connecté' : `⚪ WhatsApp : ${status.whatsapp.status}`}`,
      status.whatsapp.phoneFormatted ? `📱 Numéro : ${status.whatsapp.phoneFormatted}` : null,
      status.whatsapp.pushName ? `👤 Profil : ${status.whatsapp.pushName}` : null,
      `⏱️ En ligne : ${status.whatsapp.uptimeMs ? formatUptime(status.whatsapp.uptimeMs) : '—'}`,
      ``,
      `👑 ADMIN : ${status.admin.name || 'non configuré'}`,
      `🔢 Numéro admin : ${status.admin.number || 'non configuré'}`,
      `🔣 PREFIX : ${status.bot.prefix}`,
      `🎨 STICKER NAME : ${status.bot.stickerName}`,
      `✍️ Auteur sticker : ${status.bot.stickerAuthor || '—'}`,
      `🔐 SESSION : ${status.session.sessionId ? 'générée' : 'aucune'}`,
      `🧩 COMMANDS : ${status.commands.total}`,
      ``,
      `🎞️ ffmpeg : ${caps.ffmpeg ? '✅' : '❌'}`,
      `🖼️ sharp : ${caps.sharp ? '✅' : '❌'}`,
      `💬 Messages : ${status.stats.messagesProcessed} • ⚙️ Commandes : ${status.stats.commandsExecuted}`,
      `👥 Conversations suivies : ${status.stats.chats}`,
    ].filter(Boolean);

    if (status.error) lines.push(``, `⚠️ Dernier incident : ${status.error}`);

    await ctx.reply(lines.join('\n'));
  },
};
