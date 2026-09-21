import os from 'node:os';
import { createRequire } from 'node:module';
import { hasFfmpeg, resolveFfmpegPath } from './ffmpeg.js';

const require = createRequire(import.meta.url);

function readVersion(pkg) {
  try {
    return require(`${pkg}/package.json`).version;
  } catch {
    return null;
  }
}

export function systemInfo() {
  return {
    node: process.version,
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    cpus: os.cpus()?.length || 0,
    memoryTotal: os.totalmem(),
    memoryFree: os.freemem(),
    processMemory: process.memoryUsage(),
    uptime: os.uptime(),
  };
}

export function versions() {
  return {
    bot: readVersion('idrem-tereshkova-bot') || process.env.npm_package_version || '1.0.0',
    baileys: readVersion('@whiskeysockets/baileys') || 'inconnue',
    sharp: readVersion('sharp') || 'inconnue',
    node: process.version,
  };
}

export async function capabilities() {
  const ffmpeg = await resolveFfmpegPath();
  return {
    ffmpeg: Boolean(ffmpeg),
    ffmpegPath: ffmpeg ? 'détecté' : 'absent',
    sharp: Boolean(readVersion('sharp')),
    features: {
      imageSticker: true,
      viewOnce: true,
      animatedSticker: Boolean(ffmpeg),
      stickerToVideo: Boolean(ffmpeg),
      videoToAudio: Boolean(ffmpeg),
    },
  };
}

export { hasFfmpeg };
