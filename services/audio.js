'use strict';
/*
 * 🧬 MeR~NeL — services/audio.js
 * Xplay : recherche YouTube + téléchargement audio ≤ MEDIA_MAX_SECONDS.
 * Si la source dépasse la limite, on ne contourne RIEN : réponse propre.
 */

const fs = require('fs');
const path = require('path');
const config = require('../core/config');

function createAudioService(logger) {
  function typedError(code, message) {
    const e = new Error(message || code);
    e.code = code;
    return e;
  }

  let yts, ytdl;
  try {
    yts = require('yt-search');
    // eslint-disable-next-line global-require
    ytdl = require('@distube/ytdl-core');
  } catch (_) {
    yts = null;
    ytdl = null;
  }

  function available() {
    return Boolean(yts && ytdl);
  }

  function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /**
   * Recherche un morceau dont la durée respecte la limite.
   * @returns {Promise<{ok: true, video}|{ok: false, reason: 'TOO_LONG'|'NOT_FOUND', top?}>}
   */
  async function search(query, maxSeconds = config.media.mediaMaxSeconds) {
    if (!available()) throw typedError('MEDIA_SERVICE_UNAVAILABLE');
    const clean = String(query || '').trim().slice(0, 200);
    if (!clean) throw typedError('BAD_QUERY');
    const results = await yts(clean);
    const videos = (results && results.videos) || [];
    if (videos.length === 0) return { ok: false, reason: 'NOT_FOUND' };
    const first = videos[0];
    const within = videos.find((v) => (v.seconds || Infinity) <= maxSeconds);
    if (!within) {
      return { ok: false, reason: 'TOO_LONG', top: { title: first.title, seconds: first.seconds, url: first.url } };
    }
    return { ok: true, video: { title: within.title, seconds: within.seconds, url: within.url, author: within.author && within.author.name } };
  }

  /**
   * Télécharge l'audio (m4a de préférence) dans tmp/.
   * @returns {Promise<{file, title, seconds}>}
   */
  async function download(video) {
    if (!available()) throw typedError('MEDIA_SERVICE_UNAVAILABLE');
    fs.mkdirSync(config.tmpDir, { recursive: true });
    const stamp = Date.now();
    const filter = (f) => f.hasAudio && !f.hasVideo && f.container === 'm4a';
    let stream;
    try {
      stream = ytdl(video.url, { filter, quality: 'highestaudio' });
    } catch (_) {
      stream = ytdl(video.url, { filter: 'audioonly', quality: 'highestaudio' });
    }
    const ext = 'm4a';
    const dest = path.join(config.tmpDir, `audio-${stamp}.${ext}`);

    return new Promise((resolve, reject) => {
      const killer = setTimeout(() => {
        stream.destroy();
        reject(typedError('API_TIMEOUT'));
      }, config.media.downloadTimeoutMs);
      const out = fs.createWriteStream(dest);
      let size = 0;
      stream.on('data', (chunk) => {
        size += chunk.length;
        if (size > 25 * 1024 * 1024) {
          clearTimeout(killer);
          stream.destroy();
          out.destroy();
          reject(typedError('MEDIA_TOO_LARGE'));
        }
      });
      stream.on('error', (err) => {
        clearTimeout(killer);
        reject(typedError('MEDIA_UNAVAILABLE', err.message));
      });
      out.on('error', (err) => {
        clearTimeout(killer);
        reject(typedError('MEDIA_WRITE_FAILED', err.message));
      });
      out.on('finish', () => {
        clearTimeout(killer);
        resolve({ file: dest, title: video.title, seconds: video.seconds });
      });
      stream.pipe(out);
    });
  }

  return { search, download, available, formatDuration };
}

module.exports = { createAudioService };
