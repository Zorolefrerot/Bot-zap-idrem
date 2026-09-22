"use strict";

/**
 * services/external/index.js
 * ---------------------------------------------------------------------------
 * Registre des services externes.
 *
 * Deux familles, affichées honnêtement par /botinfo et /admin status :
 *   • PUBLICS (sans clé)   → météo, traduction, définitions, recherche, mèmes,
 *                            liens courts, devises, QR codes, paroles, oEmbed.
 *   • À CONFIGURER (clé)   → IA, génération d'images, téléchargement média.
 *
 * Un service « à configurer » sans clé renvoie toujours `kind:"not-configured"`
 * — jamais de résultat inventé.
 * ---------------------------------------------------------------------------
 */

const weather = require("./weather");
const translate = require("./translate");
const define = require("./define");
const search = require("./search");
const meme = require("./meme");
const shortener = require("./shortener");
const currency = require("./currency");
const qr = require("./qr");
const lyrics = require("./lyrics");
const { createAi } = require("./ai");
const { createMedia } = require("./media");

/**
 * @param {object} deps
 * @param {object} deps.config
 * @param {object} [deps.logger]
 */
function createExternal(deps = {}) {
  const { config } = deps;
  const logger = deps.logger;

  const ai = createAi({ config, logger });
  const media = createMedia({ config, logger });

  /**
   * État lisible de chaque service (affiché par /botinfo, /admin status).
   * @returns {Array<{ name: string, kind: "public"|"configured"|"missing", detail: string }>}
   */
  function status() {
    const aiInfo = ai.info();
    return [
      { name: "Météo", kind: "public", detail: "Open-Meteo (sans clé)" },
      { name: "Traduction", kind: "public", detail: "MyMemory (sans clé)" },
      { name: "Définitions", kind: "public", detail: "Wiktionnaire + Wikipédia" },
      { name: "Recherche", kind: "public", detail: "Wikipédia (API publique)" },
      { name: "Mèmes", kind: "public", detail: "meme-api.com / Reddit" },
      { name: "Liens courts", kind: "public", detail: "is.gd / TinyURL" },
      { name: "Devises", kind: "public", detail: "open.er-api.com" },
      { name: "QR codes", kind: "public", detail: "api.qrserver.com" },
      { name: "Paroles", kind: "public", detail: "lrclib.net" },
      { name: "Métadonnées vidéo", kind: "public", detail: "oEmbed YouTube / TikTok" },
      {
        name: "IA texte",
        kind: aiInfo.configured ? "configured" : "missing",
        detail: aiInfo.configured ? `${aiInfo.provider} • ${aiInfo.model}` : "AI_API_KEY absent"
      },
      {
        name: "IA image",
        kind: aiInfo.imageConfigured ? "configured" : "missing",
        detail: aiInfo.imageConfigured ? "endpoint Images compatible OpenAI" : "IMAGE_API_KEY absent"
      },
      {
        name: "Téléchargement média",
        kind: media.configured() ? "configured" : "missing",
        detail: media.configured() ? media.settings().apiUrl : "MEDIA_API_URL absent (volontaire : aucun contournement)"
      }
    ];
  }

  /** Nombre de services pleinement opérationnels. */
  function readiness() {
    const list = status();
    const ready = list.filter((s) => s.kind !== "missing").length;
    return { ready, total: list.length, missing: list.filter((s) => s.kind === "missing").map((s) => s.name) };
  }

  return {
    weather,
    translate,
    define,
    search,
    meme,
    shortener,
    currency,
    qr,
    lyrics,
    ai,
    media,
    status,
    readiness
  };
}

module.exports = { createExternal };
