"use strict";

/**
 * Outils partagés par les commandes média.
 *
 * Principe absolu du projet : AUCUN contournement des protections des
 * plateformes, AUCUN résultat inventé. Ce module transforme chaque échec de
 * service externe en message clair et honnête, et ne livre un fichier que s'il
 * a réellement pu être récupéré.
 *
 * Fichier préfixé par « _ » : le registre ne le charge pas comme commande.
 */

const { box, lightBox, ICONS } = require("../../utils/text");

/** Rappel droits d'auteur / CGU, affiché avec chaque livraison de média. */
const TOS_LINE = `${ICONS.info} Respect des CGU et des droits d'auteur : n'utilise ces commandes que pour du contenu que tu es autorisé à récupérer.`;

/** Formate une taille en octets de façon lisible. */
function bytes(value) {
  const size = Number(value) || 0;
  if (!size) return "";
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

/**
 * Trouve une pièce jointe du bon type dans le message courant, sinon dans le
 * message cité (réponse).
 *
 * @param {object} ctx
 * @param {string[]} types types acceptés (« photo », « audio », « video », « file », « sticker », « animated_image »)
 */
function findAttachment(ctx, types = []) {
  const allowed = Array.isArray(types) && types.length ? types : null;
  const sources = [ctx.attachments || []];
  const replied = ctx.replied;
  if (replied && Array.isArray(replied.attachments)) sources.push(replied.attachments);
  else if (replied && replied.messageReply && Array.isArray(replied.messageReply.attachments)) {
    sources.push(replied.messageReply.attachments);
  }

  for (const list of sources) {
    for (const attachment of list) {
      if (!attachment || typeof attachment !== "object") continue;
      if (allowed && !allowed.includes(String(attachment.type))) continue;
      return attachment;
    }
  }
  return null;
}

/** URL exploitable d'une pièce jointe (plusieurs formats selon la source). */
function attachmentUrl(attachment) {
  if (!attachment || typeof attachment !== "object") return "";
  const candidates = [attachment.url, attachment.largePreviewUrl, attachment.previewUrl, attachment.playable_url, attachment.src, attachment.animatedGifUrl];
  const found = candidates.find((value) => typeof value === "string" && /^https?:\/\//i.test(value));
  return found ? String(found) : "";
}

/**
 * Message propre pour un échec de service externe (jamais de stack, jamais de
 * résultat simulé).
 *
 * @param {string} title   titre de l'encadré (« YTMP3 »)
 * @param {object} result  résultat `{ ok:false, kind, message }`
 * @param {string[]} [extraLines] lignes complémentaires (conseils, alternatives)
 */
function failureBox(title, result, extraLines = []) {
  const message = String((result && result.message) || "Service indisponible.");
  const kind = String((result && result.kind) || "error");

  if (kind === "not-configured") {
    return box(`${title} — SERVICE NON CONFIGURÉ`, [message, "", ...extraLines, extraLines.length ? "" : null, `${TOS_LINE}`].filter((l) => l !== null), {
      icon: ICONS.plug
    });
  }
  if (kind === "unauthorized") {
    return lightBox(title, [`${ICONS.no} Le service a refusé la demande.`, message, "", ...extraLines]);
  }
  if (kind === "rate-limited") {
    return lightBox(title, [`${ICONS.time} Trop de demandes vers le service distant.`, "Réessaie dans une minute.", "", ...extraLines]);
  }
  if (kind === "not-found") {
    return lightBox(title, [`${ICONS.warn} Contenu introuvable.`, message, "", ...extraLines]);
  }
  if (kind === "timeout" || kind === "unavailable") {
    return lightBox(title, [`${ICONS.warn} Service distant injoignable.`, message, "", "Le bot n'invente aucun fichier : réessaie plus tard.", ...extraLines]);
  }
  return lightBox(title, [`${ICONS.error} Impossible de traiter la demande.`, message, "", ...extraLines]);
}

/**
 * Livre un fichier média : d'abord en pièce jointe réelle (le fichier est
 * récupéré puis envoyé), sinon en lien cliquable, sinon message honnête.
 *
 * @returns {Promise<{ ok: boolean, message?: string, how?: "attachment"|"url" }>}
 */
async function deliver(ctx, bag, fileUrl, caption = "", options = {}) {
  const url = String(fileUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, message: "Le service n'a renvoyé aucune URL exploitable." };

  const body = options.tos === false ? caption : [caption, TOS_LINE].filter(Boolean).join("\n");

  const file = await bag.services.external.media.fetchFile(url, { timeoutMs: options.timeoutMs });
  if (file.ok && file.data.buffer && file.data.buffer.length) {
    const sent = await ctx.send({ attachment: file.data.buffer, body });
    if (sent) return { ok: true, how: "attachment" };
  }

  const linked = await ctx.sendUrl(url, body);
  if (linked) return { ok: true, how: "url" };

  return {
    ok: false,
    message: "Fichier récupéré mais impossible à envoyer sur cette conversation (limite Messenger ou pièce jointe refusée)."
  };
}

/** Carte publique d'une vidéo/contenu (métadonnées officielles oEmbed). */
function metadataBox(title, data, extraLines = []) {
  const lines = [
    `${ICONS.media} ${data.title}`,
    data.author ? `${ICONS.user} ${data.author}` : "",
    data.provider ? `${ICONS.pin} ${data.provider}` : "",
    data.width && data.height ? `${ICONS.chart} ${data.width}×${data.height}` : "",
    "",
    `${ICONS.pin} ${data.url}`
  ]
    .filter(Boolean)
    .concat(extraLines.length ? ["", ...extraLines] : []);

  return box(title, lines, { icon: ICONS.media });
}

module.exports = { TOS_LINE, bytes, findAttachment, attachmentUrl, failureBox, deliver, metadataBox };
