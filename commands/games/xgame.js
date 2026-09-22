'use strict';
/*
 * 🧬 MeR~NeL — commands/games/xgame.js
 * Catalogue de jeux — registre extensible pour les futurs ajouts.
 */

/* Registre extensible : ajouter une entrée ici pour référencer un futur jeu. */
const GAMES = [
  { label: '𝗫𝗾𝘂𝗶𝘇', command: 'xquiz', available: true, hint: 'Quiz solo — ID / MULTIVERS / CG' },
  { label: '𝗫𝗱𝘂𝗲𝗹', command: 'xduel', available: true, hint: 'Duel 1v1 avec mise' },
  { label: '𝗫𝗿𝗼𝘂𝗹𝗲𝘁𝘁𝗲', command: null, available: false, hint: 'Bientôt disponible…' },
  { label: '𝗫𝗽𝗲𝗻𝗱𝘂', command: null, available: false, hint: 'Bientôt disponible…' },
];

module.exports = {
  name: 'xgame',
  description: 'Liste des jeux disponibles',
  usage: 'Xgame',
  category: 'games',
  aliases: ['xgames', 'xjeux'],
  adminOnly: false,
  cooldownMs: 4000,
  run: async (ctx) => {
    const lines = GAMES.map((g) =>
      g.available ? `▸ ${ctx.fmt.bold(g.label)} — ${g.hint}` : `▸ ${ctx.fmt.bold(g.label)} — ${ctx.fmt.bold(g.hint)}`
    );
    lines.push('', '🎲 ' + ctx.fmt.bold('D’autres jeux arrivent dans une prochaine mise à jour.'));
    await ctx.send(ctx.fmt.frame('🎮 𝗠𝗘𝗥~𝗡𝗘𝗟 𝗚𝗔𝗠𝗘𝗦', lines));
  },
};
