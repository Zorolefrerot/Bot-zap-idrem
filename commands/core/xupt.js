'use strict';
/*
 * 🧬 MeR~NeL — commands/core/xupt.js
 * Xupt — temps d'activité du bot + ses capacités.
 */

function human(ms) {
  let s = Math.floor(ms / 1000);
  const j = Math.floor(s / 86400);
  s -= j * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const parts = [];
  if (j) parts.push(`${j}j`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}min`);
  if (!j && !h) parts.push(`${s}s`);
  return parts.join(' ');
}

module.exports = {
  name: 'xupt',
  description: 'Temps d’activité de MeR~NeL + ses capacités',
  usage: 'Xupt',
  category: 'menu',
  aliases: ['xuptime', 'xstats-bot', 'x capacites'],
  adminOnly: false,
  cooldownMs: 5000,
  run: async (ctx) => {
    const b = ctx.fmt.bold;
    const mem = process.memoryUsage();
    const mb = (n) => `${Math.round(n / 1024 / 1024)} Mo`;
    const dbStats = ctx.db.stats.data || {};

    const lines = [
      `⏳ ${b('En activité depuis')} : ${b(human(Date.now() - ctx.bot.startedAt || 0))}`,
      `🧬 ${b('Version')} : ${b('MeR~NEL v4')} — ${b('stable')}`,
      '',
      `⚡ ${b('CAPACITÉS')}`,
      `🤖 ${b('Commandes')} : ${b(ctx.commands.size)} disponibles`,
      `🧠 ${b('IA')} : ${b(ctx.services.aiPool.providersList().length)} fournisseurs à rotation`,
      `     ${ctx.services.aiPool.providersList().join(' · ')}`,
      `🎌 ${b('Quiz manga (Xid)')} : ${b('AniList + Jikan')} — 100 images max`,
      `🎮 ${b('Quiz (Xquiz)')} : ${b('5 catégories')} — ID · MULTIVERS · CG · CAPITALE · DRAPEAU`,
      `⚽ ${b('Quiz foot (Xfoot)')} : ${b('Wikidata — 200 joueurs')} — clubs & sélections`,
      `⚽ ${b('Paris sportifs (Xbet)')} : ${b('10 matchs par manche')}`,
      `🖼️ ${b('Images (Ximg)')} : ${b('génération IA sans clé')} — max ${b(ctx.config.media.maxImages)}`,
      `🌙 ${b('Veille auto')} : ${b('30 min')} d’inactivité`,
      '',
      `📊 ${b('VITALITÉ')}`,
      `💾 ${b('Mémoire')} : ${b(mb(mem.heapUsed))} / ${b(mb(mem.heapTotal))}`,
      `👥 ${b('Utilisateurs connus')} : ${b(Object.keys(ctx.db.users.data || {}).length)}`,
      `💬 ${b('Messages traités')} : ${b(Number(dbStats.messages || 0).toLocaleString('fr-FR'))}`,
      `🎮 ${b('Quiz joués')} : ${b(dbStats.quizzesPlayed || 0)} — lancés : ${b(dbStats.quizzesStarted || 0)}`,
      `⚔️ ${b('Duels')} : ${b(dbStats.duelsPlayed || 0)}`,
    ];

    await ctx.send(ctx.fmt.frame('📈 MeR~NEL — XUPT', lines));
  },
};
