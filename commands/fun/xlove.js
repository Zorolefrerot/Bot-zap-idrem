'use strict';
/*
 * 🧬 MeR~NeL — commands/fun/xlove.js
 * Xlove — photo de profil du lanceur + celle d'un membre au hasard du groupe,
 * collées avec un cœur au milieu → « amour parfait ».
 */

const Jimp = require('jimp');

const { downloadImage } = require('../../systems/mangaQuiz');

const W = 720;
const H = 400;
const PHOTO_R = 130;

/* Remplit un disque dans le bitmap. */
function fillCircle(img, cx, cy, r, rC, gC, bC, aC) {
  img.scan(Math.max(0, cx - r - 1), Math.max(0, cy - r - 1), 2 * r + 2, 2 * r + 2, function (x, y, idx) {
    const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    if (d <= r) {
      this.bitmap.data[idx] = rC;
      this.bitmap.data[idx + 1] = gC;
      this.bitmap.data[idx + 2] = bC;
      this.bitmap.data[idx + 3] = aC;
    }
  });
}

/* Cœur parfait : équation implicite (x²+y²−1)³ − x²y³ ≤ 0, remplie en rouge. */
function fillHeart(img, cx, cy, s, rC, gC, bC) {
  img.scan(cx - s * 16, cy - s * 15, s * 32, s * 33, function (x, y, idx) {
    const X = (x - cx) / s;
    const Y = (cy - y) / s + 0.1;
    const x2 = X * X;
    const y2 = Y * Y;
    const t = x2 + y2 - 1;
    if (t * t * t - x2 * y2 * Y <= 0) {
      this.bitmap.data[idx] = rC;
      this.bitmap.data[idx + 1] = gC;
      this.bitmap.data[idx + 2] = bC;
      this.bitmap.data[idx + 3] = 255;
    }
  });
}

/* Photo ronde avec liseré doré, posée sur le canvas en (cx, cy). */
async function renderPhotoOnCanvas(canvasImg, src, cx, cy) {
  const photo = await Jimp.read(src);
  const size = PHOTO_R * 2;
  photo.cover(size, size);
  const mask = new Jimp(size, size, 0x00000000);
  fillCircle(mask, PHOTO_R, PHOTO_R, PHOTO_R, 255, 255, 255, 255);
  photo.mask(mask, 0, 0);
  const ring = new Jimp(size + 12, size + 12, 0x00000000);
  fillCircle(ring, PHOTO_R + 6, PHOTO_R + 6, PHOTO_R + 6, 255, 205, 60, 255);
  ring.composite(photo, 6, 6);
  canvasImg.composite(ring, Math.round(cx - (size + 12) / 2), Math.round(cy - (size + 12) / 2));
}

module.exports = {
  name: 'xlove',
  description: 'Toi + un membre au hasard = amour parfait (photos + cœur)',
  usage: 'Xlove',
  category: 'fun',
  aliases: ['xamour', 'xship'],
  adminOnly: false,
  cooldownMs: 10000,
  run: async (ctx) => {
    /* Membres du groupe (hors lanceur). */
    let ids = [];
    try {
      const info = await ctx.adapter.getThreadInfo(ctx.threadID);
      ids = ((info && (info.participantIDs || (info.userInfo || []).map((u) => u.id))) || [])
        .map(String)
        .filter((id) => id !== String(ctx.senderID));
    } catch (_) {
      ids = [];
    }
    if (ids.length === 0) ids = [String(ctx.senderID)]; // solo → auto-ship rigolo
    const crushID = ids[Math.floor(Math.random() * ids.length)];

    const [mine, theirs] = await Promise.all([
      ctx.getUserInfo(ctx.senderID).catch(() => ({})),
      ctx.getUserInfo(crushID).catch(() => ({})),
    ]);
    const myName = (mine && mine.name) || 'Toi';
    const crushName = (theirs && theirs.name) || 'Élu(e) du cœur';
    const myPic = mine && mine.thumbSrc;
    const crushPic = theirs && theirs.thumbSrc;

    if (!myPic || !crushPic || !/^https?:\/\//.test(myPic) || !/^https?:\/\//.test(crushPic)) {
      return ctx.send(
        ctx.fmt.frame('💔 XLOVE', [
          `💘 ${ctx.fmt.bold(myName)} × ${ctx.fmt.bold(crushName)}`,
          '',
          '😢 Impossible de récupérer les deux photos de profil — réessaie plus tard.',
        ])
      );
    }

    /* Composite : fond sombre, deux photos rondes, cœur au centre. */
    try {
      const [p1, p2] = await Promise.all([
        downloadImage(myPic, ctx.config.tmpDir),
        downloadImage(crushPic, ctx.config.tmpDir),
      ]);
      const canvasImg = new Jimp(W, H, 0x12122bff);
      fillCircle(canvasImg, W / 2, H / 2, 300, 26, 20, 46, 255); // vignette douce

      await renderPhotoOnCanvas(canvasImg, p1, W / 2 - 165, H / 2);
      await renderPhotoOnCanvas(canvasImg, p2, W / 2 + 165, H / 2);
      fillHeart(canvasImg, W / 2, H / 2 - 6, 34, 255, 40, 90);
      fillHeart(canvasImg, W / 2, H / 2 - 6, 26, 255, 90, 130);

      const file = require('path').join(ctx.config.tmpDir, `xlove_${Date.now()}.png`);
      await canvasImg.writeAsync(file);

      const pct = 60 + Math.floor(Math.random() * 41); // 60 → 100 %
      const bars = Math.round(pct / 10);
      await ctx.send({
        body: ctx.fmt.frame('💘 XLOVE — AMOUR PARFAIT', [
          `💖 ${ctx.fmt.bold(myName)} × ${ctx.fmt.bold(crushName)}`,
          '',
          `${'❤️'.repeat(bars)}${'🖤'.repeat(10 - bars)} ${ctx.fmt.bold(pct + '%')}`,
          '',
          ctx.fmt.pick([
            '💍 Le mariage est programmé, félicitations !',
            '🔥 Ça va chauffer sérieusement ici…',
            '🌹 Une rose pour les amoureux !',
            '😭 MeR~NeL est jaloux de ce couple.',
          ]),
        ]),
        attachment: require('fs').createReadStream(file),
      });
    } catch (_) {
      await ctx.send(
        ctx.fmt.frame('💔 XLOVE', [
          `💘 ${ctx.fmt.bold(myName)} × ${ctx.fmt.bold(crushName)}`,
          '',
          '😢 La composition des photos a échoué — réessaie plus tard.',
        ])
      );
    }
  },
};
