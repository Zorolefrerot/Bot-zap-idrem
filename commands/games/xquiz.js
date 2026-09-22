'use strict';
/*
 * 🧬 MeR~NeL — commands/games/xquiz.js
 * Lance une session quiz (machine d'états dans systems/quiz.js).
 * Le joueur répond ensuite SANS préfixe : le gestionnaire de sessions
 * capte ses messages (CG → 20 → réponses A/B/C/D).
 */

const { QuizSession } = require('../../systems/quiz');

module.exports = {
  name: 'xquiz',
  description: 'Lance un quiz (ID / MULTIVERS / CG)',
  usage: 'Xquiz',
  category: 'games',
  aliases: ['xq'],
  adminOnly: false,
  cooldownMs: 5000,
  run: async (ctx) => {
    const existing = ctx.sessions.get(ctx.threadID, `quiz:${ctx.senderID}`);
    if (existing) {
      return ctx.send(
        ctx.fmt.frame('🎮 XQUIZ', '⚠️ ' + ctx.fmt.bold('Un quiz est déjà en cours pour toi.') + '\n🛑 ' + ctx.fmt.bold('Tape « cancel » pour l’annuler.'))
      );
    }
    const session = ctx.sessions.add(
      new QuizSession(ctx.bot, {
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
