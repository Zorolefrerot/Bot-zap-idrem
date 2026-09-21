import { buildMenu } from '../../utils/menu.js';

export default {
  name: 'menu',
  aliases: ['commandes', 'cmds', 'liste', 'list'],
  category: 'bot',
  description: 'Affiche toutes les commandes par catégorie',
  usage: '/menu',
  examples: ['/menu'],

  async execute(ctx) {
    const status = ctx.manager.getStatus();
    const text = buildMenu({
      commands: ctx.manager.commands,
      settings: ctx.settings,
      status: status.whatsapp,
      prefix: ctx.prefix,
    });
    await ctx.reply(text);
  },
};
