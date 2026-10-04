'use strict';
/*
 * 🧬 MeR~NeL — commands/games/xbet.js
 * Xbet — paris sur des matchs de football RÉELS (carte triée, cotes affichées,
 * puissances JAMAIS montrées). Résultat poussé TOUT SEUL 30 s après le pari :
 * somme gagnée/perdue + nouveau solde.
 *   Xbet                                → les 10 affrontements de la manche
 *   Xbet 15 a v 50  → match n°15, équipe a, victoire, mise 50 XCoins
 *   <n°> <a|b> <v|n|d> <mise> — v victoire · n nul · d défaite
 *   Minimum 100 XCoins · 1 pari par match · résultat 30 s après le pari.
 */

const { MIN_MISE, BET_DELAY_MS } = require('../../systems/xbet');

module.exports = {
  name: 'xbet',
  description: 'Paris football — 10 affrontements réels par manche (XCoins)',
  usage: 'Xbet · Xbet <n°> <a|b> <v|n|d> <mise>',
  category: 'games',
  aliases: ['xparis', 'xparis-sportifs'],
  adminOnly: false,
  cooldownMs: 3000,
  run: async (ctx) => {
    await ctx.bot.bets.sweep(ctx.threadID); // rattrape les paris tombés pendant une pause

    /* ── Pari complet : Xbet <n°> <a|b> <v|n|d> <mise> ── */
    if (ctx.args.length >= 4) {
      const [no, side, outcome, miseRaw] = ctx.args;
      const mise = Number(String(miseRaw).replace(/\s/g, ''));
      const user = ctx.db.ensureUser(ctx.senderID);
      if (!Number.isInteger(mise) || mise < MIN_MISE) {
        return ctx.send(ctx.fmt.frame('⚽ XBET', `⚠️ ${ctx.fmt.bold('Mise minimum')} : ${ctx.fmt.bold(MIN_MISE + ' XCoins')}.`));
      }
      if (user.xcoins < mise) {
        return ctx.send(
          ctx.fmt.frame('⚽ XBET', `💸 ${ctx.fmt.bold('Solde insuffisant')} — tu as ${ctx.fmt.bold(user.xcoins.toLocaleString('fr-FR') + ' XCoins')}.` +
            '\n💡 Gagne des XCoins : Xdaily · Xquiz · Xduel')
        );
      }
      const res = ctx.bot.bets.placeBet(ctx.threadID, ctx.senderID, no, String(side).toLowerCase(), String(outcome).toLowerCase(), mise);
      if (!res.ok) return ctx.send(ctx.fmt.frame('⚽ XBET', res.message));

      // Débit immédiat de la mise (remboursée ×cote si gagnée).
      user.xcoins -= mise;
      ctx.db.users.save();

      const b = res.bet;
      await ctx.send(
        ctx.fmt.frame('🎲 XBET — PARI ENREGISTRÉ', [
          `⚽ ${ctx.fmt.bold(b.matchLabel)}`,
          `🎯 ${ctx.fmt.bold(b.team)} — ${ctx.fmt.bold(b.outcome.toUpperCase())} (cote ×${ctx.fmt.bold(b.odds)})`,
          `💰 ${ctx.fmt.bold('Mise')} : ${ctx.fmt.bold(mise.toLocaleString('fr-FR') + ' XCoins')}`,
          `⏱️ ${ctx.fmt.bold('Résultat dans 30 secondes…')}`,
        ])
      );
      return;
    }

    /* ── Sans arguments : afficher la manche ── */
    const card = ctx.bot.bets.getCard(ctx.threadID);
    const lines = [
      `🔥 ${ctx.fmt.bold('10 AFFRONTEMENTS')} — parie sur un !`,
      `📌 ${ctx.fmt.bold('Format')} : ${ctx.fmt.bold('Xbet <n°> <a|b> <v|n|d> <mise>')}`,
      '   a/b = équipe · v = victoire · n = nul · d = défaite',
      `   min ${MIN_MISE} XCoins · 1 pari/match · résultat ${BET_DELAY_MS / 1000} s`,
      '',
    ];
    /* Carte PROPRE : numérotée, triée (grosses affiches d'abord), cotes
     * affichées — les puissances internes ne sont JAMAIS montrées. */
    card.forEach((m, i) => {
      const tag = m.taken ? ' ✅' : '';
      lines.push(`${ctx.fmt.bold(String(i + 1) + '.')} ${ctx.fmt.bold(m.a[0])} 🆚 ${ctx.fmt.bold(m.b[0])}${tag}`);
      lines.push(`    ${ctx.fmt.bold('×' + m.odds.vA)}   ·   nul ×${m.odds.nul}   ·   ${ctx.fmt.bold('×' + m.odds.vB)}`);
    });
    lines.push('');
    lines.push(`🎯 ${ctx.fmt.bold('Cotes')} = ton gain par XCoin misé (×1.6 → 100 ⇒ 160).`);
    lines.push(`⚡ ${ctx.fmt.bold('Le résultat tombe TOUT SEUL 30 s après ton pari')} — gain + solde.`);

    await ctx.send(ctx.fmt.frame('⚽ XBET — MANCHE', lines));
  },
};
