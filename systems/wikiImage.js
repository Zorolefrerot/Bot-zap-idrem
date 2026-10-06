'use strict';
/*
 * 🧬 MeR~NeL — systems/wikiImage.js
 * 🖼️ Images pour les quiz MÉMORIAL & LOGO : récupère la photo d'un lieu
 * ou le logo d'une marque via l'API Wikipedia (REST summary) — SANS CLÉ.
 * Cache mémoire des URL + échecs temporaires (10 min). Aucune image
 * disponible → l'item est SAUTÉ (règle permanente des quiz images).
 */

const fs = require('fs');
const path = require('path');

const UA = 'MeR~NeL-Bot/1.0 (Messenger quiz bot; +https://github.com/Zorolefrerot/Bot-zap-idrem)';
const urlCache = new Map(); // title -> url | null
const failCache = new Map(); // title -> timestamp
const FAIL_MS = 10 * 60 * 1000;

function typed(code, msg) {
  const e = new Error(msg || code);
  e.code = code;
  return e;
}

/* Cherche l'image principale de la page Wikipedia (fr puis en). */
async function resolveWikiImage(title, fetchImpl) {
  const f = fetchImpl || global.fetch;
  const key = String(title);
  if (urlCache.has(key)) return urlCache.get(key);
  const failed = failCache.get(key);
  if (failed && Date.now() - failed < FAIL_MS) return null;

  for (const lang of ['fr', 'en']) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await f(
          `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(key)}?redirect=true`,
          { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(15000) }
        );
        if (res.ok) {
          const j = await res.json();
          const src = (j.originalimage && j.originalimage.source) || (j.thumbnail && j.thumbnail.source);
          if (src) {
            urlCache.set(key, src);
            return src;
          }
          break; // page existe mais sans image → inutile de retenter
        }
        break; // 404/503 → on tente la langue suivante (retry au prochain cycle)
      } catch (_) {
        if (attempt === 1) break;
      }
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  failCache.set(key, Date.now());
  return null;
}

/**
 * Télécharge l'image d'une question {wiki} dans tmpDir.
 * @returns {Promise<string|null>} chemin local, ou null si indisponible.
 */
async function getQuizImage(q, tmpDir, fetchImpl) {
  if (!q || !q.wiki) return null;
  try {
    const src = await resolveWikiImage(q.wiki, fetchImpl);
    if (!src) return null;
    // téléchargement via le helper éprouvé du quiz manga
    const { downloadImage } = require('./mangaQuiz');
    const file = await downloadImage(src, tmpDir, fetchImpl);
    if (file && fs.existsSync(file)) return file;
    return null;
  } catch (_) {
    return null;
  }
}

/* Test : reset des caches (utilisé par les tests). */
function resetWikiCache() {
  urlCache.clear();
  failCache.clear();
}

module.exports = { resolveWikiImage, getQuizImage, resetWikiCache, typed };
