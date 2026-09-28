'use strict';
/*
 * 🧬 MeR~NeL — commands/admin/xonlyadmin.js
 * Xonlyadmin on/off — mode « admins uniquement » : quand il est ON,
 * le bot n'obéit qu'aux admins (admins du BOT ou du groupe Facebook).
 * Les messages des autres membres sont ignorés silencieusement.
 */

module.exports = {
  name: 'xonlyadmin',
  description: 'Mode admins uniquement on/off',
  usage: 'Xonlyadmin on|off|status',
  category: 'admin',
  aliases: ['xonly-admin', 'xadminmode'],
  adminOnly: false, // check personnalisé : admin du BOT ou du GROUPE
  cooldownMs: 3000,
  run: async (ctx) => {
    if (!ctx.isGroup) {
      return ctx.send(ctx.fmt.frame('🔒 XONLYADMIN', '⚠️ ' + ctx.fmt.bold('Ce mode ne fonctionne que dans un groupe.')));
    }

    const isBotAdmin = ctx.isAdmin(ctx.senderID);
    const isGroupAdmin = await ctx.bot._isThreadAdmin(ctx.threadID, ctx.senderID);
    if (!isBotAdmin && !isGroupAdmin) {
      return ctx.send(ctx.fmt.frame('🔒 XONLYADMIN', '⛔ ' + ctx.fmt.bold('Réservé aux admins (bot ou groupe).')));
    }

    const group = ctx.db.ensureGroup(ctx.threadID);
    const arg = String(ctx.args[0] || '').toLowerCase();
    const turningOn = arg === 'on' ? true : arg === 'off' ? false : !group.onlyAdmin;

    group.onlyAdmin = turningOn;
    ctx.db.groups.saveNow();

    if (turningOn) {
      await ctx.send(
        ctx.fmt.frame('🔒 XONLYADMIN — ACTIVÉ', [
          '🛡️ ' + ctx.fmt.bold("Le bot n'obéit plus qu'aux ADMIN S."),
          '👤 ' + ctx.fmt.bold('Les messages des autres membres sont ignorés.'),
          '🔓 ' + ctx.fmt.bold('Pour désactiver') + ' : ' + ctx.fmt.bold('Xonlyadmin off'),
        ])
      );
    } else {
      await ctx.send(
        ctx.fmt.frame('🔒 XONLYADMIN — DÉSACTIVÉ', [
          '✅ ' + ctx.fmt.bold('Tout le monde peut de nouveau utiliser le bot.'),
          '🔒 ' + ctx.fmt.bold('Pour réactiver') + ' : ' + ctx.fmt.bold('Xonlyadmin on'),
        ])
      );
    }
  },
};
