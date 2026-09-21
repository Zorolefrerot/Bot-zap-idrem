import './helpers/env.mjs';

import assert from 'node:assert/strict';
import test, { before, beforeEach, describe } from 'node:test';
import sharp from 'sharp';

import db from '../src/database/index.js';
import { botManager } from '../src/bot/manager.js';
import { createProcessor, resetRuntimeCaches } from '../src/bot/handler.js';
import { createStickerFromImage } from '../src/utils/sticker.js';
import { hasFfmpeg } from '../src/utils/ffmpeg.js';
import {
  GROUP_JID,
  OWNER_JID,
  OWNER_PHONE,
  USER_JID,
  createFakeSock,
  imageMessage,
  quotedSticker,
  quotedViewOnce,
  textMessage,
  viewOnceImageMessage,
} from './helpers/fakeSock.mjs';

/**
 * Intégration du bot : routage, permissions, commandes.
 * Seule la frontière réseau WhatsApp est doublée (socket + téléchargement
 * média) ; toute la logique testée est la vraie implémentation.
 */

const ffmpegAvailable = await hasFfmpeg();

const FAKE_JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');

function processorWith(buffer = FAKE_JPEG) {
  const sock = createFakeSock();
  const proc = createProcessor(sock, botManager, { downloadMediaMessage: async () => buffer });
  return { sock, ...proc };
}

function processorWithFailure(statusCode, message = 'media expired') {
  const sock = createFakeSock();
  const proc = createProcessor(sock, botManager, {
    downloadMediaMessage: async () => {
      const error = new Error(message);
      error.output = { statusCode };
      error.isBoom = true;
      throw error;
    },
  });
  return { sock, ...proc };
}

async function makePng() {
  return sharp({ create: { width: 300, height: 220, channels: 3, background: { r: 30, g: 200, b: 160 } } })
    .png()
    .toBuffer();
}

before(async () => {
  await db.init();
  await botManager.boot();
  db.updateSettings({ prefix: '/', adminNumber: OWNER_PHONE, adminName: 'Merdi', stickerName: 'IDREM TERESHKOVA', stickerAuthor: '' });
  await db.flush();
});

/**
 * Chaque test part d'un état propre : cooldowns remis à zéro et configuration
 * réinitialisée. Un test qui échoue ne peut donc pas contaminer les suivants.
 */
beforeEach(() => {
  resetRuntimeCaches();
  db.updateSettings({
    prefix: '/',
    botName: 'IDREM TERESHKOVA BOT',
    stickerName: 'IDREM TERESHKOVA',
    stickerAuthor: '',
    adminNumber: OWNER_PHONE,
    adminName: 'Merdi',
  });
});

describe('routage des messages', () => {
  test('un message sans préfixe est ignoré', async () => {
    const { sock, handle } = processorWith();
    const result = await handle(textMessage('bonjour tout le monde'));
    assert.equal(result.ignored, 'no-prefix');
    assert.equal(sock.sent.length, 0, 'le bot ne doit pas répondre aux messages sans préfixe');
  });

  test('les messages du bot lui-même sont ignorés (anti-boucle)', async () => {
    const { sock, handle } = processorWith();
    const result = await handle(textMessage('/ping', { fromMe: true }));
    assert.equal(result.ignored, 'fromMe');
    assert.equal(sock.sent.length, 0);
  });

  test('les statuts WhatsApp sont ignorés', async () => {
    const { sock, handle } = processorWith();
    const result = await handle(textMessage('/ping', { remoteJid: 'status@broadcast' }));
    assert.equal(result.ignored, 'broadcast');
    assert.equal(sock.sent.length, 0);
  });

  test('commande inconnue : réponse claire', async () => {
    const { sock, handle } = processorWith();
    const result = await handle(textMessage('/commande-qui-n-existe-pas'));
    assert.equal(result.unknown, 'commande-qui-n-existe-pas');
    assert.match(sock.lastText(), /Commande inconnue/);
    assert.match(sock.lastText(), /\/menu/);
  });

  test('les alias fonctionnent', async () => {
    const { sock, handle } = processorWith();
    await handle(textMessage('/s'));
    // /s sans média renvoie l'aide de la commande sticker
    assert.match(sock.lastText(), /Créer un sticker/);
  });

  test('les statistiques sont incrémentées', async () => {
    const before = db.getStats().commandsExecuted;
    const { handle } = processorWith();
    await handle(textMessage('/ping'));
    assert.ok(db.getStats().commandsExecuted >= before + 1);
    assert.ok(db.getStats().messagesProcessed > 0);
  });

  test('anti-spam : le cooldown bloque la seconde exécution immédiate', async () => {
    const sock = createFakeSock();
    const { handle } = createProcessor(sock, botManager, { downloadMediaMessage: async () => FAKE_JPEG });
    const sender = '243899900011@s.whatsapp.net';

    await handle(textMessage('/ping', { remoteJid: sender }));
    const firstCount = sock.sent.length;
    assert.ok(firstCount > 0);

    await handle(textMessage('/ping', { remoteJid: sender }));
    assert.equal(sock.sent.length, firstCount, 'aucun envoi supplémentaire pendant le cooldown');
  });
});

describe('commandes générales', () => {
  test('/menu présente toutes les catégories', async () => {
    const { sock, handle } = processorWith();
    await handle(textMessage('/menu'));
    const menu = sock.lastText();

    for (const label of ['ADMIN', 'BOT', 'TOOLS', 'STICKER', 'MEDIA']) {
      assert.ok(menu.includes(label), `catégorie manquante : ${label}`);
    }
    assert.match(menu, /╭━━━〔/);
    assert.ok(menu.includes('/menu'));
    assert.ok(menu.includes('/vv'));
    assert.ok(menu.includes('Merdi'), 'le nom de l’administrateur doit apparaître');
  });

  test('/help <commande> détaille la commande', async () => {
    const { sock, handle } = processorWith();
    await handle(textMessage('/help vv'));
    assert.match(sock.lastText(), /View Once/);
    assert.match(sock.lastText(), /Usage/);

    sock.reset();
    resetRuntimeCaches(); // l'anti-spam bloque sinon le 2e appel immédiat
    await handle(textMessage('/help inconnue'));
    assert.match(sock.lastText(), /Commande inconnue/);
  });

  test('/ping répond avec une latence mesurée', async () => {
    const { sock, handle } = processorWith();
    await handle(textMessage('/ping', { remoteJid: '243899900022@s.whatsapp.net' }));
    assert.match(sock.lastText(), /Pong/);
    assert.match(sock.lastText(), /ms/);
  });

  test('/runtime indique l’uptime', async () => {
    const { sock, handle } = processorWith();
    await handle(textMessage('/runtime'));
    assert.match(sock.lastText(), /Uptime/);
    assert.match(sock.lastText(), /Serveur actif depuis/);
  });

  test('/info expose la stack sans secret', async () => {
    const { sock, handle } = processorWith();
    await handle(textMessage('/info'));
    const text = sock.lastText();
    assert.match(text, /Baileys/);
    assert.match(text, /IDREM TERESHKOVA BOT/);
    assert.match(text, /ffmpeg/);
    for (const forbidden of ['creds', 'noiseKey', 'SESSION_SECRET', 'DASHBOARD_PASSWORD']) {
      assert.ok(!text.includes(forbidden), `fuite détectée : ${forbidden}`);
    }
  });

  test('/owner envoie une carte de contact avec le numéro administrateur', async () => {
    const { sock, handle } = processorWith();
    await handle(textMessage('/owner'));

    const contact = sock.sent.find((entry) => entry.content?.contacts);
    assert.ok(contact, 'un contact vCard doit être envoyé');
    const vcard = contact.content.contacts.contacts[0].vcard;
    assert.match(vcard, /BEGIN:VCARD/);
    assert.match(vcard, /END:VCARD/);
    assert.ok(vcard.includes(`waid=${OWNER_PHONE}`), 'le numéro admin doit être dans la vCard');
    assert.ok(vcard.includes('Merdi'), 'le nom admin doit être dans la vCard');
    assert.match(sock.lastText(), /Administrateur/);
  });
});

describe('contrôle d’accès administrateur', () => {
  test('/status refusé à un utilisateur simple', async () => {
    const { sock, handle } = processorWith();
    await handle(textMessage('/status', { remoteJid: USER_JID }));
    assert.match(sock.lastText(), /⛔/);
    assert.match(sock.lastText(), /réservée à l’administrateur/);
  });

  test('/status accepté pour l’administrateur', async () => {
    const { sock, handle } = processorWith();
    await handle(textMessage('/status', { remoteJid: OWNER_JID }));
    const text = sock.lastText();
    assert.match(text, /État du bot/);
    assert.match(text, /PREFIX/);
    assert.match(text, /STICKER NAME/);
    assert.match(text, /ADMIN/);
    assert.match(text, /SESSION/);
    assert.match(text, /COMMANDS/);
  });

  test('/restart, /shutdown, /broadcast refusés aux non-admins', async () => {
    for (const command of ['/restart', '/shutdown', '/broadcast test']) {
      const { sock, handle } = processorWith();
      await handle(textMessage(command, { remoteJid: USER_JID }));
      assert.match(sock.lastText(), /⛔/, `${command} doit être refusé`);
    }
  });

  test('/setprefix : réservé à l’admin, validé et persisté', async () => {
    // Refus pour un utilisateur simple
    const denied = processorWith();
    await denied.handle(textMessage('/setprefix !', { remoteJid: USER_JID }));
    assert.match(denied.sock.lastText(), /⛔/);
    assert.equal(db.getSettings().prefix, '/');

    // Accepté pour l'admin
    resetRuntimeCaches();
    const { sock, handle } = processorWith();
    await handle(textMessage('/setprefix !', { remoteJid: OWNER_JID }));
    assert.match(sock.lastText(), /Préfixe mis à jour/);
    assert.equal(db.getSettings().prefix, '!');

    // Le nouveau préfixe est immédiatement effectif
    resetRuntimeCaches();
    sock.reset();
    await handle(textMessage('!ping', { remoteJid: OWNER_JID }));
    assert.match(sock.lastText(), /Pong/);

    // Préfixe invalide refusé
    resetRuntimeCaches();
    sock.reset();
    await handle(textMessage('!setprefix trop-long-prefix', { remoteJid: OWNER_JID }));
    assert.match(sock.lastText(), /❌/);

    // Remise à l'état initial
    db.updateSettings({ prefix: '/' });
    await db.flush();
    assert.equal(db.getSettings().prefix, '/');
  });

  test('/setsticker met à jour le pack et l’auteur', async () => {
    const { sock, handle } = processorWith();
    await handle(textMessage('/setsticker PackTest|AuteurTest', { remoteJid: OWNER_JID }));

    assert.match(sock.lastText(), /Stickers mis à jour/);
    assert.equal(db.getSettings().stickerName, 'PackTest');
    assert.equal(db.getSettings().stickerAuthor, 'AuteurTest');

    db.updateSettings({ stickerName: 'IDREM TERESHKOVA', stickerAuthor: '' });
    await db.flush();
  });

  test('/setadmin valide le numéro et refuse un format invalide', async () => {
    const { sock, handle } = processorWith();
    await handle(textMessage('/setadmin 0970000000', { remoteJid: OWNER_JID }));
    assert.match(sock.lastText(), /❌/, 'un numéro national doit être refusé');
    assert.equal(db.getSettings().adminNumber, OWNER_PHONE);

    sock.reset();
    resetRuntimeCaches();
    await handle(textMessage('/setadmin 33612345678', { remoteJid: OWNER_JID }));
    assert.match(sock.lastText(), /Administrateur défini/);
    assert.equal(db.getSettings().adminNumber, '33612345678');

    db.updateSettings({ adminNumber: OWNER_PHONE });
    await db.flush();
  });

  test('/session sans session active explique la marche à suivre', async () => {
    const { sock, handle } = processorWith();
    await handle(textMessage('/session', { remoteJid: OWNER_JID }));
    assert.match(sock.lastText(), /Aucune session active/);
  });

  test('/session est refusée dans un groupe (donnée sensible)', async () => {
    const sock = createFakeSock({ participants: [{ id: OWNER_JID, admin: 'admin' }] });
    const { handle } = createProcessor(sock, botManager, { downloadMediaMessage: async () => FAKE_JPEG });
    await handle(textMessage('/session', { remoteJid: GROUP_JID, participant: OWNER_JID }));
    assert.match(sock.lastText(), /uniquement en message privé/);
  });

  test('/broadcast diffuse aux conversations connues', async () => {
    db.clearChats();
    db.trackChat({ jid: USER_JID, isGroup: false });
    db.trackChat({ jid: GROUP_JID, isGroup: true });

    const { sock, handle } = processorWith();
    await handle(textMessage('/bc Message de maintenance', { remoteJid: OWNER_JID }));

    // 3 cibles : les 2 conversations semées + celle de l'admin qui commande
    // (le handler enregistre toute conversation entrante).
    const texts = sock.texts();
    assert.ok(texts.some((t) => /Diffusion vers 3 conversation/.test(t)), 'annonce de diffusion attendue');
    assert.ok(texts.some((t) => /Diffusion terminée : 3 envoyée/.test(t)), 'bilan de diffusion attendu');

    const broadcasts = sock.sent.filter((entry) => entry.content?.text === 'Message de maintenance');
    assert.equal(broadcasts.length, 3, 'le message doit être diffusé aux 3 conversations');
    assert.deepEqual(
      broadcasts.map((b) => b.jid).sort(),
      [GROUP_JID, OWNER_JID, USER_JID].sort(),
    );
  });

  test('/broadcast --group ne vise que les groupes', async () => {
    db.clearChats();
    db.trackChat({ jid: USER_JID, isGroup: false });
    db.trackChat({ jid: GROUP_JID, isGroup: true });

    const { sock, handle } = processorWith();
    await handle(textMessage('/bc --group Annonce groupes', { remoteJid: OWNER_JID }));

    const broadcasts = sock.sent.filter((entry) => entry.content?.text === 'Annonce groupes');
    assert.equal(broadcasts.length, 1);
    assert.equal(broadcasts[0].jid, GROUP_JID);
  });

  test('/broadcast sans contenu est refusé', async () => {
    const { sock, handle } = processorWith();
    await handle(textMessage('/bc', { remoteJid: OWNER_JID }));
    assert.match(sock.lastText(), /Message manquant/);
  });
});

describe('/vv — View Once', () => {
  test('image en vue unique citée : récupérée et renvoyée', async () => {
    const { sock, handle } = processorWith(Buffer.from('fake-image-bytes'));
    const result = await handle(quotedViewOnce({ command: '/vv', kind: 'image' }));

    assert.equal(result.executed, 'vv');
    const sent = sock.sent.find((entry) => entry.content?.image);
    assert.ok(sent, 'une image doit être renvoyée');
    assert.deepEqual(sent.content.image, Buffer.from('fake-image-bytes'));
    assert.match(sent.content.caption, /📷 Image View Once récupérée\./);
    assert.ok(!sent.content.caption.includes('n’était pas en vue unique'), 'le média était bien en vue unique');
  });

  test('vidéo en vue unique citée : récupérée', async () => {
    const { sock, handle } = processorWith(Buffer.from('fake-video-bytes'));
    await handle(quotedViewOnce({ command: '/vv', kind: 'video' }));

    const sent = sock.sent.find((entry) => entry.content?.video);
    assert.ok(sent, 'une vidéo doit être renvoyée');
    assert.match(sent.content.caption, /🎥 Vidéo View Once récupérée\./);
    assert.equal(sent.content.mimetype, 'video/mp4');
  });

  test('audio en vue unique cité : récupéré', async () => {
    const { sock, handle } = processorWith(Buffer.from('fake-audio-bytes'));
    await handle(quotedViewOnce({ command: '/vv', kind: 'audio' }));

    assert.ok(sock.texts().some((t) => /🎵 Audio View Once récupéré\./.test(t)));
    const sent = sock.sent.find((entry) => entry.content?.audio);
    assert.ok(sent, 'un audio doit être renvoyé');
    assert.equal(sent.content.ptt, true, 'le mode vocal doit être conservé');
  });

  test('média vue unique reçu directement avec la commande en légende', async () => {
    const sock = createFakeSock();
    const { handle } = createProcessor(sock, botManager, { downloadMediaMessage: async () => Buffer.from('direct-vo') });

    const message = viewOnceImageMessage({ remoteJid: '243899900055@s.whatsapp.net' });
    message.message.viewOnceMessageV2.message.imageMessage.caption = '/vv';

    const result = await handle(message);
    assert.equal(result.executed, 'vv');

    const sent = sock.sent.find((entry) => entry.content?.image);
    assert.ok(sent, 'l’image doit être renvoyée');
    assert.deepEqual(sent.content.image, Buffer.from('direct-vo'));
    assert.match(sent.content.caption, /📷 Image View Once récupérée\./);
  });

  test('média vue unique sans commande : le bot reste silencieux', async () => {
    const sock = createFakeSock();
    const { handle } = createProcessor(sock, botManager, { downloadMediaMessage: async () => Buffer.from('direct-vo') });

    const result = await handle(viewOnceImageMessage({ remoteJid: '243899900066@s.whatsapp.net' }));
    assert.equal(result.ignored, 'no-prefix');
    assert.equal(sock.sent.length, 0, 'aucun renvoi sans commande explicite');
  });

  test('aucun média : message d’explication', async () => {
    const { sock, handle } = processorWith();
    await handle(textMessage('/vv'));

    const text = sock.lastText();
    assert.match(text, /❌ Aucun média View Once détecté\./);
    assert.match(text, /Répondez à un média en \*vue unique\*/);
    assert.match(text, /image, vidéo ou audio/i);
  });

  test('média expiré (HTTP 410) : erreur explicite', async () => {
    const { sock, handle } = processorWithFailure(410);
    await handle(quotedViewOnce({ command: '/vv', kind: 'image' }));
    assert.match(sock.lastText(), /Média expiré/);
  });

  test('média introuvable (HTTP 404) : erreur explicite', async () => {
    const { sock, handle } = processorWithFailure(404);
    await handle(quotedViewOnce({ command: '/vv', kind: 'video' }));
    assert.match(sock.lastText(), /expiré|supprimé/i);
  });

  test('accès refusé (HTTP 403) : erreur explicite', async () => {
    const { sock, handle } = processorWithFailure(403);
    await handle(quotedViewOnce({ command: '/vv', kind: 'image' }));
    assert.match(sock.lastText(), /Accès refusé/);
  });

  test('échec réseau générique : erreur propre, pas de crash', async () => {
    const { sock, handle } = processorWithFailure(undefined, 'socket hang up');
    await handle(quotedViewOnce({ command: '/vv', kind: 'image' }));
    assert.match(sock.lastText(), /Téléchargement du média impossible/);
  });

  test('détection du type de média (analyse du message)', async () => {
    const { getMediaInfo, getQuotedInfo } = await import('../src/utils/message.js');

    const image = viewOnceImageMessage();
    assert.equal(getMediaInfo(image.message).kind, 'image');
    assert.equal(getMediaInfo(image.message).isViewOnce, true);

    const quoted = quotedViewOnce({ kind: 'video' });
    const info = getQuotedInfo(quoted.message);
    assert.equal(info.media.kind, 'video');
    assert.equal(info.isViewOnce, true);
    assert.equal(info.stanzaId !== null, true);
  });
});

describe('/sticker — création réelle', () => {
  test('image -> sticker WebP avec pack et auteur configurés', async () => {
    const png = await makePng();
    const sock = createFakeSock();
    const { handle } = createProcessor(sock, botManager, { downloadMediaMessage: async () => png });

    const message = imageMessage({ remoteJid: '243899900033@s.whatsapp.net' });
    message.message.imageMessage.caption = '/sticker';

    const result = await handle(message);
    assert.equal(result.executed, 'sticker');

    const sent = sock.sent.find((entry) => entry.content?.sticker);
    assert.ok(sent, 'un sticker doit être envoyé');

    const sticker = sent.content.sticker;
    assert.equal(sticker.subarray(0, 4).toString(), 'RIFF');
    assert.equal(sticker.subarray(8, 12).toString(), 'WEBP');
    assert.ok(sticker.includes(Buffer.from('IDREM TERESHKOVA')), 'le pack configuré doit être embarqué');
    assert.ok(sticker.includes(Buffer.from('Merdi')), 'l’auteur (ADMIN_NAME) doit être embarqué');

    const meta = await sharp(sticker).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 512);
  });

  test('une image sans commande ne déclenche rien', async () => {
    const sock = createFakeSock();
    const { handle } = createProcessor(sock, botManager, { downloadMediaMessage: async () => makePng() });
    const result = await handle(imageMessage({ remoteJid: '243899900077@s.whatsapp.net' }));

    assert.equal(result.ignored, 'no-prefix');
    assert.equal(sock.sent.length, 0);
  });

  test('pack et auteur personnalisés à la volée', async () => {
    const png = await makePng();
    const sock = createFakeSock();
    const { handle } = createProcessor(sock, botManager, { downloadMediaMessage: async () => png });

    const message = imageMessage({ remoteJid: '243899900044@s.whatsapp.net' });
    message.message.imageMessage.caption = '/sticker MonPack|MonAuteur';
    await handle(message);

    const sent = sock.sent.find((entry) => entry.content?.sticker);
    assert.ok(sent);
    assert.ok(sent.content.sticker.includes(Buffer.from('MonPack')));
    assert.ok(sent.content.sticker.includes(Buffer.from('MonAuteur')));
  });

  test('sans média : guide d’utilisation', async () => {
    const { sock, handle } = processorWith();
    await handle(textMessage('/sticker'));
    const text = sock.lastText();
    assert.match(text, /Créer un sticker/);
    assert.match(text, /IDREM TERESHKOVA/);
  });

  test('/toimg convertit un vrai sticker en PNG', async () => {
    const png = await makePng();
    const realSticker = await createStickerFromImage(png, { packname: 'IDREM TERESHKOVA', author: 'Merdi' });

    const sock = createFakeSock();
    const { handle } = createProcessor(sock, botManager, { downloadMediaMessage: async () => realSticker });
    const result = await handle(quotedSticker({ command: '/toimg' }));

    assert.equal(result.executed, 'toimg');
    const sent = sock.sent.find((entry) => entry.content?.image);
    assert.ok(sent, 'une image doit être renvoyée');
    assert.equal(sent.content.image.subarray(1, 4).toString(), 'PNG');
  });

  test('/tovideo sans ffmpeg renvoie une erreur actionnable', async () => {
    if (ffmpegAvailable) return; // sur une machine équipée, la conversion est réelle

    const sock = createFakeSock();
    const { handle } = createProcessor(sock, botManager, { downloadMediaMessage: async () => FAKE_JPEG });
    await handle(quotedSticker({ command: '/tovideo' }));
    assert.match(sock.lastText(), /ffmpeg/);
  });

  test('/toaudio exige une vidéo', async () => {
    const sock = createFakeSock();
    const { handle } = createProcessor(sock, botManager, { downloadMediaMessage: async () => FAKE_JPEG });
    await handle(textMessage('/toaudio'));
    assert.match(sock.lastText(), /Répondez à une \*vidéo\*/);
  });
});

describe('groupes', () => {
  test('/del autorisé pour un admin du groupe', async () => {
    const sock = createFakeSock({
      participants: [
        { id: USER_JID, admin: 'admin' },
        { id: `${OWNER_PHONE}:9@s.whatsapp.net`, admin: null },
      ],
    });
    const { handle } = createProcessor(sock, botManager, { downloadMediaMessage: async () => FAKE_JPEG });

    const message = quotedSticker({ command: '/del', remoteJid: GROUP_JID });
    message.key.participant = USER_JID;
    const result = await handle(message);

    assert.equal(result.executed, 'del');
    const deletion = sock.sent.find((entry) => entry.content?.delete);
    assert.ok(deletion, 'une suppression doit être envoyée');
    assert.equal(deletion.content.delete.remoteJid, GROUP_JID);
    assert.ok(deletion.content.delete.id);
  });

  test('/del refusé à un membre simple', async () => {
    const sock = createFakeSock({ participants: [{ id: USER_JID, admin: null }] });
    const { handle } = createProcessor(sock, botManager, { downloadMediaMessage: async () => FAKE_JPEG });

    const message = quotedSticker({ command: '/del', remoteJid: GROUP_JID });
    message.key.participant = USER_JID;
    await handle(message);

    assert.match(sock.lastText(), /réservée aux administrateurs du groupe/);
    assert.equal(sock.sent.filter((e) => e.content?.delete).length, 0);
  });

  test('le nom du groupe est résolu dans le contexte', async () => {
    const sock = createFakeSock({ participants: [{ id: USER_JID, admin: null }] });
    const { buildContext } = createProcessor(sock, botManager, { downloadMediaMessage: async () => FAKE_JPEG });

    const message = textMessage('/ping', { remoteJid: GROUP_JID, participant: USER_JID });
    const ctx = await buildContext(message);

    assert.equal(ctx.isGroup, true);
    assert.equal(ctx.groupName, 'Groupe de test');
    assert.equal(ctx.sender, USER_JID);
    assert.equal(ctx.isGroupAdmin, false);
    assert.equal(ctx.isOwner, false);
  });
});

describe('contexte et permissions', () => {
  test('détection du propriétaire par ADMIN_NUMBER', async () => {
    const { buildContext } = processorWith();

    const ownerCtx = await buildContext(textMessage('/ping', { remoteJid: OWNER_JID }));
    assert.equal(ownerCtx.isOwner, true);

    const userCtx = await buildContext(textMessage('/ping', { remoteJid: USER_JID }));
    assert.equal(userCtx.isOwner, false);

    // Formatage différent du même numéro : toujours reconnu
    assert.equal(botManager.isOwner(`+${OWNER_PHONE}@s.whatsapp.net`), true);
    assert.equal(botManager.isOwner(`${OWNER_PHONE}:12@s.whatsapp.net`), true);
    assert.equal(botManager.isOwner('243811112222@s.whatsapp.net'), false);
    assert.equal(botManager.isOwner(null), false);
  });

  test('anti-verrouillage : sans ADMIN_NUMBER, le compte connecté est owner', async () => {
    const previous = db.getSettings().adminNumber;
    db.updateSettings({ adminNumber: '' });

    botManager.jid = OWNER_JID;
    assert.equal(botManager.isOwner(OWNER_JID), true);
    assert.equal(botManager.isOwner(USER_JID), false);

    db.updateSettings({ adminNumber: previous });
    botManager.jid = null;
    await db.flush();
  });

  test('analyse du préfixe et des arguments', async () => {
    const { buildContext } = processorWith();

    const ctx = await buildContext(textMessage('/sticker MonPack|Auteur avec du texte'));
    assert.equal(ctx.isCommand, true);
    assert.equal(ctx.commandName, 'sticker');
    assert.deepEqual(ctx.args, ['MonPack|Auteur', 'avec', 'du', 'texte']);
    assert.equal(ctx.argText, 'MonPack|Auteur avec du texte');
    assert.equal(ctx.prefix, '/');

    const noCmd = await buildContext(textMessage('salut'));
    assert.equal(noCmd.isCommand, false);
    assert.equal(noCmd.commandName, '');
  });

  test('légende de média utilisée comme commande', async () => {
    const { buildContext } = processorWith();
    const message = imageMessage({ remoteJid: USER_JID });
    message.message.imageMessage.caption = '/sticker Pack|Auteur';

    const ctx = await buildContext(message);
    assert.equal(ctx.isCommand, true);
    assert.equal(ctx.commandName, 'sticker');
    assert.equal(ctx.media.kind, 'image');
    assert.equal(ctx.argText, 'Pack|Auteur');
  });

  test('les logs du dashboard ne contiennent aucun secret', async () => {
    const { getLogBuffer } = await import('../src/utils/logger.js');
    const serialized = JSON.stringify(getLogBuffer(200));

    for (const forbidden of ['DASHBOARD_PASSWORD', 'SESSION_SECRET', 'Idrem-Dev-2026', 'noiseKey', 'signedIdentityKey']) {
      assert.ok(!serialized.includes(forbidden), `fuite dans les logs : ${forbidden}`);
    }
  });
});
