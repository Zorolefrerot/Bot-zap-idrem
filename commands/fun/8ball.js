"use strict";

/**
 * /8ball — la boule magique répond à une question fermée.
 *   /8ball vais-je réussir ?
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");
const { pick, dailyValue } = require("../../utils/random");
const { EIGHT_BALL } = require("../../services/corpus");

module.exports = {
  name: "8ball",
  aliases: ["boule", "oracle", "destin", "eightball"],
  category: "fun",
  description: "Pose une question fermée à la boule magique (divertissement).",
  usage: "/8ball <question>",
  examples: ["/8ball vais-je gagner au quiz ?", "/8ball dois-je dormir ?"],
  permissions: "public",
  cooldown: 4,

  async execute(ctx) {
    const question = ctx.argString.trim();
    if (!question) {
      return lightBox("BOULE MAGIQUE", [
        `${ICONS.warn} Pose une question à laquelle on répond par oui, non ou peut-être.`,
        "",
        `${cmd("8ball vais-je réussir mon quiz ?", ctx.prefix)}`
      ]);
    }

    // Réponse déterministe pour une même question le même jour (anti-boucle).
    const seed = dailyValue(`${ctx.senderID}:8ball:${question.toLowerCase().slice(0, 60)}`, 0, 99);
    const tone = seed < 45 ? "positive" : seed < 75 ? "neutral" : "negative";
    const answer = pick(EIGHT_BALL[tone]);
    const icons = { positive: "✅", neutral: "🔮", negative: "❌" };

    return box(
      "BOULE MAGIQUE",
      [
        `❓ ${question.slice(0, 140)}`,
        "",
        `${icons[tone]} ${answer}`,
        "",
        `${ICONS.info} Divertissement : aucune valeur prédictive réelle.`
      ],
      { icon: "🎱" }
    );
  }
};
