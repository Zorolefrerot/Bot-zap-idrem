import { nameSchema, parseOrBotError } from '../../utils/validate.js';
import { BotError } from '../../utils/errors.js';

export default {
  name: 'setsticker',
  aliases: ['setpack', 'stickername', 'setstiker'],
  category: 'admin',
  description: 'Définit le nom du pack de stickers (et l’auteur)',
  usage: '/setsticker <NomDuPack>[|<Auteur>]',
  ownerOnly: true,
  examples: ['/setsticker IDREM TERESHKOVA', '/setsticker IDREM TERESHKOVA|Merdi'],

  async execute(ctx) {
    const raw = ctx.argText.trim();
    if (!raw) {
      throw new BotError(
        `ℹ️ Pack actuel : *${ctx.settings.stickerName}* • Auteur : *${ctx.settings.stickerAuthor || '—'}*\n\n` +
          `Usage : \`${ctx.prefix}setsticker <NomDuPack>|<Auteur>\``,
      );
    }

    const [packRaw, authorRaw] = raw.split('|');
    const patch = {};

    patch.stickerName = parseOrBotError(nameSchema, packRaw, `${ctx.prefix}setsticker IDREM TERESHKOVA`);

    if (authorRaw !== undefined) {
      patch.stickerAuthor = authorRaw.trim() ? parseOrBotError(nameSchema, authorRaw, `${ctx.prefix}setsticker Pack|Auteur`) : '';
    }

    ctx.db.updateSettings(patch);

    const settings = ctx.db.getSettings();
    await ctx.reply(
      `🎨 Stickers mis à jour :\n• Pack : *${settings.stickerName}*\n• Auteur : *${settings.stickerAuthor || '—'}*\n\n💡 ${ctx.prefix}sticker pour tester.`,
    );
  },
};
