"use strict";

/**
 * /play <titre> — lecture d'un morceau.
 *
 * Le bot ne dispose d'aucun lecteur audio dans Messenger et ne télécharge rien
 * sans service conforme. Il propose donc :
 *   • la récupération réelle de l'audio si MEDIA_API_URL est branché ;
 *   • sinon les alternatives VRAIMENT disponibles (/yt, /lyrics).
 */

const { lightBox, cmd, ICONS } = require("../../utils/text");
const { failureBox, deliver } = require("./_media");

module.exports = {
  name: "play",
  aliases: ["music", "musique", "song", "ecouter", "écouter"],
  category: "media",
  description: "Récupère l'audio d'un titre via un service conforme, sinon oriente vers les vraies alternatives.",
  usage: "/play <titre|lien>",
  examples: ["/play https://youtu.be/dQw4w9WgXcQ", "/play daft punk around the world"],
  permissions: "public",
  cooldown: 20,
  external: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const media = services.external.media;
    const target = ctx.argString.trim();
    if (!target) return lightBox("PLAY", [`${ICONS.warn} Indique un titre ou un lien.`, "", cmd("play <titre|lien>", ctx.prefix)]);

    if (!media.configured()) {
      return failureBox("PLAY", await media.download("audio", target), [
        `${ICONS.gear} Pour activer la récupération audio : MEDIA_API_URL (service conforme que tu héberges).`,
        "",
        `${ICONS.pin} Disponibles immédiatement, sans service :`,
        `   • ${cmd("yt <lien vidéo>", ctx.prefix)} → informations publiques YouTube`,
        `   • ${cmd("lyrics <artiste - titre>", ctx.prefix)} → paroles synchronisées (LRCLIB, sans clé)`
      ]);
    }

    await ctx.typing(900);
    const res = await media.download("audio", target, { timeoutMs: 60000 });
    if (!res.ok) return failureBox("PLAY", res);

    const data = res.data;
    const caption = [`🎵 ${data.title}${data.author ? ` — ${data.author}` : ""}`, data.duration ? `⏱️ ${data.duration}` : ""].filter(Boolean).join("\n");
    const delivered = await deliver(ctx, bag, data.url, caption);
    if (delivered.ok) return "";
    return lightBox("PLAY", [`${ICONS.warn} ${delivered.message}`, "", `${ICONS.pin} Fichier : ${data.url.slice(0, 150)}`]);
  }
};
