import { BotError } from '../../utils/errors.js';

/**
 * /vv — récupération d'un média "View Once" (vue unique).
 *
 * Implémentation strictement basée sur les mécanismes de la bibliothèque
 * Baileys : lorsqu'un média en vue unique est reçu par le bot, son contenu
 * chiffré est livré au client comme n'importe quel média, et
 * `downloadMediaMessage()` le déchiffre via les clés de session légitimes
 * (avec re-upload automatique si WhatsApp l'exige).
 * Aucun contournement de protection WhatsApp n'est effectué : si le média
 * est expiré ou inaccessible côté serveur, l'échec est remonté proprement.
 */

const USAGE_LINES = [
  '❌ Aucun média View Once détecté.',
  '',
  '👉 Répondez à un média en *vue unique* (image, vidéo ou audio) puis tapez :',
  '`{prefix}vv`',
  '',
  '💡 Fonctionne aussi si le média vue unique est envoyé directement au bot en privé.',
];

export default {
  name: 'vv',
  aliases: ['readviewonce', 'viewonce', 'antionce', 'voir', 'vo'],
  category: 'media',
  description: 'Récupère un média envoyé en View Once (vue unique)',
  usage: '/vv (en répondant au média View Once)',
  examples: ['/vv', '/readviewonce'],
  usesMedia: true,
  cooldownMs: 1000,

  async execute(ctx) {
    // Cible prioritaire : le message cité (cas d'usage principal), sinon le message lui-même.
    const fromQuote = Boolean(ctx.quoted?.media);
    const info = fromQuote ? ctx.quoted.media : ctx.media;

    if (!info) {
      throw new BotError(USAGE_LINES.join('\n').replaceAll('{prefix}', ctx.prefix));
    }

    const { buffer } = fromQuote ? await ctx.downloadQuoted() : await ctx.downloadMedia();

    const wasViewOnce = fromQuote ? Boolean(ctx.quoted.isViewOnce || info.isViewOnce) : Boolean(info.isViewOnce);
    const note = wasViewOnce ? '' : '\n\nℹ️ Ce média n’était pas en vue unique : il a simplement été renvoyé.';

    switch (info.kind) {
      case 'image': {
        await ctx.sendImage(buffer, `📷 Image View Once récupérée.${note}`);
        break;
      }

      case 'video': {
        await ctx.sendVideo(buffer, `🎥 Vidéo View Once récupérée.${note}`, {
          mimetype: info.mimetype || 'video/mp4',
          gifPlayback: Boolean(info.isGif),
        });
        break;
      }

      case 'audio': {
        await ctx.reply(`🎵 Audio View Once récupéré.${note}`);
        await ctx.sendAudio(buffer, { mimetype: info.mimetype || 'audio/mpeg', ptt: Boolean(info.node?.ptt) });
        break;
      }

      case 'sticker': {
        await ctx.sendSticker(buffer);
        await ctx.reply(`🎨 Sticker View Once récupéré.${note}`);
        break;
      }

      case 'document': {
        await ctx.sendDocument(buffer, info.fileName || 'document.bin', info.mimetype);
        await ctx.reply(`📄 Document View Once récupéré.${note}`);
        break;
      }

      default:
        throw new BotError('❌ Type de média View Once non pris en charge.');
    }

    await ctx.react(wasViewOnce ? '✅' : 'ℹ️').catch(() => {});
  },
};
