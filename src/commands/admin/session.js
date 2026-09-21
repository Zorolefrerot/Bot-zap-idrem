import { BotError } from '../../utils/errors.js';

export default {
  name: 'session',
  aliases: ['sessionid', 'mysession'],
  category: 'admin',
  description: 'Affiche la Session ID courante (administrateur, en privé)',
  usage: '/session',
  ownerOnly: true,
  privateOnly: true,
  examples: ['/session'],

  async execute(ctx) {
    const session = ctx.manager.getPublicSession();
    if (!session?.sessionId) {
      throw new BotError('❌ Aucune session active : générez d’abord un Pair Code depuis le dashboard web.');
    }

    const connected = ctx.manager.isConnected();
    const lines = [
      `🔐 *Session ID — ${ctx.settings.botName}*`,
      ``,
      `\`${session.sessionId}\``,
      ``,
      `${connected ? '🟢 Connecté' : '⚪ Déconnecté'}${session.phone ? ` • ${session.phone}` : ''}`,
      `Créée le : ${session.createdAt || '—'}`,
      ``,
      `ℹ️ Cette Session ID référence les credentials conservés sur votre serveur.`,
      `Elle ne contient aucune donnée WhatsApp et se régénère depuis le dashboard.`,
    ];

    await ctx.reply(lines.join('\n'));
  },
};
