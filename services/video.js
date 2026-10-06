'use strict';
/*
 * 🧬 MeR~NeL — services/video.js
 * Xvideo : recherche + téléchargement vidéo ≤ MEDIA_MAX_SECONDS,
 * sans jamais contourner les restrictions des plateformes.
 */

const fs = require('fs');
const path = require('path');
const config = require('../core/config');

function createVideoService(logger) {
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

  async function download(video) {
    if (!available()) throw typedError('MEDIA_SERVICE_UNAVAILABLE');
    fs.mkdirSync(config.tmpDir, { recursive: true });
    const dest = path.join(config.tmpDir, `video-${Date.now()}.mp4`);
    const filter = (f) => f.hasVideo && f.hasAudio && f.container === 'mp4' && (f.height || 720) <= 480;

    return new Promise((resolve, reject) => {
      let stream;
      try {
        stream = ytdl(video.url, { filter, quality: 'highest' });
      } catch (err) {
        return reject(typedError('MEDIA_UNAVAILABLE', err.message));
      }
      const killer = setTimeout(() => {
        stream.destroy();
        reject(typedError('API_TIMEOUT'));
      }, config.media.downloadTimeoutMs);
      const out = fs.createWriteStream(dest);
      let size = 0;
      stream.on('data', (chunk) => {
        size += chunk.length;
        if (size > 24 * 1024 * 1024) {
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

  return { search, download, available };
}

module.exports = { createVideoService };
