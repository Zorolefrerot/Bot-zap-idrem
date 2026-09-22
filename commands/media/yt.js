"use strict";

/**
 * /yt — informations YouTube.
 *
 *   /yt <lien vidéo>  → titre, chaîne, miniature (oEmbed officiel, sans clé)
 *   /yt <mots-clés>   → recherche via l'API YouTube Data v3 si YOUTUBE_API_KEY
 *                        est définie ; sinon message clair (jamais de scraping)
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");
const { failureBox } = require("./_media");

module.exports = {
  name: "yt",
  aliases: ["youtube", "video", "vidéo"],
  category: "media",
  description: "Recherche ou affiche les informations publiques d'une vidéo YouTube.",
  usage: "/yt <lien vidéo|mots-clés>",
  examples: ["/yt https://youtu.be/dQw4w9WgXcQ", "/yt tutoriel node.js"],
  permissions: "public",
  cooldown: 6,
  external: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const media = services.external.media;
    const input = ctx.argString.trim();
    if (!input) return lightBox("YOUTUBE", [`${ICONS.warn} Indique un lien vidéo ou des mots-clés.`, "", cmd("yt <lien|mots-clés>", ctx.prefix)]);

    const isUrl = /https?:\/\//i.test(input) || /^(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(input);

    // --- Cas 1 : lien direct → métadonnées publiques officielles (oEmbed) ----
    if (isUrl) {
      const parsed = media.parseUrl(input);
      if (!parsed.ok || parsed.platform !== "youtube") {
        return lightBox("YOUTUBE", [`${ICONS.warn} ${parsed.error || "Ce lien n'est pas une vidéo YouTube."}`, "", `${ICONS.pin} Exemple : https://youtu.be/xxxxxxxxxxx`]);
      }
      const res = await media.metadata(parsed.url);
      if (!res.ok) return failureBox("YOUTUBE", res, [cmd(`yt ${parsed.url}`, ctx.prefix)]);

      const data = res.data;
      const caption = [`🎬 ${data.title}`, data.author ? `👤 ${data.author}` : "", data.url].filter(Boolean).join("\n");
      if (data.thumbnail) {
        const sent = await ctx.sendUrl(data.thumbnail, caption);
        if (sent) return "";
      }
      return box(
        "YOUTUBE",
        [
          `${ICONS.media} ${data.title}`,
          `${ICONS.user} ${data.author || "chaîne inconnue"}`,
          data.width && data.height ? `${ICONS.chart} ${num(data.width)}×${num(data.height)}` : "",
          data.thumbnail ? `${ICONS.pin} Miniature : ${data.thumbnail.slice(0, 110)}` : "",
          "",
          `${ICONS.pin} ${data.url}`,
          "",
          `${ICONS.info} Audio : ${cmd(`ytmp3 ${data.url}`, ctx.prefix)}`,
          `${ICONS.info} Vidéo : ${cmd(`ytmp4 ${data.url}`, ctx.prefix)}`
        ].filter(Boolean)
      );
    }

    // --- Cas 2 : mots-clés → API officielle uniquement ----------------------
    const search = await media.youtubeSearch(input, { limit: 5 });
    if (!search.ok) {
      return failureBox("YOUTUBE", search, [
        `${ICONS.pin} Astuce sans clé : colle directement un lien vidéo (${cmd("yt <lien>", ctx.prefix)}).`
      ]);
    }

    const lines = search.data.videos.map((video, index) => {
      return `${index + 1}. ${video.title}${video.channel ? ` — ${video.channel}` : ""}\n   ${video.url}`;
    });

    return box(
      "RECHERCHE YOUTUBE",
      [
        `${ICONS.target} « ${search.data.query.slice(0, 60)} » • ${num(search.data.videos.length)} résultat(s)`,
        `${ICONS.pin} Source : ${search.data.source}`,
        "",
        ...lines,
        "",
        `${ICONS.info} Puis ${cmd("yt <lien>", ctx.prefix)} pour le détail d'une vidéo.`
      ]
    );
  }
};
