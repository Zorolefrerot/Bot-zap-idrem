"use strict";

/**
 * /ytmp3 — audio d'une vidéo YouTube.
 *
 * Le bot ne télécharge RIEN lui-même et ne contourne aucune protection :
 * il passe par un service conforme hébergé par le propriétaire (MEDIA_API_URL).
 * Sans ce service, la réponse est un refus expliqué, jamais un faux fichier.
 */

const { lightBox, cmd, ICONS } = require("../../utils/text");
const { failureBox, deliver, bytes } = require("./_media");

module.exports = {
  name: "ytmp3",
  aliases: ["mp3", "ytaudio", "youtube-mp3"],
  category: "media",
  description: "Récupère l'audio d'une vidéo YouTube via un service conforme (MEDIA_API_URL).",
  usage: "/ytmp3 <lien YouTube>",
  examples: ["/ytmp3 https://youtu.be/dQw4w9WgXcQ"],
  permissions: "public",
  cooldown: 20,
  external: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const media = services.external.media;
    const target = ctx.argString.trim();

    if (!target) return lightBox("YTMP3", [`${ICONS.warn} Indique le lien de la vidéo.`, "", cmd("ytmp3 <lien YouTube>", ctx.prefix)]);

    const parsed = media.parseUrl(target);
    if (!parsed.ok) return lightBox("YTMP3", [`${ICONS.warn} ${parsed.error}`, "", `${ICONS.pin} Exemple : https://youtu.be/xxxxxxxxxxx`]);
    if (parsed.platform !== "youtube") {
      return lightBox("YTMP3", [`${ICONS.warn} Lien ${parsed.label} détecté — cette commande vise YouTube.`, "", `${ICONS.pin} ${cmd("tiktok <lien>", ctx.prefix)} ou ${cmd("instagram <lien>", ctx.prefix)}`]);
    }

    if (!media.configured()) {
      return failureBox("YTMP3", await media.download("ytmp3", parsed.url), [
        `${ICONS.gear} Variable à renseigner : MEDIA_API_URL (+ MEDIA_API_TOKEN si ton service est protégé).`,
        `${ICONS.pin} Alternative immédiate, sans service : ${cmd("lyrics <artiste - titre>", ctx.prefix)} et ${cmd("yt <lien>", ctx.prefix)}.`
      ]);
    }

    await ctx.typing(800);
    const res = await media.download("ytmp3", parsed.url, { timeoutMs: 45000 });
    if (!res.ok) return failureBox("YTMP3", res, [cmd(`yt ${parsed.url}`, ctx.prefix)]);

    const data = res.data;
    const caption = [`🎧 ${data.title}${data.author ? ` — ${data.author}` : ""}`, data.duration ? `⏱️ ${data.duration}` : "", data.size ? `💾 ${bytes(data.size)}` : "", `📥 ${data.format}`]
      .filter(Boolean)
      .join("\n");

    const delivered = await deliver(ctx, bag, data.url, caption);
    if (delivered.ok) return "";
    return lightBox("YTMP3", [`${ICONS.warn} ${delivered.message}`, "", `${ICONS.pin} Fichier : ${data.url.slice(0, 150)}`]);
  }
};
