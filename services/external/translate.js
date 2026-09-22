"use strict";

/**
 * services/external/translate.js
 * ---------------------------------------------------------------------------
 * Traduction via MyMemory (api.mymemory.translated.net) : service public
 * gratuit, SANS clé API. Une adresse e-mail optionnelle augmente le quota
 * (variable MYMEMORY_EMAIL), mais n'est pas obligatoire.
 *
 * Aucune traduction n'est inventée : si le service ne répond pas, la commande
 * affiche un message d'indisponibilité honnête.
 * ---------------------------------------------------------------------------
 */

const { fetchJson, query, fail, success } = require("./http");

const ENDPOINT = "https://api.mymemory.translated.net/get";

/** Langues acceptées (codes ISO 639-1) avec leurs noms français. */
const LANGUAGES = {
  fr: "français",
  en: "anglais",
  es: "espagnol",
  de: "allemand",
  it: "italien",
  pt: "portugais",
  nl: "néerlandais",
  ru: "russe",
  ar: "arabe",
  zh: "chinois",
  ja: "japonais",
  ko: "coréen",
  hi: "hindi",
  sw: "swahili",
  ln: "lingala",
  tr: "turc",
  pl: "polonais",
  sv: "suédois",
  el: "grec",
  he: "hébreu",
  th: "thaï",
  vi: "vietnamien",
  id: "indonésien",
  la: "latin",
  af: "afrikaans",
  uk: "ukrainien",
  ro: "roumain",
  cs: "tchèque",
  hu: "hongrois",
  da: "danois",
  fi: "finnois",
  no: "norvégien",
  bn: "bengali",
  fa: "persan",
  ur: "ourdou",
  yo: "yoruba",
  ha: "haoussa",
  zu: "zoulou",
  auto: "détection automatique"
};

/** Alias courants (noms français → code ISO). */
const ALIASES = {
  francais: "fr",
  française: "fr",
  francaise: "fr",
  anglais: "en",
  english: "en",
  espagnol: "es",
  spanish: "es",
  allemand: "de",
  german: "de",
  italien: "it",
  portugais: "pt",
  neerlandais: "nl",
  russe: "ru",
  arabe: "ar",
  chinois: "zh",
  chinese: "zh",
  japonais: "ja",
  coreen: "ko",
  hindi: "hi",
  swahili: "sw",
  lingala: "ln",
  turc: "tr",
  polonais: "pl",
  suedois: "sv",
  grec: "el",
  hebreu: "he",
  thai: "th",
  vietnamien: "vi",
  indonesien: "id",
  latin: "la",
  ukrainien: "uk",
  roumain: "ro",
  tcheque: "cs",
  hongrois: "hu",
  danois: "da",
  finnois: "fi",
  norvegien: "no",
  bengali: "bn",
  persan: "fa",
  ourdou: "ur",
  auto: "auto",
  detect: "auto"
};

function fold(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Résout une langue : code ISO, nom français ou alias.
 * @param {string} value
 * @returns {string} code ISO ou "" si inconnu
 */
function resolveLang(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (LANGUAGES[lower]) return lower;
  const alias = ALIASES[fold(lower)];
  return alias || "";
}

/** Nom français d'un code langue. */
function langName(code) {
  return LANGUAGES[String(code || "").toLowerCase()] || String(code || "").toUpperCase();
}

/** Détection très simple de la langue source (fr / en / es par défaut). */
function detectLang(text) {
  const body = String(text || "");
  if (/[àâçéèêëîïôùûüœ]|\b(le|la|les|des|est|une|pour|avec|dans|vous|nous|bonjour|merci)\b/i.test(body)) return "fr";
  if (/[ñ¿¡]|\b(el|los|las|una|para|con|por|hola|gracias)\b/i.test(body)) return "es";
  if (/[ßäöü]|\b(der|die|das|und|ist|nicht|hallo|danke)\b/i.test(body)) return "de";
  if (/[\u0600-\u06FF]/.test(body)) return "ar";
  if (/[\u4e00-\u9fff]/.test(body)) return "zh";
  if (/[\u3040-\u30ff]/.test(body)) return "ja";
  if (/[\u0400-\u04FF]/.test(body)) return "ru";
  return "en";
}

/**
 * Traduit un texte.
 *
 * @param {string} text
 * @param {{ from?: string, to?: string, email?: string, timeoutMs?: number }} options
 * @returns {Promise<{ok: boolean, data?: object, kind?: string, message?: string}>}
 */
async function translate(text, options = {}) {
  const source = String(text || "").trim();
  if (!source) return fail("error", "Aucun texte à traduire.");
  if (source.length > 500) return fail("error", "Texte trop long (500 caractères maximum).");

  const to = resolveLang(options.to) || "en";
  const from = resolveLang(options.from) === "auto" || !resolveLang(options.from) ? detectLang(source) : resolveLang(options.from);
  if (from === to) return fail("error", `Le texte semble déjà être en ${langName(to)}.`);

  const url = `${ENDPOINT}${query({
    q: source,
    langpair: `${from}|${to}`,
    de: options.email || undefined
  })}`;

  const res = await fetchJson(url, { timeoutMs: options.timeoutMs || 10000 });
  if (!res.ok) return res;

  const payload = res.data || {};
  const status = Number(payload.responseStatus) || 0;
  const translated = String((payload.responseData && payload.responseData.translatedText) || "").trim();

  if (status && status !== 200 && !translated) {
    const note = String(payload.responseDetails || "").slice(0, 120);
    if (/INVALID (TRANSLATION )?LANGUAGE|MYMEMORY INVALID/i.test(note)) {
      return fail("error", `Combinaison de langues non supportée (${from} → ${to}).`);
    }
    if (/QUERY LENGTH LIMIT|LIMIT/i.test(note)) {
      return fail("unavailable", "Quota quotidien du service de traduction atteint. Réessaie demain.");
    }
    return fail("unavailable", note || "Le service de traduction a refusé la requête.");
  }
  if (!translated) return fail("not-found", "Aucune traduction renvoyée pour ce texte.");

  // MyMemory renvoie parfois plusieurs correspondances : on garde la meilleure.
  let best = translated;
  let bestQuality = Number((payload.responseData && payload.responseData.match) || 0);
  if (Array.isArray(payload.matches)) {
    for (const match of payload.matches) {
      const quality = Number(match && match.quality) || 0;
      const segment = String((match && match.translation) || "").trim();
      if (segment && quality > bestQuality) {
        best = segment;
        bestQuality = quality;
      }
    }
  }

  return success({
    from,
    to,
    fromName: langName(from),
    toName: langName(to),
    source,
    translated: best,
    alternatives: Array.isArray(payload.matches)
      ? payload.matches.map((m) => String(m.translation || "").trim()).filter((v) => v && v !== best).slice(0, 3)
      : []
  });
}

/** Liste des langues supportées (pour l'aide de /translate). */
function languages() {
  return Object.keys(LANGUAGES).filter((code) => code !== "auto");
}

module.exports = { translate, resolveLang, langName, detectLang, languages, LANGUAGES };
