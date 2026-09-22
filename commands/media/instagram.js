"use strict";

/**
 * /instagram <lien> — Meta n'expose aucune donnée publique sans jeton Graph :
 * sans service conforme branché, le bot explique au lieu d'inventer.
 */

const { lightBox, cmd, ICONS } = require("../../utils/text");
const { failureBox, deliver, bytes } = require("./_media");

module.exports = {
  name: "instagram",
  aliases: ["ig", "insta", "reels"],
  category: "media",
  description: "Récupère une publication Instagram via un service conforme (MEDIA_API_URL).",
  usage: "/instagram <lien Instagram>",
  examples: ["/instagram https://www.instagram.com/reel/AbCdEf123/"],
  permissions: "public",
  cooldown: 20,
  external: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const media = services.external.media;
    const target = ctx.argString.trim();
    if (!target) return lightBox("INSTAGRAM", [`${ICONS.warn} Colle le lien d'une publication ou d'un reel.`, "", cmd("instagram https://www.instagram.com/p/XXXX/", ctx.prefix)]);

    const parsed = media.parseUrl(target);
    if (!parsed.ok) return lightBox("INSTAGRAM", [`${ICONS.warn} ${parsed.error}`, "", `${ICONS.pin} Format attendu : instagram.com/p/… ou /reel/…`]);
    if (parsed.platform !== "instagram") return lightBox("INSTAGRAM", [`${ICONS.warn} Lien ${parsed.label} détecté — cette commande vise Instagram.`]);

    if (!media.configured()) {
      const res = await media.download("instagram", parsed.url);
      return failureBox("INSTAGRAM", res, [
        `${ICONS.gear} Variable à renseigner : MEDIA_API_URL (+ MEDIA_API_TOKEN).`,
        `${ICONS.pin} Instagram exige un jeton Graph API : aucune donnée publique n'est accessible sans service autorisé.`,
        `${ICONS.info} Le bot n'utilise aucun scraping ni contournement.`
      ]);
    }

    await ctx.typing(900);
    const res = await media.download("instagram", parsed.url, { timeoutMs: 45000 });
    if (!res.ok) return failureBox("INSTAGRAM", res);

    const data = res.data;
    const caption = [`📸 ${data.title}`, data.author ? `👤 ${data.author}` : "", data.size ? `💾 ${bytes(data.size)}` : ""].filter(Boolean).join("\n");
    const delivered = await deliver(ctx, bag, data.url, caption);
    if (delivered.ok) return "";
    return lightBox("INSTAGRAM", [`${ICONS.warn} ${delivered.message}`, "", `${ICONS.pin} Fichier : ${data.url.slice(0, 150)}`]);
  }
};
