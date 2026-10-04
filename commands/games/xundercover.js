'use strict';
/*
 * 🧬 MeR~NeL — commands/games/xundercover.js
 * Xundercover — Civils 🏛️ vs Undercover 🕵️ vs Mr. White ⚪.
 * Enrôlement 90 s (« moi ») — Go anticipé possible du lanceur (min 3)
 * → le lanceur colle le TID du QG (Xtid)
 * → les rôles de chacun y sont déposés (redistribution PV manuelle)
 * → indices 15 s/joueur
 * → vote 75 s → éliminations → victoire + « plus malin » + XCoins.
 */

const { UCSession } = require('../../systems/undercover');

module.exports = {
  name: 'xundercover',
  description: 'Undercover : civils vs infiltrés vs Mr. White (rôles via QG/TID)',
  usage: 'Xundercover · Xundercover stop',
  category: 'games',
  aliases: ['xuc', 'xunder'],
  adminOnly: false,
  cooldownMs: 5000,
  run: async (ctx) => {
    if (!ctx.isGroup) {
      return ctx.send(ctx.fmt.frame('🎭 XUNDERCOVER', '⚠️ ' + ctx.fmt.bold('Undercover se joue EN GROUPE !')));
    }
    if (ctx.sessions.get(ctx.threadID, 'xundercover')) {
      return ctx.send(ctx.fmt.frame('🎭 XUNDERCOVER', '⚠️ ' + ctx.fmt.bold('Une partie est déjà en cours.') + ' 🛑 Le lanceur peut taper « stop ».'));
    }
    const session = ctx.sessions.add(
      new UCSession(ctx.bot, {
        threadID: ctx.threadID,
        ownerID: ctx.senderID,
        ownerName: ctx.senderName,
        send: (payload) => ctx.send(payload),
      })
    );
    ctx.db.bumpStat('quizzesStarted');
    await session.start();
  },
};
