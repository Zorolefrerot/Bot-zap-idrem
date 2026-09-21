import { stickerToImage } from '../../utils/sticker.js';
import { BotError } from '../../utils/errors.js';

export default {
  name: 'toimg',
  aliases: ['toimage', 'img', 'photo'],
  category: 'sticker',
  description: 'Convertit un sticker en image PNG',
  usage: '/toimg (en répondant à un sticker)',
  examples: ['/toimg'],
  usesMedia: true,

  async execute(ctx) {
    const source = ctx.quoted?.media?.kind === 'sticker' ? 'quoted' : ctx.media?.kind === 'sticker' ? 'self' : null;

    if (!source) {
      throw new BotError(`❌ Répondez à un *sticker* avec \`${ctx.prefix}toimg\` pour le convertir en image.`);
    }

    const { buffer } = source === 'quoted' ? await ctx.downloadQuoted() : await ctx.downloadMedia();
    const result = await stickerToImage(buffer);

    await ctx.sendImage(result.buffer, ctx.argText ? String(ctx.argText).slice(0, 500) : '✅ Image récupérée depuis le sticker.');
  },
};
