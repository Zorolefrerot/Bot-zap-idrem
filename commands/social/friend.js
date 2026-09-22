"use strict";

/**
 * /friend — ajoute (ou retire) quelqu'un à ta liste d'amis du bot.
 *   /friend @quelquun        → ajoute
 *   /friend remove @quelquun → retire
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");

module.exports = {
  name: "friend",
  aliases: ["ami", "addfriend", "bestie"],
  category: "social",
  description: "Ajoute quelqu'un à ta liste d'amis du bot (ou l'en retire).",
  usage: "/friend [remove] <@personne|uid>",
  examples: ["/friend @quelquun", "/friend remove @quelquun"],
  permissions: "public",
  cooldown: 4,

  async execute(ctx, bag) {
    const { services } = bag;
    const first = String(ctx.args[0] || "").toLowerCase();
    const removing = ["remove", "delete", "supprimer", "retirer", "unfriend"].includes(first);
    const targetRaw = removing ? ctx.args[1] : ctx.args[0];
    const target = ctx.resolveTarget(targetRaw);

    if (!target.explicit || target.id === ctx.senderID) {
      return lightBox("AMIS", [
        `${ICONS.warn} Mentionne la personne à ajouter.`,
        "",
        `${cmd("friend @quelquun", ctx.prefix)} — ${cmd("friend remove @quelquun", ctx.prefix)}`
      ]);
    }

    const result = removing ? services.users.removeFriend(ctx.senderID, target.id) : services.users.addFriend(ctx.senderID, target.id);
    if (!result.ok) return lightBox("AMIS", [`${ICONS.no} ${result.error}`]);

    const name = target.name || ctx.displayName(target.id);
    return box(
      removing ? "AMI RETIRÉ" : "AMI AJOUTÉ",
      [
        `${removing ? ICONS.warn : ICONS.ok} ${name} ${removing ? "n'est plus dans ta liste." : "rejoint ta liste d'amis."}`,
        `${ICONS.social} Liste : ${num(result.total)} personne(s)`,
        "",
        `${ICONS.pin} ${cmd("friends", ctx.prefix)} pour voir ta liste`
      ],
      { icon: ICONS.social }
    );
  }
};
