'use strict';
/*
 * 🧬 MeR~NeL — commands/games/xrps.js
 * Xrps — Pierre 🪨 Feuille 📄 Ciseaux ✂️ contre MeR~NeL.
 */

const MOVES = [
  { id: 'pierre', emoji: '🪨', beats: 'ciseaux' },
  { id: 'feuille', emoji: '📄', beats: 'pierre' },
  { id: 'ciseaux', emoji: '✂️', beats: 'feuille' },
];

const ALIASES = {
  pierre: 'pierre', p: 'pierre', rock: 'pierre', caillou: 'pierre',
  feuille: 'feuille', f: 'feuille', paper: 'feuille',
  ciseaux: 'ciseaux', c: 'ciseaux', scissors: 'ciseaux',
};

module.exports = {
  name: 'xrps',
  description: 'Pierre-Feuille-Ciseaux contre MeR~NeL',
  usage: 'Xrps pierre|feuille|ciseaux',
  category: 'games',
  aliases: ['xshifumi', 'rpc'],
  adminOnly: false,
  cooldownMs: 3000,
  run: async (ctx) => {
    const raw = (ctx.args[0] || '').toLowerCase();
    const player = ALIASES[raw];
    if (!player) {
      return ctx.send(
        ctx.fmt.frame('🎮 PIERRE-FEUILLE-CISEAUX', [
          '📌 ' + ctx.fmt.bold('Choisis ton arme :'),
          `🪨 ${ctx.fmt.bold('pierre')} · 📄 ${ctx.fmt.bold('feuille')} · ✂️ ${ctx.fmt.bold('ciseaux')}`,
          '',
          '📌 ' + ctx.fmt.bold('Exemple') + ' : ' + ctx.fmt.bold('Xrps pierre'),
        ])
      );
    }
    const bot = MOVES[Math.floor(Math.random() * 3)];
    const me = MOVES.find((m) => m.id === player);

    let title, verdict;
    if (player === bot.id) {
      title = '🤝 ÉGALITÉ';
      verdict = ctx.fmt.pick(['🤝 Égalité — grands esprits…', '😅 Match nul, revanche ?', '🧲 Même onde cérébrale.']);
    } else if (bot.beats === player) {
      title = '🤖 MeR~NeL GAGNE';
      verdict = ctx.fmt.pick(['😈 Trop facile.', '🧠 Le cerveau bat la chair.', '✌️ Prédictible, humain.']);
    } else {
      title = '🎉 TU GAGNES';
      verdict = ctx.fmt.pick(['😳 Chanceux…', '😤 Revanche immédiate !', '🏆 Bien joué, humain.']);
    }

    await ctx.send(
      ctx.fmt.frame(title, [
        `${me.emoji} ${ctx.fmt.bold('Toi')} : ${ctx.fmt.bold(player)}   vs   ${ctx.fmt.bold('MeR~NeL')} : ${bot.emoji} ${ctx.fmt.bold(bot.id)}`,
        '',
        verdict,
      ])
    );
  },
};
