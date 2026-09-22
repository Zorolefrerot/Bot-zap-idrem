"use strict";

/**
 * /avatar — photo de profil publique d'un utilisateur (via l'API Facebook).
 * Aucune image n'est inventée : si Facebook ne renvoie rien, le bot le dit.
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");

module.exports = {
  name: "avatar",
  aliases: ["profilepic", "pdp", "avatarpic", "photoprofil"],
  category: "social",
  description: "Affiche la photo de profil publique de quelqu'un (ou la tienne).",
  usage: "/avatar [@personne|uid]",
  examples: ["/avatar", "/avatar @quelquun"],
  permissions: "public",
  cooldown: 6,

  async execute(ctx, bag) {
    const { services } = bag;
    const target = ctx.resolveTarget(ctx.args[0]);
    const name = target.name || ctx.displayName(target.id);
    const isSelf = target.id === ctx.senderID;

    const info = await services.groups.userInfo(target.id);
    if (!info.ok) {
      return lightBox("AVATAR", [
        `${ICONS.warn} Impossible de récupérer la photo de profil (${info.error || "API indisponible"}).`,
        "",
        `${ICONS.info} La photo peut aussi être masquée par les réglages de confidentialité du compte.`
      ]);
    }

    if (info.avatar && /^https?:\/\//i.test(info.avatar)) {
      const sent = await ctx.sendUrl(info.avatar, `🖼️ Photo de profil de ${isSelf ? "toi" : name}`);
      if (sent) return "";
      return box("AVATAR", [
        `${ICONS.user} ${isSelf ? "Ta photo" : `Photo de ${name}`}`,
        info.avatar.slice(0, 120),
        "",
        `${ICONS.warn} L'envoi de l'image a échoué : voici le lien.`
      ]);
    }

    return lightBox("AVATAR", [
      `${ICONS.user} ${info.name || name}`,
      info.vanity ? `Profil : facebook.com/${info.vanity}` : "",
      "",
      `${ICONS.info} Facebook n'a renvoyé aucune photo accessible pour ce compte.`
    ].filter(Boolean));
  }
};
