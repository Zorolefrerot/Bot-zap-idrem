"use strict";

/**
 * /translate — traduction via MyMemory (service public, sans clé).
 *   /translate hello                 → français (détection auto)
 *   /translate en bonjour le monde   → anglais
 *   /translate fr->es bonjour        → espagnol
 */

const { box, lightBox, cmd, ICONS } = require("../../utils/text");

module.exports = {
  name: "translate",
  aliases: ["trad", "traduire", "traduction"],
  category: "utility",
  description: "Traduit un texte (détection automatique de la langue source).",
  usage: "/translate [code|fr->es] <texte>",
  examples: ["/translate hello world", "/translate en bonjour", "/translate fr->de merci"],
  permissions: "public",
  cooldown: 4,

  async execute(ctx, bag) {
    const { services } = bag;
    const translator = services.external.translate;
    const args = [...ctx.args];

    if (!args.length) {
      return lightBox("TRADUCTION", [
        `${ICONS.warn} Aucun texte à traduire.`,
        "",
        `${cmd("translate hello world", ctx.prefix)} → français`,
        `${cmd("translate en bonjour le monde", ctx.prefix)} → anglais`,
        `${cmd("translate fr->es bonjour", ctx.prefix)} → espagnol`,
        "",
        `${ICONS.info} Langues courantes : ${translator.languages().slice(0, 18).join(", ")}…`
      ]);
    }

    let from = "";
    let to = "";

    // Format « fr->es » ou « fr-es » en premier argument.
    const arrow = args[0].match(/^([a-zA-Z]{2,3})\s*(?:->|→|>|to|\|)\s*([a-zA-Z]{2,3})$/);
    if (arrow) {
      from = translator.resolveLang(arrow[1]);
      to = translator.resolveLang(arrow[2]);
      args.shift();
    } else if (translator.resolveLang(args[0]) && args.length > 1) {
      to = translator.resolveLang(args[0]);
      args.shift();
    }

    const text = args.join(" ").trim();
    if (!text) return lightBox("TRADUCTION", [`${ICONS.warn} Texte manquant après la langue.`, "", cmd("translate en bonjour", ctx.prefix)]);

    const result = await translator.translate(text, { from: from || "auto", to: to || "fr", timeoutMs: 12000 });
    if (!result.ok) {
      return lightBox("TRADUCTION", [
        `${ICONS.no} ${result.message}`,
        "",
        `${ICONS.info} Service : MyMemory (public, sans clé).`
      ]);
    }

    const data = result.data;
    return box(
      "TRADUCTION",
      [
        `${ICONS.info} ${data.fromName} → ${data.toName}`,
        "",
        `📥 ${data.source}`,
        `📤 ${data.translated}`,
        "",
        ...(data.alternatives.length ? [`🔁 Variantes :`, ...data.alternatives.map((alt) => `  • ${alt}`), ""] : [])
      ],
      { icon: "🌍", footer: [`${ICONS.pin} ${cmd("translate fr->es merci", ctx.prefix)} pour choisir les deux langues`] }
    );
  }
};
