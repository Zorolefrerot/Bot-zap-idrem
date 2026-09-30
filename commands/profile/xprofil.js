'use strict';
/*
 * 🧬 MeR~NeL — commands/profile/xprofil.js
 * Xprofil — CARTE DE PROFIL « MeR~NEL » (jimp, sans canvas natif) :
 * fond violet circuits, ambiance photo floue, avatar à anneaux lumineux,
 * nom, NIVEAU + barre d'XP capsule, XCoins en grand, stats à icônes.
 * Repli carte texte si l'image échoue.
 */

const { downloadImage } = require('../../systems/mangaQuiz');
const { buildProfileCard } = require('../../systems/profileCard');

const W = 900;
const H = 420;

/* Dégradé vertical bleu nuit → violet. */
function gradient(img) {
  img.scan(0, 0, W, H, function (x, y, idx) {
    const t = y / H;
    this.bitmap.data[idx] = Math.round(15 + t * 28);
    this.bitmap.data[idx + 1] = Math.round(16 + t * 10);
    this.bitmap.data[idx + 2] = Math.round(36 + t * 38);
    this.bitmap.data[idx + 3] = 255;
  });
}

function fillCircle(img, cx, cy, r, R, G, B, A) {
  img.scan(Math.max(0, cx - r - 1), Math.max(0, cy - r - 1), 2 * r + 2, 2 * r + 2, function (x, y, idx) {
    const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    if (d <= r) {
      this.bitmap.data[idx] = R;
      this.bitmap.data[idx + 1] = G;
      this.bitmap.data[idx + 2] = B;
      this.bitmap.data[idx + 3] = A;
    }
  });
}

module.exports = {
  name: 'xprofil',
  description: 'Affiche ta carte de profil (image)',
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
    const name = user.nickname || info.name || 'Membre';
    const uidShort = String(targetID).slice(-6);

    const lines = [
      `◈ ${ctx.fmt.bold('𝗣𝘀𝗲𝘂𝗱𝗼')} : ${ctx.fmt.bold(name)}`,
      `◈ ${ctx.fmt.bold('𝗫𝗣')} : ${ctx.fmt.boldNum(xpInfo.xp)} — ${ctx.fmt.bold('Niv.')} ${ctx.fmt.boldNum(xpInfo.level)}`,
      `◈ ${ctx.fmt.bold('𝗫𝗖𝗼𝗶𝗻𝘀')} : ${ctx.fmt.boldNum(user.xcoins)}`,
      `◈ ${ctx.fmt.bold('𝗨𝗜𝗗')} : ${ctx.fmt.bold('#' + uidShort)}`,
      '',
      `🎮 ${ctx.fmt.bold('Quiz')} : ${ctx.fmt.boldNum(user.stats.quizPlayed || 0)} — 🥊 ${ctx.fmt.bold('Duels')} : ${ctx.fmt.boldNum(user.stats.duelsPlayed || 0)} (${ctx.fmt.boldNum(user.stats.duelWins || 0)}V)`,
    ];

    try {
      require('fs').mkdirSync(ctx.config.tmpDir, { recursive: true });
      let photoPath = null;
      if (info.thumbSrc && /^https?:\/\//.test(info.thumbSrc)) {
        photoPath = await downloadImage(info.thumbSrc, ctx.config.tmpDir);
      }
      const xpFull = ctx.xp.info(targetID);
      const file = await buildProfileCard(
        {
          name,
          level: xpFull.level,
          intoLevel: xpFull.intoLevel,
          progress: xpFull.progress,
          xcoins: user.xcoins,
          quiz: user.stats.quizPlayed || 0,
          duels: user.stats.duelsPlayed || 0,
          duelWins: user.stats.duelWins || 0,
          uidShort,
          photoPath,
        },
        ctx.config.tmpDir
      );
      return ctx.send({
        body: ctx.fmt.frame('👤 𝗣𝗥𝗢𝗙𝗜𝗟', lines),
        attachment: require('fs').createReadStream(file),
      });
    } catch (_) {
      // Repli carte texte propre
      const payload = { body: ctx.fmt.frame('👤 𝗣𝗥𝗢𝗙𝗜𝗟', lines) };
      if (info.thumbSrc && /^https?:\/\//.test(info.thumbSrc)) {
        const file = await downloadImage(info.thumbSrc, ctx.config.tmpDir);
        payload.attachment = file || info.thumbSrc;
      }
      await ctx.send(payload);
    }
  },
};
