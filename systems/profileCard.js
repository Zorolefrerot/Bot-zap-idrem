'use strict';
/*
 * 🧬 MeR~NeL — systems/profileCard.js
 * 🎨 Carte de profil Xprofil — design « MeR~NEL » :
 * fond violet dégradé + circuits imprimés, ambiance photo floue à droite,
 * avatar rond dans des anneaux lumineux, nom, NIVEAU + barre d'XP capsule
 * avec tête brillante, XCoins en grand, stats avec icônes dessinées.
 * 100 % Jimp (aucune dépendance native, aucun emoji bitmap — jamais de « ?? »).
 */

const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

const W = 1500;
const H = 700;

/* ── PRNG déterministe (motif circuits identique à chaque carte) ── */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/* Plot sécurisé (avec épaisseur) */
function plot(img, x, y, r, g, b, a, thick) {
  const t = thick || 1;
  const half = Math.floor(t / 2);
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const px = Math.round(x + dx);
      const py = Math.round(y + dy);
      if (px < 0 || py < 0 || px >= img.bitmap.width || py >= img.bitmap.height) continue;
      const idx = (py * img.bitmap.width + px) << 2;
      img.bitmap.data[idx] = r;
      img.bitmap.data[idx + 1] = g;
      img.bitmap.data[idx + 2] = b;
      img.bitmap.data[idx + 3] = Math.max(img.bitmap.data[idx + 3], a);
    }
  }
}

/* Ligne (points interpolés) */
function line(img, x1, y1, x2, y2, r, g, b, a, thick) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) | 0;
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    plot(img, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, r, g, b, a, thick);
  }
}

/* Anneau (stroke circle) */
function ring(img, cx, cy, radius, r, g, b, a, stroke) {
  const st = stroke || 2;
  img.scan(
    clamp(cx - radius - st, 0, img.bitmap.width),
    clamp(cy - radius - st, 0, img.bitmap.height),
    Math.min(2 * (radius + st) + 1, img.bitmap.width),
    Math.min(2 * (radius + st) + 1, img.bitmap.height),
    function (x, y, idx) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (Math.abs(d - radius) <= st / 2) {
        this.bitmap.data[idx] = r;
        this.bitmap.data[idx + 1] = g;
        this.bitmap.data[idx + 2] = b;
        this.bitmap.data[idx + 3] = Math.max(this.bitmap.data[idx + 3], a);
      }
    }
  );
}

/* Disque plein */
function disc(img, cx, cy, radius, r, g, b, a) {
  img.scan(
    clamp(cx - radius, 0, img.bitmap.width),
    clamp(cy - radius, 0, img.bitmap.height),
    Math.min(2 * radius + 1, img.bitmap.width),
    Math.min(2 * radius + 1, img.bitmap.height),
    function (x, y, idx) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (d <= radius) {
        this.bitmap.data[idx] = r;
        this.bitmap.data[idx + 1] = g;
        this.bitmap.data[idx + 2] = b;
        this.bitmap.data[idx + 3] = Math.max(this.bitmap.data[idx + 3], a);
      }
    }
  );
}

/* Arc avec intensité modulée (halo d'énergie autour de l'avatar) */
function energyArc(img, cx, cy, radius, r, g, b, a0, thick, phase) {
  for (let deg = 0; deg < 360; deg += 1) {
    const t = (deg * Math.PI) / 180;
    const intensity = 0.25 + 0.75 * Math.abs(Math.sin(t * 3 + phase));
    const x = cx + radius * Math.cos(t);
    const y = cy + radius * Math.sin(t);
    plot(img, x, y, r, g, b, Math.round(a0 * intensity), thick);
  }
}

/* Rectangle arrondi « capsule » avec couleur fonction de x (dégradé) */
function capsule(img, x0, y0, w, h, colorFn) {
  const r = h / 2;
  img.scan(x0, y0, w, h, function (x, y, idx) {
    const lx = x - x0;
    const inRect = lx >= r && lx <= w - r;
    const inLeft = lx < r && (lx - r) ** 2 + (y - y0 - r) ** 2 <= r * r;
    const inRight = lx > w - r && (lx - (w - r)) ** 2 + (y - y0 - r) ** 2 <= r * r;
    if (inRect || inLeft || inRight) {
      const [cr, cg, cb, ca] = colorFn(lx / w);
      this.bitmap.data[idx] = cr;
      this.bitmap.data[idx + 1] = cg;
      this.bitmap.data[idx + 2] = cb;
      this.bitmap.data[idx + 3] = Math.max(this.bitmap.data[idx + 3], ca);
    }
  });
}

/* Texte « fantôme » (blanc atténué → lavande grise sur fond violet) */
async function ghostText(base, font, text, x, y, alpha) {
  const w = Jimp.measureText(font, text) + 4;
  const h = Jimp.measureTextHeight(font, text, w) + 4;
  const layer = await new Jimp(w, h, 0x00000000);
  layer.print(font, 0, 0, String(text));
  layer.scan(0, 0, w, h, function (px, py, idx) {
    this.bitmap.data[idx] = Math.min(255, this.bitmap.data[idx] + 235); // teinte lavande claire
    this.bitmap.data[idx + 1] = Math.min(255, this.bitmap.data[idx + 1] + 225);
    this.bitmap.data[idx + 2] = 255;
    this.bitmap.data[idx + 3] = Math.round((this.bitmap.data[idx + 3] / 255) * alpha);
  });
  base.composite(layer, Math.round(x), Math.round(y));
}

/* Petit icône « cible » (Quiz) */
function drawTarget(img, cx, cy) {
  ring(img, cx, cy, 8, 196, 181, 253, 235, 3);
  disc(img, cx, cy, 3, 232, 213, 255, 255);
}

/* Petit icône « épées croisées » (Duels) */
function drawSwords(img, cx, cy) {
  line(img, cx - 8, cy - 8, cx + 8, cy + 8, 240, 171, 252, 235, 3);
  line(img, cx + 8, cy - 8, cx - 8, cy + 8, 240, 171, 252, 235, 3);
  plot(img, cx, cy, 232, 213, 255, 255, 3);
}

/* Petit icône « badge » (UID) */
function drawBadge(img, cx, cy) {
  const layer = img;
  line(layer, cx - 9, cy - 7, cx + 9, cy - 7, 167, 139, 250, 235, 2);
  line(layer, cx + 9, cy - 7, cx + 9, cy + 7, 167, 139, 250, 235, 2);
  line(layer, cx + 9, cy + 7, cx - 9, cy + 7, 167, 139, 250, 235, 2);
  line(layer, cx - 9, cy + 7, cx - 9, cy - 7, 167, 139, 250, 235, 2);
  disc(layer, cx - 4, cy - 2, 2, 196, 181, 253, 255);
  line(layer, cx + 1, cy + 3, cx + 6, cy + 3, 196, 181, 253, 220, 2);
}

/* Motif « circuits imprimés » en filigrane */
function circuitPattern(img) {
  const rnd = mulberry32(424242);
  for (let i = 0; i < 30; i++) {
    let x = Math.round(rnd() * W);
    let y = Math.round(rnd() * H);
    let horiz = rnd() > 0.5;
    for (let seg = 0; seg < 3; seg++) {
      const len = Math.round(60 + rnd() * 220);
      const nx = horiz ? clamp(x + len, 0, W - 1) : x;
      const ny = horiz ? y : clamp(y + (rnd() > 0.5 ? len : -len), 0, H - 1);
      line(img, x, y, nx, ny, 139, 92, 246, 20, 1);
      disc(img, nx, ny, 3, 139, 92, 246, 34);
      x = nx;
      y = ny;
      horiz = !horiz;
    }
  }
}

/* Icône ADN avant la marque (double hélice pointillée) */
function drawHelix(img, cx, cy) {
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const y = cy - 26 + t * 52;
    const off = 13 * Math.sin(t * Math.PI * 2);
    plot(img, cx + off, y, 167, 139, 250, 255, 4);
    plot(img, cx - off, y, 240, 171, 252, 255, 4);
    if (i % 3 === 0) line(img, cx + off, y, cx - off, y, 196, 181, 253, 90, 2);
  }
}

const fontCache = {};
async function fonts() {
  if (!fontCache.f32) {
    fontCache.f32 = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    fontCache.f64 = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    fontCache.f128 = await Jimp.loadFont(Jimp.FONT_SANS_128_WHITE);
  }
  return fontCache;
}

/**
 * Construit la carte de profil (design MeR~NEL).
 * @param {object} d { name, level, intoLevel, progress, xcoins, quiz, duels, duelWins, uidShort, photoPath }
 * @returns {Promise<string>} chemin du PNG
 */
async function buildProfileCard(d, tmpDir) {
  const { f32, f64, f128 } = await fonts();
  const card = new Jimp(W, H);

  /* ── Fond : dégradé violet profond ── */
  card.scan(0, 0, W, H, function (x, y, idx) {
    const t = y / H;
    const u = x / W;
    this.bitmap.data[idx] = Math.round(24 + t * 26 + u * 14);
    this.bitmap.data[idx + 1] = Math.round(14 + t * 12 + u * 4);
    this.bitmap.data[idx + 2] = Math.round(52 + t * 40 + u * 22);
    this.bitmap.data[idx + 3] = 255;
  });

  /* ── Ambiance photo (droite, floutée + fondue) ── */
  if (d.photoPath && fs.existsSync(d.photoPath)) {
    try {
      const photo = await Jimp.read(d.photoPath);
      const pw = Math.round(W * 0.52);
      photo.cover(pw, H);
      photo.blur(12);
      // Fondu progressif + teinte violette : la photo reste à peine perceptible.
      photo.scan(0, 0, pw, H, function (x, y, idx) {
        const fade = x / pw; // 0 au bord gauche → 1 à droite
        this.bitmap.data[idx] = Math.round(this.bitmap.data[idx] * 0.5 + 88 * 0.5);
        this.bitmap.data[idx + 1] = Math.round(this.bitmap.data[idx + 1] * 0.5 + 38 * 0.5);
        this.bitmap.data[idx + 2] = Math.round(this.bitmap.data[idx + 2] * 0.5 + 140 * 0.5);
        this.bitmap.data[idx + 3] = Math.round(255 * (0.05 + 0.26 * fade * fade));
      });
      card.composite(photo, W - pw, 0);
    } catch (_) {
      /* pas d'ambiance photo — le fond uni reste propre */
    }
  }

  /* ── Motif circuits + vignette ── */
  circuitPattern(card);
  card.scan(0, 0, W, H, function (x, y, idx) {
    const dx = (x - W / 2) / (W / 2);
    const dy = (y - H / 2) / (H / 2);
    const v = 1 - 0.38 * Math.min(1, Math.sqrt(dx * dx + dy * dy));
    this.bitmap.data[idx] = Math.round(this.bitmap.data[idx] * v);
    this.bitmap.data[idx + 1] = Math.round(this.bitmap.data[idx + 1] * v);
    this.bitmap.data[idx + 2] = Math.round(this.bitmap.data[idx + 2] * v);
  });

  /* ── Liseré supérieur violet ── */
  card.scan(0, 0, W, 6, function (x, y, idx) {
    this.bitmap.data[idx] = 138;
    this.bitmap.data[idx + 1] = 92;
    this.bitmap.data[idx + 2] = 246;
    this.bitmap.data[idx + 3] = 255;
  });

  /* ── Marque « MeR~NEL » centrée + ADN + filet ── */
  const brand = 'MeR~NEL';
  const brandW = Jimp.measureText(f64, brand);
  const brandX = Math.round(W / 2 - brandW / 2);
  drawHelix(card, brandX - 44, 62);
  card.print(f64, brandX, 26, brand);
  card.scan(brandX - 130, 118, brandW + 260, 2, function (x, y, idx) {
    const t = (x - (brandX - 130)) / (brandW + 260);
    const a = Math.round(150 * Math.sin(Math.PI * t));
    this.bitmap.data[idx] = 196;
    this.bitmap.data[idx + 1] = 181;
    this.bitmap.data[idx + 2] = 253;
    this.bitmap.data[idx + 3] = a;
  });

  /* ── Avatar : photo ronde + anneaux lumineux + halo d'énergie ── */
  const AV_X = 250;
  const AV_Y = 396;
  const AV_R = 136;
  const glow = new Jimp(W, H, 0x00000000);
  ring(glow, AV_X, AV_Y, AV_R + 16, 124, 58, 237, 255, 10);
  glow.blur(14);
  card.composite(glow, 0, 0);
  energyArc(card, AV_X, AV_Y, AV_R + 24, 216, 180, 254, 210, 3, 0.8);
  ring(card, AV_X, AV_Y, AV_R + 14, 124, 58, 237, 235, 3);
  ring(card, AV_X, AV_Y, AV_R + 6, 196, 181, 253, 255, 3);
  let photoDone = false;
  if (d.photoPath && fs.existsSync(d.photoPath)) {
    try {
      const photo = await Jimp.read(d.photoPath);
      photo.cover(AV_R * 2, AV_R * 2);
      const mask = new Jimp(AV_R * 2, AV_R * 2, 0x00000000);
      disc(mask, AV_R, AV_R, AV_R, 255, 255, 255, 255);
      photo.mask(mask, 0, 0);
      card.composite(photo, AV_X - AV_R, AV_Y - AV_R);
      photoDone = true;
    } catch (_) {
      photoDone = false;
    }
  }
  if (!photoDone) {
    disc(card, AV_X, AV_Y, AV_R, 46, 38, 84, 255);
    disc(card, AV_X - 40, AV_Y - 40, 46, 84, 60, 140, 120);
  }

  /* ── Nom ── */
  card.print(f64, 505, 118, String(d.name || 'Membre').slice(0, 26));

  /* ── NIVEAU ── */
  await ghostText(card, f32, `NIVEAU ${d.level || 1}`, 505, 208, 205);

  /* ── Barre d'XP (capsule, dégradé, tête brillante) ── */
  const BX = 505;
  const BY = 258;
  const BW = 700;
  const BH = 22;
  capsule(card, BX, BY, BW, BH, () => [255, 255, 255, 34]);
  const pct = clamp(Number(d.progress) || 0, 0, 1);
  const fillW = Math.max(BH, Math.round(BW * pct));
  capsule(card, BX, BY, fillW, BH, (t) => [
    Math.round(109 + t * 100),
    Math.round(40 + t * 115),
    Math.round(237 + t * 16),
    255,
  ]);
  // Tête brillante : halo discret + cœur blanc (PAS de blur → jamais d'artefact).
  capsule(card, BX + Math.max(0, fillW - 34), BY - 7, 38, BH + 14, () => [238, 226, 255, 70]);
  capsule(card, BX + Math.max(0, fillW - 26), BY - 3, 30, BH + 6, () => [242, 233, 255, 150]);
  capsule(card, BX + Math.max(0, fillW - 16), BY, 16, BH, () => [250, 247, 255, 255]);

  /* ── XP du niveau ── */
  await ghostText(card, f32, `${d.intoLevel || 0} XP / niveau suivant`, BX, BY + 42, 190);

  /* ── XCoins ── */
  const coins = String(Math.max(0, Number(d.xcoins) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  card.print(f128, 500, 330, coins);
  const coinsW = Jimp.measureText(f128, coins);
  await ghostText(card, f64, 'xCoins', 500 + coinsW + 18, 330 + 118, 235);

  /* ── Stats avec icônes dessinées (jamais de « ?? ») ── */
  const SY = 540;
  const segQuiz = `Quiz : ${d.quiz || 0}`;
  const segDuels = `Duels : ${d.duels || 0} (${d.duelWins || 0}V)`;
  const segUid = `UID #${d.uidShort || '000000'}`;
  let x = 508;
  drawTarget(card, x + 9, SY + 17);
  await ghostText(card, f32, segQuiz, x + 30, SY, 215);
  x += 30 + Jimp.measureText(f32, segQuiz) + 34;
  await ghostText(card, f32, '·', x, SY, 170);
  x += Jimp.measureText(f32, '·') + 34;
  drawSwords(card, x + 9, SY + 17);
  await ghostText(card, f32, segDuels, x + 30, SY, 215);
  x += 30 + Jimp.measureText(f32, segDuels) + 34;
  await ghostText(card, f32, '·', x, SY, 170);
  x += Jimp.measureText(f32, '·') + 34;
  drawBadge(card, x + 10, SY + 17);
  await ghostText(card, f32, segUid, x + 32, SY, 215);

  const outDir = tmpDir || '/tmp/xprofile';
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `xprofil_${Date.now()}_${Math.floor(Math.random() * 1e6)}.png`);
  await card.writeAsync(out);
  return out;
}

module.exports = { buildProfileCard };
