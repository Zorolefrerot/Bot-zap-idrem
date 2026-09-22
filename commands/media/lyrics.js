"use strict";

/**
 * /lyrics — paroles via LRCLIB (base communautaire libre, aucune clé requise).
 *   /lyrics artiste - titre
 *   /lyrics titre
 */

const { box, lightBox, cmd, num, ICONS } = require("../../utils/text");
const { failureBox } = require("./_media");

module.exports = {
  name: "lyrics",
  aliases: ["paroles", "lyric", "songtext"],
  category: "media",
  description: "Affiche les paroles d'un titre (LRCLIB, service libre sans clé).",
  usage: "/lyrics <artiste - titre>",
  examples: ["/lyrics Daft Punk - Around the World", "/lyrics shape of you"],
  permissions: "public",
  cooldown: 8,
  external: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const query = ctx.argString.trim();
    if (!query) {
      return lightBox("PAROLES", [`${ICONS.warn} Indique un artiste et/ou un titre.`, "", cmd("lyrics artiste - titre", ctx.prefix)]);
    }
    if (query.length > 120) return lightBox("PAROLES", [`${ICONS.warn} Recherche trop longue (120 caractères maximum).`]);

    const res = await services.external.lyrics.search(query, { timeoutMs: 15000 });
    if (!res.ok) {
      return failureBox("PAROLES", res, [
        `${ICONS.pin} Astuce : ${cmd("lyrics Artiste - Titre", ctx.prefix)} donne de meilleurs résultats.`
      ]);
    }

    const data = res.data;
    const header = [
      `${ICONS.media} ${data.title}${data.artist ? ` — ${data.artist}` : ""}`,
      data.album ? `${ICONS.book} Album : ${data.album}` : "",
      data.year ? `📅 Année : ${num(data.year)}` : "",
      data.duration ? `${ICONS.time} ${num(Math.round(data.duration))} s` : "",
      data.synced ? `🎼 Version synchronisée disponible sur LRCLIB.` : "",
      data.instrumental ? `${ICONS.info} Morceau instrumental : aucune parole publiée.` : "",
      "",
      data.text
    ].filter(Boolean);

    if (data.truncated) header.push("", `${ICONS.warn} Paroles tronquées pour rester lisible sur mobile.`);
    if (!data.exact) header.push("", `${ICONS.info} Correspondance approximative (meilleure estimation de LRCLIB).`);
    if (Array.isArray(data.others) && data.others.length) {
      header.push("", `${ICONS.pin} Autres pistes :`, ...data.others.map((other) => `   • ${other}`));
    }
    header.push("", `${ICONS.info} Source : LRCLIB (paroles fournies par la communauté).`);

    return box("PAROLES", header, { icon: ICONS.media });
  }
};
