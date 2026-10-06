'use strict';
/*
 * 🧬 MeR~NeL — commands/ai/xask.js
 * Question rapide → réponse courte de l'IA.
 */

module.exports = {
  name: 'xask',
  description: 'Pose une question rapide à l’IA',
  usage: 'Xask <question>',
  category: 'ai',
  aliases: [],
  adminOnly: false,
  cooldownMs: 5000,
  run: async (ctx) => {
    const question = ctx.fmt.clean(ctx.args.join(' '), 500);
    if (!question) {
      return ctx.send(
        ctx.fmt.frame('🧠 XASK', [
          '⚠️ ' + ctx.fmt.bold('Pose une question.'),
          `📌 ${ctx.fmt.bold('Exemple')} : ${ctx.fmt.bold('Xask Quelle est la capitale du Japon ?')}`,
        ])
      );
    }
    const thinking = await ctx.send(
      ctx.fmt.pick([
        '🛰️ ' + ctx.fmt.bold('Analyse en cours…'),
        '🧠 ' + ctx.fmt.bold('Interrogation des circuits…'),
        '⚡ ' + ctx.fmt.bold('Calcul en progression…'),
      ])
    );
    try {
      const answer = await ctx.services.ai.ask(question, { mode: 'short' });
      await ctx.send(
        ctx.fmt.frame('🧠 𝗫𝗔𝗦𝗞 ⚡', ctx.fmt.truncate(answer, 1200))
      );
    } catch (err) {
      await ctx.send(
        ctx.fmt.frame('⚠️ SYSTÈME EN PAUSE', [
          '🛰️ ' + ctx.fmt.bold('Le module IA ne répond pas.'),
          `🧾 ${ctx.fmt.bold('CODE')} : ${ctx.fmt.bold(String(err.code || 'AI_ERROR').toUpperCase())}`,
        ])
      );
    } finally {
      // Supprimer le message "analyse en cours" si l'API le permet.
      if (thinking && thinking.messageID && ctx.capabilities.unsend) {
        ctx.adapter.unsend(thinking.messageID).catch(() => {});
      }
    }
  },
};
