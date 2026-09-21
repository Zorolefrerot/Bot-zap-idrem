import { addStickerExif, isAnimatedWebp } from '../../utils/exif.js';
import { createStickerFromImage, createStickerFromVideo } from '../../utils/sticker.js';
import { BotError } from '../../utils/errors.js';

const MAX_VIDEO_SECONDS = 10;
const MAX_URL_BYTES = 10 * 1024 * 1024;
const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;

const EXTENSION_BY_MIME = {
  'video/mp4': '.mp4',
  'video/3gpp': '.3gp',
  'video/webm': '.webm',
  'video/x-matroska': '.mkv',
  'image/gif': '.gif',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

/** `pack|auteur` ou `pack` — retombe toujours sur la configuration du dashboard. */
function resolveMeta(argText, settings) {
  let packname = settings.stickerName;
  let author = settings.stickerAuthor;

  const text = String(argText || '').trim();
  if (text.includes('|')) {
    const [pack, pub] = text.split('|');
    if (pack.trim()) packname = pack.trim();
    if (pub !== undefined && pub.trim()) author = pub.trim();
  } else if (text) {
    packname = text;
  }

  return { packname: packname.slice(0, 64), author: String(author || '').slice(0, 64) };
}

function extractEmojis(text) {
  const found = String(text || '').match(EMOJI_REGEX);
  return found ? [...new Set(found)].slice(0, 6) : [];
}

function findUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

async function downloadFromUrl(url) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'follow' });
  } catch {
    throw new BotError('❌ Impossible de récupérer cette URL (délai dépassé).');
  }
  if (!response.ok) throw new BotError(`❌ URL inaccessible (HTTP ${response.status}).`);

  const type = response.headers.get('content-type') || '';
  if (type && !/^image\//.test(type)) throw new BotError('❌ L’URL doit pointer vers une image.');

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new BotError('❌ Fichier vide.');
  if (buffer.length > MAX_URL_BYTES) throw new BotError('❌ Image trop lourde (max 10 Mo).');
  return buffer;
}

export default {
  name: 'sticker',
  aliases: ['s', 'stiker', 'stickers', 'ste', 'take'],
  category: 'sticker',
  description: 'Convertit une image/vidéo/sticker en sticker WhatsApp',
  usage: '/sticker [pack|auteur] (en répondant à un média, ou avec une URL d’image)',
  examples: ['/sticker', '/s', '/sticker IDREM TERESHKOVA|Merdi', '/s https://exemple.com/image.png'],
  usesMedia: true,
  cooldownMs: 1500,

  async execute(ctx) {
    const { packname, author } = resolveMeta(ctx.argText, ctx.settings);
    const emojis = extractEmojis(ctx.argText);

    // 1) Cas particulier : une URL d'image est fournie dans les arguments.
    const url = findUrl(ctx.argText);
    if (url) {
      const buffer = await downloadFromUrl(url);
      const sticker = await createStickerFromImage(buffer, { packname, author, emojis });
      return ctx.sendSticker(sticker);
    }

    // 2) Média cité en priorité, sinon média du message courant.
    const info = ctx.quoted?.media || ctx.media;
    if (!info) {
      throw new BotError(
        `🎨 *Créer un sticker*\n\n` +
          `Répondez à une image, une vidéo courte ou un sticker avec :\n` +
          `\`${ctx.prefix}sticker\`\n\n` +
          `Personnaliser le pack :\n\`${ctx.prefix}sticker NomDuPack|Auteur\`\n` +
          `Depuis une URL :\n\`${ctx.prefix}sticker https://exemple.com/image.png\`\n\n` +
          `Pack par défaut : *${packname}* • Auteur : *${author || '—'}*`,
      );
    }

    const { buffer } = ctx.quoted?.media ? await ctx.downloadQuoted() : await ctx.downloadMedia();
    let sticker;

    switch (info.kind) {
      case 'image': {
        if (isAnimatedWebp(buffer) || info.isGif || (info.mimetype || '').includes('gif')) {
          sticker = await createStickerFromVideo(buffer, { packname, author, emojis, ext: '.gif' });
        } else {
          sticker = await createStickerFromImage(buffer, { packname, author, emojis });
        }
        break;
      }

      case 'video': {
        if (info.seconds && Number(info.seconds) > MAX_VIDEO_SECONDS) {
          throw new BotError(`❌ Vidéo trop longue (${info.seconds}s). Maximum : ${MAX_VIDEO_SECONDS} secondes.`);
        }
        const ext = EXTENSION_BY_MIME[info.mimetype] || '.mp4';
        sticker = await createStickerFromVideo(buffer, { packname, author, emojis, ext });
        break;
      }

      case 'sticker': {
        // Re-marquage : nouveau pack/auteur sur un sticker existant.
        sticker = await addStickerExif(buffer, { packname, author, emojis });
        break;
      }

      default:
        throw new BotError('❌ Média non pris en charge : utilisez une image, une vidéo courte ou un sticker.');
    }

    await ctx.sendSticker(sticker);
    await ctx.react('🎨').catch(() => {});
  },
};
