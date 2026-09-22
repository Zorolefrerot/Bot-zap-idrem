"use strict";

/**
 * /sticker — autocollants Messenger.
 *
 * Ce qui est RÉEL ici :
 *   • /sticker <id>            → renvoie l'autocollant correspondant ;
 *   • /sticker (sur un message contenant un sticker, ou en réponse à celui-ci)
 *                              → renvoie ce sticker (l'API expose son ID) ;
 *   • sans ID ni sticker reçu  → explication honnête : l'API non officielle
 *     n'expose aucun catalogue consultable, donc aucune liste inventée.
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");
const { findAttachment } = require("./_media");

module.exports = {
  name: "sticker",
  aliases: ["stickers", "autocollant", "emojigrand"],
  category: "media",
  description: "Renvoie un autocollant Messenger (par ID, ou celui reçu dans la conversation).",
  usage: "/sticker [id]",
  examples: ["/sticker", "/sticker 362643017410744"],
  permissions: "public",
  cooldown: 6,

  async execute(ctx) {
    const raw = ctx.argString.trim();

    // 1. ID explicite.
    if (raw) {
      const id = raw.replace(/[^\d]/g, "");
      if (!id || id.length < 6) {
        return lightBox("AUTOCOLLANT", [`${ICONS.warn} « ${raw.slice(0, 24)} » n'est pas un identifiant d'autocollant.`, "", `${ICONS.pin} Un ID est une longue suite de chiffres (ex. 362643017410744).`]);
      }
      const sent = ctx.sendSticker(id);
      if (sent) return "";
      return lightBox("AUTOCOLLANT", [`${ICONS.no} Messenger a refusé cet identifiant.`, "", `${ICONS.info} L'autocollant a peut-être été retiré du catalogue.`]);
    }

    // 2. Sticker reçu dans ce message (ou dans le message cité).
    const received = findAttachment(ctx, ["sticker"]);
    if (received) {
      const id = String(received.stickerID || received.ID || "").trim();
      if (id) {
        const sent = ctx.sendSticker(id);
        if (sent) return `${received.caption ? `🎭 ${received.caption}\n` : ""}${ICONS.ok} Autocollant renvoyé (ID ${id}).`;
      }
      const url = String(received.url || "").trim();
      if (/^https?:\/\//i.test(url)) {
        const sentUrl = await ctx.sendUrl(url, `${ICONS.media} Autocollant reçu${received.caption ? ` — ${received.caption}` : ""}.`);
        if (sentUrl) return "";
      }
      return lightBox("AUTOCOLLANT", [`${ICONS.warn} Autocollant détecté, mais Messenger refuse de le renvoyer.`]);
    }

    // 3. Rien à exploiter → explication honnête.
    return box(
      "AUTOCOLLANT",
      [
        `${ICONS.info} L'API Messenger non officielle n'expose aucun catalogue d'autocollants consultable.`,
        "Le bot n'invente donc aucune liste.",
        "",
        `${ICONS.pin} Ce qui fonctionne réellement :`,
        `   • ${cmd("sticker <id>", ctx.prefix)} → renvoie un autocollant connu`,
        `   • Envoie un autocollant puis ${cmd("sticker", ctx.prefix)} → il est renvoyé`,
        `   • ${cmd("toimg", ctx.prefix)} → renvoie une photo reçue sous forme d'image`
      ]
    );
  }
};
