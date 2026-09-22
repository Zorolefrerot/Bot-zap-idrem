"use strict";

/** /compliment — compliment sincère (corpus local). */

const { box, ICONS } = require("../../utils/text");
const { pick } = require("../../utils/random");
const { COMPLIMENTS } = require("../../services/corpus");

module.exports = {
  name: "compliment",
  aliases: ["complimente", "gentil", "praise"],
  category: "fun",
  description: "Envoie un compliment (corpus local, toujours positif).",
  usage: "/compliment [@personne]",
  examples: ["/compliment", "/compliment @quelquun"],
  permissions: "public",
  cooldown: 4,

  async execute(ctx) {
    const target = ctx.resolveTarget(ctx.args[0]);
    const name = target.id === ctx.senderID ? "" : target.name || ctx.displayName(target.id);
    return box(
      "COMPLIMENT",
      [`${ICONS.heart} ${name ? `${name}, ` : ""}${pick(COMPLIMENTS)}`, "", `${ICONS.info} Gratuit, sans limite, et sincère.`],
      { icon: ICONS.heart }
    );
  }
};
