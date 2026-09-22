"use strict";

/**
 * /pp — « portrait express » : photo de profil réelle + verdict humoristique.
 * Utilise les vraies données Facebook (avatar public) ; si rien n'est
 * accessible, le bot le dit au lieu d'inventer une image.
 */

const { box, lightBox, cmd, num, progress, ICONS } = require("../../utils/text");
const { dailyValue } = require("../../utils/random");

const VERDICTS = [
  "Photo validée par le conseil esthétique du bot.",
  "Le cadrage est discutable, le charisme non.",
  "On dirait une photo de dossier… mais stylée.",
  "Cette image mérite un cadre, ou au moins un emoji.",
  "Aucun filtre détecté, respect.",
  "Le bot approuve, mais il n'a pas vraiment le choix."
];

module.exports = {
  name: "pp",
  aliases: ["pprofile", "photo2profil", "profilpic"],
  category: "fun",
  description: "Affiche la photo de profil réelle avec un verdict humoristique (score du jour).",
  usage: "/pp [@personne|uid]",
  examples: ["/pp", "/pp @quelquun"],
  permissions: "public",
  cooldown: 6,
  external: true,

  async execute(ctx, bag) {
    const { services, random } = bag;
    const target = ctx.resolveTarget(ctx.args[0]);
    const name = target.name || ctx.displayName(target.id);
    const isSelf = target.id === ctx.senderID;
    const score = dailyValue(`pp:${target.id}`, 1, 100);
    const verdict = random.pick(VERDICTS);

    const info = await services.groups.userInfo(target.id);
    if (!info.ok) {
      return lightBox("PORTRAIT", [
        `${ICONS.warn} Photo inaccessible (${info.error || "API indisponible"}).`,
        "",
        `${ICONS.target} Score du jour : ${num(score)}/100 ${progress(score, 100)}`,
        `💬 ${verdict}`,
        "",
        `${ICONS.info} Le bot n'invente pas d'image : voici seulement le verdict.`
      ]);
    }

    if (info.avatar && /^https?:\/\//i.test(info.avatar)) {
      const caption = [
        `🖼️ Portrait de ${isSelf ? "toi" : name}`,
        `🎯 Score du jour : ${score}/100`,
        `💬 ${verdict}`,
        `⚠️ 100 % divertissement.`
      ].join("\n");
      const sent = await ctx.sendUrl(info.avatar, caption);
      if (sent) return "";
      return box("PORTRAIT", [caption, "", `${ICONS.pin} ${info.avatar.slice(0, 120)}`]);
    }

    return lightBox("PORTRAIT", [
      `${ICONS.user} ${info.name || name}`,
      `${ICONS.info} Facebook n'expose aucune photo publique pour ce compte.`,
      "",
      `${ICONS.target} Score du jour : ${num(score)}/100`,
      `💬 ${verdict}`,
      "",
      `${cmd("avatar", ctx.prefix)} pour une tentative classique.`
    ]);
  }
};
