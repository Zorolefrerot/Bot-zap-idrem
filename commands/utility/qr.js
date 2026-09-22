"use strict";

/**
 * /qr — génère un QR code (image PNG envoyée en pièce jointe).
 *   /qr https://exemple.com
 *   /qr Bonjour à tous
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");

module.exports = {
  name: "qr",
  aliases: ["qrcode", "qr-code"],
  category: "utility",
  description: "Génère un QR code image à partir d'un texte ou d'une URL.",
  usage: "/qr <texte ou url>",
  examples: ["/qr https://exemple.com", "/qr IDREM"],
  permissions: "public",
  cooldown: 8,

  async execute(ctx, bag) {
    const content = ctx.argString.trim();
    if (!content) {
      return lightBox("QR CODE", [
        `${ICONS.warn} Rien à encoder.`,
        "",
        `${cmd("qr https://exemple.com", ctx.prefix)}`,
        `${cmd("qr Mon texte à encoder", ctx.prefix)}`
      ]);
    }

    const result = await bag.services.external.qr.generate(content, { size: 600, timeoutMs: 20000 });
    if (!result.ok) {
      return lightBox("QR CODE", [
        `${ICONS.no} ${result.message}`,
        "",
        `${ICONS.info} Service : api.qrserver.com (public, sans clé).`
      ]);
    }

    const sent = await ctx.sendImage(result.data.buffer, {
      caption: `📱 QR code — ${content.slice(0, 60)}${content.length > 60 ? "…" : ""}`
    });

    if (sent) return "";
    return box("QR CODE", [
      `${ICONS.warn} L'image n'a pas pu être envoyée (${result.data.bytes} octets générés).`,
      `${ICONS.info} Contenu encodé : ${content.slice(0, 120)}`,
      "",
      `${cmd("qr", ctx.prefix)} peut être limité par les règles d'envoi de la conversation.`
    ]);
  }
};
