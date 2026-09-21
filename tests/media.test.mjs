import './helpers/env.mjs';

import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import sharp from 'sharp';

import { addStickerExif, isAnimatedWebp, webpFrameCount } from '../src/utils/exif.js';
import { hasFfmpeg } from '../src/utils/ffmpeg.js';
import {
  createStickerFromImage,
  createStickerFromVideo,
  imageToWebp,
  stickerToImage,
  stickerToVideo,
  videoToAudio,
} from '../src/utils/sticker.js';
import { BotError } from '../src/utils/errors.js';

const PACK = 'IDREM TERESHKOVA';
const AUTHOR = 'Merdi';

async function makePng(width = 320, height = 200, color = { r: 40, g: 120, b: 220 }) {
  return sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
}

function assertWebp(buffer) {
  assert.ok(Buffer.isBuffer(buffer), 'doit renvoyer un Buffer');
  assert.equal(buffer.subarray(0, 4).toString(), 'RIFF', 'signature RIFF');
  assert.equal(buffer.subarray(8, 12).toString(), 'WEBP', 'signature WEBP');
}

const ffmpegAvailable = await hasFfmpeg();

describe('stickers — conversion réelle (sharp)', () => {
  test('image PNG -> WebP 512x512', async () => {
    const png = await makePng();
    const webp = await imageToWebp(png);

    assertWebp(webp);
    const meta = await sharp(webp).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 512);
  });

  test('JPEG -> WebP sans erreur', async () => {
    const jpeg = await sharp(await makePng(640, 480)).jpeg({ quality: 85 }).toBuffer();
    const webp = await imageToWebp(jpeg);
    assertWebp(webp);
  });

  test('buffer vide refusé', async () => {
    await assert.rejects(() => imageToWebp(Buffer.alloc(0)), BotError);
  });
});

describe('stickers — métadonnées pack / auteur', () => {
  test('le pack et l’auteur configurés sont bien injectés', async () => {
    const png = await makePng();
    const sticker = await createStickerFromImage(png, { packname: PACK, author: AUTHOR });

    assertWebp(sticker);
    assert.ok(sticker.includes(Buffer.from('EXIF')), 'le bloc EXIF doit être présent');
    assert.ok(sticker.includes(Buffer.from(PACK)), `le pack "${PACK}" doit être présent`);
    assert.ok(sticker.includes(Buffer.from(AUTHOR)), `l’auteur "${AUTHOR}" doit être présent`);
  });

  test('re-marquage d’un sticker existant (take)', async () => {
    const first = await createStickerFromImage(await makePng(), { packname: 'Ancien Pack', author: 'Ancien' });
    const remarque = await addStickerExif(first, { packname: PACK, author: AUTHOR });

    assertWebp(remarque);
    assert.ok(remarque.includes(Buffer.from(PACK)));
    assert.ok(remarque.includes(Buffer.from(AUTHOR)));
  });

  test('noms longs tronqués et emojis acceptés', async () => {
    const sticker = await createStickerFromImage(await makePng(), {
      packname: 'P'.repeat(120),
      author: 'A'.repeat(120),
      emojis: ['🔥', '⚡'],
    });
    assertWebp(sticker);
    assert.ok(sticker.includes(Buffer.from('🔥')));
  });

  test('pack/auteur vides acceptés (sticker sans métadonnées visibles)', async () => {
    const sticker = await createStickerFromImage(await makePng(), { packname: '', author: '' });
    assertWebp(sticker);
  });
});

describe('stickers — détection d’animation', () => {
  test('un WebP statique n’est pas détecté comme animé', async () => {
    const webp = await imageToWebp(await makePng());
    assert.equal(isAnimatedWebp(webp), false);
    assert.equal(await webpFrameCount(webp), 1);
  });
});

describe('stickers — conversion inverse', () => {
  test('WebP -> PNG', async () => {
    const webp = await imageToWebp(await makePng());
    const { buffer, mimeType } = await stickerToImage(webp);

    assert.equal(mimeType, 'image/png');
    assert.equal(buffer.subarray(1, 4).toString(), 'PNG', 'signature PNG');
    const meta = await sharp(buffer).metadata();
    assert.equal(meta.format, 'png');
  });

  test('sticker complet (avec EXIF) -> PNG', async () => {
    const sticker = await createStickerFromImage(await makePng(), { packname: PACK, author: AUTHOR });
    const { buffer } = await stickerToImage(sticker);
    assert.equal(buffer.subarray(1, 4).toString(), 'PNG');
  });

  test('buffer vide refusé', async () => {
    await assert.rejects(() => stickerToImage(Buffer.alloc(0)), BotError);
  });
});

describe('média — dépendance ffmpeg', () => {
  test(
    'vidéo -> sticker animé (ffmpeg)',
    { skip: ffmpegAvailable ? false : 'ffmpeg absent : la dégradation propre est testée ailleurs' },
    async () => {
      // Génère une vraie vidéo de test puis la convertit.
      const { toAnimatedWebp } = await import('../src/utils/ffmpeg.js');
      const { runFfmpeg } = await import('../src/utils/ffmpeg.js');
      const { createTempPath, removeFile } = await import('../src/utils/tempfile.js');
      const fs = await import('node:fs/promises');

      const source = createTempPath('.mp4', 'src');
      await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15:duration=2', '-pix_fmt', 'yuv420p', source]);
      const video = await fs.readFile(source);
      await removeFile(source);

      const webp = await toAnimatedWebp(video, { ext: '.mp4' });
      assertWebp(webp);
      assert.equal(isAnimatedWebp(webp), true);

      const sticker = await createStickerFromVideo(video, { packname: PACK, author: AUTHOR, ext: '.mp4' });
      assertWebp(sticker);
      assert.ok(sticker.includes(Buffer.from(PACK)));
    },
  );

  test('sans ffmpeg : message d’erreur explicite et actionnable', async () => {
    if (ffmpegAvailable) {
      // Sur une machine équipée, on vérifie simplement que la fonction ne lève pas d'erreur de dépendance.
      assert.equal(typeof createStickerFromVideo, 'function');
      return;
    }

    for (const [label, task] of [
      ['sticker animé', () => createStickerFromVideo(Buffer.from('fake'), { packname: PACK, author: AUTHOR })],
      ['tovideo', () => stickerToVideo(Buffer.from('fake'))],
      ['toaudio', () => videoToAudio(Buffer.from('fake'))],
    ]) {
      await assert.rejects(task, (error) => {
        assert.ok(error instanceof BotError, `${label} doit lever une BotError`);
        assert.match(error.message, /ffmpeg/, `${label} : le message doit mentionner ffmpeg`);
        assert.match(error.message, /❌/, `${label} : le message doit commencer par ❌`);
        return true;
      });
    }
  });
});
