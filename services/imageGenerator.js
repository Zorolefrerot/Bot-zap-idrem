'use strict';
/*
 * 🧬 MeR~NeL — services/imageGenerator.js
 * Génération d'images via l'API Agnes (compatible OpenAI Images).
 * Clé lue UNIQUEMENT depuis l'environnement (AGNES_API_KEY).
 */

const fs = require('fs');
const path = require('path');
const config = require('../core/config');

function createImageGenerator(logger) {
  function typedError(code, message) {
    const e = new Error(message || code);
    e.code = code;
    return e;
  }

  function available() {
    return config.agnes.hasKey();
  }

  async function downloadTo(url, dest) {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw typedError('IMAGE_DOWNLOAD_FAILED', `HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    return dest;
  }

  /**
   * Génère n images pour un prompt validé.
   * @returns {Promise<string[]>} chemins locaux des fichiers générés
   */
  async function generate(prompt, n = 1) {
    if (!available()) throw typedError('IMAGE_NO_KEY', 'AGNES_API_KEY manquante dans la configuration.');
    const count = Math.max(1, Math.min(Number(n) || 1, config.media.maxImages));

    fs.mkdirSync(config.tmpDir, { recursive: true });
    let res;
    try {
      res = await fetch(`${config.agnes.baseUrl}${config.agnes.imageEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.agnes.apiKey}`,
        },
        body: JSON.stringify({
          model: config.agnes.imageModel,
          prompt,
          n: count,
          size: '1024x1024',
        }),
        signal: AbortSignal.timeout(150_000),
      });
    } catch (err) {
      if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw typedError('API_TIMEOUT');
      throw typedError('API_UNREACHABLE');
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw typedError('IMAGE_AUTH', `HTTP ${res.status}`);
      if (res.status === 429) throw typedError('AI_RATE_LIMIT');
      throw typedError('IMAGE_UNAVAILABLE', `HTTP ${res.status}`);
    }

    let data;
    try {
      data = await res.json();
    } catch (_) {
      throw typedError('IMAGE_BAD_RESPONSE');
    }
    const items = (data && Array.isArray(data.data) && data.data) || [];
    if (items.length === 0) throw typedError('IMAGE_BAD_RESPONSE');

    const stamp = Date.now();
    const files = [];
    for (let i = 0; i < Math.min(count, items.length); i++) {
      const item = items[i];
      const dest = path.join(config.tmpDir, `img-${stamp}-${i + 1}.png`);
      try {
        if (item && typeof item.b64_json === 'string' && item.b64_json) {
          fs.writeFileSync(dest, Buffer.from(item.b64_json, 'base64'));
          files.push(dest);
        } else if (item && typeof item.url === 'string' && /^https?:\/\//.test(item.url)) {
          files.push(await downloadTo(item.url, dest));
        }
      } catch (err) {
        logger.warn('[imageGenerator] item ignoré:', err.code || err.message);
      }
    }
    if (files.length === 0) throw typedError('IMAGE_BAD_RESPONSE');
    return files;
  }

  /** Génère une affiche (utilisée par Xannonce) — best effort. */
  async function generatePoster({ title, subtitle, lines }) {
    if (!available()) return null;
    const prompt =
      `Affiche futuriste sombre avec néons cyan et violet, style cyberpunk élégant, ` +
      `grand titre "${title}"${subtitle ? `, sous-titre "${subtitle}"` : ''}` +
      (lines && lines.length ? `, lignes d'informations : ${lines.join(' / ')}` : '') +
      `, aspect ratio vertical, typographie moderne, esthétique sci-fi, pas de filigrane.`;
    try {
      const files = await generate(prompt, 1);
      return files[0] || null;
    } catch (err) {
      logger.warn('[imageGenerator] affiche ignorée:', err.code || err.message);
      return null;
    }
  }

  return { generate, generatePoster, available };
}

module.exports = { createImageGenerator };
