import { normalizePhone } from '../../utils/phone.js';

export default {
  name: 'owner',
  aliases: ['admin', 'proprietaire', 'createur'],
  category: 'bot',
  description: 'Affiche le contact de l’administrateur du bot',
  usage: '/owner',
  examples: ['/owner'],

  async execute(ctx) {
    const number = normalizePhone(ctx.settings.adminNumber);
    const name = ctx.settings.adminName || 'Administrateur';

    if (!number) {
      return ctx.reply(
        `👤 Administrateur : *${name}*\n\nℹ️ Aucun numéro configuré.\nL'administrateur peut le définir avec ${ctx.prefix}setadmin <numéro>.`,
      );
    }

    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `N:;${name};;;`,
      `FN:${name}`,
      `ORG:${ctx.settings.botName};`,
      `item1.TEL;waid=${number}:+${number}`,
      'item1.X-ABLabel:Administrateur',
      `X-WA-BOT:${ctx.settings.botName}`,
      'END:VCARD',
    ].join('\n');

    await ctx.send({
      contacts: { displayName: name, contacts: [{ vcard }] },
    });

    await ctx.reply(`👑 Administrateur : *${name}*\n📱 +${number}`);
  },
};
