"use strict";

/**
 * /tomp3 — renvoie un audio reçu, ou convertit une vidéo en audio SI un service
 * conforme est branché (MEDIA_API_URL).
 *
 * Le bot n'embarque aucun encodeur : sans service, il le dit clairement au lieu
 * de faire semblant.
 */

const { lightBox, cmd, ICONS } = require("../../utils/text");
const { findAttachment, attachmentUrl, failureBox, deliver, bytes } = require("./_media");

module.exports = {
  name: "tomp3",
  aliases: ["toaudio", "mp3from", "extraire-audio"],
  category: "media",
  description: "Renvoie l'audio reçu, ou extrait l'audio d'une vidéo via un service conforme.",
  usage: "/tomp3 (avec un audio/une vidéo jointe ou en réponse)",
  examples: ["/tomp3"],
  permissions: "public",
  cooldown: 15,
  external: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const media = services.external.media;
    const audio = findAttachment(ctx, ["audio"]);
    const video = audio ? null : findAttachment(ctx, ["video", "file", "share", "animated_image"]);

    // 1. Audio déjà présent → on le renvoie tel quel (aucune conversion feinte).
    if (audio) {
      const url = attachmentUrl(audio);
      if (!url) {
        return lightBox("MP3", [`${ICONS.warn} Facebook n'expose aucune URL pour cet audio.`]);
      }
      await ctx.typing(600);
      const caption = `🎧 ${audio.filename || "Audio"}${audio.duration ? ` • ${Math.round(audio.duration / 1000)} s` : ""}`;
      const delivered = await deliver(ctx, bag, url, caption, { tos: false });
      if (delivered.ok) return "";
      return lightBox("MP3", [`${ICONS.warn} ${delivered.message}`, "", `${ICONS.pin} ${url.slice(0, 150)}`]);
    }

    // 2. Vidéo/fichier → extraction audio : nécessite un service conforme.
    if (video) {
      const url = attachmentUrl(video) || (video.subattachments && attachmentUrl(video.subattachments[0] || {}));
      if (!url) return lightBox("MP3", [`${ICONS.warn} Impossible de lire cette pièce jointe (aucune URL exposée).`]);

      if (!media.configured()) {
        return failureBox("MP3", await media.download("audio", url), [
          `${ICONS.gear} Extraction audio : renseigne MEDIA_API_URL (le bot n'embarque aucun encodeur).`,
          `${ICONS.pin} L'audio reçu, lui, est renvoyé tel quel : enregistre un vocal puis ${cmd("tomp3", ctx.prefix)}.`
        ]);
      }

      await ctx.typing(900);
      const res = await media.download("audio", url, { timeoutMs: 60000 });
      if (!res.ok) return failureBox("MP3", res);

      const data = res.data;
      const caption = [`🎧 ${data.title || "Audio extrait"}`, data.size ? `💾 ${bytes(data.size)}` : ""].filter(Boolean).join("\n");
      const delivered = await deliver(ctx, bag, data.url, caption);
      if (delivered.ok) return "";
      return lightBox("MP3", [`${ICONS.warn} ${delivered.message}`, "", `${ICONS.pin} Fichier : ${data.url.slice(0, 150)}`]);
    }

    // 3. Rien à traiter.
    return lightBox("MP3", [
      `${ICONS.warn} Aucun audio ni vidéo détecté.`,
      "",
      `${ICONS.pin} Envoie un vocal / une vidéo avec la commande, ou réponds au message concerné.`,
      `${ICONS.info} Audio reçu → renvoyé tel quel. Vidéo → extraction via MEDIA_API_URL.`
    ]);
  }
};
