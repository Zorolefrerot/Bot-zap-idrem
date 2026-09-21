import { shutdownProcess } from '../../utils/process.js';

export default {
  name: 'shutdown',
  aliases: ['stop', 'off', 'eteindre'],
  category: 'admin',
  description: 'Éteint le bot',
  usage: '/shutdown',
  ownerOnly: true,
  examples: ['/shutdown'],

  async execute(ctx) {
    await ctx.reply('👋 Extinction du bot… Relancez le processus serveur pour le redémarrer.');
    await shutdownProcess({
      beforeExit: async () => {
        await ctx.db.flush();
        await ctx.manager.shutdown();
      },
    });
  },
};
