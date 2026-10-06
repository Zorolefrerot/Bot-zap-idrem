'use strict';
/*
 * 🧬 MeR~NeL — services/videoGenerator.js
 * Génération de vidéos via l'API Agnes (endpoint vidéos, best-effort).
 * Si l'endpoint n'existe pas côté fournisseur, une erreur typée propre
 * est retournée — le bot n'invente jamais un succès.
 */

const fs = require('fs');
const path = require('path');
const config = require('../core/config');

function createVideoGenerator(logger) {
  function typedError(code, message) {
    const e = new Error(message || code);
    e.code = code;
    return e;
  }

  function available() {
    return config.agnes.hasKey();
  }

  /**
   * Tente de générer une courte vidéo depuis un prompt.
   * @returns {Promise<string|null>} chemin du fichier ou null (indisponible)
   */
  async function generate(prompt, maxSeconds = config.media.mediaMaxSeconds) {
    if (!available()) throw typedError('VIDEO_NO_KEY', 'AGNES_API_KEY manquante.');
    fs.mkdirSync(config.tmpDir, { recursive: true });

    let res;
    try {
      res = await fetch(`${config.agnes.baseUrl}/videos/generations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.agnes.apiKey}` },
        body: JSON.stringify({ prompt: String(prompt).slice(0, 800), seconds: Math.min(maxSeconds, 120) }),
        signal: AbortSignal.timeout(240_000),
      });
    } catch (err) {
      if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw typedError('API_TIMEOUT');
      throw typedError('API_UNREACHABLE');
    }

    if (res.status === 404 || res.status === 405) throw typedError('VIDEO_NOT_SUPPORTED');
    if (!res.ok) throw typedError(res.status === 401 ? 'VIDEO_AUTH' : 'VIDEO_UNAVAILABLE', `HTTP ${res.status}`);

    const data = await res.json().catch(() => null);
    const url = data && data.data && data.data[0] && (data.data[0].url || data.data[0].video_url);
    if (!url) throw typedError('VIDEO_BAD_RESPONSE');

    const dest = path.join(config.tmpDir, `video-gen-${Date.now()}.mp4`);
    const dl = await fetch(url, { signal: AbortSignal.timeout(90_000) });
    if (!dl.ok) throw typedError('VIDEO_DOWNLOAD_FAILED');
    fs.writeFileSync(dest, Buffer.from(await dl.arrayBuffer()));
    return dest;
  }

  return { generate, available };
}

module.exports = { createVideoGenerator };
