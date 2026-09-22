"use strict";

/**
 * services/external/media.js
 * ---------------------------------------------------------------------------
 * Médias : YouTube, TikTok, Instagram, lecture, paroles, autocollants.
 *
 * POSITION LÉGALE EXPLICITE (exigence du projet) :
 *   • Le bot NE CONTOURNE AUCUNE protection de plateforme : pas d'extraction de
 *     flux chiffrés, pas de signature inversée, pas de téléchargement non
 *     autorisé. Les conditions d'utilisation de YouTube, TikTok et Meta
 *     interdisent ces pratiques, et le bot s'y conforme.
 *   • Ce qui est fait ici est 100 % légitime :
 *       – lecture des métadonnées PUBLIQUES via les points d'entrée oEmbed
 *         officiels (YouTube / TikTok), sans clé ;
 *       – paroles via lrclib.net (base libre) ;
 *       – téléchargement/conversion UNIQUEMENT si le propriétaire du bot branche
 *         son propre service conforme (MEDIA_API_URL).
 *   • Sinon : message « service non configuré » honnête. Jamais de faux résultat.
 * ---------------------------------------------------------------------------
 */

const { fetchJson, fetchBuffer, query, fail, success, notConfigured } = require("./http");
const { callApiMethod } = require("../../utils/helpers");

/** Empreintes d'URL par plateforme. */
const PLATFORM_PATTERNS = [
  {
    id: "youtube",
    label: "YouTube",
    re: /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i,
    oembed: (url) => `https://www.youtube.com/oembed${query({ url, format: "json" })}`
  },
  {
    id: "tiktok",
    label: "TikTok",
    re: /tiktok\.com\/@[\w.\-]+\/video\/(\d+)/i,
    oembed: (url) => `https://www.tiktok.com/oembed${query({ url })}`
  },
  {
    id: "instagram",
    label: "Instagram",
    re: /instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i,
    oembed: null // Meta exige un jeton Graph API : aucune donnée publique sans clé.
  },
  {
    id: "facebook",
    label: "Facebook",
    re: /facebook\.com\/(?:watch\/?\?v=|[\w.]+\/videos\/)(\d+)/i,
    oembed: null
  }
];

/**
 * @param {object} deps
 * @param {object} deps.config
 * @param {object} [deps.logger]
 */
function createMedia(deps = {}) {
  const { config } = deps;
  const logger = deps.logger || { info() {}, warn() {}, error() {}, debug() {} };

  function settings() {
    const media = (config && config.media) || {};
    return {
      apiUrl: String(media.apiUrl || "").trim().replace(/\/+$/, ""),
      apiToken: String(media.apiToken || "").trim(),
      youtubeApiKey: String(media.youtubeApiKey || "").trim(),
      timeoutMs: Math.max(3000, Number(media.timeoutMs) || 20000),
      maxDownloadBytes: Math.max(65536, Number(media.maxDownloadBytes) || 6 * 1024 * 1024)
    };
  }

  /** Un service média conforme est-il branché ? */
  function configured() {
    return Boolean(settings().apiUrl);
  }

  /** Reconnaît la plateforme d'une URL et en extrait l'identifiant. */
  function parseUrl(raw) {
    const text = String(raw || "").trim();
    if (!text) return { ok: false, error: "Aucun lien indiqué." };
    if (text.length > 1000) return { ok: false, error: "Lien trop long." };

    let url = text;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, error: "Lien invalide." };
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { ok: false, error: "Protocole non autorisé." };
    }

    for (const platform of PLATFORM_PATTERNS) {
      const match = url.match(platform.re);
      if (match) {
        return { ok: true, platform: platform.id, label: platform.label, id: match[1], url: parsed.toString() };
      }
    }
    return {
      ok: false,
      error: "Lien non reconnu. Plateformes supportées : YouTube, TikTok, Instagram, Facebook.",
      host: parsed.hostname
    };
  }

  /**
   * Métadonnées PUBLIQUES via oEmbed officiel (titre, auteur, miniature).
   * Aucune clé requise, aucun contournement.
   */
  async function metadata(rawUrl, options = {}) {
    const parsed = parseUrl(rawUrl);
    if (!parsed.ok) return fail("error", parsed.error);

    const platform = PLATFORM_PATTERNS.find((p) => p.id === parsed.platform);
    if (!platform || typeof platform.oembed !== "function") {
      return notConfigured(
        `Les métadonnées ${parsed.label}`,
        `${parsed.label} ne propose pas de point d'entrée public sans jeton API. Configure un service conforme via MEDIA_API_URL.`
      );
    }

    const res = await fetchJson(platform.oembed(parsed.url), { timeoutMs: options.timeoutMs || 12000 });
    if (!res.ok) {
      if (res.kind === "not-found") {
        return fail("not-found", "Contenu introuvable, privé, supprimé ou restreint par la plateforme.");
      }
      return res;
    }

    const data = res.data || {};
    return success({
      platform: parsed.platform,
      label: parsed.label,
      id: parsed.id,
      url: parsed.url,
      title: String(data.title || "").trim() || "(sans titre)",
      author: String(data.author_name || data.authorName || "").trim(),
      authorUrl: String(data.author_url || "").trim(),
      thumbnail: String(data.thumbnail_url || "").trim(),
      provider: String(data.provider_name || platform.label),
      width: Number(data.width) || null,
      height: Number(data.height) || null
    });
  }

  /**
   * Téléchargement / conversion (mp3, mp4, TikTok sans filigrane…).
   *
   * Nécessite MEDIA_API_URL : un service que le PROPRIÉTAIRE du bot héberge et
   * dont il assume la conformité (droits d'auteur, CGU des plateformes).
   * Sans ce service, la réponse est un refus explicite et expliqué.
   *
   * @param {"ytmp3"|"ytmp4"|"tiktok"|"instagram"|"audio"} kind
   * @param {string} target URL ou recherche
   */
  async function download(kind, target, options = {}) {
    const s = settings();
    if (!s.apiUrl) {
      return notConfigured(
        "Le téléchargement média",
        "Aucun service conforme n'est branché (MEDIA_API_URL). Le bot ne contourne pas les protections des plateformes : configure ton propre service, ou utilise /lyrics et /yt pour les informations publiques."
      );
    }

    const text = String(target || "").trim();
    if (!text) return fail("error", "Indique un lien ou un titre à chercher.");
    if (text.length > 500) return fail("error", "Demande trop longue.");

    const res = await fetchJson(`${s.apiUrl}/media`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(s.apiToken ? { authorization: `Bearer ${s.apiToken}` } : {})
      },
      body: JSON.stringify({ kind, target: text }),
      timeoutMs: options.timeoutMs || s.timeoutMs
    });
    if (!res.ok) {
      if (res.status === 451 || res.status === 403) {
        return fail("unavailable", "Le service média a refusé cette demande (contenu protégé ou non autorisé).");
      }
      return res;
    }

    const data = res.data || {};
    const fileUrl = String(data.url || data.audioUrl || data.videoUrl || "").trim();
    if (!fileUrl) return fail("not-found", "Le service média n'a renvoyé aucun fichier.");
    if (!/^https?:\/\//i.test(fileUrl)) return fail("error", "Réponse du service média invalide.");

    return success({
      kind,
      title: String(data.title || text).slice(0, 200),
      author: String(data.author || "").slice(0, 120),
      url: fileUrl,
      thumbnail: String(data.thumbnail || ""),
      duration: String(data.duration || ""),
      size: Number(data.size) || null,
      format: String(data.format || kind)
    });
  }

  /**
   * Résout l'URL d'une photo reçue sur Messenger (api.resolvePhotoUrl).
   * Utilisé par /toimg pour renvoyer une pièce jointe sous forme d'image.
   */
  async function resolvePhoto(api, photoID) {
    if (!api || typeof api.resolvePhotoUrl !== "function") {
      return fail("unavailable", "L'API Facebook n'expose pas resolvePhotoUrl sur cette version.");
    }
    const id = String(photoID || "").trim();
    if (!id) return fail("error", "Aucun identifiant de photo.");
    try {
      const url = await callApiMethod(api.resolvePhotoUrl.bind(api), [id], { timeoutMs: 15000 });
      if (!url || typeof url !== "string") return fail("error", "URL de photo introuvable.");
      return success({ url, photoID: id });
    } catch (err) {
      logger.debug(`resolvePhotoUrl échoué : ${err.message}`, "media");
      return fail("unavailable", `Impossible de résoudre la photo (${String(err.message).slice(0, 80)}).`);
    }
  }

  /** La recherche YouTube officielle est-elle branchée ? */
  function youtubeConfigured() {
    return Boolean(settings().youtubeApiKey);
  }

  /**
   * Recherche YouTube via l'API OFFICIELLE v3 (nécessite YOUTUBE_API_KEY).
   * Aucun scraping, aucun contournement des CGU.
   *
   * @param {string} rawQuery
   * @param {{ limit?: number, timeoutMs?: number }} [options]
   */
  async function youtubeSearch(rawQuery, options = {}) {
    const s = settings();
    const q = String(rawQuery || "").trim();
    if (!q) return fail("error", "Aucune recherche indiquée.");
    if (q.length > 120) return fail("error", "Recherche trop longue (120 caractères max).");
    if (!s.youtubeApiKey) {
      return notConfigured(
        "La recherche YouTube",
        "Renseigne YOUTUBE_API_KEY (console Google Cloud, API YouTube Data v3). Sans clé, le bot ne scrappe pas YouTube : utilise /yt <lien vidéo> pour les informations publiques d'une vidéo précise."
      );
    }

    const limit = Math.max(1, Math.min(10, Number(options.limit) || 5));
    const url = `https://www.googleapis.com/youtube/v3/search${query({
      part: "snippet",
      q,
      type: "video",
      maxResults: limit,
      safeSearch: "moderate",
      key: s.youtubeApiKey
    })}`;
    const res = await fetchJson(url, { timeoutMs: options.timeoutMs || 12000 });
    if (!res.ok) {
      if (res.status === 403 || res.kind === "unavailable") {
        return fail("unauthorized", "La clé YouTube API a été refusée (quota épuisé, clé invalide ou API non activée).");
      }
      return res;
    }

    const items = Array.isArray(res.data && res.data.items) ? res.data.items : [];
    const videos = items
      .map((item) => {
        const id = item && item.id && item.id.videoId;
        const snippet = (item && item.snippet) || {};
        if (!id) return null;
        return {
          id: String(id),
          title: String(snippet.title || "(sans titre)").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').slice(0, 140),
          channel: String(snippet.channelTitle || "").slice(0, 80),
          publishedAt: String(snippet.publishedAt || "").slice(0, 10),
          description: String(snippet.description || "").slice(0, 200),
          thumbnail: String((snippet.thumbnails && ((snippet.thumbnails.medium && snippet.thumbnails.medium.url) || (snippet.thumbnails.default && snippet.thumbnails.default.url))) || ""),
          url: `https://www.youtube.com/watch?v=${id}`
        };
      })
      .filter(Boolean);

    if (!videos.length) return fail("not-found", `Aucune vidéo trouvée pour « ${q} ».`);
    return success({ query: q, videos, source: "YouTube Data API v3" });
  }

  /**
   * Récupère un fichier média distant (plafond strict) pour l'envoyer en pièce
   * jointe. Échoue proprement si le fichier est trop lourd ou inaccessible.
   *
   * @param {string} fileUrl
   * @param {{ timeoutMs?: number }} [options]
   */
  async function fetchFile(fileUrl, options = {}) {
    const s = settings();
    const url = String(fileUrl || "").trim();
    if (!/^https?:\/\//i.test(url)) return fail("error", "URL de fichier invalide.");
    const res = await fetchBuffer(url, { timeoutMs: options.timeoutMs || s.timeoutMs });
    if (!res.ok) return res;
    if (res.data.length > s.maxDownloadBytes) {
      return fail("unavailable", `Fichier trop volumineux (limite ${Math.round(s.maxDownloadBytes / 1048576)} Mo).`);
    }
    return success({ buffer: res.data, contentType: res.contentType, size: res.size });
  }

  /** Conversions impossibles sans outil externe : message honnête. */
  function conversionUnavailable(feature) {
    return notConfigured(
      feature,
      "Aucun convertisseur n'est branché sur ce déploiement (MEDIA_API_URL). Le bot ne simule jamais un résultat."
    );
  }

  return {
    PLATFORM_PATTERNS,
    configured,
    youtubeConfigured,
    parseUrl,
    metadata,
    youtubeSearch,
    download,
    fetchFile,
    resolvePhoto,
    conversionUnavailable,
    settings
  };
}

module.exports = { createMedia, PLATFORM_PATTERNS };
