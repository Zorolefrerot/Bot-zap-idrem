import { restartProcess } from '../../utils/process.js';

export default {
  name: 'restart',
  aliases: ['reboot', 'redemarrer'],
  category: 'admin',
  description: 'Redémarre le bot (session conservée)',
  usage: '/restart',
  ownerOnly: true,
  examples: ['/restart'],

  async execute(ctx) {
    await ctx.reply('🔄 Redémarrage en cours… la session WhatsApp est conservée.');
    await restartProcess({
      beforeExit: async () => {
        await ctx.db.flush();
        await ctx.manager.shutdown();
      },
    });
  },
};
