import { BotError } from '../../utils/errors.js';

export default {
  name: 'del',
  aliases: ['delete', 'supprimer'],
  category: 'tools',
  description: 'Supprime un message cité (admin du groupe ou owner)',
  usage: '/del (en répondant à un message)',
  adminOnly: true,
  examples: ['/del'],

  async execute(ctx) {
    if (!ctx.quoted?.stanzaId) {
      throw new BotError(`❌ Répondez à un message puis tapez ${ctx.prefix}del.`);
    }

    const key = {
      remoteJid: ctx.from,
      fromMe: ctx.manager.isSelf(ctx.quoted.participant) || false,
      id: ctx.quoted.stanzaId,
      participant: ctx.quoted.participant || undefined,
    };

    try {
      await ctx.sock.sendMessage(ctx.from, { delete: key });
      await ctx.react('🗑️');
    } catch (error) {
      throw new BotError(`❌ Suppression impossible : ${error.message}`);
    }
  },
};
