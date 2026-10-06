'use strict';
/*
 * 🧬 MeR~NeL — commands/admin/xremove.js
 * Xremove — les admins SUPRÊMES retirent le rôle admin à un admin nommé.
 * Les admins suprêmes (config) sont intouchables. superOnly : un admin
 * nommé ne peut PAS retirer un autre admin. Persistant (JSON + Neon).
 */

module.exports = {
  name: 'xremove',
  description: 'Admins suprêmes : retirer le rôle admin à un admin nommé',
  usage: 'Xremove @membre · Xremove tout',
  category: 'admin',
  aliases: ['xdemote', 'xretirer'],
  adminOnly: true,
  superOnly: true, // 🔒 même les admins nommés ne peuvent pas l'utiliser
  cooldownMs: 2000,
  run: async (ctx) => {
    const mentions = Object.keys(ctx.event.mentions || {}).map(String);
    const replySender = ctx.event.messageReply && ctx.event.messageReply.senderID;
    const arg = (ctx.args[0] || '').toLowerCase();

    /* 🧹 Tout retirer */
    if (arg === 'tout' || arg === 'all') {
      const list = ctx.db.namedAdmins();
      if (!list.length) {
        return ctx.send(
          ctx.fmt.frame('🛡️ XREMOVE', ['📭 ' + ctx.fmt.bold('Aucun admin nommé à retirer.')])
        );
      }
      for (const e of list) ctx.db.removeNamedAdmin(e.uid);
      return ctx.send(
        ctx.fmt.frame('🛡️ ADMINS RETIRÉS', [
          `🧹 ${ctx.fmt.bold(String(list.length))} ${list.length > 1 ? 'admins nommés retirés' : 'admin nommé retiré'}.`,
        ])
      );
    }

    /* 🎯 Cibles : mentions, sinon message RéPONDU */
    const targets = mentions.slice();
    if (!targets.length && replySender) targets.push(String(replySender));
    if (!targets.length) {
      return ctx.send(
        ctx.fmt.frame('🛡️ XREMOVE', [
          '📌 ' + ctx.fmt.bold('Retirer') + ' : ' + ctx.fmt.bold('Xremove @membre') + ' (ou réponds à son message).',
          '🧹 ' + ctx.fmt.bold('Tout retirer') + ' : ' + ctx.fmt.bold('Xremove tout'),
        ])
      );
    }

    const lines = [];
    for (const uid of targets) {
      const name = (await ctx.getUserName(uid)) || 'Membre';
      if (ctx.isSuperAdmin(uid)) {
        lines.push('👑 ' + ctx.fmt.bold(name) + ' est admin SUPRÊME — intouchable.');
        continue;
      }
      if (!ctx.isNamedAdmin(uid)) {
        lines.push('❓ ' + ctx.fmt.bold(name) + ' n\u2019est pas admin.');
        continue;
      }
      ctx.db.removeNamedAdmin(uid);
      lines.push('🚮 ' + ctx.fmt.bold(name) + ' n\u2019est plus admin.');
    }
    await ctx.send(ctx.fmt.frame('🛡️ ADMIN RETIRÉ', lines));
  },
};
