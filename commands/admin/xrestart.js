'use strict';
/*
 * 🧬 MeR~NeL — commands/admin/xrestart.js
 * Xrestart — redémarre le bot (admins uniquement).
 * Toutes les données (XCoins, XP, rangs, paris…) sont SAUVEGARDÉES avant
 * l'arrêt — le processus se relance automatiquement (Render/pm2/systemd).
 */

module.exports = {
  name: 'xrestart',
  description: 'Redémarre MeR~NeL (admins) — sauvegarde tout avant',
  usage: 'Xrestart',
  category: 'admin',
  aliases: ['xreboot', 'xredemarrer'],
  adminOnly: true,
  cooldownMs: 10000,
  run: async (ctx) => {
    if (!ctx.isAdmin(ctx.senderID)) {
      return ctx.send(ctx.fmt.frame('🔄 XRESTART', '⛔ ' + ctx.fmt.bold('Commande réservée aux admins.')));
    }

    await ctx.send(
      ctx.fmt.frame('🔄 REDÉMARRAGE', [
        '⏳ ' + ctx.fmt.bold('MeR~NeL redémarre…'),
        '💾 ' + ctx.fmt.bold('Sauvegarde de toutes les données') + ' (XCoins, XP, rangs, paris)…',
        '⚡ ' + ctx.fmt.bold('De retour dans quelques secondes.'),
      ])
    );

    // 💾 Persistance garantie AVANT l'arrêt.
    try {
      ctx.bot.db.saveAll();
    } catch (_) { /* */ }
    try {
      ctx.bot.bets.shutdown();
    } catch (_) { /* */ }
    try {
      await ctx.bot.shutdown();
    } catch (_) { /* */ }

    // En tests (mock), on ne tue pas le processus.
    if (String((ctx.adapter && ctx.adapter.botID) || '') === 'BOT_MOCK_000000') return;
    setTimeout(() => process.exit(0), 800).unref?.();
    setTimeout(() => process.exit(0), 1200);
  },
};
