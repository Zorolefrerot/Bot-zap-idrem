'use strict';
/*
 * 🧬 MeR~NeL — commands/games/xquiz.js  (v2 — quiz de groupe)
 * Le lanceur choisit catégorie + nombre, puis TOUT le groupe joue.
 */

const { GroupQuizSession } = require('../../systems/quiz');

module.exports = {
  name: 'xquiz',
  description: 'Quiz de groupe : première bonne réponse marque (ID / MULTIVERS / CG)',
  usage: 'Xquiz',
  category: 'games',
  aliases: ['xq'],
  adminOnly: false,
  cooldownMs: 5000,
  run: async (ctx) => {
    if (!ctx.isGroup) {
      return ctx.send(ctx.fmt.frame('🎮 XQUIZ', '⚠️ ' + ctx.fmt.bold('Le quiz se joue en groupe — tout le monde participe !')));
    }
    const existing = ctx.sessions.get(ctx.threadID, 'quiz');
    if (existing) {
      return ctx.send(
        ctx.fmt.frame('🎮 XQUIZ', '⚠️ ' + ctx.fmt.bold('Un quiz est déjà en cours dans ce groupe.') + '\n🛑 ' + ctx.fmt.bold('Le lanceur peut taper « cancel ».'))
      );
    }
    const session = ctx.sessions.add(
      new GroupQuizSession(ctx.bot, {
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
