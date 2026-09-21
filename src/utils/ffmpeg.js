import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import env from '../config/env.js';
import { createLogger } from './logger.js';
import { createTempPath, removeFile } from './tempfile.js';

const logger = createLogger('ffmpeg');

/**
 * ffmpeg est OPTIONNEL.
 * Sans lui : /sticker (images), /toimg (stickers statiques) et /vv fonctionnent.
 * Avec lui : /tovideo, /toaudio et les stickers animés sont disponibles.
 * Résolution : FFMPEG_PATH -> PATH système -> paquet npm `ffmpeg-static`.
 */

let cachedBinary;

async function isExecutable(candidate) {
  if (!candidate) return false;
  return new Promise((resolve) => {
    let done = false;
    const child = spawn(candidate, ['-version'], { stdio: 'ignore' });
    const finish = (value) => {
      if (done) return;
      done = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* noop */
      }
      resolve(value);
    };
    child.on('error', () => finish(false));
    child.on('exit', (code) => finish(code === 0));
    setTimeout(() => finish(false), 5000);
  });
}

export async function resolveFfmpegPath({ force = false } = {}) {
  if (cachedBinary !== undefined && !force) return cachedBinary;

  const candidates = [];
  if (env.ffmpegPath) candidates.push(env.ffmpegPath);
  candidates.push(process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');

  try {
    const mod = await import('ffmpeg-static');
    const resolved = mod?.default || mod;
    if (typeof resolved === 'string') candidates.push(resolved);
  } catch {
    /* paquet optionnel absent */
  }

  for (const candidate of candidates) {
    if (await isExecutable(candidate)) {
      cachedBinary = candidate;
      logger.info('ffmpeg détecté', { binary: candidate === env.ffmpegPath ? 'FFMPEG_PATH' : candidate });
      return cachedBinary;
    }
  }

  cachedBinary = null;
  logger.warn('ffmpeg introuvable : /tovideo, /toaudio et stickers animés seront désactivés');
  return cachedBinary;
}

export async function hasFfmpeg() {
  return (await resolveFfmpegPath()) !== null;
}

/**
 * Exécute ffmpeg.
 * @returns {Promise<{outputFile: string|null, stderr: string}>}
 */
export async function runFfmpeg(args, { timeoutMs = 90_000 } = {}) {
  const binary = await resolveFfmpegPath();
  if (!binary) {
    const error = new Error('ffmpeg est requis pour cette commande mais n’est pas installé sur le serveur.');
    error.code = 'FFMPEG_MISSING';
    throw error;
  }

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error('Conversion ffmpeg interrompue (délai dépassé).'));
    }, timeoutMs);

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('exit', async (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        logger.error('échec ffmpeg', { code, tail: stderr.slice(-600) });
        reject(new Error(`Échec de la conversion (ffmpeg code ${code}).`));
        return;
      }
      resolve({ stderr });
    });
  });
}

/** Convertit un média (buffer) en WebP animé conforme aux stickers WhatsApp. */
export async function toAnimatedWebp(inputBuffer, { ext = '.mp4', maxSeconds = 8, fps = 15, size = 512 } = {}) {
  const input = createTempPath(ext, 'in');
  const output = createTempPath('.webp', 'sticker');
  await fs.writeFile(input, inputBuffer);

  const filter = [
    `scale=${size}:${size}:force_original_aspect_ratio=decrease`,
    `fps=${fps}`,
    `pad=${size}:${size}:-1:-1:color=black@0.0`,
    'split[a][b];[a]palettegen=reserve_transparent=1:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
  ].join(',');

  try {
    await runFfmpeg(['-y', '-i', input, '-vf', filter, '-t', String(maxSeconds), '-loop', '0', '-an', '-vsync', '0', output]);
    return await fs.readFile(output);
  } finally {
    await removeFile(input);
    await removeFile(output);
  }
}

/** WebP animé (sticker) -> MP4. */
export async function webpToMp4(inputBuffer) {
  const input = createTempPath('.webp', 'sticker');
  const output = createTempPath('.mp4', 'video');
  await fs.writeFile(input, inputBuffer);

  try {
    await runFfmpeg([
      '-y',
      '-i',
      input,
      '-movflags',
      'faststart',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '24',
      '-vf',
      'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:v',
      'libx264',
      output,
    ]);
    return await fs.readFile(output);
  } finally {
    await removeFile(input);
    await removeFile(output);
  }
}

/** Extrait la piste audio d'une vidéo en MP3. */
export async function videoToMp3(inputBuffer, { ext = '.mp4' } = {}) {
  const input = createTempPath(ext, 'in');
  const output = createTempPath('.mp3', 'audio');
  await fs.writeFile(input, inputBuffer);

  try {
    try {
      await runFfmpeg(['-y', '-i', input, '-vn', '-c:a', 'libmp3lame', '-q:a', '4', '-ar', '44100', output]);
    } catch (error) {
      // Certains builds ffmpeg n'incluent pas libmp3lame : on laisse ffmpeg choisir.
      await runFfmpeg(['-y', '-i', input, '-vn', '-q:a', '4', output]);
    }
    return await fs.readFile(output);
  } finally {
    await removeFile(input);
    await removeFile(output);
  }
}

/** Extrait la première image d'un média (fallback de /toimg pour les stickers animés). */
export async function toPng(inputBuffer, { ext = '.webp' } = {}) {
  const input = createTempPath(ext, 'in');
  const output = createTempPath('.png', 'out');
  await fs.writeFile(input, inputBuffer);

  try {
    await runFfmpeg(['-y', '-i', input, '-frames:v', '1', '-vf', 'scale=512:512:force_original_aspect_ratio=decrease', output]);
    return await fs.readFile(output);
  } finally {
    await removeFile(input);
    await removeFile(output);
  }
}
