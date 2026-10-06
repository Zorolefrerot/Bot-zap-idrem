'use strict';
/*
 * 🧬 MeR~NeL — commands/fun/xlove.js
 * Xlove — photos de profil du lanceur + d'un membre au hasard, collées
 * avec un cœur → « amour parfait ». Rendu PROPRE : dégradé rose/violet,
 * ombres douces, anneaux blancs, cœur avec contour + noms sous les photos.
 */

const Jimp = require('jimp');
const { downloadImage } = require('../../systems/mangaQuiz');

const W = 900;
const H = 480;
const PHOTO_R = 140;

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

/* Cœur (équation implicite) rempli. */
function fillHeart(img, cx, cy, s, R, G, B, A = 255) {
  img.scan(cx - s * 16, cy - s * 15, s * 32, s * 33, function (x, y, idx) {
    const X = (x - cx) / s;
    const Y = (cy - y) / s + 0.1;
    const x2 = X * X;
    const y2 = Y * Y;
    const t = x2 + y2 - 1;
    if (t * t * t - x2 * y2 * Y <= 0) {
      this.bitmap.data[idx] = R;
      this.bitmap.data[idx + 1] = G;
      this.bitmap.data[idx + 2] = B;
      this.bitmap.data[idx + 3] = A;
    }
  });
}

/* Photo ronde avec double anneau blanc posée sur le canvas. */
async function renderPhoto(canvasImg, src, cx, cy) {
  const photo = await Jimp.read(src);
  const size = PHOTO_R * 2;
  photo.cover(size, size);
  const mask = new Jimp(size, size, 0x00000000);
  fillCircle(mask, PHOTO_R, PHOTO_R, PHOTO_R, 255, 255, 255, 255);
  photo.mask(mask, 0, 0);

  // Ombre douce
  const shadow = new Jimp(size + 40, size + 40, 0x00000000);
  fillCircle(shadow, (size + 40) / 2, (size + 40) / 2, PHOTO_R + 10, 40, 10, 40, 200);
  shadow.blur(12);
  canvasImg.composite(shadow, Math.round(cx - (size + 40) / 2), Math.round(cy - (size + 40) / 2 + 8));

  // Double anneau (extérieur fin + intérieur épais blanc)
  const ring1 = new Jimp(size + 44, size + 44, 0x00000000);
  fillCircle(ring1, (size + 44) / 2, (size + 44) / 2, PHOTO_R + 22, 255, 255, 255, 230);
  canvasImg.composite(ring1, Math.round(cx - (size + 44) / 2), Math.round(cy - (size + 44) / 2));

  const ring2 = new Jimp(size + 28, size + 28, 0x00000000);
  fillCircle(ring2, (size + 28) / 2, (size + 28) / 2, PHOTO_R + 14, 255, 255, 255, 255);
  ring2.composite(photo, 14, 14);
  canvasImg.composite(ring2, Math.round(cx - (size + 28) / 2), Math.round(cy - (size + 28) / 2));
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
    if (ids.length === 0) ids = [String(ctx.senderID)]; // solo → auto-ship
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

    const pct = 60 + Math.floor(Math.random() * 41); // 60 → 100 %
    try {
      const [p1, p2] = await Promise.all([
        downloadImage(myPic, ctx.config.tmpDir),
        downloadImage(crushPic, ctx.config.tmpDir),
      ]);
      const canvasImg = new Jimp(W, H);

      // Dégradé rose → violet
      canvasImg.scan(0, 0, W, H, function (x, y, idx) {
        const t = (x / W + y / H) / 2;
        this.bitmap.data[idx] = Math.round(255 - t * 130);
        this.bitmap.data[idx + 1] = Math.round(120 - t * 85);
        this.bitmap.data[idx + 2] = Math.round(160 + t * 60);
        this.bitmap.data[idx + 3] = 255;
      });

      const CY = 200;
      await renderPhoto(canvasImg, p1, 245, CY);
      await renderPhoto(canvasImg, p2, 655, CY);

      // Cœur : contour foncé + cœur rouge + reflet blanc
      const HX = W / 2;
      const HY = CY - 8;
      fillHeart(canvasImg, HX + 5, HY + 6, 62, 90, 8, 40, 220);
      fillHeart(canvasImg, HX, HY, 58, 230, 30, 75, 255);
      fillHeart(canvasImg, HX - 12, HY - 10, 16, 255, 235, 245, 235);

      // Noms sous les photos
      const f32 = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
      const f16 = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
      const name1 = String(myName).slice(0, 18);
      const name2 = String(crushName).slice(0, 18);
      canvasImg.print(f32, Math.round(245 - Jimp.measureText(f32, name1) / 2), 388, name1);
      canvasImg.print(f32, Math.round(655 - Jimp.measureText(f32, name2) / 2), 388, name2);
      const cap = 'AMOUR PARFAIT';
      canvasImg.print(f16, Math.round(W / 2 - Jimp.measureText(f16, cap) / 2), 446, cap);

      const file = require('path').join(ctx.config.tmpDir, `xlove_${Date.now()}.png`);
      await canvasImg.writeAsync(file);

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
          `💘 ${ctx.fmt.bold(myName)} × ${ctx.fmt.bold(crushName)} — ${ctx.fmt.bold(pct + '%')}`,
          '',
          '😢 La composition des photos a échoué — réessaie plus tard.',
        ])
      );
    }
  },
};
