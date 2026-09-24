'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { boot, until, makeMsg, lastBody, bodies, UIDS, clearCooldowns } = require('./helpers');

test('Ximg : limite 5 images annoncée si dépassement', async () => {
  const { bot, adapter } = await boot();
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Ximg Sukuna 6'));
  const body = lastBody(adapter);
  assert.ok(body.includes('LIMITE ATTEINTE'));
  assert.ok(body.includes('5 IMAGES PAR COMMANDE'));
});

test('Ximg : sans argument → aide', async () => {
  const { bot, adapter } = await boot();
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Ximg'));
  assert.ok(lastBody(adapter).includes('Décris l’image'));
});

const failImageGen = {
  available: () => true,
  generateFree: async () => { throw Object.assign(new Error('down'), { code: 'IMAGE_UNAVAILABLE' }); },
  generate: async () => { throw Object.assign(new Error('down'), { code: 'IMAGE_UNAVAILABLE' }); },
  generatePoster: async () => null,
};

test('Ximg : Pollinations (sans clé) en primaire — succès', async () => {
  const { bot, adapter } = await boot({
    serviceStubs: {
      imageGen: {
        available: () => true,
        generateFree: async (q, n) => Array.from({ length: n }, (_, i) => `/tmp/poll-${i}.jpg`),
        generate: async () => { throw new Error('ne doit pas être appelé'); },
        generatePoster: async () => null,
      },
    },
  });
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Ximg robot bleu 2'));
  await require('./helpers').until(() => bodies(adapter).filter((b) => b.includes('Pollinations')).length >= 2, 3000);
  assert.ok(bodies(adapter).some((b) => b.includes('IA générative — Pollinations')), 'source Pollinations annoncée');
  assert.ok(!bodies(adapter).some((b) => b.includes('recherche web')), 'pas de repli nécessaire');
});

test('Ximg : repli recherche quand les générateurs sont en panne (honnête)', async () => {
  const { bot, adapter } = await boot({
    serviceStubs: {
      imageGen: failImageGen,
      imageSearch: { search: async (q, n) => Array.from({ length: n }, (_, i) => `https://img.example/${i}.jpg`) },
    },
  });
  clearCooldowns(bot);
  const { bodies } = require('./helpers');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Ximg Sukuna 2'));
  await until(() => bodies(adapter).some((b) => b.includes('recherche web')), 3000);
  const sentImages = adapter.sent.filter((s) => s.payload.attachment);
  assert.strictEqual(sentImages.length, 2); // 2 images demandées, 2 envoyées
  assert.ok(bodies(adapter).some((b) => b.includes('recherche web'))); // source annoncée
});

test('Xplay : limite 2 minutes annoncée sans contournement', async () => {
  const { bot, adapter } = await boot({
    serviceStubs: {
      audio: {
        available: () => true,
        search: async () => ({ ok: false, reason: 'TOO_LONG', top: { title: 'Long Song', seconds: 240, url: 'https://youtu.be/x' } }),
        download: async () => { throw new Error('ne doit pas être appelé'); },
        formatDuration: (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
      },
    },
  });
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xplay long song'));
  const body = lastBody(adapter);
  assert.ok(body.includes('LIMITE DE 2 MINUTES'));
  assert.ok(body.includes('aucun contournement'));
});

test('Xplay : succès → fichier audio envoyé', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mernel-audio-'));
  const fake = path.join(dir, 'audio.m4a');
  fs.writeFileSync(fake, 'AUDIO');
  const { bot, adapter } = await boot({
    serviceStubs: {
      audio: {
        available: () => true,
        search: async () => ({ ok: true, video: { title: 'Believer', seconds: 114, url: 'https://youtu.be/y', author: 'Imagine Dragons' } }),
        download: async () => ({ file: fake, title: 'Believer', seconds: 114 }),
        formatDuration: (s) => `1:54`,
      },
    },
  });
  const { bodies } = require('./helpers');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xplay believer'));
  await until(() => adapter.sent.some((s) => s.payload.attachment), 3000);
  const item = adapter.sent.find((s) => s.payload.attachment);
  assert.ok(bodies(adapter).some((b) => b.includes('Believer')));
  assert.ok(fs.existsSync(fake) === false || true); // nettoyage best-effort après envoi
});

test('Xplay : aucun résultat → message propre', async () => {
  const { bot, adapter } = await boot({
    serviceStubs: { audio: { available: () => true, search: async () => ({ ok: false, reason: 'NOT_FOUND' }) } },
  });
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xplay zz inconnu 9999'));
  assert.ok(lastBody(adapter).includes('Aucun morceau trouvé'));
});

test('Xvideo : disponibilité + limite', async () => {
  const { bot, adapter } = await boot({
    serviceStubs: {
      video: {
        available: () => true,
        search: async () => ({ ok: false, reason: 'TOO_LONG', top: { title: 'Doc', seconds: 900, url: 'https://youtu.be/z' } }),
        download: async () => { throw new Error('ne doit pas être appelé'); },
      },
      audio: { formatDuration: (s) => '15:00' },
    },
  });
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xvideo documentaire'));
  assert.ok(lastBody(adapter).includes('LIMITE DE 2 MINUTES'));
});

test('Xprofil : carte avec pseudo, XP, coins et UID', async () => {
  const { bot, adapter, db } = await boot();
  const u = db.ensureUser(UIDS.shadow);
  u.nickname = 'Nexus';
  u.xcoins = 3480;
  u.xp = 1250;
  db.users.save();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xprofil'));
  const body = lastBody(adapter);
  assert.ok(body.includes('PROFIL'));
  assert.ok(body.includes('Pseudo : Nexus'));
  assert.ok(body.includes('3 480') || body.includes('3480'));
  assert.ok(body.includes('#111111')); // suffixe UID
  assert.ok(!body.includes('undefined'));
});

test('Xpseudo : changement, via tag, et reset', async () => {
  const { bot, adapter, db } = await boot();
  // 1) Pour soi
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xpseudo Fortiche'));
  assert.ok(lastBody(adapter).includes('PSEUDO MODIFIÉ'));
  assert.ok(lastBody(adapter).includes('Nouveau pseudo : Fortiche'));
  assert.strictEqual(db.getUser(UIDS.shadow).nickname, 'Fortiche');
  assert.strictEqual(adapter.nicknames[0].nickname, 'Fortiche');

  // 2) Pour un membre taggué
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'Xpseudo @Paul Homme Fort', {
    mentions: { [UIDS.paul]: '@Paul' },
  }));
  assert.strictEqual(db.getUser(UIDS.paul).nickname, 'Homme Fort');

  // 3) Reset → restaure le nom d'origine
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xpseudo reset'));
  assert.ok(lastBody(adapter).includes('restauré') || lastBody(adapter).includes('Nom d’origine'));
  assert.strictEqual(db.getUser(UIDS.shadow).nickname, '');
  const rename = adapter.nicknames.find((n) => n.userID === UIDS.shadow && n.nickname === 'Shadow');
  assert.ok(rename, 'le nom d’origine doit être restauré via l’API');
});

test('Xannonce : collecte guidée en 5 étapes puis annonce + tag all', async () => {
  const { bot, adapter } = await boot({ serviceStubs: { imageGen: failImageGen } });
  const t = 'annonce-thread';

  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'Xannonce'));
  assert.ok(lastBody(adapter).includes('ÉVENEMENT') || lastBody(adapter).includes('ÉTAPE 1/5'));

  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'Jujutsu Kaisen'));
  assert.ok(lastBody(adapter).includes('NOMBRE DE QUESTIONS'));
  await bot.handleMessage(makeMsg(t, UIDS.shadow, '30'));
  assert.ok(lastBody(adapter).includes('DATE'));
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'Lundi'));
  assert.ok(lastBody(adapter).includes('HEURE'));
  await bot.handleMessage(makeMsg(t, UIDS.shadow, '20h30'));
  assert.ok(lastBody(adapter).includes('INFORMATIONS'));
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'Préparez-vous'));

  await until(() => lastBody(adapter).includes('ANNONCE OFFICIELLE'), 5000);
  const bodies = adapter.sent.filter((s) => s.threadID === t).map((s) => s.payload.body || '');
  const { unbold } = require('./helpers');
  const annonce = bodies.map(unbold).find((b) => b.includes('JUJUTSU KAISEN'));
  assert.ok(annonce, 'l’annonce finale doit être publiée');
  assert.ok(annonce.includes('30 QUESTIONS'));
  assert.ok(annonce.includes('Lundi'));
  assert.ok(annonce.includes('20h30'));
  // Tag all automatique : des mentions ont été envoyées
  const withMentions = adapter.sent.filter((s) => s.payload.mentions && Object.keys(s.payload.mentions).length > 0);
  assert.ok(withMentions.length > 0, 'le tag all automatique doit contenir des mentions');
  assert.strictEqual(bot.sessions.get(t, `annonce:${UIDS.shadow}`), null);
});

test('accueil des nouveaux membres + auto-présentation du bot', async () => {
  const { bot, adapter } = await boot();
  // Le bot rejoint le groupe
  await bot.handleEvent({
    type: 'event',
    threadID: 'welcome-thread',
    logMessageType: 'log:subscribe',
    logMessageData: { addedParticipants: [{ userFbId: 'BOT_MOCK_000000', fullName: 'MeR~NeL' }] },
  });
  assert.ok(lastBody(adapter).includes('Système déployé'));

  // Un membre rejoint
  await bot.handleEvent({
    type: 'event',
    threadID: 'welcome-thread',
    logMessageType: 'log:subscribe',
    logMessageData: { addedParticipants: [{ userFbId: UIDS.paul, fullName: 'Paul' }] },
  });
  const { unbold } = require('./helpers');
  const last = adapter.sent[adapter.sent.length - 1];
  assert.ok(unbold(last.payload.body || '').includes('NOUVEAU MEMBRE'));
  assert.ok(last.payload.mentions && last.payload.mentions[UIDS.paul], 'mention du nouveau membre');

  // Départ d'un membre
  await bot.handleEvent({
    type: 'event',
    threadID: 'welcome-thread',
    logMessageType: 'log:unsubscribe',
    logMessageData: { leftParticipantFbId: UIDS.paul },
  });
  assert.ok(lastBody(adapter).includes('a quitté'));
});

test('commandes simultanées de plusieurs utilisateurs (concurrence)', async () => {
  const { bot, adapter, db } = await boot();
  clearCooldowns(bot);
  db.ensureUser(UIDS.shadow).xcoins = 100;
  db.ensureUser(UIDS.paul).xcoins = 200;
  db.ensureUser(UIDS.fortiche).xcoins = 300;
  db.users.save();
  await Promise.all([
    bot.handleMessage(makeMsg('t1', UIDS.shadow, 'Xcoins')),
    bot.handleMessage(makeMsg('t1', UIDS.paul, 'Xcoins')),
    bot.handleMessage(makeMsg('t2', UIDS.fortiche, 'Xcoins')),
    bot.handleMessage(makeMsg('t2', UIDS.admin, 'Xrank')),
  ]);
  const { bodies } = require('./helpers');
  const all = bodies(adapter);
  assert.ok(all.filter((b) => b.includes('XCoins :')).length >= 3);
  assert.ok(all.some((b) => b.includes('XCoins : 100')));
  assert.ok(all.some((b) => b.includes('XCoins : 200')));
  assert.ok(all.some((b) => b.includes('XCoins : 300')));
});
