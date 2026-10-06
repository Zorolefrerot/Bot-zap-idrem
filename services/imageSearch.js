'use strict';
/*
 * 🧬 MeR~NeL — services/imageSearch.js
 * Recherche d'images Google (module best-effort).
 * La requête utilisateur est TOUJOURS encodée avec encodeURIComponent()
 * — jamais insérée brute dans une URL.
 */

const { sanitizeQuery } = require('../utils/sanitize');

const SEARCH_BASE = 'https://images.google.com/search?tbm=isch&q=';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function createImageSearch(logger) {
  function typedError(code, message) {
    const e = new Error(message || code);
    e.code = code;
    return e;
  }

  function extractImageUrls(html, limit) {
    const urls = new Set();
    // 1) Objets JSON intégrés : "ou":"https://..." (Google Images classique)
    const ouRegex = /"ou":"(https?:\/\/[^"]+?)"/g;
    let m;
    while ((m = ouRegex.exec(html)) !== null) {
      try {
        const url = JSON.parse(`"${m[1]}"`).replace(/\\u003d/g, '=').replace(/\\u0026/g, '&');
        if (/^https?:\/\//.test(url) && !/\.svg($|\?)/.test(url)) urls.add(url);
      } catch (_) { /* ignoré */ }
      if (urls.size >= limit * 3) break;
    }
    // 2) Fallback : srcset/img classiques
    if (urls.size === 0) {
      const imgRegex = /<img[^>]+src="(https?:\/\/[^"]+)"/g;
      while ((m = imgRegex.exec(html)) !== null) {
        if (!/googlelogos|gstatic/.test(m[1])) urls.add(m[1]);
        if (urls.size >= limit * 3) break;
      }
    }
    return [...urls].slice(0, limit);
  }

  /**
   * Recherche des images.
   * @returns {Promise<string[]>} URLs d'images
   */
  async function search(query, n = 1) {
    const clean = sanitizeQuery(query, 200);
    if (!clean) throw typedError('BAD_QUERY');
    const url = SEARCH_BASE + encodeURIComponent(clean); // encodage systématique
    let res;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' },
        signal: AbortSignal.timeout(20_000),
        redirect: 'follow',
      });
    } catch (err) {
      if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw typedError('API_TIMEOUT');
      throw typedError('SEARCH_UNAVAILABLE');
    }
    if (!res.ok) throw typedError('SEARCH_UNAVAILABLE', `HTTP ${res.status}`);
    const html = await res.text().catch(() => '');
    const urls = extractImageUrls(html, Math.max(1, n));
    if (urls.length === 0) throw typedError('SEARCH_EMPTY');
    return urls;
  }

  return { search };
}

module.exports = { createImageSearch };
