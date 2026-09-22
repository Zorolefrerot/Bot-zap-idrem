"use strict";

/**
 * services/external/lyrics.js
 * ---------------------------------------------------------------------------
 * Paroles de chansons via lrclib.net : base communautaire ouverte, SANS clé,
 * dont le contenu est publié sous licences libres (CC0 pour la plupart des
 * entrées). Aucun contournement de service payant.
 *
 * L'API demande un User-Agent identifiable : c'est fourni ci-dessous.
 * ---------------------------------------------------------------------------
 */

const { fetchJson, query, fail, success } = require("./http");

const HOST = "https://lrclib.net";
const USER_AGENT = "IDREM-TERESHKOVA/2.0 (Messenger bot)";

/** Extrait « artiste - titre » d'une requête libre. */
function splitQuery(raw) {
  const text = String(raw || "").trim();
  const separators = [" - ", " – ", " — ", " by ", " | "];
  for (const sep of separators) {
    const index = text.toLowerCase().indexOf(sep.toLowerCase());
    if (index > 0 && index < text.length - sep.length) {
      return { artist: text.slice(0, index).trim(), track: text.slice(index + sep.length).trim() };
    }
  }
  return { artist: "", track: text };
}

/** Nettoie un texte de paroles pour Messenger (pas de HTML ni de balises LRC). */
function cleanLyrics(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalize(entry) {
  if (!entry || typeof entry !== "object") return null;
  const plain = cleanLyrics(entry.plainLyrics || entry.plain_lyrics || "");
  const synced = cleanLyrics(entry.syncedLyrics || entry.synced_lyrics || "");
  const text = plain || synced;
  if (!text) return null;
  return {
    title: String(entry.trackName || entry.track_name || entry.name || "").trim(),
    artist: String(entry.artistName || entry.artist_name || "").trim(),
    album: String(entry.albumName || entry.album_name || "").trim(),
    year: Number(entry.releaseDate ? String(entry.releaseDate).slice(0, 4) : entry.year || 0) || null,
    duration: Number(entry.duration) || null,
    instrumental: Boolean(entry.instrumental),
    lyrics: text,
    synced: Boolean(synced),
    id: entry.id || null
  };
}

/**
 * Recherche de paroles.
 * @param {string} rawQuery « artiste - titre » ou simple recherche
 * @param {{ artist?: string, track?: string, timeoutMs?: number, maxLength?: number }} [options]
 */
async function search(rawQuery, options = {}) {
  const parsed = splitQuery(rawQuery);
  const artist = String(options.artist || parsed.artist || "").trim();
  const track = String(options.track || parsed.track || "").trim();
  const q = [artist, track].filter(Boolean).join(" ").trim();

  if (!q) return fail("error", "Aucun titre indiqué.");
  if (q.length > 120) return fail("error", "Recherche trop longue.");

  const maxLength = Math.max(400, Math.min(3800, Number(options.maxLength) || 3200));

  // 1. Recherche exacte si artiste ET titre sont connus (meilleure qualité).
  if (artist && track) {
    const exact = `${HOST}/api/get${query({ artist_name: artist, track_name: track })}`;
    const res = await fetchJson(exact, { timeoutMs: options.timeoutMs || 12000, headers: { "user-agent": USER_AGENT } });
    if (res.ok) {
      const entry = normalize(res.data);
      if (entry) return success({ ...entry, truncated: entry.lyrics.length > maxLength, text: cap(entry.lyrics, maxLength), exact: true });
    }
    if (res.kind === "timeout" || res.kind === "unavailable") return res;
  }

  // 2. Recherche libre.
  const url = `${HOST}/api/search${query({ q, artist_name: artist || undefined, track_name: track || undefined })}`;
  const res = await fetchJson(url, { timeoutMs: options.timeoutMs || 12000, headers: { "user-agent": USER_AGENT } });
  if (!res.ok) return res;

  const list = Array.isArray(res.data) ? res.data.map(normalize).filter(Boolean) : [];
  if (!list.length) return fail("not-found", `Aucune parole trouvée pour « ${q} ».`);

  const best = list[0];
  return success({
    ...best,
    truncated: best.lyrics.length > maxLength,
    text: cap(best.lyrics, maxLength),
    exact: false,
    others: list.slice(1, 4).map((e) => `${e.artist} — ${e.title}`)
  });
}

function cap(text, maxLength) {
  const body = String(text || "");
  if (body.length <= maxLength) return body;
  return `${body.slice(0, maxLength).replace(/\n[^\n]*$/, "").trimEnd()}\n…`;
}

module.exports = { search, splitQuery, cleanLyrics };
