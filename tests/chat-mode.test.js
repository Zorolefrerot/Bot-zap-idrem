'use strict';
/*
 * 🧬 MeR~NeL — tests/chat-mode.test.js
 * Xchat : mode discussion sans préfixe (on/off, routage, persistance).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { boot, until, makeMsg, lastBody, bodies, UIDS, clearCooldowns } = require('./helpers');

test('Xchat on : le bot répond SANS préfixe à tous les messages (stub IA)', async () => {
  const { bot, adapter, db } = await boot({
    serviceStubs: { chat: { reply: async () => 'réponse simulée', clear() {}, resetAll() {} } },
  });
  const t = 'chat-thread';
  // Non-admin → refusé
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'Xchat on'));
  assert.ok(lastBody(adapter).includes('ACCÈS REFUSÉ'));
  // Admin → activé
  await bot.handleMessage(makeMsg(t, UIDS.owner, 'Xchat on'));
  assert.ok(lastBody(adapter).includes('MODE DISCUSSION ACTIVÉ'));
  assert.strictEqual(db.getGroup(t).chatMode, true);

  // Messages SANS préfixe → réponses IA (même très courts, même sans question)
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'Salut MeR~NeL'));
  await until(() => lastBody(adapter).includes('réponse simulée'), 3000);
  await bot.handleMessage(makeMsg(t, UIDS.paul, 'ok'));
  await until(() => bodies(adapter).filter((b) => b.includes('réponse simulée')).length >= 2, 3000);
  assert.ok(bodies(adapter).filter((b) => b.includes('réponse simulée')).length >= 2, 'le bot répond à tout sans X');

  // Off → plus rien
  await bot.handleMessage(makeMsg(t, UIDS.owner, 'Xchat off'));
  assert.ok(lastBody(adapter).includes('DÉSACTIVÉ'));
  const before = adapter.sent.length;
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'encore toi ?'));
  assert.strictEqual(adapter.sent.length, before, 'mode off → silence');
});

test('mode chat ON : même un message en « X… » inconnu part vers l’IA', async () => {
  const { bot, adapter } = await boot({
    serviceStubs: { chat: { reply: async () => 'réponse IA', clear() {}, resetAll() {} } },
  });
  const t = 'chat-x-thread';
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg(t, UIDS.owner, 'Xchat on'));
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'Xblabla bonjour'));
  await until(() => lastBody(adapter).includes('réponse IA'), 3000);
  assert.ok(lastBody(adapter).includes('réponse IA'), 'routé vers l’IA au lieu de « commande inconnue »');
});

test('persistance Xchat : chatMode sauvegardé sur disque', async () => {
  const { bot, db } = await boot();
  await bot.handleMessage(makeMsg('persist-thread', UIDS.owner, 'Xchat on'));
  db.groups.saveNow();
  const raw = JSON.parse(require('fs').readFileSync(db.groups.file, 'utf8'));
  assert.strictEqual(raw['persist-thread'].chatMode, true);
});
