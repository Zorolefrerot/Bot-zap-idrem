'use strict';
/*
 * 🧬 MeR~NeL — commands/admin/xadmin.js
 * Xadmin — les admins SUPRÊMES (config) nomment des admins supplémentaires.
 * Les admins nommés obtiennent tous les pouvoirs admin SAUF Xadmin/Xremove :
 * la hiérarchie ne se délègue pas (superOnly). Persistant (JSON + Neon).
 */

module.exports = {
  name: 'xadmin',
  description: 'Admins suprêmes : nommer un admin (les nommés ne peuvent PAS utiliser cette commande)',
  usage: 'Xadmin @membre · Xadmin liste',
  category: 'admin',
  aliases: ['xpromote', 'xpromouvoir'],
  adminOnly: true,
  superOnly: true, // 🔒 même les admins nommés ne peuvent pas l'utiliser
  cooldownMs: 2000,
  run: async (ctx) => {
    const mentions = Object.keys(ctx.event.mentions || {}).map(String);
    const replySender = ctx.event.messageReply && ctx.event.messageReply.senderID;
    const arg = (ctx.args[0] || '').toLowerCase();

    /* 📜 Liste des admins nommés */
    if (arg === 'liste' || arg === 'list') {
      const list = ctx.db.namedAdmins();
      if (!list.length) {
        return ctx.send(
          ctx.fmt.frame('🛡️ ADMINS NOMMÉS', [
            '📭 ' + ctx.fmt.bold('Aucun admin nommé.') + ' Utilise ' + ctx.fmt.bold('Xadmin @membre') + '.',
          ])
        );
      }
      const lines = [];
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        const name = (await ctx.getUserName(e.uid)) || e.name || e.uid;
        const when = e.at ? new Date(e.at).toLocaleDateString('fr-FR') : '';
        lines.push(`${ctx.fmt.boldNum(i + 1)}. ${ctx.fmt.bold(name)}${when ? ' — 📅 ' + when : ''}`);
      }
      lines.push('', '🔒 ' + ctx.fmt.bold('Les nommés ne peuvent pas nommer ni retirer.'));
      return ctx.send(ctx.fmt.frame(`🛡️ ADMINS NOMMÉS — ${list.length}`, lines));
    }

    /* 🎯 Cibles : mentions, sinon message RéPONDU */
    const targets = mentions.slice();
    if (!targets.length && replySender) targets.push(String(replySender));
    if (!targets.length) {
      return ctx.send(
        ctx.fmt.frame('🛡️ XADMIN', [
          '📌 ' + ctx.fmt.bold('Nommer') + ' : ' + ctx.fmt.bold('Xadmin @membre') + ' (ou réponds à son message).',
          '📜 ' + ctx.fmt.bold('Liste') + ' : ' + ctx.fmt.bold('Xadmin liste'),
          '',
          '⚖️ ' + ctx.fmt.bold('L\u2019admin nommé a tous les pouvoirs SAUF Xadmin/Xremove.'),
        ])
      );
    }

    const lines = [];
    for (const uid of targets) {
      const name = (await ctx.getUserName(uid)) || 'Membre';
      if (ctx.isSuperAdmin(uid)) {
        lines.push('👑 ' + ctx.fmt.bold(name) + ' est déjà admin SUPRÊME.');
        continue;
      }
      if (ctx.isNamedAdmin(uid)) {
        lines.push('⚖️ ' + ctx.fmt.bold(name) + ' est déjà admin.');
        continue;
      }
      ctx.db.addNamedAdmin(uid, ctx.senderID, name);
      lines.push('✅ ' + ctx.fmt.bold(name) + ' est maintenant ' + ctx.fmt.bold('ADMIN') + '.');
    }
    lines.push('', '🛡️ ' + ctx.fmt.bold('Pouvoirs complets') + ' — sauf ' + ctx.fmt.bold('Xadmin/Xremove') + '.');
    await ctx.send(ctx.fmt.frame('🛡️ ADMIN NOMMÉ', lines));
  },
};
