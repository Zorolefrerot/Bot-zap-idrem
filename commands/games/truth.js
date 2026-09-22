"use strict";

/**
 * /truth — une vérité à révéler (jeu action/vérité).
 */

const { box, ICONS } = require("../../utils/text");

module.exports = {
  name: "truth",
  aliases: ["verite", "vérité"],
  category: "games",
  description: "Tire une question « vérité » au hasard (jeu, sans conséquence).",
  usage: "/truth",
  examples: ["/truth"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx, bag) {
    const result = bag.services.games.truth();
    return box(
      "VÉRITÉ",
      [`${ICONS.target} ${result.text}`, "", `${ICONS.info} C'est un jeu : réponds librement, ou passe ton tour.`],
      { icon: "🕵️" }
    );
  }
};
