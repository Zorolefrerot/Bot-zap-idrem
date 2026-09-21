import { formatUptime } from '../../utils/format.js';

export default {
  name: 'runtime',
  aliases: ['uptime', 'actif'],
  category: 'bot',
  description: 'Durée de fonctionnement du bot',
  usage: '/runtime',
  examples: ['/runtime'],

  async execute(ctx) {
    const status = ctx.manager.getStatus();
    const waUptime = status.whatsapp.uptimeMs;
    const serverUptime = status.server.uptimeMs;

    const lines = [
      `⏱️ *Uptime ${status.bot.name}*`,
      ``,
      `🤖 Bot en ligne depuis : ${waUptime ? formatUptime(waUptime) : 'non connecté'}`,
      `🖥️ Serveur actif depuis : ${formatUptime(serverUptime)}`,
      `💬 Messages traités : ${status.stats.messagesProcessed}`,
      `⚙️ Commandes exécutées : ${status.stats.commandsExecuted}`,
    ];

    await ctx.reply(lines.join('\n'));
  },
};
