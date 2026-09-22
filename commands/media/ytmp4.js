"use strict";

/**
 * /ytmp4 — vidéo YouTube (mp4), via le service conforme MEDIA_API_URL.
 * Aucun contournement des protections de la plateforme.
 */

const { lightBox, cmd, ICONS } = require("../../utils/text");
const { failureBox, deliver, bytes } = require("./_media");

module.exports = {
  name: "ytmp4",
  aliases: ["mp4", "ytvideo", "youtube-mp4"],
  category: "media",
  description: "Récupère la vidéo d'un lien YouTube via un service conforme (MEDIA_API_URL).",
  usage: "/ytmp4 <lien YouTube>",
  examples: ["/ytmp4 https://youtu.be/dQw4w9WgXcQ"],
  permissions: "public",
  cooldown: 25,
  external: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const media = services.external.media;
    const target = ctx.argString.trim();

    if (!target) return lightBox("YTMP4", [`${ICONS.warn} Indique le lien de la vidéo.`, "", cmd("ytmp4 <lien YouTube>", ctx.prefix)]);

    const parsed = media.parseUrl(target);
    if (!parsed.ok) return lightBox("YTMP4", [`${ICONS.warn} ${parsed.error}`, "", `${ICONS.pin} Exemple : https://youtu.be/xxxxxxxxxxx`]);
    if (parsed.platform !== "youtube") return lightBox("YTMP4", [`${ICONS.warn} Lien ${parsed.label} détecté — cette commande vise YouTube.`]);

    if (!media.configured()) {
      return failureBox("YTMP4", await media.download("ytmp4", parsed.url), [
        `${ICONS.gear} Variable à renseigner : MEDIA_API_URL.`,
        `${ICONS.pin} Sans service : ${cmd("yt <lien>", ctx.prefix)} donne les informations publiques et le lien officiel.`
      ]);
    }

    await ctx.typing(800);
    const res = await media.download("ytmp4", parsed.url, { timeoutMs: 60000 });
    if (!res.ok) return failureBox("YTMP4", res, [cmd(`yt ${parsed.url}`, ctx.prefix)]);

    const data = res.data;
    const caption = [`🎬 ${data.title}${data.author ? ` — ${data.author}` : ""}`, data.duration ? `⏱️ ${data.duration}` : "", data.size ? `💾 ${bytes(data.size)}` : ""].filter(Boolean).join("\n");

    const delivered = await deliver(ctx, bag, data.url, caption);
    if (delivered.ok) return "";
    return lightBox("YTMP4", [`${ICONS.warn} ${delivered.message}`, "", `${ICONS.pin} Fichier : ${data.url.slice(0, 150)}`]);
  }
};
