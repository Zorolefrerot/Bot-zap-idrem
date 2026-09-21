import crypto from 'node:crypto';
import * as webpModule from 'node-webpmux';

const webp = webpModule.default ?? webpModule;
const WebpImage = webp.Image ?? webp.default?.Image;

/**
 * Métadonnées WhatsApp d'un sticker (pack + auteur).
 * Format : bloc EXIF inséré dans le conteneur WebP.
 */

function buildExifBlock(json) {
  const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
  const lenBuffer = Buffer.alloc(4);
  lenBuffer.writeUInt32LE(jsonBuffer.length, 0);

  const header = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00,
    0x00, 0x00,
  ]);

  return Buffer.concat([header, lenBuffer, jsonBuffer]);
}

/**
 * Injecte `packname` / `author` dans un WebP (statique ou animé).
 * Retourne le buffer WebP prêt à être envoyé comme sticker.
 */
export async function addStickerExif(webpBuffer, { packname = '', author = '', emojis = [] } = {}) {
  if (!WebpImage) throw new Error('node-webpmux indisponible');
  if (!Buffer.isBuffer(webpBuffer) || webpBuffer.length === 0) throw new Error('Buffer WebP invalide');

  const image = new WebpImage();
  await image.load(webpBuffer);

  const metadata = {
    'sticker-pack-id': crypto.randomBytes(8).toString('hex'),
    'sticker-pack-name': String(packname || '').slice(0, 64),
    'sticker-pack-publisher': String(author || '').slice(0, 64),
    emojis: Array.isArray(emojis) ? emojis.slice(0, 8).map(String) : [],
  };

  image.exif = buildExifBlock(metadata);
  return await image.save(null);
}

/** Détecte un WebP animé (chunk ANIM/ANMF). */
export function isAnimatedWebp(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return false;
  const head = buffer.subarray(0, Math.min(buffer.length, 64));
  return head.includes(Buffer.from('ANIM')) || head.includes(Buffer.from('ANMF'));
}

/** Nombre de frames d'un WebP (1 pour une image statique). */
export async function webpFrameCount(buffer) {
  try {
    const image = new WebpImage();
    await image.load(buffer);
    return Array.isArray(image.frames) && image.frames.length ? image.frames.length : 1;
  } catch {
    return isAnimatedWebp(buffer) ? 2 : 1;
  }
}
