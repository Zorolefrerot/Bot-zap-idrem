"use strict";

/**
 * /admins — administrateurs du groupe courant.
 */

const { box, lightBox, num, ICONS } = require("../../utils/text");

module.exports = {
  name: "admins",
  aliases: ["adminsgroupe", "adminlist", "responsables"],
  category: "groups",
  description: "Liste les administrateurs du groupe courant.",
  usage: "/admins",
  examples: ["/admins"],
  permissions: "public",
  cooldown: 10,
  groupOnly: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const info = await services.groups.threadInfo(ctx.threadID);
    if (!info.ok) return lightBox("ADMINISTRATEURS", [`${ICONS.warn} Informations de groupe indisponibles (${info.error}).`]);

    const admins = Array.isArray(info.adminIDs) ? info.adminIDs : [];
    const lines = [
      `${ICONS.group} ${ctx.threadName || info.name || "Ce groupe"} — ${num(info.memberCount)} membre(s)`,
      ""
    ];

    if (!admins.length) {
      lines.push(`${ICONS.info} Facebook n'indique aucun administrateur pour ce groupe.`);
      lines.push(`${ICONS.warn} Cela arrive sur les groupes sans admin déclaré ou si l'API ne les expose pas.`);
    } else {
      lines.push(`${ICONS.crown} ${num(admins.length)} administrateur(s) :`);
      lines.push(...admins.slice(0, 20).map((id) => `   • ${String(services.users.getName(id) || id).slice(0, 28)}${id === ctx.senderID ? " (toi)" : ""}`));
      if (admins.length > 20) lines.push(`   … ${num(admins.length - 20)} autre(s).`);
      lines.push("", `${ICONS.info} Les administrateurs du groupe peuvent utiliser les commandes de modération.`);
    }

    return box("ADMINISTRATEURS", lines.filter((line) => line !== ""));
  }
};
