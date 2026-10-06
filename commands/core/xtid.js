'use strict';
/*
 * 🧬 MeR~NeL — commands/core/xtid.js
 * Xtid — donne le TID (identifiant) de la conversation courante.
 * En GROUPE : le TID du groupe (à coller dans Xundercover pour y recevoir
 * les rôles). En PV : le TID de la conversation privée.
 */

module.exports = {
  name: 'xtid',
  description: 'Affiche le TID de cette conversation (groupe ou PV)',
  usage: 'Xtid',
  category: 'core',
  aliases: ['xtreadid', 'xgroupid'],
  adminOnly: false,
  cooldownMs: 3000,
  run: async (ctx) => {
    await ctx.send(
      ctx.fmt.frame('🆔 TID', [
        `${ctx.isGroup ? '👥' : '📩'} ${ctx.fmt.bold(ctx.isGroup ? 'TID DU GROUPE' : 'TID DE CE PV')} :`,
        '',
        ctx.fmt.bold(String(ctx.threadID)),
        '',
        '📋 ' + ctx.fmt.bold('Copie-le') + ' et colle-le quand le bot demande où envoyer les rôles (Xundercover).',
      ])
    );
  },
};
