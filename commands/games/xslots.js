'use strict';
/*
 * 🧬 MeR~NeL — commands/games/xslots.js
 * Xslots 🎰 — machine à sous : mise, 3 rouleaux, gros gains possibles.
 *   Xslots 200   → mise 200 XCoins
 *   3 × 💎 = ×25 · 3 × 7️⃣ = ×18 · 3 × ⭐ = ×12 · 3 × 🍇 = ×8 · 3 × 🍋 = ×6 · 3 × 🍒 = ×4
 *   2 symboles identiques = ×2 — rien ne se perd côté sauvegarde (XCoins).
 */

const SYMBOLS = [
  ['🍒', 4],
  ['🍋', 6],
  ['🍇', 8],
  ['⭐', 12],
  ['7️⃣', 18],
  ['💎', 25],
];
const MIN_MISE = 50;

module.exports = {
  name: 'xslots',
  description: 'Machine à sous 🎰 — mise min 50 XCoins, jusqu’à ×25',
  usage: 'Xslots <mise>',
  category: 'games',
  aliases: ['xmachinesous', 'xcasino'],
  adminOnly: false,
  cooldownMs: 4000,
  run: async (ctx) => {
    const rng = ctx._rng || Math.random;
    const mise = Number(String(ctx.args[0] || '').replace(/\s/g, ''));
    if (!Number.isInteger(mise) || mise < MIN_MISE) {
      return ctx.send(ctx.fmt.frame('🎰 XSLOTS', `⚠️ ${ctx.fmt.bold('Mise minimum')} : ${ctx.fmt.bold(MIN_MISE + ' XCoins')}.\n📌 ${ctx.fmt.bold('Exemple')} : ${ctx.fmt.bold('Xslots 100')}`));
    }
    const user = ctx.db.ensureUser(ctx.senderID);
    if (user.xcoins < mise) {
      return ctx.send(ctx.fmt.frame('🎰 XSLOTS', `💸 ${ctx.fmt.bold('Solde insuffisant')} — tu as ${ctx.fmt.bold(user.xcoins.toLocaleString('fr-FR') + ' XCoins')}.\n💡 Gagne des XCoins : Xdaily · Xquiz · Xbet`));
    }

    ctx.economy.spend(ctx.senderID, mise);

    const a = SYMBOLS[Math.floor(rng() * SYMBOLS.length)];
    const b = SYMBOLS[Math.floor(rng() * SYMBOLS.length)];
    const c = SYMBOLS[Math.floor(rng() * SYMBOLS.length)];

    let gain = 0;
    let line;
    if (a[0] === b[0] && b[0] === c[0]) {
      gain = mise * a[1];
      line = ctx.fmt.pick(['💥 JACKPOT !', '🏆 MACHINE EN FEU !', '🔥 TRIPLE !']);
    } else if (a[0] === b[0] || b[0] === c[0] || a[0] === c[0]) {
      gain = mise * 2;
      line = '✨ Paire — mise doublée !';
    } else {
      line = ctx.fmt.pick(['😌 Pas de chance, retente !', '💨 Presque…', '🎯 La prochaine est la bonne.']);
    }

    let solde = ctx.economy.getBalance(ctx.senderID);
    if (gain > 0) solde = ctx.economy.addCoins(ctx.senderID, gain);
    ctx.db.bumpStat('gamesPlayed', 1);

    await ctx.send(
      ctx.fmt.frame(gain > 0 ? `🎰 XSLOTS — GAGNÉ +${gain.toLocaleString('fr-FR')}` : '🎰 XSLOTS — PERDU', [
        `╭─────┬─────┬─────╮`,
        `│  ${a[0]}  │  ${b[0]}  │  ${c[0]}  │`,
        `╰─────┴─────┴─────╯`,
        '',
        `${line}`,
        `💰 ${ctx.fmt.bold('Mise')} : ${ctx.fmt.bold(mise.toLocaleString('fr-FR') + ' XCoins')}` +
          (gain > 0 ? ` — ${ctx.fmt.bold('Gain')} : ${ctx.fmt.bold((gain + mise).toLocaleString('fr-FR'))}` : ''),
        `💳 ${ctx.fmt.bold('Solde')} : ${ctx.fmt.bold(solde.toLocaleString('fr-FR') + ' XCoins')}`,
      ])
    );
  },
};
