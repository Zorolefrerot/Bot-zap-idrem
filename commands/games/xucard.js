'use strict';
/*
 * 🧬 MeR~NeL — commands/games/xucard.js
 * Xucard — le LANCEUR (ou un admin) déclare qu'un joueur utilise une carte
 * pendant une partie Xundercover : « Xucard <n°> @joueur [@cible] ».
 * Les effets secrets partent dans le QG (le TID fourni au lancement).
 */

module.exports = {
  name: 'xucard',
  description: 'Lanceur : déclarer qu\u2019un joueur utilise une carte Undercover',
  usage: 'Xucard <n°> @joueur [@cible]',
  category: 'games',
  aliases: ['xucarte'],
  adminOnly: false,
  cooldownMs: 2000,
  run: async (ctx) => {
    const session = ctx.sessions.get(ctx.threadID, 'xundercover');
    if (!session) {
      return ctx.send(ctx.fmt.frame('🃏 XUCARD', '⚠️ ' + ctx.fmt.bold('Aucune partie Xundercover en cours ici.')));
    }
    const cardNo = Number((ctx.args[0] || '').replace(/[^0-9]/g, ''));
    if (!cardNo) {
      return ctx.send(ctx.fmt.frame('🃏 XUCARD', `📌 ${ctx.fmt.bold('Format')} : Xucard <n°> @joueur [@cible]`));
    }
    const mentions = Object.keys(ctx.event.mentions || {}).map(String);
    const playerUid = mentions[0];
    const targetUid = mentions[1];
    if (!playerUid) {
      return ctx.send(ctx.fmt.frame('🃏 XUCARD', '⚠️ ' + ctx.fmt.bold('Mentionne le joueur') + ' : Xucard ' + cardNo + ' @joueur [@cible]'));
    }
    const ok = await session.declareCard(cardNo, playerUid, targetUid, ctx.senderID);
    if (!ok) {
      const pl = session.players.get(String(playerUid));
      if (!pl || !pl.alive) {
        return ctx.send(ctx.fmt.frame('🃏 XUCARD', '⚠️ ' + ctx.fmt.bold('Ce joueur ne joue pas (ou est éliminé).')));
      }
      return ctx.send(
        ctx.fmt.frame('🃏 XUCARD', [
          '❌ ' + ctx.fmt.bold('Carte non jouée :'),
          `• ${ctx.fmt.bold(pl.name)} n\u2019a pas la carte ${cardNo} en inventaire (Xucards buy ${cardNo})`,
          '• ou il a déjà joué une carte ce tour',
          '• ou tu n\u2019es pas le lanceur de la partie',
        ])
      );
    }
  },
};
