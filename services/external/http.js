"use strict";

/**
 * services/external/http.js
 * ---------------------------------------------------------------------------
 * Couche HTTP commune à tous les services externes.
 *
 * Utilise le `fetch` natif de Node ≥ 18 : AUCUNE dépendance supplémentaire.
 * Toutes les réponses sont normalisées :
 *
 *   { ok: true,  data }                                        succès
 *   { ok: false, kind: "not-configured" | "not-found" |
 *                      "timeout" | "unavailable" | "error",
 *             message, status? }                               échec
 *
 * `kind` permet aux commandes d'afficher le BON message : « service non
 * configuré » (honnête) plutôt qu'une erreur technique opaque.
 * ---------------------------------------------------------------------------
 */

const DEFAULT_TIMEOUT_MS = 12000;
const MAX_BYTES = 6 * 1024 * 1024;

/** Erreur métier d'un service externe. */
class ServiceError extends Error {
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = "ServiceError";
    this.kind = kind;
    Object.assign(this, extra);
  }
}

function fail(kind, message, extra = {}) {
  return { ok: false, kind, message, ...extra };
}

function success(data, extra = {}) {
  return { ok: true, data, ...extra };
}

/** Le runtime dispose-t-il de fetch ? (Node ≥ 18) */
function hasFetch() {
  return typeof globalThis.fetch === "function";
}

/**
 * Requête HTTP avec délai maximal.
 *
 * @param {string} url
 * @param {{ method?: string, headers?: object, body?: string, timeoutMs?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<Response>}
 */
async function request(url, options = {}) {
  if (!hasFetch()) throw new ServiceError("unavailable", "fetch indisponible (Node 18+ requis).");
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body,
      signal: options.signal || controller.signal,
      redirect: options.redirect === undefined ? "follow" : options.redirect
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Récupère et décode du JSON.
 * @returns {Promise<{ok: boolean, data?: any, kind?: string, message?: string, status?: number}>}
 */
async function fetchJson(url, options = {}) {
  try {
    const res = await request(url, { ...options, headers: { accept: "application/json", ...(options.headers || {}) } });
    if (res.status === 404) return fail("not-found", "Ressource introuvable.", { status: res.status });
    if (res.status === 429) return fail("unavailable", "Service distant saturé (limite de requêtes atteinte).", { status: res.status });
    if (!res.ok) return fail("unavailable", `Service distant indisponible (HTTP ${res.status}).`, { status: res.status });

    const text = await res.text();
    if (text.length > MAX_BYTES) return fail("unavailable", "Réponse distante trop volumineuse.");
    try {
      return success(JSON.parse(text), { status: res.status });
    } catch {
      return fail("error", "Réponse distante illisible (JSON invalide).");
    }
  } catch (err) {
    return normalizeFetchError(err);
  }
}

/** Récupère du texte brut. */
async function fetchText(url, options = {}) {
  try {
    const res = await request(url, options);
    if (!res.ok) return fail("unavailable", `Service distant indisponible (HTTP ${res.status}).`, { status: res.status });
    const text = await res.text();
    if (text.length > MAX_BYTES) return fail("unavailable", "Réponse distante trop volumineuse.");
    return success(text.trim(), { status: res.status });
  } catch (err) {
    return normalizeFetchError(err);
  }
}

/** Récupère un contenu binaire (images, QR codes…). */
async function fetchBuffer(url, options = {}) {
  try {
    const res = await request(url, options);
    if (!res.ok) return fail("unavailable", `Service distant indisponible (HTTP ${res.status}).`, { status: res.status });

    const contentType = String(res.headers.get("content-type") || "");
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BYTES) return fail("unavailable", "Fichier distant trop volumineux.");
    if (!arrayBuffer.byteLength) return fail("error", "Fichier distant vide.");
    return success(Buffer.from(arrayBuffer), { contentType, size: arrayBuffer.byteLength });
  } catch (err) {
    return normalizeFetchError(err);
  }
}

function normalizeFetchError(err) {
  const cause = err && err.cause ? String(err.cause.message || err.cause.code || err.cause) : "";
  const message = `${String((err && err.message) || err || "")}${cause ? ` (${cause})` : ""}`;
  if (err && (err.name === "AbortError" || /aborted|timeout/i.test(message))) {
    return fail("timeout", "Le service distant n'a pas répondu à temps.");
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
    return fail("unavailable", "Service distant injoignable (résolution DNS impossible).");
  }
  if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|socket hang up/i.test(message)) {
    return fail("unavailable", "Connexion au service distant refusée ou interrompue.");
  }
  if (/certificate|SSL|TLS/i.test(message)) {
    return fail("unavailable", "Échec de la vérification TLS du service distant.");
  }
  if (err instanceof ServiceError) return fail(err.kind, err.message);
  // « fetch failed » sans cause exploitable = sortie réseau bloquée ou indisponible.
  if (/^fetch failed/i.test(message)) {
    return fail("unavailable", "Service distant injoignable depuis ce serveur (réseau sortant indisponible).", {
      detail: message.slice(0, 160)
    });
  }
  return fail("error", `Erreur réseau : ${message.slice(0, 120)}`);
}

/** Message uniforme « service non configuré ». */
function notConfigured(serviceName, hint = "") {
  return fail(
    "not-configured",
    `${serviceName} : service non configuré sur ce déploiement.${hint ? ` ${hint}` : ""}`
  );
}

/** Construit une query string encodée. */
function query(params) {
  const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!entries.length) return "";
  return `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&")}`;
}

module.exports = {
  ServiceError,
  fail,
  success,
  hasFetch,
  request,
  fetchJson,
  fetchText,
  fetchBuffer,
  normalizeFetchError,
  notConfigured,
  query,
  DEFAULT_TIMEOUT_MS,
  MAX_BYTES
};
