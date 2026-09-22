"use strict";

/**
 * /meme — mème image (services publics sans clé) avec repli assumé.
 *   /meme            → mème aléatoire
 *   /meme programmer → sous-reddit autorisé
 */

const { box, lightBox, cmd, ICONS, num } = require("../../utils/text");
const { MEME_FALLBACK } = require("../../services/corpus");
const { pick } = require("../../utils/random");

module.exports = {
  name: "meme",
  aliases: ["memes", "marrant", "funny"],
  category: "fun",
  description: "Envoie un mème depuis des sources publiques (avec repli textuel local assumé).",
  usage: "/meme [subreddit]",
  examples: ["/meme", "/meme ProgrammerHumor"],
  permissions: "public",
  cooldown: 8,
  external: true,

  async execute(ctx, bag) {
    const { services } = bag;
    const sub = String(ctx.args[0] || "").trim();
    if (sub && !services.external.meme.isSafeSubreddit(sub)) {
      return lightBox("MÈME", [
        `${ICONS.warn} Sous-reddit « ${sub} » non autorisé (liste sûre uniquement).`,
        "",
        `${ICONS.pin} Autorisés : ${services.external.meme.SAFE_SUBREDDITS.join(", ")}`
      ]);
    }

    const result = await services.external.meme.getMeme(sub, { timeoutMs: 15000 });
    if (result.ok) {
      const post = result.data;
      const caption = `😂 ${post.title}${post.subreddit ? ` — r/${post.subreddit}` : ""}`;
      const sent = await ctx.sendImage
        ? await (async () => {
            // On envoie l'image directement : Messenger génère l'aperçu du lien.
            return ctx.sendUrl(post.imageUrl, caption);
          })()
        : false;
      if (sent) return "";
      return box("MÈME", [caption, "", `${ICONS.pin} ${post.imageUrl}`, `${ICONS.chart} ${num(post.ups)} vote(s) • ${post.source}`]);
    }

    // Repli honnête : un mème TEXTUEL du corpus local, clairement annoncé.
    return box(
      "MÈME TEXTUEL",
      [
        `${ICONS.warn} Service d'images injoignable (${result.kind}) — aucune image inventée.`,
        "",
        `😂 ${pick(MEME_FALLBACK)}`,
        "",
        `${ICONS.pin} Réessaie plus tard, ou ${cmd("joke", ctx.prefix)} pour une blague du corpus local.`
      ],
      { icon: ICONS.fun }
    );
  }
};
