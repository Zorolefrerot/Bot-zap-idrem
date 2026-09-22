"use strict";

/**
 * /uid — identifiant Facebook (le tien, ou celui d'une personne mentionnée).
 */

const { box, mono, ICONS } = require("../../utils/text");

module.exports = {
  name: "uid",
  aliases: ["id", "userid"],
  category: "general",
  description: "Donne ton UID Facebook, ou celui de la personne mentionnée/citée.",
  usage: "/uid [@personne]",
  examples: ["/uid", "/uid @quelquun"],
  permissions: "public",
  cooldown: 3,

  async execute(ctx) {
    const target = ctx.resolveTarget(ctx.args[0]);
    const isSelf = target.id === ctx.senderID;
    const name = target.name || ctx.displayName(target.id);

    return box(
      "UID",
      [
        `${ICONS.user} ${isSelf ? "Ton UID" : `UID de ${name}`}`,
        `${mono(target.id)}`,
        "",
        `Source : ${isSelf ? "ton message" : target.source === "mention" ? "mention" : target.source === "reply" ? "message cité" : "argument"}`
      ],
      { footer: [`${ICONS.info} Cet identifiant sert pour /give, /profile <uid>, /warn…`] }
    );
  }
};
