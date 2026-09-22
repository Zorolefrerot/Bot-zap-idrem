'use strict';
/*
 * 🧬 MeR~NeL — commands/admin/xclear.js
 * Suppression d'un message cité via unsend — limité par l'API aux
 * messages envoyés par le bot lui-même ; on l'affiche honnêtement.
 */

module.exports = {
  name: 'xclear',
  description: 'Supprime le message cité (si l’API le permet)',
  usage: 'Réponds à un message puis tape Xclear',
  category: 'admin',
  aliases: ['xsweep'],
  adminOnly: true,
  cooldownMs: 3000,
  run: async (ctx) => {
    const reply = ctx.event.messageReply;
    const messageID = reply && reply.messageID;
    if (!messageID) {
      return ctx.send(
        ctx.fmt.frame('🧹 XCLEAR', '📌 ' + ctx.fmt.bold('Réponds au message à supprimer, puis tape Xclear.'))
      );
    }
    if (!ctx.capabilities.unsend) {
      return ctx.send(
        ctx.fmt.frame('🧹 XCLEAR — INDISPONIBLE', 'ℹ️ ' + ctx.fmt.bold('L’API utilisée ne supporte pas la suppression de messages.'))
      );
    }
    try {
      await ctx.adapter.unsend(messageID);
      ctx.db.bumpStat('messagesCleared');
      await ctx.send(ctx.fmt.frame('🧹 XCLEAR', ctx.fmt.pick(['✅ ' + ctx.fmt.bold('Nettoyage effectué.'), '🧹 ' + ctx.fmt.bold('Message effacé du fil.'), '✨ ' + ctx.fmt.bold('Zone propre.')])));
    } catch (err) {
      // Messenger : unsend limité aux messages du bot.
      await ctx.send(
        ctx.fmt.frame('🧹 XCLEAR — LIMITATION', [
          'ℹ️ ' + ctx.fmt.bold('Messenger ne permet au bot de retirer que ses propres messages.'),
          '💡 ' + ctx.fmt.bold('Pour un abus : Xwarn ou Xban reste disponible.'),
          `🧾 ${ctx.fmt.bold('CODE')} : ${ctx.fmt.bold(String(err.code || 'FB_UNSEND_FAILED').toUpperCase())}`,
        ])
      );
    }
  },
};
