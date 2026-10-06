'use strict';
/*
 * 🧬 MeR~NeL — commands/games/xucrank.js
 * Xucrank — tableau de RANG des meilleurs joueurs d'Undercover :
 * points = victoires ×10 + « plus malin » ×15 + bons votes ×3.
 */

module.exports = {
  name: 'xucrank',
  description: 'Classement des meilleurs joueurs d’Undercover',
  usage: 'Xucrank',
  category: 'games',
  aliases: ['xucranking', 'xuclassement'],
  adminOnly: false,
  cooldownMs: 4000,
  run: async (ctx) => {
    const rows = [];
    for (const [uid, u] of Object.entries(ctx.db.users.data)) {
      if (!u || !u.uc || (!u.uc.games && !u.uc.wins && !u.uc.mvp)) continue;
      const pts = (u.uc.wins || 0) * 10 + (u.uc.mvp || 0) * 15 + (u.uc.votesOK || 0) * 3;
      rows.push({ uid, name: u.nickname || u.name || 'Joueur', pts, w: u.uc.wins || 0, m: u.uc.mvp || 0, v: u.uc.votesOK || 0, g: u.uc.games || 0 });
    }
    rows.sort((a, b) => b.pts - a.pts);
    const medals = ['🥇', '🥈', '🥉'];

    const lines = [];
    if (!rows.length) {
      lines.push('🎭 ' + ctx.fmt.bold('Aucune partie jouée encore !'), `▶️ Lance ${ctx.fmt.bold('Xundercover')} en groupe.`);
    } else {
      rows.slice(0, 10).forEach((r, i) => {
        const medal = medals[i] || ` ${i + 1}.`;
        lines.push(`${medal} ${ctx.fmt.bold(r.name)} — ${ctx.fmt.bold(r.pts + ' pts')} · ${ctx.fmt.bold(r.w + 'V')} · 🧠${r.mvp} · 🗳️${r.v}`);
      });
      const me = rows.findIndex((r) => r.uid === ctx.senderID);
      if (me >= 10) {
        lines.push('', `📍 ${ctx.fmt.bold('Tu es ' + (me + 1) + 'ᵉ')} avec ${ctx.fmt.bold(rows[me].pts + ' pts')}`);
      }
    }
    await ctx.send(ctx.fmt.frame('🎭 XUCRANK — MEILLEURS JOUEURS', lines));
  },
};
