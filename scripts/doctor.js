#!/usr/bin/env node
/**
 * IDREM TERESHKOVA BOT — diagnostic d'installation (`npm run doctor`).
 *
 * Vérifie l'environnement d'exécution sans jamais afficher de secret :
 *   • version de Node
 *   • présence du fichier .env et des variables clés (noms uniquement)
 *   • importabilité des dépendances critiques (+ version de Baileys et
 *     du override libsignal)
 *   • fonctionnement réel de sharp (conversion 1x1)
 *   • disponibilité de ffmpeg (optionnel : stickers animés, /tovideo, /toaudio)
 *   • écriture dans les répertoires data/ sessions/ logs/ tmp/
 *   • présence du build frontend (frontend/dist)
 *   • validité du numéro admin configuré (format uniquement)
 *   • disponibilité du port HTTP
 *
 * Code de sortie : 0 si aucune erreur bloquante, 1 sinon.
 */

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const OK = '✓';
const WARN = '⚠';
const KO = '✗';

let errors = 0;
let warnings = 0;

function ok(label, detail = '') {
  console.log(`  ${OK} ${label}${detail ? ` — ${detail}` : ''}`);
}

function warn(label, detail = '') {
  warnings += 1;
  console.log(`  ${WARN} ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail = '') {
  errors += 1;
  console.log(`  ${KO} ${label}${detail ? ` — ${detail}` : ''}`);
}

function section(title) {
  console.log(`\n${title}`);
  console.log('  ' + '─'.repeat(Math.max(title.length, 40)));
}

/** Lit uniquement les NOMS de clés du .env (jamais les valeurs). */
function readEnvKeys() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return null;
  const keys = new Set();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
    if (match) keys.add(match[1]);
  }
  return keys;
}

function checkNode() {
  section('Runtime Node.js');
  const [major] = process.versions.node.split('.').map(Number);
  if (major >= 20) ok(`Node ${process.versions.node}`, '>= 20 requis');
  else fail(`Node ${process.versions.node}`, 'Node 20+ est requis (22 LTS recommandé)');
  ok(`Plateforme : ${os.platform()} ${os.arch()}`);
}

function checkEnvFile() {
  section('Fichier .env (noms des variables uniquement)');
  const keys = readEnvKeys();
  if (!keys) {
    warn('.env absent', 'copiez .env.example vers .env : `cp .env.example .env`');
    return;
  }
  ok('.env présent');

  const recommended = ['DASHBOARD_PASSWORD', 'SESSION_SECRET'];
  const optional = ['ADMIN_NUMBER', 'ADMIN_NAME', 'PREFIX', 'STICKER_NAME', 'BOT_NAME', 'PORT', 'ALLOWED_ORIGINS'];

  for (const key of recommended) {
    if (keys.has(key)) ok(`${key} défini`);
    else warn(`${key} absent`, 'un secret sera généré au démarrage et affiché UNE fois dans les logs');
  }
  for (const key of optional) {
    if (keys.has(key)) ok(`${key} défini`);
    else console.log(`  · ${key} non défini (valeur par défaut utilisée)`);
  }
}

async function checkDependencies() {
  section('Dépendances');
  const critical = [
    '@whiskeysockets/baileys',
    'express',
    'sharp',
    'zod',
    'node-webpmux',
    'qrcode',
    'pino',
    '@hapi/boom',
    'helmet',
    'cors',
    'cookie-parser',
    'express-rate-limit',
    'dotenv',
  ];

  for (const name of critical) {
    try {
      require.resolve(name);
      ok(name);
    } catch {
      fail(name, 'introuvable — lancez `npm install`');
    }
  }

  try {
    const pkg = require('@whiskeysockets/baileys/package.json');
    ok(`Baileys version ${pkg.version}`);
  } catch {
    warn('version Baileys illisible');
  }

  try {
    const pkg = require('libsignal/package.json');
    if (pkg.version === '6.0.0') ok(`libsignal ${pkg.version}`, 'override npm appliqué');
    else warn(`libsignal ${pkg.version}`, 'attendu 6.0.0 (overrides du package.json)');
  } catch {
    warn('libsignal introuvable', 'le pairing peut échouer — relancez `npm install`');
  }
}

async function checkSharp() {
  section('Traitement d’image (sharp)');
  try {
    const { default: sharp } = await import('sharp');
    const png = await sharp({
      create: { width: 1, height: 1, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    if (png.length > 0) ok('sharp opérationnel', `PNG test ${png.length} octets`);
    else fail('sharp a produit un buffer vide');
  } catch (error) {
    fail('sharp indisponible', error.message);
  }
}

async function checkFfmpeg() {
  section('Traitement vidéo/audio (ffmpeg — optionnel)');
  try {
    const { hasFfmpeg, resolveFfmpegPath } = await import('../src/utils/ffmpeg.js');
    const available = await hasFfmpeg();
    if (available) {
      const resolved = await resolveFfmpegPath();
      ok('ffmpeg disponible', resolved || '');
    } else {
      warn(
        'ffmpeg absent',
        '/tovideo, /toaudio et les stickers animés seront indisponibles (les stickers image fonctionnent)',
      );
      console.log('    → Debian/Ubuntu : apt-get install ffmpeg | macOS : brew install ffmpeg');
    }
  } catch (error) {
    warn('vérification ffmpeg impossible', error.message);
  }
}

function checkDirectories() {
  section('Répertoires de stockage');
  const dirs = {
    DATA_DIR: process.env.DATA_DIR || './data',
    SESSION_DIR: process.env.SESSION_DIR || './sessions',
    LOG_DIR: process.env.LOG_DIR || './logs',
    TMP_DIR: process.env.TMP_DIR || './tmp',
  };

  for (const [name, dir] of Object.entries(dirs)) {
    const abs = path.resolve(ROOT, dir);
    try {
      fs.mkdirSync(abs, { recursive: true });
      const probe = path.join(abs, `.doctor-${Date.now()}`);
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      ok(`${name} accessible en écriture`, abs.replace(ROOT, '.'));
    } catch (error) {
      fail(`${name} non accessible`, `${abs} — ${error.message}`);
    }
  }
}

function checkFrontend() {
  section('Frontend (dashboard)');
  const indexFile = path.join(ROOT, 'frontend', 'dist', 'index.html');
  if (fs.existsSync(indexFile)) {
    ok('build frontend présent', 'frontend/dist/index.html');
  } else {
    warn('build frontend absent', 'le dashboard ne sera pas servi — lancez `npm run build`');
  }
}

async function checkConfig() {
  section('Configuration applicative');
  try {
    const { env } = await import('../src/config/env.js');
    const { isValidPhone } = await import('../src/utils/phone.js');

    ok(`Nom du bot : ${env.botDefaults.botName}`);
    ok(`Préfixe : ${env.botDefaults.prefix}`);
    ok(`Sticker : pack « ${env.botDefaults.stickerName} »`);

    if (!env.botDefaults.adminNumber) {
      warn('ADMIN_NUMBER non défini', 'les commandes admin ne seront utilisables par personne');
    } else if (isValidPhone(env.botDefaults.adminNumber)) {
      ok('ADMIN_NUMBER au format international valide', `se termine par ${env.botDefaults.adminNumber.slice(-4)}`);
    } else {
      fail('ADMIN_NUMBER invalide', 'format international attendu, ex : 243970000000');
    }

    if (env.security.dashboardPasswordGenerated) {
      warn('DASHBOARD_PASSWORD sera généré au démarrage', 'définissez-le dans .env pour un mot de passe stable');
    } else {
      ok('DASHBOARD_PASSWORD défini');
    }
    if (env.security.sessionSecretGenerated) {
      warn('SESSION_SECRET sera généré au démarrage', 'les tokens du dashboard seront invalidés à chaque redémarrage');
    } else {
      ok('SESSION_SECRET défini');
    }
  } catch (error) {
    fail('chargement de la configuration impossible', error.message);
  }
}

async function checkPort() {
  section('Port HTTP');
  const port = Number.parseInt(process.env.PORT || '3000', 10) || 3000;
  const free = await new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, process.env.HOST || '0.0.0.0');
  });
  if (free) ok(`port ${port} disponible`);
  else warn(`port ${port} déjà utilisé`, 'le serveur ne pourra pas démarrer sur ce port');
}

async function main() {
  console.log('🩺 IDREM TERESHKOVA BOT — diagnostic d’installation');
  console.log(`   racine : ${ROOT}`);

  // Charge .env comme le fait le serveur, pour diagnostiquer la vraie config.
  try {
    const { default: dotenv } = await import('dotenv');
    dotenv.config({ path: path.join(ROOT, '.env') });
  } catch {
    /* dotenv est une dépendance du projet ; sinon les checks suivants le signaleront */
  }

  checkNode();
  checkEnvFile();
  await checkDependencies();
  await checkSharp();
  await checkFfmpeg();
  checkDirectories();
  checkFrontend();
  await checkConfig();
  await checkPort();

  console.log('\n──────────────────────────────────────────────');
  if (errors > 0) {
    console.log(`❌ Diagnostic terminé : ${errors} erreur(s), ${warnings} avertissement(s).`);
    process.exit(1);
  }
  if (warnings > 0) {
    console.log(`🟡 Diagnostic terminé : 0 erreur, ${warnings} avertissement(s). Le bot peut démarrer.`);
  } else {
    console.log('✅ Diagnostic terminé : tout est vert. Lancez `npm start` (ou `npm run dev`).');
  }
  process.exit(0);
}

await main();
