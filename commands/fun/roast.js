"use strict";

/**
 * /roast — taquinerie gentille (jamais de contenu haineux).
 *   /roast           → toi
 *   /roast @quelquun → la personne mentionnée
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");
const { pick } = require("../../utils/random");
const { ROASTS } = require("../../services/corpus");

module.exports = {
  name: "roast",
  aliases: ["taquine", "clash", "insulte"],
  category: "fun",
  description: "Envoie une taquinerie humoristique (toujours bon enfant, jamais haineuse).",
  usage: "/roast [@personne]",
  examples: ["/roast", "/roast @quelquun"],
  permissions: "public",
  cooldown: 5,

  async execute(ctx) {
    const target = ctx.resolveTarget(ctx.args[0]);
    const name = target.id === ctx.senderID ? "toi" : target.name || ctx.displayName(target.id);
    const roast = pick(ROASTS);

    if (target.id !== ctx.senderID && !target.explicit) {
      return lightBox("TAQUINERIE", [`${ICONS.warn} Mentionne quelqu'un pour le taquiner.`, "", cmd("roast @quelquun", ctx.prefix)]);
    }

    return box(
      "TAQUINERIE",
      [
        `${ICONS.fire} ${target.id === ctx.senderID ? "À toi-même" : name} :`,
        roast,
        "",
        `${ICONS.info} 100 % humour — rien de personnel, jamais méchant.`
      ],
      { icon: ICONS.fire }
    );
  }
};
