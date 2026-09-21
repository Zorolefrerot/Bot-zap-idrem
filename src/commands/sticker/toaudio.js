import { videoToAudio } from '../../utils/sticker.js';
import { BotError } from '../../utils/errors.js';

const EXTENSION_BY_MIME = {
  'video/mp4': '.mp4',
  'video/3gpp': '.3gp',
  'video/webm': '.webm',
  'video/x-matroska': '.mkv',
};

export default {
  name: 'toaudio',
  aliases: ['tomp3', 'mp3', 'audio'],
  category: 'sticker',
  description: 'Extrait l’audio d’une vidéo (MP3)',
  usage: '/toaudio (en répondant à une vidéo)',
  examples: ['/toaudio'],
  usesMedia: true,

  async execute(ctx) {
    const info = ctx.quoted?.media || ctx.media;
    if (!info || info.kind !== 'video') {
      throw new BotError(`❌ Répondez à une *vidéo* avec \`${ctx.prefix}toaudio\` pour en extraire le son.`);
    }

    const { buffer } = ctx.quoted?.media ? await ctx.downloadQuoted() : await ctx.downloadMedia();
    const ext = EXTENSION_BY_MIME[info.mimetype] || '.mp4';
    const result = await videoToAudio(buffer, { ext });

    await ctx.sendAudio(result.buffer, { mimetype: 'audio/mpeg' });
    await ctx.react('🎵').catch(() => {});
  },
};
