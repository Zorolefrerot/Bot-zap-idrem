'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { boot, makeMsg, lastBody, bodies, UIDS, unbold, until, clearCooldowns } = require('./helpers');

/*
 * ⚡ Tests du CHEMIN RÉEL DE PRODUCTION :
 * l'événement brut du listener → adapter.inject() → handleRawEvent
 * (le même routage que index.js). Régression directe du bug
 * « le bot ne répondait à aucun message ».
 */

test('PIPELINE : un message brut reçu produit une réponse (routage handleRawEvent)', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  assert.strictEqual(adapter.sent.length, 0, 'rien avant le message');
  adapter.inject(makeMsg('pipe-thread', UIDS.shadow, 'Xcoins')); // événement BRUT du listener
  await until(() => adapter.sent.length > 0, 4000);
  assert.ok(adapter.sent.length > 0, 'LE BOT DOIT RÉPONDRE — sinon il est sourd');
  assert.ok(lastBody(adapter).includes('XCoins :'), 'réponse de commande correcte');
});

test('préfixe X : « X » seul, « Xmenu », minuscule « xmenu » — tout répond', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const t = 'prefix-thread';

  adapter.inject(makeMsg(t, UIDS.shadow, 'X'));
  await until(() => adapter.sent.length > 0, 4000);
  assert.ok(/MeR~N/i.test(lastBody(adapter)), 'accueil sur « X »');
  assert.ok(lastBody(adapter).includes('Xmenu'));

  clearCooldowns(bot);
  adapter.inject(makeMsg(t, UIDS.shadow, 'xmenu'));
  await until(() => bodies(adapter).some((b) => b.includes('Intelligence & Chat')), 4000);
  assert.ok(bodies(adapter).some((b) => b.includes('Économie')), 'menu via minuscules');

  clearCooldowns(bot);
  adapter.inject(makeMsg(t, UIDS.shadow, 'XQUIZ')); // casse mixte
  await until(() => bodies(adapter).some((b) => b.includes('CHOOSE YOUR CATEGORY')), 4000);
  assert.ok(bodies(adapter).some((b) => b.includes('CHOOSE YOUR CATEGORY')), 'casse indifférente');
  adapter.inject(makeMsg(t, UIDS.shadow, 'cancel'));
});

test('message sans préfixe : pas de réponse hors mode chat (mais le bot a bien lu)', async () => {
  const { bot, adapter, db } = await boot();
  const t = 'noprefix-thread';
  const before = adapter.sent.length;
  adapter.inject(makeMsg(t, UIDS.shadow, 'salut la compagnie'));
  await until(() => db.getUser(UIDS.shadow) !== null, 3000); // traité (user enregistré)
  assert.strictEqual(adapter.sent.length, before, 'silence hors Xchat — comportement attendu');
});

test('PIPELINE : événement de groupe (nouveau membre) passe aussi par le routeur', async () => {
  const { bot, adapter } = await boot();
  adapter.inject({
    type: 'event',
    threadID: 'pipe-group',
    logMessageType: 'log:subscribe',
    logMessageData: { addedParticipants: [{ userFbId: UIDS.paul, fullName: 'Paul' }] },
  });
  await until(() => adapter.sent.length > 0, 4000);
  assert.ok(unbold(lastBody(adapter)).includes('NOUVEAU MEMBRE'), 'accueil via le routeur');
});

test('le routeur envoie les messages vers handleMessage même après un événement groupe', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const t = 'mix-thread';
  adapter.inject({
    type: 'event',
    threadID: t,
    logMessageType: 'log:subscribe',
    logMessageData: { addedParticipants: [{ userFbId: 'BOT_MOCK_000000', fullName: 'MeR~NeL' }] },
  });
  await until(() => adapter.sent.length > 0, 4000); // auto-présentation
  clearCooldowns(bot);
  adapter.inject(makeMsg(t, UIDS.shadow, 'Xrank'));
  await until(() => bodies(adapter).some((b) => b.includes('XRANK') || b.includes('Ta position')), 4000);
  assert.ok(
    bodies(adapter).some((b) => b.includes('XRANK') || b.includes('Ta position')),
    'commandes toujours vivantes après un event'
  );
});

test('shim envoi : l’API qui ne renvoie QUE une Promise est supportée', async () => {
  // Vérifie le contrat du shim via le mock adapter (callback) — le chemin Promise
  // est couvert par fca-login (api factice sendMessage callback) + ce test unitaire :
  const config = require('../core/config');
  const { Logger } = require('../utils/logger');
  const facebook = require('../services/facebook');
  const { sendMessage } = facebook;
  const promiseOnlyApi = {
    sendMessage: (msg, threadID) => Promise.resolve({ messageID: 'promise-1' }),
  };
  const logger = new Logger({ logFile: false });
  const info = await sendMessage(promiseOnlyApi, { body: 'hi' }, 't1');
  assert.strictEqual(info.messageID, 'promise-1');
});

test('shim envoi : l’API classique à callback fonctionne toujours', async () => {
  const { sendMessage } = require('../services/facebook');
  const callbackApi = {
    sendMessage: (msg, threadID, cb) => setImmediate(() => cb(null, { messageID: 'cb-1' })),
  };
  const info = await sendMessage(callbackApi, { body: 'hi' }, 't1');
  assert.strictEqual(info.messageID, 'cb-1');
});

test('shim envoi : l’erreur Promise-only est bien propagée', async () => {
  const { sendMessage } = require('../services/facebook');
  const failingApi = {
    sendMessage: () => Promise.reject({ error: 'Not authorized' }),
  };
  await assert.rejects(() => sendMessage(failingApi, { body: 'hi' }, 't1'), /Not authorized/);
});
