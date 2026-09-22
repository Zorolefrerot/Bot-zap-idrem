"use strict";

/**
 * /coin — pile ou face (avec pari optionnel).
 *   /coin           → tirage simple
 *   /coin pile      → parie sur pile
 *   /coin face 100  → parie 100 pièces sur face
 */

const { box, lightBox, cmd, ICONS, num } = require("../../utils/text");

module.exports = {
  name: "coin",
  aliases: ["pileface", "flip"],
  category: "games",
  description: "Pile ou face. Tu peux parier des pièces sur ton choix.",
  usage: "/coin [pile|face] [mise]",
  examples: ["/coin", "/coin pile", "/coin face 200"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const side = String(ctx.args[0] || "").toLowerCase();
    const bet = Number(ctx.args[1]) || 0;
    const currency = config.currency.symbol;

    if (bet > 0) {
      if (!Number.isInteger(bet) || bet < 1) return lightBox("PILE OU FACE", ["Mise invalide : indique un nombre entier positif."]);
      if (!["pile", "face"].includes(side)) {
        return lightBox("PILE OU FACE", [
          `${ICONS.warn} Pour parier, précise ton choix.`,
          "",
          `${cmd("coin pile 200", ctx.prefix)} ou ${cmd("coin face 200", ctx.prefix)}`
        ]);
      }
      if (!services.economy.has(ctx.senderID, bet)) {
        return lightBox("PILE OU FACE", [
          `Solde insuffisant : mise de ${services.economy.fmt(bet)} demandée.`,
          `Tu possèdes ${services.economy.fmt(services.economy.balance(ctx.senderID))}.`
        ]);
      }
    }

    const flip = services.games.coinFlip(side);
    const won = bet > 0 ? flip.win : null;

    let betLines = [];
    if (bet > 0) {
      if (won) {
        services.economy.add(ctx.senderID, bet, `pari ${flip.result} gagné`);
        betLines = [
          `${ICONS.ok} Pari gagné : +${num(bet)} ${currency}`,
          `Nouveau solde : ${services.economy.fmt(services.economy.balance(ctx.senderID))}`
        ];
      } else {
        services.economy.remove(ctx.senderID, bet, `pari ${flip.result} perdu`);
        betLines = [
          `${ICONS.no} Pari perdu : −${num(bet)} ${currency}`,
          `Nouveau solde : ${services.economy.fmt(services.economy.balance(ctx.senderID))}`
        ];
      }
    } else {
      const gains = services.xp.applyGameReward(ctx.senderID, "draw", services.economy);
      betLines = [`${ICONS.xp} +${num(gains.xp)} XP de participation`];
    }

    return box(
      won === true ? "PARI GAGNÉ" : won === false ? "PARI PERDU" : "PILE OU FACE",
      [
        `${flip.icon} Résultat : ${flip.result.toUpperCase()}`,
        flip.chosen ? `Ton choix : ${flip.chosen}` : "Tirage simple (sans pari)",
        "",
        ...betLines,
        "",
        `${ICONS.pin} Parier : ${cmd("coin pile 200", ctx.prefix)}`
      ],
      { icon: won === false ? ICONS.no : ICONS.game }
    );
  }
};
