import { stickerToVideo } from '../../utils/sticker.js';
import { BotError } from '../../utils/errors.js';

export default {
  name: 'tovideo',
  aliases: ['tomp4', 'togif', 'mp4'],
  category: 'sticker',
  description: 'Convertit un sticker animé en vidéo MP4',
  usage: '/tovideo (en répondant à un sticker animé)',
  examples: ['/tovideo'],
  usesMedia: true,

  async execute(ctx) {
    const source = ctx.quoted?.media?.kind === 'sticker' ? 'quoted' : ctx.media?.kind === 'sticker' ? 'self' : null;

    if (!source) {
      throw new BotError(`❌ Répondez à un *sticker animé* avec \`${ctx.prefix}tovideo\`.`);
    }

    const { buffer } = source === 'quoted' ? await ctx.downloadQuoted() : await ctx.downloadMedia();
    const result = await stickerToVideo(buffer);

    await ctx.sendVideo(result.buffer, ctx.argText ? String(ctx.argText).slice(0, 500) : '🎬 Sticker converti en vidéo.');
  },
};
