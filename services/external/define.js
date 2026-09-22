"use strict";

/**
 * services/external/define.js
 * ---------------------------------------------------------------------------
 * Définitions de mots via l'API REST de Wiktionnaire (fr.wiktionary.org),
 * publique et SANS clé. Repli sur Wikipédia pour les noms propres et les
 * expressions qui n'ont pas d'article de dictionnaire.
 *
 * Aucune définition n'est inventée : en cas d'échec, la commande le dit.
 * ---------------------------------------------------------------------------
 */

const { fetchJson, fail, success } = require("./http");
const wikipedia = require("./search");

const WIKTIONARY_URL = "https://fr.wiktionary.org/api/rest_v1/page/definition";

function encodeTerm(term) {
  return encodeURIComponent(String(term || "").trim().replace(/\s+/g, "_"));
}

/**
 * Cherche la définition d'un mot.
 *
 * @param {string} term
 * @param {{ language?: string, timeoutMs?: number, limit?: number }} [options]
 */
async function define(term, options = {}) {
  const raw = String(term || "").trim();
  if (!raw) return fail("error", "Aucun mot indiqué.");
  if (raw.length > 80) return fail("error", "Mot trop long (80 caractères maximum).");

  const limit = Math.max(1, Math.min(6, Number(options.limit) || 3));
  const url = `${WIKTIONARY_URL}/${encodeTerm(raw)}`;
  const res = await fetchJson(url, { timeoutMs: options.timeoutMs || 12000 });

  if (res.ok) {
    const payload = res.data || {};
    const lang = options.language || "fr";
    const entries = Array.isArray(payload[lang]) ? payload[lang] : Object.values(payload)[0];

    if (Array.isArray(entries) && entries.length) {
      const senses = [];
      for (const entry of entries) {
        const part = String(entry.part || "").trim();
        const definitions = Array.isArray(entry.definitions)
          ? entry.definitions.map((d) => String(typeof d === "string" ? d : (d && d.definition) || "").trim()).filter(Boolean)
          : [];
        for (const text of definitions) {
          senses.push({ part, text: clean(text) });
          if (senses.length >= limit) break;
        }
        if (senses.length >= limit) break;
      }
      if (senses.length) {
        return success({
          term: raw,
          source: "Wiktionnaire",
          url: `https://fr.wiktionary.org/wiki/${encodeTerm(raw)}`,
          senses
        });
      }
    }
  }

  if (res.kind === "not-found") {
    // Repli : Wikipédia couvre les noms propres, œuvres, lieux…
    const fallback = await wikipedia.summary(raw, { timeoutMs: options.timeoutMs, language: options.language });
    if (fallback.ok && fallback.data.extract) {
      return success({
        term: raw,
        source: "Wikipédia",
        url: fallback.data.url,
        senses: [{ part: "", text: fallback.data.extract.slice(0, 400) }],
        note: "Aucune entrée de dictionnaire trouvée : définition issue de Wikipédia."
      });
    }
    return fail("not-found", `Aucune définition trouvée pour « ${raw} ».`);
  }

  return res;
}

/** Nettoie les balises et liens wiki résiduels. */
function clean(text) {
  return String(text || "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { define, clean };
