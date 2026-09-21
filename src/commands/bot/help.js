import { buildHelp } from '../../utils/menu.js';

export default {
  name: 'help',
  aliases: ['aide', 'h'],
  category: 'bot',
  description: 'Aide détaillée d’une commande',
  usage: '/help <commande>',
  examples: ['/help', '/help vv', '/help sticker'],

  async execute(ctx) {
    const target = ctx.args[0] ? String(ctx.args[0]).replace(new RegExp(`^\\${ctx.prefix}`), '').toLowerCase() : '';
    if (!target) {
      const command = ctx.manager.resolveCommand('menu');
      if (command) return command.execute(ctx);
      return ctx.reply(`💡 Tapez ${ctx.prefix}menu pour la liste des commandes.`);
    }

    const command = ctx.manager.resolveCommand(target);
    if (!command) {
      return ctx.reply(`❌ Commande inconnue : ${ctx.prefix}${target}\n💡 ${ctx.prefix}menu pour voir la liste.`);
    }

    await ctx.reply(buildHelp(command, ctx.prefix));
  },
};
