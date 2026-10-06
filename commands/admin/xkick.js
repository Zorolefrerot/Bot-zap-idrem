'use strict';
/*
 * 🧬 MeR~NeL — commands/admin/xkick.js
 * Expulsion d'un membre via l'API — si (et seulement si) la plateforme
 * le permet. Sinon : message clair, aucune réussite simulée.
 */

module.exports = {
  name: 'xkick',
  description: 'Expulse le membre cité (admin)',
  usage: 'Réponds à un message puis tape Xkick',
  category: 'admin',
  aliases: ['xexpulser'],
  adminOnly: true,
  cooldownMs: 3000,
  run: async (ctx) => {
    if (!ctx.isGroup) {
      return ctx.send(ctx.fmt.frame('🥾 XKICK', '⚠️ ' + ctx.fmt.bold('À utiliser dans un groupe.')));
    }
    if (!ctx.capabilities.removeUser) {
      return ctx.send(
        ctx.fmt.frame('🥾 XKIND — INDISPONIBLE', [
          'ℹ️ ' + ctx.fmt.bold('L’API Messenger utilisée ne permet pas d’expulser des membres.'),
          '🛡️ ' + ctx.fmt.bold('Alternative : Xban applique un bannissement côté bot (membre ignoré).'),
        ])
      );
    }
    const reply = ctx.event.messageReply;
    const mentions = ctx.event.mentions || {};
    const targetID = String((reply && reply.senderID) || Object.keys(mentions)[0] || '');
    if (!targetID) {
      return ctx.send(ctx.fmt.frame('🥾 XKICK', '📌 ' + ctx.fmt.bold('Réponds au message du membre à expulser, puis tape Xkick.')));
    }
    if (targetID === ctx.adapter.botID || ctx.isAdmin(targetID)) {
      return ctx.send(ctx.fmt.frame('🥾 XKICK', '⛔ ' + ctx.fmt.bold('Cible protégée.')));
    }
    const targetName = await ctx.getUserName(targetID);
    try {
      await ctx.adapter.removeUser(targetID, ctx.threadID);
      ctx.db.bumpStat('kicksIssued');
      await ctx.send(
        ctx.fmt.frame('🥾 XKICK', [
          `🚪 ${ctx.fmt.bold(targetName)} ${ctx.fmt.bold('a été retiré du groupe.')}`,
          '⚡ ' + ctx.fmt.pick(['Le groupe respire à nouveau.', 'Ordre rétabli.', 'Le système veille.']),
        ])
      );
    } catch (err) {
      await ctx.send(
        ctx.fmt.frame('🥾 XKICK — ÉCHEC', [
          'ℹ️ ' + ctx.fmt.bold('Facebook a refusé l’expulsion (permissions insuffisantes).'),
          `🧾 ${ctx.fmt.bold('CODE')} : ${ctx.fmt.bold(String(err.code || 'FB_REMOVE_FAILED').toUpperCase())}`,
        ])
      );
    }
  },
};
