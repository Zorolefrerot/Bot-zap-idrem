'use strict';
/*
 * 🧬 MeR~NeL — commands/games/xucards.js
 * Xucards — boutique des 20 CARTES SPÉCIALES d'Undercover (500 →
 * 1 000 000 XCoins). Xucards = shop · Xucards buy <n°> = achat ·
 * en partie : « carte <n°> @cible » (1 carte / joueur / tour).
 */

const { CARDS, cardById } = require('../../systems/ucCards');

module.exports = {
  name: 'xucards',
  description: 'Boutique des 20 cartes spéciales Undercover (XCoins)',
  usage: 'Xucards · Xucards buy <1-20> · Xucards info <1-20>',
  category: 'games',
  aliases: ['xcartes', 'xcards'],
  adminOnly: false,
  cooldownMs: 3000,
  run: async (ctx) => {
    const user = ctx.db.ensureUser(ctx.senderID);
    const arg = (ctx.args[0] || '').toLowerCase();

    /* 🔍 Info : Xucards info <n°> */
    if (['info', 'details', 'detail', 'voir'].includes(arg)) {
      const card = cardById(ctx.args[1]);
      if (!card) {
        return ctx.send(ctx.fmt.frame('🃏 XCARTES', `⚠️ ${ctx.fmt.bold('Numéro de carte ?')} Entre 1 et ${CARDS.length} — tape Xucards.`));
      }
      const owned = (user.cards && user.cards[card.id]) || 0;
      return ctx.send(
        ctx.fmt.frame(`🃏 CARTE ${card.id} — ${card.emoji} ${card.name.toUpperCase()}`, [
          `${card.emoji} ${ctx.fmt.bold(card.name)}`,
          '',
          `🎯 ${ctx.fmt.bold('Utilité')} : ${card.desc}`,
          `💰 ${ctx.fmt.bold('Prix')} : ${ctx.fmt.bold(card.price.toLocaleString('fr-FR') + ' XCoins')}`,
          `⏱️ ${ctx.fmt.bold('Quand')} : phase ${card.phase === 'vote' ? 'VOTE uniquement' : 'n’importe quel tour'}`,
          `🎒 ${ctx.fmt.bold('Dans ton inventaire')} : ×${owned}`,
          '',
          `🛒 ${ctx.fmt.bold('Achat')} : Xucards buy ${card.id}`,
          `🎮 ${ctx.fmt.bold('En partie')} : carte ${card.id} @cible — ou dis-le au lanceur (Xucard ${card.id} @toi @cible)`,
        ])
      );
    }

    /* 🛒 Achat : Xucards buy <n°> */
    if (['buy', 'acheter', 'achat'].includes(arg)) {
      const card = CARDS.find((c) => c.id === Number(ctx.args[1]));
      if (!card) {
        return ctx.send(ctx.fmt.frame('🃏 XCARTES', `⚠️ ${ctx.fmt.bold('Numéro de carte ?')} Entre 1 et ${CARDS.length} — tape Xucards.`));
      }
      if (user.xcoins < card.price) {
        return ctx.send(
          ctx.fmt.frame('🃏 XCARTES', [
            `💸 ${ctx.fmt.bold('Solde insuffisant')} — il te faut ${ctx.fmt.bold(card.price.toLocaleString('fr-FR') + ' XCoins')}.`,
            `💰 Tu as ${ctx.fmt.bold(user.xcoins.toLocaleString('fr-FR') + ' XCoins')}.`,
            '💡 Gagne des XCoins : Xdaily · Xquiz · Xduel · Xbet',
          ])
        );
      }
      user.xcoins -= card.price;
      user.cards[card.id] = (user.cards[card.id] || 0) + 1;
      ctx.db.users.save();
      return ctx.send(
        ctx.fmt.frame('🃏 CARTE ACHETÉE', [
          `✅ ${ctx.fmt.bold(card.emoji + ' ' + card.name)} ajoutée à ton inventaire (×${user.cards[card.id]}).`,
          `🎯 ${card.desc}`,
          `💰 ${ctx.fmt.bold('Nouveau solde')} : ${ctx.fmt.bold(user.xcoins.toLocaleString('fr-FR') + ' XCoins')}`,
          '',
          '🎮 En partie : ' + ctx.fmt.bold(`carte ${card.id} @cible`),
        ])
      );
    }

    /* 🛍️ Boutique + inventaire */
    const owned = Object.entries(user.cards || {})
      .filter(([, n]) => n > 0)
      .map(([id, n]) => {
        const c = CARDS.find((x) => x.id === Number(id));
        return c ? `${c.emoji} ${c.name} ×${n}` : null;
      })
      .filter(Boolean);

    const half = Math.ceil(CARDS.length / 2);
    const lines = [
      `💰 ${ctx.fmt.bold('Ton solde')} : ${ctx.fmt.bold(user.xcoins.toLocaleString('fr-FR') + ' XCoins')}`,
      '',
      ctx.fmt.bold('── BOUTIQUE (1 → 10) ──'),
      ...CARDS.slice(0, half).map((c) => {
        const have = (user.cards[c.id] || 0) > 0 ? ` ✅×${user.cards[c.id]}` : '';
        return `${c.id}. ${c.emoji} ${ctx.fmt.bold(c.name)}${have} — ${ctx.fmt.bold(c.price.toLocaleString('fr-FR'))}`;
      }),
      '',
      ctx.fmt.bold('── BOUTIQUE (11 → 20) ──'),
      ...CARDS.slice(half).map((c) => {
        const have = (user.cards[c.id] || 0) > 0 ? ` ✅×${user.cards[c.id]}` : '';
        return `${c.id}. ${c.emoji} ${ctx.fmt.bold(c.name)}${have} — ${ctx.fmt.bold(c.price.toLocaleString('fr-FR'))}`;
      }),
      '',
      owned.length ? `🎒 ${ctx.fmt.bold('Inventaire')} : ${owned.join(' · ')}` : `🎒 ${ctx.fmt.bold('Inventaire vide')} — achète avec ${ctx.fmt.bold('Xucards buy <n°>')}`,
      '🔍 ' + ctx.fmt.bold('Détails d’une carte') + ' : Xucards info <n°>',
      '🎮 En partie : ' + ctx.fmt.bold('carte <n°> @cible') + ' (1 / joueur / tour)',
    ];
    await ctx.send(ctx.fmt.frame('🃏 XCARTES — BOUTIQUE', lines));
  },
};
