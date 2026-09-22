"use strict";

/**
 * /image — génération d'image (nécessite IMAGE_API_KEY).
 *   /image un chat astronaute
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");

module.exports = {
  name: "image",
  aliases: ["img", "generer", "générer", "draw", "dessine"],
  category: "ai",
  description: "Génère une image à partir d'une description (nécessite un service d'images).",
  usage: "/image <description>",
  examples: ["/image un chat astronaute sur la Lune"],
  permissions: "public",
  cooldown: 20,
  external: true,

  async execute(ctx, bag) {
    const ai = bag.services.external.ai;
    const prompt = ctx.argString.trim();

    if (!ai.imageConfigured()) {
      return box(
        "GÉNÉRATION D'IMAGES NON CONFIGURÉE",
        [
          `${ICONS.plug} Aucune clé de génération d'images n'est définie.`,
          "",
          `${ICONS.gear} Variables attendues :`,
          "  IMAGE_API_KEY = clé du service d'images",
          "  AI_BASE_URL   = endpoint compatible OpenAI Images (optionnel)",
          "",
          `${ICONS.warn} Le bot ne dessine rien lui-même et ne renvoie jamais d'image « approximative ».`
        ],
        { icon: ICONS.plug }
      );
    }

    if (!prompt) {
      return lightBox("IMAGE", [
        `${ICONS.warn} Décris l'image à générer.`,
        "",
        `${cmd("image un robot bleu dans l'espace", ctx.prefix)}`,
        `${cmd("image logo minimaliste IDREM", ctx.prefix)}`
      ]);
    }

    const result = await ai.generateImage(prompt, { size: "1024x1024" });
    if (!result.ok) return lightBox("IMAGE", [`${ICONS.no} ${result.message}`]);

    if (result.data.buffer) {
      const sent = await ctx.sendImage(result.data.buffer, { caption: `🎨 ${prompt.slice(0, 120)}` });
      if (sent) return "";
      return lightBox("IMAGE", [`${ICONS.warn} Image générée mais envoi impossible dans cette conversation.`]);
    }

    if (result.data.url) {
      const sent = await ctx.sendUrl(result.data.url, `🎨 ${prompt.slice(0, 120)}`);
      if (sent) return "";
      return box("IMAGE", [`${ICONS.ok} Image générée :`, result.data.url]);
    }

    return lightBox("IMAGE", [`${ICONS.no} Le service n'a renvoyé aucune image exploitable.`]);
  }
};
