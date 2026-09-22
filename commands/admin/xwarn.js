'use strict';
/*
 * 🧬 MeR~NeL — commands/admin/xwarn.js
 * Avertissement : l'admin répond au message du membre concerné.
 * Au-delà de la limite → mute configuré (et honnête sur ses limites).
 */

const { humanDelay } = require('../../utils/cooldown');

module.exports = {
  name: 'xwarn',
  description: 'Avertit un membre (admin) — réponse au message ciblé',
  usage: 'Réponds à un message puis tape Xwarn | Xwarn list',
  category: 'admin',
  aliases: ['xavertir'],
  adminOnly: true,
  cooldownMs: 3000,
  run: async (ctx) => {
    const reply = ctx.event.messageReply;
    const mentions = ctx.event.mentions || {};
    const arg = (ctx.args[0] || '').toLowerCase();

    if (arg === 'list') {
      const targetID = String((reply && reply.senderID) || Object.keys(mentions)[0] || ctx.senderID);
      const u = ctx.economy.ensureUser(targetID);
      const muted = u.mutedUntil && u.mutedUntil > Date.now();
      return ctx.send(
        ctx.fmt.frame('⚠️ XWARN', [
          `👤 ${ctx.fmt.bold(u.nickname || u.name || 'Membre')}`,
          `🚨 ${ctx.fmt.bold('Avertissements')} : ${ctx.fmt.boldNum(u.warnings)}/${ctx.fmt.boldNum(ctx.config.spam.warnLimit)}`,
          muted ? `🔇 ${ctx.fmt.bold('Mute actif')} — ${ctx.fmt.bold(humanDelay(u.mutedUntil - Date.now()))}` : '🟢 ' + ctx.fmt.bold('Aucun mute actif'),
        ])
      );
    }

    const targetID = String((reply && reply.senderID) || Object.keys(mentions)[0] || '');
    if (!targetID) {
      return ctx.send(
        ctx.fmt.frame('⚠️ XWARN', '📌 ' + ctx.fmt.bold('Réponds au message du membre à avertir, puis tape Xwarn.'))
      );
    }
    if (ctx.isAdmin(targetID)) {
      return ctx.send(ctx.fmt.frame('⚠️ XWARN', '⛔ ' + ctx.fmt.bold('Impossible d’avertir un administrateur.')));
    }

    const targetName = await ctx.getUserName(targetID);
    const target = ctx.economy.ensureUser(targetID, targetName);
    target.warnings += 1;
    const count = target.warnings;
    let mutedLine = '';
    if (count >= ctx.config.spam.warnLimit) {
      target.mutedUntil = Date.now() + ctx.config.spam.muteMinutes * 60 * 1000;
      target.warnings = 0;
      mutedLine = `\n🔇 ${ctx.fmt.bold('LIMITE ATTEINTE — mode silence')} ${ctx.fmt.bold(humanDelay(ctx.config.spam.muteMinutes * 60 * 1000))}`;
    }
    ctx.db.users.save();
    ctx.db.bumpStat('warningsIssued');

    await ctx.send(
      ctx.fmt.frame('⚠️ 𝗔𝗩𝗘𝗥𝗧𝗜𝗦𝗦𝗘𝗠𝗘𝗡𝗧', [
        `🎯 ${ctx.fmt.bold(targetName)} — ${ctx.fmt.bold('avertissement')} ${ctx.fmt.boldNum(count)}/${ctx.fmt.boldNum(ctx.config.spam.warnLimit)}`,
        ctx.fmt.pick([
          '🛰️ ' + ctx.fmt.bold('Le système observe. La prochaine fois, il n’observera plus.'),
          '⚡ ' + ctx.fmt.bold('Reste calme, le groupe aussi.'),
          '🧬 ' + ctx.fmt.bold('Le dossier s’épaissit…'),
        ]) + mutedLine,
      ])
    );
  },
};
