"use strict";

/**
 * services/external/meme.js
 * ---------------------------------------------------------------------------
 * Mèmes publics. Deux sources SANS clé, essayées dans l'ordre :
 *   1. meme-api.com/gimme  → agrégateur Reddit, réponse JSON simple ;
 *   2. reddit.com/r/<sub>/hot.json → repli direct (Reddit bloque parfois les
 *      adresses de centres de données : l'échec est alors géré proprement).
 *
 * Le contenu est filtré : jamais de NSFW ni de spoiler. Si aucune source ne
 * répond, la commande le dit — pas de mème inventé.
 * ---------------------------------------------------------------------------
 */

const { fetchJson, query, fail, success } = require("./http");

const MEME_API = "https://meme-api.com/gimme";
const REDDIT_HOST = "https://www.reddit.com";
const USER_AGENT = "IDREM-TERESHKOVA/2.0 (Messenger bot; educational use)";

const DEFAULT_SUBREDDITS = ["memes", "dankmemes", "me_irl", "funny"];
const SAFE_SUBREDDITS = ["memes", "dankmemes", "me_irl", "funny", "wholesomememes", "ProgrammerHumor", "AdviceAnimals"];

/** Un subreddit est-il autorisé ? */
function isSafeSubreddit(name) {
  const clean = String(name || "").trim().toLowerCase();
  return SAFE_SUBREDDITS.includes(clean);
}

function normalizePost(post) {
  if (!post || !post.title) return null;
  const image = String(post.url || post.image || "");
  const isImage = /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(image);
  return {
    title: String(post.title).slice(0, 300),
    imageUrl: isImage ? image : (Array.isArray(post.preview) && post.preview[0]) || "",
    postLink: String(post.postLink || post.permalink || ""),
    subreddit: String(post.subreddit || "").replace(/^\/?r\//, ""),
    author: String(post.author || ""),
    ups: Number(post.ups || post.score || post.upvotes || 0) || 0,
    nsfw: Boolean(post.nsfw),
    spoiler: Boolean(post.spoiler)
  };
}

/** Source 1 : meme-api.com. */
async function fromMemeApi(subreddit, options = {}) {
  const sub = isSafeSubreddit(subreddit) ? subreddit : "";
  const url = sub ? `${MEME_API}/${encodeURIComponent(sub)}` : MEME_API;
  const res = await fetchJson(url, { timeoutMs: options.timeoutMs || 10000, headers: { "user-agent": USER_AGENT } });
  if (!res.ok) return res;
  const post = normalizePost(res.data);
  if (!post) return fail("error", "Réponse inexploitable du service de mèmes.");
  if (post.nsfw || post.spoiler) return fail("not-found", "Contenu filtré (NSFW/spoiler).");
  if (!post.imageUrl) return fail("not-found", "Mème sans image exploitable.");
  return success({ ...post, source: "meme-api.com" });
}

/** Source 2 : Reddit JSON direct. */
async function fromReddit(subreddit, options = {}) {
  const sub = isSafeSubreddit(subreddit) ? subreddit : DEFAULT_SUBREDDITS[0];
  const url = `${REDDIT_HOST}/r/${encodeURIComponent(sub)}/hot.json${query({ limit: 30, raw_json: 1 })}`;
  const res = await fetchJson(url, { timeoutMs: options.timeoutMs || 12000, headers: { "user-agent": USER_AGENT } });
  if (!res.ok) return res;

  const children = (res.data && res.data.data && res.data.data.children) || [];
  const candidates = children
    .map((child) => normalizePost(child && child.data))
    .filter((post) => post && !post.nsfw && !post.spoiler && post.imageUrl);

  if (!candidates.length) return fail("not-found", "Aucun mème exploitable trouvé.");
  const post = candidates[Math.floor(Math.random() * candidates.length)];
  return success({ ...post, source: "reddit.com", subreddit: sub });
}

/**
 * Récupère un mème.
 * @param {string} [subreddit] sous-reddit (restreint à une liste sûre)
 * @param {{ timeoutMs?: number, allowFallbackText?: boolean }} [options]
 */
async function getMeme(subreddit, options = {}) {
  const first = await fromMemeApi(subreddit, options);
  if (first.ok) return first;

  const second = await fromReddit(subreddit, options);
  if (second.ok) return second;

  // Les deux sources ont échoué : on remonte l'erreur la plus informative.
  const kind = second.kind === "timeout" || first.kind === "timeout" ? "timeout" : "unavailable";
  return fail(kind, "Service de mèmes injoignable pour le moment.", {
    detail: `${first.kind}: ${first.message} / ${second.kind}: ${second.message}`
  });
}

module.exports = { getMeme, fromMemeApi, fromReddit, isSafeSubreddit, SAFE_SUBREDDITS, normalizePost };
