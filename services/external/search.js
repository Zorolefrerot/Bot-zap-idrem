"use strict";

/**
 * services/external/search.js
 * ---------------------------------------------------------------------------
 * Recherche encyclopédique via l'API publique de Wikipédia (SANS clé).
 *
 * Deux modes :
 *   • search()   → liste d'articles pertinents (/search)
 *   • summary()  → résumé court d'un article précis (/search <terme> direct)
 *
 * Limitation assumée : il s'agit de Wikipédia, pas d'un moteur de recherche
 * web général. Le bot le dit clairement dans /search plutôt que de faire
 * semblant d'indexer tout Internet.
 * ---------------------------------------------------------------------------
 */

const { fetchJson, query, fail, success } = require("./http");

const HOSTS = {
  fr: "https://fr.wikipedia.org",
  en: "https://en.wikipedia.org",
  es: "https://es.wikipedia.org",
  de: "https://de.wikipedia.org",
  it: "https://it.wikipedia.org",
  pt: "https://pt.wikipedia.org",
  ar: "https://ar.wikipedia.org",
  ln: "https://ln.wikipedia.org",
  sw: "https://sw.wikipedia.org"
};

function host(language) {
  return HOSTS[String(language || "fr").toLowerCase()] || HOSTS.fr;
}

/**
 * Recherche d'articles.
 * @param {string} term
 * @param {{ language?: string, limit?: number, timeoutMs?: number }} [options]
 */
async function search(term, options = {}) {
  const raw = String(term || "").trim();
  if (!raw) return fail("error", "Aucun terme de recherche.");
  if (raw.length > 120) return fail("error", "Recherche trop longue.");

  const language = String(options.language || "fr").toLowerCase();
  const limit = Math.max(1, Math.min(10, Number(options.limit) || 5));
  const base = host(language);

  const url = `${base}/w/api.php${query({
    action: "query",
    list: "search",
    srsearch: raw,
    srlimit: limit,
    srprop: "snippet|wordcount|timestamp",
    format: "json",
    formatversion: 2,
    utf8: 1
  })}`;

  const res = await fetchJson(url, { timeoutMs: options.timeoutMs || 12000 });
  if (!res.ok) return res;

  const results = (res.data && res.data.query && res.data.query.search) || [];
  if (!results.length) return fail("not-found", `Aucun article trouvé pour « ${raw} ».`);

  return success({
    term: raw,
    language,
    base,
    total: (res.data && res.data.query && res.data.query.searchinfo && res.data.query.searchinfo.totalhits) || results.length,
    results: results.map((entry) => ({
      title: String(entry.title || ""),
      snippet: stripHtml(entry.snippet || ""),
      words: Number(entry.wordcount) || 0,
      updated: entry.timestamp ? String(entry.timestamp).slice(0, 10) : "",
      url: `${base}/wiki/${encodeURIComponent(String(entry.title || "").replace(/ /g, "_"))}`
    }))
  });
}

/**
 * Résumé d'un article (REST summary).
 * @param {string} title
 */
async function summary(title, options = {}) {
  const raw = String(title || "").trim();
  if (!raw) return fail("error", "Aucun article indiqué.");
  const language = String(options.language || "fr").toLowerCase();
  const base = host(language);
  const url = `${base}/api/rest_v1/page/summary/${encodeURIComponent(raw.replace(/\s+/g, "_"))}`;

  const res = await fetchJson(url, { timeoutMs: options.timeoutMs || 12000 });
  if (!res.ok) return res;

  const data = res.data || {};
  const extract = String(data.extract || "").trim();
  if (!extract) return fail("not-found", `Aucun résumé disponible pour « ${raw} ».`);

  return success({
    title: String(data.title || raw),
    description: String(data.description || ""),
    extract: extract.replace(/\s+/g, " ").slice(0, 900),
    url: (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page) || `${base}/wiki/${encodeURIComponent(raw)}`,
    thumbnail: (data.thumbnail && data.thumbnail.source) || "",
    type: String(data.type || "")
  });
}

/** Recherche puis résumé automatique du meilleur résultat. */
async function searchAndSummarize(term, options = {}) {
  const direct = await summary(term, options);
  if (direct.ok) return { ...direct, data: { ...direct.data, results: null } };

  const found = await search(term, { ...options, limit: 1 });
  if (!found.ok) return found;
  const best = found.data.results[0];
  const summarized = await summary(best.title, options);
  if (!summarized.ok) return found;
  return {
    ok: true,
    data: { ...summarized.data, results: found.data.results, matchedTitle: best.title }
  };
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { search, summary, searchAndSummarize, host, HOSTS, stripHtml };
