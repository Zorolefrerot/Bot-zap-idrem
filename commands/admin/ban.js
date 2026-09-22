"use strict";

/**
 * /ban — bannissement global : l'utilisateur ne peut plus utiliser AUCUNE
 * commande du bot, dans aucune conversation.
 *
 *   /ban <uid|@personne> [raison]
 *
 * Le propriétaire et les administrateurs du bot ne peuvent jamais être bannis.
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");
const { target, record } = require("../../utils/moderation");

module.exports = {
  name: "ban",
  aliases: ["banuser", "bannir", "blacklist"],
  category: "admin",
  description: "Bannit un utilisateur du bot (toutes conversations) avec une raison.",
  usage: "/ban <uid|@personne> [raison]",
  examples: ["/ban 100012345678901 Spam répété", "/ban @quelquun Publicité"],
  permissions: "admin",
  cooldown: 10,

  async execute(ctx, bag) {
    const { services, permissions } = bag;
    const { id, name, explicit, rest } = target(ctx);

    if (!id) return lightBox("BANNISSEMENT", [`${ICONS.warn} Cible invalide.`, "", `${ICONS.pin} ${cmd("ban <uid|@personne> [raison]", ctx.prefix)}`]);
    if (!explicit) return lightBox("BANNISSEMENT", [`${ICONS.warn} Indique qui bannir (UID ou mention).`, "", `${ICONS.pin} ${cmd("ban 100012345678901 raison", ctx.prefix)}`]);
    if (id === ctx.senderID) return lightBox("BANNISSEMENT", [`${ICONS.no} Tu ne peux pas te bannir toi-même.`]);
    if (services.warnings.isProtected(id)) return lightBox("BANNISSEMENT", [`${ICONS.no} Cet utilisateur est protégé (propriétaire du bot).`]);
    if (permissions.isAdmin(id)) {
      return lightBox("BANNISSEMENT", [`${ICONS.no} Un administrateur du bot ne peut pas être banni.`, "", `${ICONS.pin} Retire-lui d'abord son rôle (${cmd("admin", ctx.prefix)}).`]);
    }
    if (services.warnings.isBanned(id)) {
      const info = services.warnings.banInfo(id);
      return lightBox("BANNISSEMENT", [
        `${ICONS.warn} ${name || id} est déjà banni.`,
        info && info.reason ? `${ICONS.pin} Motif : ${info.reason}` : "",
        info && info.at ? `${ICONS.time} Depuis le ${new Date(info.at).toLocaleDateString("fr-FR")}` : "",
        "",
        `${ICONS.info} ${cmd(`unban ${id}`, ctx.prefix)} pour lever la sanction.`
      ].filter(Boolean));
    }

    const result = services.warnings.ban(id, rest, ctx.senderID);
    if (!result.ok) return lightBox("BANNISSEMENT", [`${ICONS.no} ${result.error}`]);

    record(bag, ctx, "ban", `${id}${rest ? ` — ${rest}` : ""}`);

    // Information de l'utilisateur banni (MP), sans détail technique.
    const notice = `⛔ Tu as été banni de ${bag.config.identity.name}.\n${rest ? `Motif : ${rest}\n` : ""}\nLe bot ne répondra plus à tes commandes. Contacte le propriétaire pour contester.`;
    await bag.sendTo(id, notice);

    return box("BANNISSEMENT", [
      `${ICONS.no} ${name || id} est banni du bot.`,
      rest ? `${ICONS.pin} Motif : ${rest.slice(0, 120)}` : `${ICONS.pin} Aucun motif précisé.`,
      `${ICONS.user} UID : ${id}`,
      "",
      `${ICONS.info} Portée : toutes les conversations (commandes ignorées).`,
      `${ICONS.info} Annulation : ${cmd(`unban ${id}`, ctx.prefix)}`
    ]);
  }
};
