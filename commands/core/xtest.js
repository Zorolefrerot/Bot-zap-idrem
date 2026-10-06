'use strict';
/*
 * 🧬 MeR~NeL — commands/core/xtest.js
 * Xtest — teste la messagerie EN PV : le bot envoie « Je suis présent ✅ »
 * directement dans la conversation privée de celui qui lance la commande.
 * (Où qu'il soit : groupe ou PV — le message part TOUJOURS en PV.)
 */

module.exports = {
  name: 'xtest',
  description: 'Test PV : le bot t\u2019envoie « Je suis présent ✅ » en privé',
  usage: 'Xtest',
  category: 'core',
  aliases: ['xping', 'xpv'],
  adminOnly: false,
  cooldownMs: 5000,
  run: async (ctx) => {
    try {
      /* Envoi DIRECT en PV : threadID = l'UID de l'utilisateur. */
      await ctx.bot.send(
        ctx.fmt.frame('🧪 XTEST', ['✅ ' + ctx.fmt.bold('Je suis présent') + ' — la messagerie privée fonctionne parfaitement !']),
        ctx.senderID
      );
      /* Confirmation discrète dans le groupe (sans le spammer). */
      if (ctx.isGroup) {
        await ctx.send(ctx.fmt.frame('🧪 XTEST', `📩 ${ctx.fmt.bold('Message envoyé en PV')} — va voir ta conversation avec moi !`));
      }
    } catch (err) {
      /* Jamais de crash : on explique proprement dans la conversation courante. */
      await ctx.send(
        ctx.fmt.frame('🧪 XTEST', [
          '⚠️ ' + ctx.fmt.bold('Impossible d\u2019écrire en PV pour l\u2019instant.'),
          '💡 ' + ctx.fmt.bold('Ouvre d\u2019abord ta conversation avec moi') + ' (envoie-moi un message en privé), puis réessaie.',
          `🧾 ${ctx.fmt.bold('CODE')} : ${ctx.fmt.bold(String((err && err.code) || 'PV_SEND_FAILED').toUpperCase())}`,
        ])
      );
    }
  },
};
