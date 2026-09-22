"use strict";

/**
 * /tiktok <lien> — informations publiques (oEmbed officiel TikTok) et, si un
 * service conforme est branché, récupération du fichier.
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");
const { failureBox, deliver, bytes, TOS_LINE } = require("./_media");

module.exports = {
  name: "tiktok",
  aliases: ["tt", "tiktokmp4"],
  category: "media",
  description: "Affiche les informations publiques d'une vidéo TikTok (et la récupère si MEDIA_API_URL est branché).",
  usage: "/tiktok <lien TikTok>",
  examples: ["/tiktok https://www.tiktok.com/@user/video/1234567890"],
  permissions: "public",
  cooldown: 15,
  external: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const media = services.external.media;
    const target = ctx.argString.trim();
    if (!target) return lightBox("TIKTOK", [`${ICONS.warn} Colle le lien d'une vidéo TikTok.`, "", cmd("tiktok https://www.tiktok.com/@pseudo/video/123456", ctx.prefix)]);

    const parsed = media.parseUrl(target);
    if (!parsed.ok) return lightBox("TIKTOK", [`${ICONS.warn} ${parsed.error}`, "", `${ICONS.pin} Format attendu : tiktok.com/@pseudo/video/<id>`]);
    if (parsed.platform !== "tiktok") return lightBox("TIKTOK", [`${ICONS.warn} Lien ${parsed.label} détecté — cette commande vise TikTok.`]);

    // Service conforme branché → récupération réelle du fichier.
    if (media.configured()) {
      await ctx.typing(800);
      const res = await media.download("tiktok", parsed.url, { timeoutMs: 45000 });
      if (res.ok) {
        const data = res.data;
        const caption = [`📱 ${data.title}`, data.author ? `👤 ${data.author}` : "", data.size ? `💾 ${bytes(data.size)}` : ""].filter(Boolean).join("\n");
        const delivered = await deliver(ctx, bag, data.url, caption);
        if (delivered.ok) return "";
        return lightBox("TIKTOK", [`${ICONS.warn} ${delivered.message}`, "", `${ICONS.pin} Fichier : ${data.url.slice(0, 150)}`]);
      }
      if (res.kind !== "not-configured") return failureBox("TIKTOK", res);
    }

    // Sinon : métadonnées publiques officielles uniquement.
    const meta = await media.metadata(parsed.url);
    if (!meta.ok) {
      return failureBox("TIKTOK", meta, [
        `${ICONS.gear} Récupération du fichier : renseigne MEDIA_API_URL (service conforme que tu héberges).`,
        TOS_LINE
      ]);
    }

    const data = meta.data;
    if (data.thumbnail) {
      const caption = [`📱 ${data.title}`, data.author ? `👤 ${data.author}` : "", data.url, "", `${ICONS.gear} Fichier : MEDIA_API_URL non branché — informations publiques uniquement.`].filter(Boolean).join("\n");
      const sent = await ctx.sendUrl(data.thumbnail, caption);
      if (sent) return "";
    }

    return box("TIKTOK", [
      `${ICONS.media} ${data.title}`,
      `${ICONS.user} ${data.author || "auteur inconnu"}`,
      `${ICONS.pin} ${data.url}`,
      "",
      `${ICONS.gear} Récupération du fichier indisponible : MEDIA_API_URL n'est pas branché.`,
      `${ICONS.info} Le bot ne contourne pas les protections de TikTok.`
    ]);
  }
};
