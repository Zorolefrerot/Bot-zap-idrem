import sharp from 'sharp';
import { addStickerExif, isAnimatedWebp } from './exif.js';
import { hasFfmpeg, toAnimatedWebp, toPng, videoToMp3, webpToMp4 } from './ffmpeg.js';
import { BotError } from './errors.js';

export const STICKER_SIZE = 512;
const MAX_STICKER_SECONDS = 8;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function assertBuffer(buffer, label = 'média') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new BotError(`❌ Impossible de lire le ${label}.`);
  }
  return buffer;
}

/** Image (png/jpg/webp/gif statique) -> WebP 512x512 avec fond transparent. */
export async function imageToWebp(buffer) {
  assertBuffer(buffer, 'image');
  try {
    return await sharp(buffer, { failOn: 'none', animated: false })
      .resize(STICKER_SIZE, STICKER_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        withoutEnlargement: false,
      })
      .webp({ quality: 90, effort: 4 })
      .toBuffer();
  } catch (error) {
    throw new BotError(`❌ Conversion image impossible : ${error.message}`);
  }
}

/**
 * Crée un sticker complet (WebP + métadonnées pack/auteur) depuis une image.
 */
export async function createStickerFromImage(buffer, { packname, author, emojis = [] }) {
  if (buffer.length > MAX_IMAGE_BYTES) throw new BotError('❌ Image trop lourde pour être convertie en sticker.');
  const webp = await imageToWebp(buffer);
  return addStickerExif(webp, { packname, author, emojis });
}

/**
 * Crée un sticker animé depuis une vidéo / GIF (ffmpeg requis).
 */
export async function createStickerFromVideo(buffer, { packname, author, ext = '.mp4', emojis = [] }) {
  assertBuffer(buffer, 'vidéo');
  if (!(await hasFfmpeg())) {
    throw new BotError(
      '❌ Les stickers animés nécessitent ffmpeg sur le serveur.\n' +
        '➡️ Utilisez une image avec /sticker, ou installez ffmpeg (voir README).',
    );
  }
  const webp = await toAnimatedWebp(buffer, { ext, maxSeconds: MAX_STICKER_SECONDS });
  return addStickerExif(webp, { packname, author, emojis });
}

/** Sticker WebP -> PNG (statique via sharp, animé via ffmpeg). */
export async function stickerToImage(buffer) {
  assertBuffer(buffer, 'sticker');

  if (!isAnimatedWebp(buffer)) {
    try {
      return { buffer: await sharp(buffer, { failOn: 'none' }).png().toBuffer(), mimeType: 'image/png' };
    } catch {
      /* on tente le fallback ffmpeg */
    }
  }

  if (await hasFfmpeg()) {
    try {
      return { buffer: await toPng(buffer, { ext: '.webp' }), mimeType: 'image/png' };
    } catch {
      /* erreur ffmpeg : message explicite ci-dessous */
    }
  }

  if (isAnimatedWebp(buffer)) {
    throw new BotError('❌ Ce sticker est animé : utilisez /tovideo pour le récupérer en vidéo.');
  }
  throw new BotError('❌ Impossible de convertir ce sticker en image.');
}

/** Sticker WebP -> MP4 (ffmpeg requis). */
export async function stickerToVideo(buffer) {
  assertBuffer(buffer, 'sticker');
  if (!(await hasFfmpeg())) {
    throw new BotError('❌ /tovideo nécessite ffmpeg sur le serveur (voir README pour l’installation).');
  }
  return { buffer: await webpToMp4(buffer), mimeType: 'video/mp4' };
}

/** Vidéo -> MP3 (ffmpeg requis). */
export async function videoToAudio(buffer, { ext = '.mp4' } = {}) {
  assertBuffer(buffer, 'vidéo');
  if (!(await hasFfmpeg())) {
    throw new BotError('❌ /toaudio nécessite ffmpeg sur le serveur (voir README pour l’installation).');
  }
  return { buffer: await videoToMp3(buffer, { ext }), mimeType: 'audio/mpeg' };
}
