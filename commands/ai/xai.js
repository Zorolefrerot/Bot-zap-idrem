'use strict';
/*
 * 🧬 MeR~NeL — commands/ai/xai.js
 * IA avancée : explications, analyse, rédaction, programmation…
 */

module.exports = {
  name: 'xai',
  description: 'IA avancée : analyse, explication, rédaction, code',
  usage: 'Xai <demande>',
  category: 'ai',
  aliases: ['xintelligence'],
  adminOnly: false,
  cooldownMs: 6000,
  run: async (ctx) => {
    const prompt = ctx.fmt.clean(ctx.args.join(' '), 1500);
    if (!prompt) {
      return ctx.send(
        ctx.fmt.frame('🤖 XAI', [
          '⚠️ ' + ctx.fmt.bold('Donne-moi une demande.'),
          `📌 ${ctx.fmt.bold('Exemples')} :`,
          `▸ ${ctx.fmt.bold('Xai explique les trous noirs')}`,
          `▸ ${ctx.fmt.bold('Xai écris une fonction JS de tri')}`,
        ])
      );
    }
    await ctx.send(
      ctx.fmt.pick([
        '🤖 ' + ctx.fmt.bold('MeR~NeL analyse ta demande…'),
        '⚡ ' + ctx.fmt.bold('Traitement neuronal en cours…'),
        '🛰️ ' + ctx.fmt.bold('Montée en charge des processeurs…'),
      ])
    );
    try {
      const answer = await ctx.services.ai.ask(prompt, { mode: 'advanced' });
      await ctx.send(ctx.fmt.frame('🤖 𝗫𝗔𝗜 ⚡', ctx.fmt.truncate(answer, 1800)));
    } catch (err) {
      await ctx.send(
        ctx.fmt.frame('⚠️ SYSTÈME EN PAUSE', [
          '🤖 ' + ctx.fmt.bold('Le module IA avancée est momentanément indisponible.'),
          `🧾 ${ctx.fmt.bold('CODE')} : ${ctx.fmt.bold(String(err.code || 'AI_ERROR').toUpperCase())}`,
        ])
      );
    }
  },
};
