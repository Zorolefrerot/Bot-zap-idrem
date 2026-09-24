'use strict';
/*
 * 🧬 MeR~NeL — commands/admin/xclear.js  (v2)
 * Messenger ne permet au bot de supprimer que SES PROPRES messages.
 * Usage :
 *   - Répondre à un message DU BOT puis Xclear → supprime celui-là ;
 *   - Xclear      → supprime le dernier message du bot ;
 *   - Xclear <n>  → supprime ses n derniers messages (max 10).
 * Le bot n'invente jamais un succès sur les messages des autres.
 */

module.exports = {
  name: 'xclear',
  description: 'Supprime les derniers messages du bot (1 à 10) — Messenger limite la suppression à ses propres messages',
  usage: 'Xclear [n] | répondre à un message du bot + Xclear',
  category: 'admin',
  aliases: ['xsweep'],
  adminOnly: true,
  cooldownMs: 3000,
  run: async (ctx) => {
    if (!ctx.capabilities.unsend) {
      return ctx.send(
        ctx.fmt.frame('🧹 XCLEAR — INDISPONIBLE', 'ℹ️ ' + ctx.fmt.bold('L’API utilisée ne supporte pas la suppression de messages.'))
      );
    }

    const botID = String(ctx.adapter.botID || '');
    const reply = ctx.event.messageReply;
    const log = ctx.bot.sentLog.get(String(ctx.threadID)) || [];

    let targets = [];

    /* Cas 1 : réponse à un message du bot → supprimer celui-là. */
    if (reply && reply.messageID && String(reply.senderID) === botID) {
      targets = [String(reply.messageID)];
    } else {
      /* Cas 2 : n derniers messages du bot (défaut 1). */
      const { safeInt } = require('../../utils/sanitize');
      let n = safeInt(ctx.args[0], { min: 1, max: 10 });
      if (reply && String(reply.senderID) !== botID && reply.messageID) {
        // L'admin a répondu à un message d'un AUTRE utilisateur → on l'informe
        // de la limite Messenger et on supprime le dernier message du bot.
        n = Math.max(1, n || 1);
      }
      n = n || 1;
      targets = log.slice(-n).reverse();
    }

    if (targets.length === 0) {
      return ctx.send(
        ctx.fmt.frame('🧹 XCLEAR', [
          'ℹ️ ' + ctx.fmt.bold('Aucun message du bot à supprimer dans cette conversation.'),
          '📌 ' + ctx.fmt.bold('Usage') + ' : ' + ctx.fmt.bold('Xclear') + ' (dernier message) · ' + ctx.fmt.bold('Xclear 3') + ' (les 3 derniers)',
        ])
      );
    }

    let ok = 0;
    let fail = 0;
    for (const messageID of targets) {
      try {
        await ctx.adapter.unsend(messageID);
        ok++;
        // Retirer du journal
        const idx = log.indexOf(messageID);
        if (idx >= 0) log.splice(idx, 1);
      } catch (err) {
        fail++;
        ctx.logger.warn('[xclear] unsend:', err.message);
      }
    }
    ctx.bot.sentLog.set(String(ctx.threadID), log);
    ctx.db.bumpStat('messagesCleared', ok);

    if (ok > 0 && fail === 0) {
      await ctx.send(
        ctx.fmt.frame('🧹 XCLEAR', ctx.fmt.pick([
          `✅ ${ctx.fmt.bold('Nettoyage effectué')} — ${ctx.fmt.boldNum(ok)} ${ctx.fmt.bold(ok > 1 ? 'messages supprimés.' : 'message supprimé.')}`,
          `🧹 ${ctx.fmt.boldNum(ok)} ${ctx.fmt.bold('message(s) du bot effacé(s).')}`,
          `✨ ${ctx.fmt.bold('Zone propre.')} (${ctx.fmt.boldNum(ok)})`,
        ]))
      );
    } else if (ok > 0) {
      await ctx.send(
        ctx.fmt.frame('🧹 XCLEAR', `✅ ${ctx.fmt.boldNum(ok)} ${ctx.fmt.bold('supprimé(s)')} — ⚠️ ${ctx.fmt.boldNum(fail)} ${ctx.fmt.bold('déjà inaccessible(s).')}`)
      );
    } else {
      await ctx.send(
        ctx.fmt.frame('🧹 XCLEAR — LIMITATION', [
          'ℹ️ ' + ctx.fmt.bold('Messenger ne permet au bot de retirer que ses propres messages.'),
          `🧾 ${ctx.fmt.bold('CODE')} : ${ctx.fmt.bold('FB_UNSEND_FAILED')}`,
        ])
      );
    }
  },
};
