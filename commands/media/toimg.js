"use strict";

/**
 * /toimg — renvoie une pièce jointe reçue (photo, GIF, fichier image) sous
 * forme d'image directement dans la conversation.
 *
 * Aucune conversion magique : si le fichier n'est pas accessible, le bot le dit.
 */

const { lightBox, cmd, ICONS } = require("../../utils/text");
const { findAttachment, attachmentUrl, failureBox, bytes } = require("./_media");

const TYPES = ["photo", "animated_image", "file"];
const IMAGE_HINT = /\.(png|jpe?g|gif|webp|bmp)$/i;

module.exports = {
  name: "toimg",
  aliases: ["toimage", "voirimage", "imagefromfile"],
  category: "media",
  description: "Renvoie la photo/image reçue (message courant ou cité) sous forme d'image.",
  usage: "/toimg (avec une photo jointe ou en réponse à celle-ci)",
  examples: ["/toimg"],
  permissions: "public",
  cooldown: 10,
  external: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const attachment = findAttachment(ctx, TYPES);

    if (!attachment) {
      return lightBox("IMAGE", [
        `${ICONS.warn} Aucune photo détectée.`,
        "",
        `${ICONS.pin} Envoie une image avec la commande, ou réponds à un message contenant une image puis tape ${cmd("toimg", ctx.prefix)}.`,
        `${ICONS.info} Formats gérés : photo, GIF animé, fichier image (png, jpg, gif, webp).`
      ]);
    }

    if (String(attachment.type) === "file" && attachment.filename && !IMAGE_HINT.test(attachment.filename)) {
      return lightBox("IMAGE", [
        `${ICONS.warn} « ${String(attachment.filename).slice(0, 40)} » n'est pas une image.`,
        "",
        `${ICONS.info} Le bot ne convertit pas un document en image : rien n'est inventé.`,
        `${ICONS.pin} Pour un audio : ${cmd("tomp3", ctx.prefix)}.`
      ]);
    }

    let url = attachmentUrl(attachment);

    // Photos Messenger : l'URL peut nécessiter une résolution côté API.
    if (!url && attachment.ID && services.external.media.resolvePhoto) {
      const resolved = await services.external.media.resolvePhoto(ctx.api, attachment.ID);
      if (resolved.ok) url = resolved.data.url;
      else return failureBox("IMAGE", resolved, [cmd("toimg", ctx.prefix)]);
    }
    if (!url) {
      return lightBox("IMAGE", [
        `${ICONS.warn} Facebook n'expose aucune URL pour cette pièce jointe.`,
        "",
        `${ICONS.info} Impossible d'afficher un fichier que la plateforme ne rend pas accessible.`
      ]);
    }

    await ctx.typing(600);
    const file = await services.external.media.fetchFile(url, { timeoutMs: 30000 });
    if (file.ok && file.data.buffer && file.data.buffer.length) {
      const caption = `${ICONS.media} ${attachment.filename || "Image"}${file.data.size ? ` • ${bytes(file.data.size)}` : ""}`;
      const sent = await ctx.sendImage(file.data.buffer, { caption });
      if (sent) return "";
    }

    // Repli : lien direct (Messenger génère l'aperçu de l'image).
    const linked = await ctx.sendUrl(url, `${ICONS.media} ${attachment.filename || "Image"} (lien direct).`);
    if (linked) return "";

    return failureBox("IMAGE", file.ok ? { ok: false, kind: "error", message: "Envoi refusé par Messenger." } : file);
  }
};
