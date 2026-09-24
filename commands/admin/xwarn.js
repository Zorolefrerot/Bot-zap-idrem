'use strict';
/*
 * 🧬 MeR~NeL — commands/admin/xwarn.js  (v2)
 * Avertissement manuel (admin) — aligné sur le système anti-spam automatique :
 * seuil = 2 avertissements → exclusion automatique (comme le spam).
 */

module.exports = {
  name: 'xwarn',
  description: 'Avertit un membre (admin) — à 2 avertissements : exclusion auto',
  usage: 'Réponds à un message puis tape Xwarn | Xwarn list',
  category: 'admin',
  aliases: ['xavertir'],
  adminOnly: true,
  cooldownMs: 3000,
  run: async (ctx) => {
    const reply = ctx.event.messageReply;
    const mentions = ctx.event.mentions || {};
    const arg = (ctx.args[0] || '').toLowerCase();
    const warnLimit = ctx.config.spam.warnLimit;

    if (arg === 'list') {
      const targetID = String((reply && reply.senderID) || Object.keys(mentions)[0] || ctx.senderID);
      const u = ctx.economy.ensureUser(targetID);
      const banned = Boolean(u.banned);
      return ctx.send(
        ctx.fmt.frame('⚠️ XWARN', [
          `👤 ${ctx.fmt.bold(u.nickname || u.name || 'Membre')}`,
          `🚨 ${ctx.fmt.bold('Avertissements')} : ${ctx.fmt.boldNum(u.warnings)}/${ctx.fmt.boldNum(warnLimit)}`,
          banned ? '💀 ' + ctx.fmt.bold('Statut : EXCLU (ban bot actif)') : '🟢 ' + ctx.fmt.bold('Aucune exclusion'),
        ])
      );
    }

    const targetID = String((reply && reply.senderID) || Object.keys(mentions)[0] || '');
    if (!targetID) {
      return ctx.send(
        ctx.fmt.frame('⚠️ XWARN', '📌 ' + ctx.fmt.bold('Réponds au message du membre à avertir, puis tape Xwarn.'))
      );
    }
    if (targetID === ctx.adapter.botID || ctx.isAdmin(targetID)) {
      return ctx.send(ctx.fmt.frame('⚠️ XWARN', '⛔ ' + ctx.fmt.bold('Cible protégée.')));
    }

    const targetName = await ctx.getUserName(targetID);
    const target = ctx.economy.ensureUser(targetID, targetName);
    target.warnings += 1;
    const count = target.warnings;

    if (count >= warnLimit) {
      // Cohérence avec l'anti-spam auto : exclusion à warnLimit.
      target.warnings = 0;
      target.banned = true;
      target.bannedReason = 'warns';
      target.bannedAt = Date.now();
      ctx.db.users.save();
      ctx.db.bumpStat('warningsIssued');

      let kickedNote = '🔇 ' + ctx.fmt.bold('Exclusion appliquée côté bot : ses messages seront ignorés.');
      if (ctx.capabilities.removeUser) {
        try {
          await ctx.adapter.removeUser(targetID, ctx.threadID);
          kickedNote = '🚫 ' + ctx.fmt.bold('Le membre a été retiré du groupe par l’API.');
        } catch (_) { /* annoncé honnêtement */ }
      }
      return ctx.send(
        ctx.fmt.frame('💀 EXCLUSION', [
          `💀 ${ctx.fmt.bold(targetName)} — ${ctx.fmt.bold('ton comportement t’a conduit à ta perte. Bye bye.')}`,
          `🚨 ${ctx.fmt.bold('Avertissements')} : ${ctx.fmt.boldNum(warnLimit)}/${ctx.fmt.boldNum(warnLimit)}`,
          kickedNote,
        ])
      );
    }

    ctx.db.users.save();
    ctx.db.bumpStat('warningsIssued');
    await ctx.send(
      ctx.fmt.frame('⚠️ 𝗔𝗩𝗘𝗥𝗧𝗜𝗦𝗦𝗘𝗠𝗘𝗡𝗧', [
        `🎯 ${ctx.fmt.bold(targetName)} — ${ctx.fmt.bold('avertissement')} ${ctx.fmt.boldNum(count)}/${ctx.fmt.boldNum(warnLimit)}`,
        '💀 ' + ctx.fmt.bold(`Au prochain avertissement : exclusion automatique.`),
      ])
    );
  },
};
