'use strict';
/*
 * 🧬 MeR~NeL — commands/games/xcourse.js
 * Xcourse 🏇 — course de chevaux : parie sur l'un des 4, gain ×3.5.
 *   Xcourse 2 100   → pari sur le cheval n°2, mise 100 XCoins
 */

const HORSES = [
  ['Éclair', '⚡'],
  ['Tornade', '🌪️'],
  ['Tonnerre', '🌩️'],
  ['Comète', '☄️'],
];
const MIN_MISE = 50;
const ODDS = 3.5;

module.exports = {
  name: 'xcourse',
  description: 'Course de chevaux 🏇 — pari sur 1 des 4, gain ×3.5',
  usage: 'Xcourse <n° 1-4> <mise>',
  category: 'games',
  aliases: ['xchevaux', 'xhipique'],
  adminOnly: false,
  cooldownMs: 5000,
  run: async (ctx) => {
    const rng = ctx._rng || Math.random;
    const pickNo = Number(String(ctx.args[0] || '').replace(/\s/g, ''));
    const mise = Number(String(ctx.args[1] || '').replace(/\s/g, ''));

    if (!Number.isInteger(pickNo) || pickNo < 1 || pickNo > 4 || !Number.isInteger(mise) || mise < MIN_MISE) {
      return ctx.send(
        ctx.fmt.frame('🏇 XCOURSE', [
          '📌 ' + ctx.fmt.bold('Format') + ' : ' + ctx.fmt.bold('Xcourse <n° 1-4> <mise>'),
          ...HORSES.map((h, i) => `${h[1]} ${ctx.fmt.bold(String(i + 1) + '.')} ${ctx.fmt.bold(h[0])}`),
          `💰 ${ctx.fmt.bold('Mise minimum')} : ${ctx.fmt.bold('50 XCoins')} — ${ctx.fmt.bold(`gain ×${ODDS}`)}`,
          '📌 ' + ctx.fmt.bold('Exemple') + ' : ' + ctx.fmt.bold('Xcourse 2 100'),
        ])
      );
    }
    const user = ctx.db.ensureUser(ctx.senderID);
    if (user.xcoins < mise) {
      return ctx.send(ctx.fmt.frame('🏇 XCOURSE', `💸 ${ctx.fmt.bold('Solde insuffisant')} — tu as ${ctx.fmt.bold(user.xcoins.toLocaleString('fr-FR') + ' XCoins')}.`));
    }

    ctx.economy.spend(ctx.senderID, mise);

    // Départ lancé… positions décoratives + vainqueur pondéré équiprobable.
    const winner = Math.floor(rng() * 4);
    const order = [0, 1, 2, 3].sort(() => rng() - 0.5);
    order.splice(order.indexOf(winner), 1);
    order.unshift(winner); // le vainqueur premier

    const gain = win0();
    function win0() {
      return winner === pickNo - 1 ? Math.round(mise * ODDS) : 0;
    }

    let solde = ctx.economy.getBalance(ctx.senderID);
    if (gain > 0) solde = ctx.economy.addCoins(ctx.senderID, gain);
    ctx.db.bumpStat('gamesPlayed', 1);

    const track = order.map((idx, pos) => {
      const [name, emo] = HORSES[idx];
      const lane = '＿'.repeat(3 - pos) + '️' ;
      const icon = pos === 0 ? '🏆' : pos === 1 ? '🥈' : pos === 2 ? '🥉' : '4️⃣';
      return `${icon} ${emo} ${ctx.fmt.bold(name)}`;
    });

    await ctx.send(
      ctx.fmt.frame(gain > 0 ? '🏇 XCOURSE — GAGNÉ !' : '🏇 XCOURSE — PERDU', [
        ...track,
        '',
        `🎯 ${ctx.fmt.bold('Ton cheval')} : ${ctx.fmt.bold(String(pickNo) + '. ' + HORSES[pickNo - 1][0])} ${HORSES[pickNo - 1][1]}`,
        win()
          ? `🎉 ${ctx.fmt.bold('Arrivée gagnante !')} +${ctx.fmt.bold(gain.toLocaleString('fr-FR'))} XCoins (×${ODDS})`
          : `💀 ${ctx.fmt.bold('Ton cheval a visé le sniff…')} — ${ctx.fmt.bold(mise.toLocaleString('fr-FR'))} XCoins perdus`,
        `💳 ${ctx.fmt.bold('Solde')} : ${ctx.fmt.bold(solde.toLocaleString('fr-FR') + ' XCoins')}`,
      ])
    );

    function win() {
      return gain > 0;
    }
  },
};
