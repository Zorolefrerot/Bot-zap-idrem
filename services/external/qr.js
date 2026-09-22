"use strict";

/**
 * services/external/qr.js
 * ---------------------------------------------------------------------------
 * Génération de QR codes en image via api.qrserver.com (public, SANS clé).
 *
 * Le résultat est un PNG (Buffer) envoyé comme pièce jointe. Si le service est
 * injoignable, la commande le dit clairement — aucun QR code n'est « dessiné »
 * en ASCII pour faire illusion.
 * ---------------------------------------------------------------------------
 */

const { fetchBuffer, query, fail, success } = require("./http");

const ENDPOINT = "https://api.qrserver.com/v1/create-qr-code/";
const MAX_DATA_LENGTH = 1500;
const DEFAULT_SIZE = 500;

/**
 * Génère un QR code PNG.
 *
 * @param {string} data texte ou URL à encoder
 * @param {{ size?: number, margin?: number, format?: "png"|"svg", timeoutMs?: number }} [options]
 * @returns {Promise<{ok: boolean, data?: {buffer: Buffer, contentType: string, size: number, encoded: string}, kind?: string, message?: string}>}
 */
async function generate(data, options = {}) {
  const payload = String(data ?? "").trim();
  if (!payload) return fail("error", "Rien à encoder.");
  if (payload.length > MAX_DATA_LENGTH) {
    return fail("error", `Contenu trop long pour un QR code lisible (max ${MAX_DATA_LENGTH} caractères).`);
  }

  const size = Math.min(1000, Math.max(120, Number(options.size) || DEFAULT_SIZE));
  const format = options.format === "svg" ? "svg" : "png";
  const url = `${ENDPOINT}${query({
    data: payload,
    size: `${size}x${size}`,
    format,
    margin: Math.min(30, Math.max(0, Number(options.margin) || 10)),
    ecc: "M",
    charset: "UTF-8"
  })}`;

  const res = await fetchBuffer(url, { timeoutMs: options.timeoutMs || 15000 });
  if (!res.ok) return res;

  const contentType = res.contentType || (format === "svg" ? "image/svg+xml" : "image/png");
  if (format === "png" && !/image\/(png|jpeg|octet-stream)/i.test(contentType)) {
    // Certaines erreurs sont renvoyées en HTML : on ne diffuse jamais ça comme image.
    return fail("unavailable", "Le service QR a renvoyé une réponse inattendue.");
  }

  return success({
    buffer: res.data,
    contentType,
    bytes: res.size,
    encoded: payload,
    dimensions: `${size}x${size}`,
    format,
    provider: "api.qrserver.com"
  });
}

/** Un texte est-il encodable (longueur raisonnable) ? */
function canEncode(data) {
  const payload = String(data ?? "").trim();
  return payload.length > 0 && payload.length <= MAX_DATA_LENGTH;
}

module.exports = { generate, canEncode, MAX_DATA_LENGTH };
