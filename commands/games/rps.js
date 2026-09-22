"use strict";

/**
 * /rps — pierre, feuille, ciseaux contre le bot.
 */

const { box, lightBox, cmd, ICONS, num } = require("../../utils/text");

module.exports = {
  name: "rps",
  aliases: ["chifumi", "pierrefeuilleciseaux", "pfc"],
  category: "games",
  description: "Pierre, feuille, ciseaux contre le bot (XP et pièces en jeu).",
  usage: "/rps <pierre|feuille|ciseaux>",
  examples: ["/rps pierre", "/rps ciseaux"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx, bag) {
    const { services, config } = bag;
    const choice = ctx.args[0];

    if (!choice) {
      return lightBox("PIERRE FEUILLE CISEAUX", [
        `${ICONS.pin} Choisis ton coup :`,
        "",
        `✊ ${cmd("rps pierre", ctx.prefix)}`,
        `✋ ${cmd("rps feuille", ctx.prefix)}`,
        `✌️ ${cmd("rps ciseaux", ctx.prefix)}`
      ]);
    }

    const result = services.games.rps(choice);
    if (!result.ok) {
      return lightBox("PIERRE FEUILLE CISEAUX", [
        result.error,
        "",
        `Coups possibles : ${result.moves ? "" : ""}pierre, feuille, ciseaux.`
      ]);
    }

    const outcome = result.result === "win" ? "win" : result.result === "lose" ? "lose" : "draw";
    const gains = services.xp.applyGameReward(ctx.senderID, outcome, services.economy);

    const title = outcome === "win" ? "VICTOIRE" : outcome === "lose" ? "DÉFAITE" : "ÉGALITÉ";
    const headline =
      outcome === "win"
        ? `${ICONS.ok} Tu gagnes cette manche !`
        : outcome === "lose"
          ? `${ICONS.no} Le bot l'emporte.`
          : `${ICONS.info} Même coup — égalité.`;

    return box(
      title,
      [
        headline,
        "",
        `${result.icons.player} Toi : ${result.playerMove}`,
        `${result.icons.bot} Bot : ${result.botMove}`,
        "",
        `${ICONS.xp} +${num(gains.xp)} XP • ${ICONS.money} +${num(gains.coinsGiven)} ${config.currency.symbol}`,
        gains.leveledUp ? `⭐ Niveau ${gains.level} atteint !` : ""
      ].filter(Boolean),
      { icon: outcome === "win" ? ICONS.ok : outcome === "lose" ? ICONS.no : ICONS.info }
    );
  }
};
