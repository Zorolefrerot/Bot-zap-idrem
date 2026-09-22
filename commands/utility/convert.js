"use strict";

/**
 * /convert — conversion de devises (API publique) et d'unités physiques (local).
 *   /convert 100 USD EUR
 *   /convert 5 km m
 *   /convert 72 C F     → température
 */

const { box, lightBox, cmd, ICONS, num } = require("../../utils/text");

/** Conversions de température (calcul local, aucune API). */
const TEMPERATURES = { c: "Celsius", f: "Fahrenheit", k: "Kelvin" };

function convertTemperature(value, from, to) {
  let celsius;
  if (from === "c") celsius = value;
  else if (from === "f") celsius = (value - 32) * (5 / 9);
  else celsius = value - 273.15;

  if (to === "c") return celsius;
  if (to === "f") return celsius * (9 / 5) + 32;
  return celsius + 273.15;
}

module.exports = {
  name: "convert",
  aliases: ["conversion", "taux", "change", "unites", "unités"],
  category: "utility",
  description: "Convertit des devises (taux en ligne) ou des unités (longueur, masse, volume, température).",
  usage: "/convert <montant> <unité-source> <unité-cible>",
  examples: ["/convert 100 USD EUR", "/convert 5 km m", "/convert 72 c f"],
  permissions: "public",
  cooldown: 4,

  async execute(ctx, bag) {
    const { services } = bag;
    const [rawAmount, rawFrom, rawTo] = ctx.args;

    if (!rawAmount || !rawFrom || !rawTo) {
      const units = Object.keys(services.external.currency.UNIT_GROUPS).join(", ");
      return lightBox("CONVERSION", [
        `${ICONS.warn} Trois arguments attendus : montant, unité source, unité cible.`,
        "",
        `${cmd("convert 100 USD EUR", ctx.prefix)} — devises (taux en ligne)`,
        `${cmd("convert 5 km m", ctx.prefix)} — longueurs`,
        `${cmd("convert 70 kg lb", ctx.prefix)} — masses`,
        `${cmd("convert 72 c f", ctx.prefix)} — températures`,
        "",
        `${ICONS.info} Groupes d'unités : ${units}`,
        `${ICONS.info} Températures : ${Object.keys(TEMPERATURES).join(", ")}`
      ]);
    }

    const from = String(rawFrom).toLowerCase();
    const to = String(rawTo).toLowerCase();
    const amount = Number(String(rawAmount).replace(",", "."));
    if (!Number.isFinite(amount)) {
      return lightBox("CONVERSION", [`${ICONS.no} Montant invalide : « ${rawAmount} ».`, "", cmd("convert 100 USD EUR", ctx.prefix)]);
    }

    // 1. Température.
    if (TEMPERATURES[from] && TEMPERATURES[to]) {
      const result = convertTemperature(amount, from, to);
      return box(
        "TEMPÉRATURE",
        [
          `${ICONS.bolt} ${num(Math.round(amount * 100) / 100)} °${from.toUpperCase()} = ${num(Math.round(result * 100) / 100)} °${to.toUpperCase()}`,
          "",
          `${ICONS.info} ${TEMPERATURES[from]} → ${TEMPERATURES[to]} (calcul local)`
        ]
      );
    }

    // 2. Unités physiques.
    if (services.external.currency.OTHER_UNITS[from] || services.external.currency.OTHER_UNITS[to]) {
      const result = services.external.currency.convertUnit(amount, from, to);
      if (!result.ok) {
        return lightBox("CONVERSION", [
          `${ICONS.no} ${result.message}`,
          "",
          `${ICONS.pin} Exemples : ${cmd("convert 5 km m", ctx.prefix)}, ${cmd("convert 70 kg lb", ctx.prefix)}`
        ]);
      }
      return box(
        "CONVERSION",
        [
          `${ICONS.bolt} ${num(amount)} ${from} = ${num(Math.round(result.data.result * 1e6) / 1e6)} ${to}`,
          "",
          `${ICONS.info} Grandeur : ${result.data.kind} (calcul local, aucune API)`
        ]
      );
    }

    // 3. Devises (taux en ligne).
    const result = await services.external.currency.convert(amount, from, to, { timeoutMs: 15000 });
    if (!result.ok) {
      return lightBox("CONVERSION", [
        `${ICONS.no} ${result.message}`,
        "",
        result.kind === "not-found"
          ? `${ICONS.pin} Codes à 3 lettres : ${services.external.currency.knownCurrencies().slice(0, 14).join(", ")}…`
          : `${ICONS.info} Source : open.er-api.com (taux mis à jour quotidiennement).`
      ]);
    }

    const data = result.data;
    return box(
      "CONVERSION",
      [
        `${ICONS.money} ${num(amount)} ${data.from} = ${num(Math.round(data.result * 100) / 100)} ${data.to}`,
        "",
        `${ICONS.chart} Taux : 1 ${data.from} = ${num(Math.round(data.rate * 1e6) / 1e6)} ${data.to}`,
        `${ICONS.info} ${data.fromName || data.from} → ${data.toName || data.to}`,
        data.same ? "" : `${ICONS.time} Taux mis à jour : ${data.updatedAt || "inconnue"}`
      ].filter(Boolean),
      { icon: ICONS.money, footer: ["Source : open.er-api.com (indicatif, pas un taux bancaire)"] }
    );
  }
};
