import { prefixSchema, parseOrBotError } from '../../utils/validate.js';
import { BotError } from '../../utils/errors.js';

export default {
  name: 'setprefix',
  aliases: ['prefix', 'changeprefix'],
  category: 'admin',
  description: 'Change le préfixe des commandes',
  usage: '/setprefix <symbole>',
  ownerOnly: true,
  examples: ['/setprefix !', '/setprefix .', '/setprefix ::'],

  async execute(ctx) {
    const raw = ctx.args[0];
    if (!raw) {
      throw new BotError(`ℹ️ Préfixe actuel : \`${ctx.settings.prefix}\`\n\nUsage : \`${ctx.prefix}setprefix <symbole>\``);
    }

    const prefix = parseOrBotError(prefixSchema, raw, `${ctx.prefix}setprefix !`);
    ctx.db.updateSettings({ prefix });

    await ctx.reply(`✅ Préfixe mis à jour : \`${prefix}\`\n💡 Testez avec ${prefix}ping`);
  },
};
