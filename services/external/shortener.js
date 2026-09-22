"use strict";

/**
 * services/external/shortener.js
 * ---------------------------------------------------------------------------
 * Raccourcissement d'URL, sans clé :
 *   1. is.gd      → https://is.gd/create.php?format=simple&url=…
 *   2. tinyurl.com → https://tinyurl.com/api-create.php?url=…
 *
 * Sécurité : seules les URL http/https sont acceptées (jamais javascript:,
 * data:, file:…), et la longueur est bornée. Le raccourcisseur renvoie un lien
 * de redirection : c'est affiché comme tel, sans prétendre analyser la cible.
 * ---------------------------------------------------------------------------
 */

const { fetchText, fetchJson, query, fail, success } = require("./http");

const ISGD = "https://is.gd/create.php";
const TINYURL = "https://tinyurl.com/api-create.php";
const MAX_URL_LENGTH = 2000;

const ALLOWED_PROTOCOLS = ["http:", "https:"];

/**
 * Valide une URL (protocole autorisé, hôte présent, longueur raisonnable).
 * @param {string} raw
 * @returns {{ ok: boolean, url?: string, error?: string }}
 */
function validateUrl(raw) {
  const text = String(raw || "").trim();
  if (!text) return { ok: false, error: "Aucune URL indiquée." };
  if (text.length > MAX_URL_LENGTH) return { ok: false, error: `URL trop longue (max ${MAX_URL_LENGTH} caractères).` };
  if (/[\s<>"']/.test(text)) return { ok: false, error: "URL invalide (caractères interdits)." };

  let candidate = text;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) candidate = `https://${candidate}`;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: "URL invalide." };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol.toLowerCase())) {
    return { ok: false, error: `Protocole non autorisé (${parsed.protocol}). Seuls http et https sont acceptés.` };
  }
  if (!parsed.hostname || !parsed.hostname.includes(".")) {
    return { ok: false, error: "Nom de domaine invalide." };
  }
  if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(parsed.hostname)) {
    return { ok: false, error: "Les adresses locales ou privées ne peuvent pas être raccourcies." };
  }

  return { ok: true, url: parsed.toString(), hostname: parsed.hostname };
}

/** Source 1 : is.gd. */
async function viaIsGd(url, options = {}) {
  const endpoint = `${ISGD}${query({ format: "simple", url })}`;
  const res = await fetchText(endpoint, { timeoutMs: options.timeoutMs || 10000 });
  if (!res.ok) return res;
  const short = String(res.data || "").trim();
  if (!/^https:\/\/is\.gd\/\S+$/i.test(short)) return fail("error", "Réponse inattendue de is.gd.");
  return success(short);
}

/** Source 2 : TinyURL. */
async function viaTinyUrl(url, options = {}) {
  const endpoint = `${TINYURL}${query({ url })}`;
  const res = await fetchText(endpoint, { timeoutMs: options.timeoutMs || 10000 });
  if (!res.ok) return res;
  const short = String(res.data || "").trim();
  if (!/^https:\/\/tinyurl\.com\/\S+$/i.test(short)) return fail("error", "Réponse inattendue de TinyURL.");
  return success(short);
}

/**
 * Raccourcit une URL.
 * @param {string} rawUrl
 * @returns {Promise<{ok: boolean, data?: {short: string, original: string, provider: string, hostname: string}, kind?: string, message?: string}>}
 */
async function shorten(rawUrl, options = {}) {
  const checked = validateUrl(rawUrl);
  if (!checked.ok) return fail("error", checked.error);

  const first = await viaIsGd(checked.url, options);
  if (first.ok) {
    return success({ short: first.data, original: checked.url, provider: "is.gd", hostname: checked.hostname });
  }

  const second = await viaTinyUrl(checked.url, options);
  if (second.ok) {
    return success({ short: second.data, original: checked.url, provider: "tinyurl.com", hostname: checked.hostname });
  }

  const kind = first.kind === "timeout" || second.kind === "timeout" ? "timeout" : "unavailable";
  return fail(kind, "Les services de raccourcissement sont injoignables pour le moment.");
}

/**
 * Développe un lien court (en-tête Location), sans suivre la redirection.
 * Utile pour vérifier la destination avant de la partager.
 */
async function expand(shortUrl, options = {}) {
  const checked = validateUrl(shortUrl);
  if (!checked.ok) return fail("error", checked.error);
  if (typeof globalThis.fetch !== "function") return fail("unavailable", "fetch indisponible (Node 18+ requis).");
  try {
    const res = await fetch(checked.url, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "IDREM-TERESHKOVA/2.0" },
      signal: AbortSignal.timeout(options.timeoutMs || 8000)
    });
    const location = res.headers.get("location");
    if (location) {
      const target = validateUrl(new URL(location, checked.url).toString());
      if (!target.ok) return fail("error", `Redirection refusée : ${target.error}`);
      return success({ short: checked.url, expanded: target.url, hostname: target.hostname });
    }
    return fail("not-found", "Ce lien ne redirige pas (aucun en-tête Location).");
  } catch (err) {
    return fail("unavailable", `Expansion impossible : ${String(err.message).slice(0, 120)}`);
  }
}

module.exports = { shorten, expand, validateUrl };
