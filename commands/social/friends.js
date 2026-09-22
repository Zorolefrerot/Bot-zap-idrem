"use strict";

/**
 * /friends — affiche ta liste d'amis du bot.
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");

module.exports = {
  name: "friends",
  aliases: ["amis", "myfriends", "listeamis"],
  category: "social",
  description: "Affiche ta liste d'amis enregistrée par le bot.",
  usage: "/friends [@personne|uid]",
  examples: ["/friends"],
  permissions: "public",
  cooldown: 4,

  async execute(ctx, bag) {
    const { services } = bag;
    const target = ctx.resolveTarget(ctx.args[0]);
    const user = services.users.get(target.id);
    const isSelf = target.id === ctx.senderID;

    if (!user.friends.length) {
      return lightBox("AMIS", [
        `${isSelf ? "Ta liste d'amis est vide." : "Cette personne n'a aucun ami enregistré."}`,
        "",
        `${ICONS.pin} ${cmd("friend @quelquun", ctx.prefix)} pour en ajouter`
      ]);
    }

    const lines = user.friends.slice(0, 20).map((id, index) => `${String(index + 1).padStart(2, " ")}. ${ctx.displayName(id)}`);

    return box(
      isSelf ? "MES AMIS" : "AMIS",
      [
        `${ICONS.social} ${isSelf ? "Ta liste" : `Liste de ${ctx.displayName(target.id)}`} : ${num(user.friends.length)} personne(s)`,
        "",
        ...lines,
        user.friends.length > 20 ? `… et ${user.friends.length - 20} autre(s)` : ""
      ].filter(Boolean),
      { footer: [`${cmd("friend remove @quelquun", ctx.prefix)} pour retirer quelqu'un`] }
    );
  }
};
