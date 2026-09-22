'use strict';
/*
 * 🧬 MeR~NeL — commands/admin/xadd.js
 * Ajout d'un membre au groupe : Xadd @Paul / Xadd <UID>.
 * Le résultat réel de l'API est toujours affiché tel quel.
 */

const { safeUid } = require('../../utils/sanitize');

module.exports = {
  name: 'xadd',
  description: 'Ajoute un membre au groupe (admin)',
  usage: 'Xadd @Paul | Xadd <UID>',
  category: 'admin',
  aliases: ['xinvite'],
  adminOnly: true,
  cooldownMs: 5000,
  run: async (ctx) => {
    if (!ctx.isGroup) {
      return ctx.send(ctx.fmt.frame('➕ XADD', '⚠️ ' + ctx.fmt.bold('À utiliser dans un groupe.')));
    }
    const mentions = ctx.event.mentions || {};
    const reply = ctx.event.messageReply;
    let targetID = String((reply && reply.senderID) || Object.keys(mentions)[0] || '');
    if (!targetID && ctx.args[0]) {
      targetID = safeUid(ctx.args[0]) || '';
      if (!targetID) {
        return ctx.send(ctx.fmt.frame('➕ XADD', '⚠️ ' + ctx.fmt.bold('UID invalide.') + ' ' + ctx.fmt.bold('Format attendu : chiffres uniquement.')));
      }
    }
    if (!targetID) {
      return ctx.send(ctx.fmt.frame('➕ XADD', `📌 ${ctx.fmt.bold('Usage')} : ${ctx.fmt.bold('Xadd @Paul')} ${ctx.fmt.bold('ou')} ${ctx.fmt.bold('Xadd <UID>')}`));
    }
    if (targetID === ctx.adapter.botID) {
      return ctx.send(ctx.fmt.frame('➕ XADD', '🤖 ' + ctx.fmt.bold('Je suis déjà dans la conversation.')));
    }
    if (!ctx.capabilities.addUser) {
      return ctx.send(
        ctx.fmt.frame('➕ XADD — INDISPONIBLE', 'ℹ️ ' + ctx.fmt.bold('L’API utilisée ne permet pas d’ajouter des membres.'))
      );
    }
    try {
      await ctx.adapter.addUser(targetID, ctx.threadID);
      ctx.db.bumpStat('addsIssued');
      await ctx.send(ctx.fmt.frame('➕ XADD', `✅ ${ctx.fmt.bold('Demande d’ajout transmise à Messenger.')}`));
    } catch (err) {
      const known = /already|participant/i.test(err.message || '') ? 'Ce membre fait déjà partie du groupe.' : 'Facebook a refusé l’ajout.';
      await ctx.send(
        ctx.fmt.frame('➕ XADD — ÉCHEC', [
          `ℹ️ ${ctx.fmt.bold(known)}`,
          `🧾 ${ctx.fmt.bold('CODE')} : ${ctx.fmt.bold(String(err.code || 'FB_ADD_FAILED').toUpperCase())}`,
        ])
      );
    }
  },
};
