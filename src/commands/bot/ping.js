export default {
  name: 'ping',
  aliases: ['p', 'latence'],
  category: 'bot',
  description: 'Mesure la latence du bot',
  usage: '/ping',
  examples: ['/ping'],

  async execute(ctx) {
    const started = process.hrtime.bigint();

    // Mesure réelle : temps d'un aller-retour vers les serveurs WhatsApp.
    try {
      await ctx.react('⚡');
    } catch {
      await ctx.reply('⏳ …').catch(() => {});
    }

    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    const latency = Math.round(elapsedMs);
    const level = latency < 300 ? '🟢' : latency < 900 ? '🟠' : '🔴';

    await ctx.reply(`${level} Pong ! Latence : *${latency} ms*`);
  },
};
