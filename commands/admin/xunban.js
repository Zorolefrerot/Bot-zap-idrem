'use strict';
/*
 * 🧬 MeR~NeL — commands/admin/xunban.js
 * Lève le bannissement côté bot posé par Xban.
 */

module.exports = {
  name: 'xunban',
  description: 'Lève le bannissement bot d’un membre (admin)',
  usage: 'Xunban @membre | Xunban <UID>',
  category: 'admin',
  aliases: ['xpardon', 'xdebannir'],
  adminOnly: true,
  cooldownMs: 3000,
  run: async (ctx) => {
    const mentions = ctx.event.mentions || {};
    const reply = ctx.event.messageReply;
    let targetID = String((reply && reply.senderID) || Object.keys(mentions)[0] || '');
    if (!targetID && ctx.args[0]) {
      targetID = (ctx.args[0] || '').replace(/\D/g, '');
    }
    if (!targetID) {
      return ctx.send(
        ctx.fmt.frame('🕊️ XUNBAN', '📌 ' + ctx.fmt.bold('Taggue le membre à rétablir, réponds à son message, ou donne son UID.'))
      );
    }
    const target = ctx.db.getUser(targetID);
    if (!target || !target.banned) {
      return ctx.send(ctx.fmt.frame('🕊️ XUNBAN', 'ℹ️ ' + ctx.fmt.bold('Ce membre n’est pas banni.')));
    }
    target.banned = false;
    target.bannedBy = null;
    target.bannedAt = null;
    ctx.antiSpam.unmute(targetID);
    ctx.db.users.save();
    const name = await ctx.getUserName(targetID);
    await ctx.send(
      ctx.fmt.frame('🕊️ 𝗫𝗨𝗡𝗕𝗔𝗡', [
        `✅ ${ctx.fmt.bold(name)} ${ctx.fmt.bold('est rétabli.')}`,
        '⚡ ' + ctx.fmt.pick(['Le système efface son dossier.', 'Seconde chance accordée.', 'Que cette clémence soit instructive.']),
      ])
    );
  },
};
