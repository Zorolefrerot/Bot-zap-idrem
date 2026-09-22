"use strict";

/**
 * /dare — un défi à réaliser (toujours sans risque).
 */

const { box, ICONS } = require("../../utils/text");

module.exports = {
  name: "dare",
  aliases: ["defi", "défi", "gage"],
  category: "games",
  description: "Tire un défi amusant et sans risque au hasard.",
  usage: "/dare",
  examples: ["/dare"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx, bag) {
    const result = bag.services.games.dare();
    return box(
      "DÉFI",
      [
        `${ICONS.fire} ${result.text}`,
        "",
        `${ICONS.info} Défi purement divertissant : rien d'obligatoire, aucune mise en jeu.`
      ],
      { icon: "🎯" }
    );
  }
};
