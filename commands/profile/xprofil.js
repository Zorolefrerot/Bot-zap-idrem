'use strict';
/*
 * 🧬 MeR~NeL — commands/profile/xprofil.js
 * Carte de profil futuriste + photo du membre si l'API la fournit.
 */

module.exports = {
  name: 'xprofil',
  description: 'Affiche ta carte de profil',
  usage: 'Xprofil [@membre]',
  category: 'profile',
  aliases: ['xprofile', 'xcard'],
  adminOnly: false,
  cooldownMs: 4000,
  run: async (ctx) => {
    const mentions = ctx.event.mentions || {};
    const targetID = Object.keys(mentions)[0] || ctx.senderID;
    const info = await ctx.getUserInfo(targetID);
    const user = ctx.economy.ensureUser(targetID);
    const xpInfo = ctx.xp.info(targetID);

    const uidShort = String(targetID).slice(-6);
    const lines = [
      info.thumbSrc ? '🖼️ ' + ctx.fmt.bold('PHOTO DU MEMBRE') : '',
      '',
      `◈ ${ctx.fmt.bold('𝗣𝘀𝗲𝘂𝗱𝗼')} : ${ctx.fmt.bold(user.nickname || info.name || 'Membre')}`,
      `◈ ${ctx.fmt.bold('𝗫𝗣')} : ${ctx.fmt.boldNum(xpInfo.xp)} — ${ctx.fmt.bold('Niv.')}${ctx.fmt.boldNum(xpInfo.level)}`,
      `◈ ${ctx.fmt.bold('𝗫𝗖𝗼𝗶𝗻𝘀')} : ${ctx.fmt.boldNum(user.xcoins)}`,
      `◈ ${ctx.fmt.bold('𝗨𝗜𝗗')} : ${ctx.fmt.bold('#' + uidShort)}`,
      '',
      `🎮 ${ctx.fmt.bold('Quiz')} : ${ctx.fmt.boldNum(user.stats.quizPlayed)} — 🥊 ${ctx.fmt.bold('Duels')} : ${ctx.fmt.boldNum(user.stats.duelsPlayed)} (${ctx.fmt.boldNum(user.stats.duelWins || 0)}V)`,
    ].filter((l) => l !== '');

    const payload = { body: ctx.fmt.frame('👤 𝗣𝗥𝗢𝗙𝗜𝗟', lines) };
    if (info.thumbSrc && /^https?:\/\//.test(info.thumbSrc)) {
      payload.attachment = info.thumbSrc; // si l'API ne fournit pas la photo → fallback texte propre
    }
    await ctx.send(payload);
  },
};
