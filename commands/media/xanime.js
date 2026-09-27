'use strict';
/*
 * 🧬 MeR~NeL — commands/media/xanime.js
 * Xanime <nom> — image de l'animé + fiche wiki (AniList, sans clé).
 */

const ANILIST = 'https://graphql.anilist.co';

const QUERY = `
query ($search: String) {
  Media(search: $search, type: ANIME) {
    id
    title { romaji english native }
    format
    episodes
    duration
    status
    season
    seasonYear
    averageScore
    popularity
    genres
    studios(isMain: true) { nodes { name } }
    description(asHtml: false)
    coverImage { extraLarge }
    bannerImage
    siteUrl
  }
}`;

async function fetchInfo(search, fetchImpl) {
  const res = await fetchImpl(ANILIST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { search } }),
  });
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
  const json = await res.json();
  return (json.data && json.data.Media) || null;
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function short(s, max) {
  const t = stripHtml(s);
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

module.exports = {
  name: 'xanime',
  description: 'Fiche wiki d’un animé (image + infos) — Xanime Naruto',
  usage: 'Xanime <nom de l’animé>',
  category: 'media',
  aliases: ['xanimewiki', 'xfiche-anime'],
  adminOnly: false,
  cooldownMs: 8000,
  run: async (ctx) => {
    const search = ctx.args.join(' ').trim();
    if (!search) {
      return ctx.send(
        ctx.fmt.frame('🎌 XANIME', '📌 ' + ctx.fmt.bold('Exemple') + ' : ' + ctx.fmt.bold('Xanime Death Note'))
      );
    }

    let media = null;
    try {
      media = await fetchInfo(search, ctx.fetchImpl || global.fetch);
    } catch (_) {
      media = null;
    }
    if (!media || !media.title) {
      return ctx.send(ctx.fmt.frame('🎌 XANIME', `⚠️ ${ctx.fmt.bold('Animé introuvable')} : ${ctx.fmt.bold(search)}`));
    }

    const t = media.title || {};
    const title = t.romaji || t.english || t.native || search;
    const studios = ((media.studios && media.studios.nodes) || []).map((s) => s.name).slice(0, 2).join(', ') || '—';
    const statusFr =
      { FINISHED: 'Terminé ✅', RELEASING: 'En cours 🔴', NOT_YET_RELEASED: 'À venir ⏳', CANCELLED: 'Annulé ❌', HIATUS: 'En pause ⏸️' }[
        media.status
      ] || media.status || '—';
    const seasonFr = { WINTER: 'Hiver', SPRING: 'Printemps', SUMMER: 'Été', FALL: 'Automne' }[media.season] || '';

    const lines = [
      `📺 ${ctx.fmt.bold('Titre')} : ${ctx.fmt.bold(title)}`,
      t.native && t.native !== title ? `🈶 ${ctx.fmt.bold('Nom original')} : ${ctx.fmt.bold(t.native)}` : '',
      `🏢 ${ctx.fmt.bold('Studio')} : ${ctx.fmt.bold(studios)}`,
      `📅 ${ctx.fmt.bold('Sortie')} : ${ctx.fmt.bold(`${seasonFr} ${media.seasonYear || '—'}`.trim())} — ${ctx.fmt.bold(statusFr)}`,
      `🎞️ ${ctx.fmt.bold('Épisodes')} : ${ctx.fmt.bold(media.episodes || '?')}` + (media.duration ? ` (${ctx.fmt.bold(media.duration)} min/ép)` : ''),
      `⭐ ${ctx.fmt.bold('Note AniList')} : ${ctx.fmt.bold(media.averageScore ? media.averageScore + '/100' : '—')} — ❤️ ${ctx.fmt.bold((media.popularity || 0).toLocaleString('fr-FR'))} fans`,
      `🏷️ ${ctx.fmt.bold('Genres')} : ${ctx.fmt.bold((media.genres || []).join(', ') || '—')}`,
      '',
      `📖 ${short(media.description, 500)}`,
      '',
      media.siteUrl ? `🔗 ${media.siteUrl}` : '',
    ].filter((l) => l !== '');

    const payload = { body: ctx.fmt.frame('🎌 ' + title.toUpperCase(), lines) };
    try {
      const { downloadImage } = require('../../systems/mangaQuiz');
      if (media.coverImage && media.coverImage.extraLarge) {
        const file = await downloadImage(media.coverImage.extraLarge, ctx.config.tmpDir, ctx.fetchImpl || global.fetch);
        if (file) payload.attachment = file;
      }
    } catch (_) {
      /* fiche seule si l'image échoue */
    }
    await ctx.send(payload);
  },
};
