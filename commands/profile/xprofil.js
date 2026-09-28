'use strict';
/*
 * 🧬 MeR~NeL — commands/profile/xprofil.js
 * Xprofil — CARTE DE PROFIL GÉNÉRÉE EN IMAGE (jimp, sans canvas natif) :
 * dégradé, photo de profil ronde avec anneau, nom, niveau + barre d'XP,
 * XCoins, stats. Repli carte texte si l'image échoue.
 */

const Jimp = require('jimp');
const { downloadImage } = require('../../systems/mangaQuiz');

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
      const card = new Jimp(W, H);
      gradient(card);

      // Bandeau accent
      card.scan(0, 0, W, 6, function (x, y, idx) {
        this.bitmap.data[idx] = 120;
        this.bitmap.data[idx + 1] = 90;
        this.bitmap.data[idx + 2] = 255;
        this.bitmap.data[idx + 3] = 255;
      });

      // ── Photo de profil ronde + anneau ──
      const AV_X = 150;
      const AV_Y = 220;
      const AV_R = 100;
      if (info.thumbSrc && /^https?:\/\//.test(info.thumbSrc)) {
        const file = await downloadImage(info.thumbSrc, ctx.config.tmpDir);
        if (file) {
          const photo = await Jimp.read(file);
          photo.cover(AV_R * 2, AV_R * 2);
          const mask = new Jimp(AV_R * 2, AV_R * 2, 0x00000000);
          fillCircle(mask, AV_R, AV_R, AV_R, 255, 255, 255, 255);
          photo.mask(mask, 0, 0);
          const ring = new Jimp(AV_R * 2 + 16, AV_R * 2 + 16, 0x00000000);
          fillCircle(ring, AV_R + 8, AV_R + 8, AV_R + 8, 240, 240, 255, 255);
          ring.composite(photo, 8, 8);
          card.composite(ring, AV_X - AV_R - 8, AV_Y - AV_R - 8);
        } else {
          fillCircle(card, AV_X, AV_Y, AV_R, 70, 60, 130, 255);
        }
      } else {
        fillCircle(card, AV_X, AV_Y, AV_R, 70, 60, 130, 255);
      }

      // ── Textes ──
      const f32 = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
      const f16 = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
      const f64 = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
      const TX = 300;

      card.print(f32, TX, 70, String(name).slice(0, 24));
      card.print(f16, TX, 122, `NIVEAU ${xpInfo.level}`);
      // Barre d'XP
      const pct = Math.max(0.03, Math.min(1, (Number(xpInfo.xp) || 0) / ((Number(xpInfo.level) || 1) * 100)));
      const BAR_W = 420;
      card.scan(TX, 150, BAR_W, 14, function (x, y, idx) {
        this.bitmap.data[idx] = 60;
        this.bitmap.data[idx + 1] = 55;
        this.bitmap.data[idx + 2] = 110;
        this.bitmap.data[idx + 3] = 255;
      });
      card.scan(TX, 150, Math.round(BAR_W * pct), 14, function (x, y, idx) {
        this.bitmap.data[idx] = 130;
        this.bitmap.data[idx + 1] = 95;
        this.bitmap.data[idx + 2] = 255;
        this.bitmap.data[idx + 3] = 255;
      });
      card.print(f16, TX, 174, `${xpInfo.xp} XP / niveau suivant`);

      // XCoins
      card.print(f64, TX, 208, String(user.xcoins).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
      card.print(f16, TX + Jimp.measureText(f64, String(user.xcoins)) + 14, 244, 'XCoins');

      // Stats
      card.print(
        f16,
        TX,
        306,
        `🎮 Quiz : ${user.stats.quizPlayed || 0}   ·   🥊 Duels : ${user.stats.duelsPlayed || 0} (${user.stats.duelWins || 0}V)   ·   🏦 UID #${uidShort}`
      );

      const file = require('path').join(ctx.config.tmpDir, `xprofil_${Date.now()}.png`);
      await card.writeAsync(file);
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
