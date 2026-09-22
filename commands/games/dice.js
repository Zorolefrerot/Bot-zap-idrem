"use strict";

/**
 * /dice — lancer de dés.
 *   /dice        → 1 dé à 6 faces
 *   /dice 20     → 1 dé à 20 faces
 *   /dice 3d6    → 3 dés à 6 faces
 */

const { box, lightBox, num, ICONS } = require("../../utils/text");

const FACES = { 1: "⚀", 2: "⚁", 3: "⚂", 4: "⚃", 5: "⚄", 6: "⚅" };

module.exports = {
  name: "dice",
  aliases: ["de", "dé", "des", "dés", "roll"],
  category: "games",
  description: "Lance un ou plusieurs dés (ex. /dice 3d6).",
  usage: "/dice [NdF]",
  examples: ["/dice", "/dice 20", "/dice 3d6"],
  permissions: "public",
  cooldown: 2,

  async execute(ctx, bag) {
    const result = bag.services.games.dice(ctx.argString);
    if (!result.ok) return lightBox("DÉS", [result.error]);

    const diceText = result.rolls.map((value) => (result.faces === 6 ? FACES[value] || value : value)).join(" ");

    return box(
      "DÉS",
      [
        `🎲 ${result.count} dé${result.count > 1 ? "s" : ""} à ${result.faces} faces`,
        "",
        diceText,
        "",
        `${ICONS.chart} Total : ${num(result.total)}`
      ],
      { icon: ICONS.game }
    );
  }
};
