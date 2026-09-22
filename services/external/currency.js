"use strict";

/**
 * services/external/currency.js
 * ---------------------------------------------------------------------------
 * Taux de change via open.er-api.com : API publique, SANS clé, mise à jour
 * quotidienne. Utilisée par /convert pour les devises réelles.
 *
 * Si l'API ne répond pas, la commande affiche un message d'indisponibilité —
 * aucun taux n'est jamais inventé.
 * ---------------------------------------------------------------------------
 */

const { fetchJson, fail, success } = require("./http");

const ENDPOINT = "https://open.er-api.com/v6/latest";

/** Devises courantes (nom français pour l'affichage). */
const CURRENCIES = {
  USD: "dollar américain",
  EUR: "euro",
  GBP: "livre sterling",
  CHF: "franc suisse",
  CAD: "dollar canadien",
  AUD: "dollar australien",
  JPY: "yen japonais",
  CNY: "yuan chinois",
  INR: "roupie indienne",
  BRL: "réal brésilien",
  ZAR: "rand sud-africain",
  NGN: "naira nigérian",
  KES: "shilling kényan",
  CDF: "franc congolais",
  XOF: "franc CFA (UEMOA)",
  XAF: "franc CFA (CEMAC)",
  MAD: "dirham marocain",
  DZD: "dinar algérien",
  TND: "dinar tunisien",
  EGP: "livre égyptienne",
  TRY: "livre turque",
  AED: "dirham des Émirats",
  SAR: "riyal saoudien",
  QAR: "riyal qatari",
  SEK: "couronne suédoise",
  NOK: "couronne norvégienne",
  DKK: "couronne danoise",
  PLN: "zloty polonais",
  RUB: "rouble russe",
  UAH: "hryvnia ukrainienne",
  MXN: "peso mexicain",
  ARS: "peso argentin",
  SGD: "dollar de Singapour",
  HKD: "dollar de Hong Kong",
  KRW: "won sud-coréen",
  THB: "baht thaïlandais",
  MYR: "ringgit malaisien",
  IDR: "roupie indonésienne",
  PHP: "peso philippin",
  VND: "dông vietnamien",
  ILS: "shekel israélien",
  LRD: "dollar libérien",
  GHS: "cedi ghanéen",
  TZS: "shilling tanzanien",
  UGX: "shilling ougandais",
  RWF: "franc rwandais",
  AOA: "kwanza angolais",
  ZMW: "kwacha zambien",
  MGA: "ariary malgache",
  XAU: "once d'or",
  BTC: "bitcoin",
  ETH: "ether"
};

/** Unités non monétaires acceptées par /convert. */
const OTHER_UNITS = {
  // longueurs (en mètres)
  m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, ft: 0.3048, in: 0.0254, yd: 0.9144,
  // masses (en kilogrammes)
  kg: 1, g: 0.001, mg: 1e-6, t: 1000, lb: 0.45359237, oz: 0.028349523125,
  // volumes (en litres)
  l: 1, ml: 0.001, cl: 0.01, dl: 0.1, gal: 3.785411784,
  // surfaces / angles / température gérés séparément
  ha: 10000, m2: 1, km2: 1000000, ft2: 0.09290304
};

const UNIT_GROUPS = {
  length: ["m", "km", "cm", "mm", "mi", "ft", "in", "yd"],
  mass: ["kg", "g", "mg", "t", "lb", "oz"],
  volume: ["l", "ml", "cl", "dl", "gal"],
  area: ["ha", "m2", "km2", "ft2"]
};

/** Taux depuis une devise de base. */
async function rates(base = "USD", options = {}) {
  const code = String(base || "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return fail("error", "Code de devise invalide (3 lettres, ex. USD).");

  const res = await fetchJson(`${ENDPOINT}/${encodeURIComponent(code)}`, { timeoutMs: options.timeoutMs || 12000 });
  if (!res.ok) return res;

  const data = res.data || {};
  if (String(data.result || "").toUpperCase() !== "SUCCESS" || !data.rates || typeof data.rates !== "object") {
    const note = String(data["error-type"] || data.result || "").slice(0, 80);
    if (/not.?supported|unknown/i.test(note)) return fail("not-found", `Devise « ${code} » non supportée.`);
    return fail("unavailable", "Réponse inattendue du service de change.");
  }

  return success({
    base: code,
    rates: data.rates,
    updatedAt: data.time_last_update_utc || "",
    provider: data.provider || "open.er-api.com"
  });
}

/**
 * Convertit un montant entre deux devises.
 * @param {number} amount
 * @param {string} from
 * @param {string} to
 */
async function convert(amount, from, to, options = {}) {
  const value = Number(String(amount).replace(",", ".").trim());
  if (!Number.isFinite(value)) return fail("error", "Montant invalide.");
  if (Math.abs(value) > 1e15) return fail("error", "Montant trop grand.");

  const source = String(from || "").trim().toUpperCase();
  const target = String(to || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(source)) return fail("error", `Code de devise source invalide : « ${from} ».`);
  if (!/^[A-Z]{3}$/.test(target)) return fail("error", `Code de devise cible invalide : « ${to} ».`);
  if (source === target) {
    return success({ amount: value, from: source, to: target, result: value, rate: 1, updatedAt: "", same: true });
  }

  const fetched = await rates(source, options);
  if (!fetched.ok) return fetched;

  const rate = Number(fetched.data.rates[target]);
  if (!Number.isFinite(rate) || rate <= 0) return fail("not-found", `Taux ${source} → ${target} indisponible.`);

  return success({
    amount: value,
    from: source,
    to: target,
    rate,
    result: value * rate,
    fromName: CURRENCIES[source] || source,
    toName: CURRENCIES[target] || target,
    updatedAt: fetched.data.updatedAt
  });
}

/** Liste des devises connues du module. */
function knownCurrencies() {
  return Object.keys(CURRENCIES);
}

/** Nom français d'une devise. */
function currencyName(code) {
  const key = String(code || "").toUpperCase();
  return CURRENCIES[key] || key;
}

/** Trouve le groupe d'une unité physique. */
function unitGroup(unit) {
  const key = String(unit || "").toLowerCase();
  for (const [group, list] of Object.entries(UNIT_GROUPS)) {
    if (list.includes(key)) return group;
  }
  return null;
}

/**
 * Conversion d'unités physiques (longueur, masse, volume, surface,
 * température) — calculée localement, aucune API nécessaire.
 */
function convertUnit(value, from, to) {
  const amount = Number(String(value).replace(",", ".").trim());
  if (!Number.isFinite(amount)) return fail("error", "Valeur invalide.");
  const source = String(from || "").toLowerCase();
  const target = String(to || "").toLowerCase();

  if (!OTHER_UNITS[source]) return fail("not-found", `Unité inconnue : « ${from} ».`);
  if (!OTHER_UNITS[target]) return fail("not-found", `Unité inconnue : « ${to} ».`);

  const sourceGroup = unitGroup(source);
  const targetGroup = unitGroup(target);
  if (!sourceGroup || sourceGroup !== targetGroup) {
    return fail("error", `Conversion impossible : « ${from} » et « ${to} » ne mesurent pas la même grandeur.`);
  }

  const result = (amount * OTHER_UNITS[source]) / OTHER_UNITS[target];
  return success({ amount, from: source, to: target, result, kind: sourceGroup });
}

module.exports = {
  rates,
  convert,
  convertUnit,
  knownCurrencies,
  currencyName,
  unitGroup,
  CURRENCIES,
  OTHER_UNITS,
  UNIT_GROUPS
};
