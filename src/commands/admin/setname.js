import { nameSchema, parseOrBotError } from '../../utils/validate.js';
import { BotError } from '../../utils/errors.js';

export default {
  name: 'setname',
  aliases: ['setbotname', 'nom'],
  category: 'admin',
  description: 'Change le nom affiché du bot',
  usage: '/setname <nom du bot>',
  ownerOnly: true,
  examples: ['/setname IDREM TERESHKOVA BOT'],

  async execute(ctx) {
    const raw = ctx.argText.trim();
    if (!raw) {
      throw new BotError(`ℹ️ Nom actuel : *${ctx.settings.botName}*\n\nUsage : \`${ctx.prefix}setname <nom>\``);
    }

    const botName = parseOrBotError(nameSchema, raw, `${ctx.prefix}setname IDREM TERESHKOVA BOT`);
    ctx.db.updateSettings({ botName });

    await ctx.reply(`✅ Nom du bot mis à jour : *${botName}*`);
  },
};
