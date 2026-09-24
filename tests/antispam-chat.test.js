'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { boot, until, makeMsg, lastBody, bodies, UIDS, clearCooldowns } = require('./helpers');

test('anti-spam : 5 messages identiques → avertissement 1/2 avec mention', async () => {
  const { bot, adapter, db } = await boot({ spam: { duplicateLimit: 5, floodWindowMs: 10000, warnLimit: 2 } });
  const t = 'spam-thread';
  for (let i = 0; i < 5; i++) await bot.handleMessage(makeMsg(t, UIDS.spammer, 'Un'));
  await until(() => lastBody(adapter).includes('ANTI-SPAM'), 3000);
  const body = lastBody(adapter);
  assert.ok(body.includes('stop le spam'), 'message demandé');
  assert.ok(body.includes('Avertissement 1/2'), 'compteur 1/2');
  assert.ok(adapter.sent[adapter.sent.length - 1].payload.mentions, 'mention du fautif');
  assert.strictEqual(db.getUser(UIDS.spammer).warnings, 1);
  assert.ok(!db.getUser(UIDS.spammer).banned, 'pas encore exclu après 1 avertissement');
});

test('anti-spam : 2e violation → 💀 exclusion automatique (« Bye bye »)', async () => {
  const { bot, adapter, db } = await boot({ spam: { duplicateLimit: 5, floodWindowMs: 10000, warnLimit: 2 } });
  const t = 'spam-ban-thread';
  for (let i = 0; i < 5; i++) await bot.handleMessage(makeMsg(t, UIDS.spammer, 'Un'));
  await until(() => lastBody(adapter).includes('Avertissement 1/2'), 3000);
  for (let i = 0; i < 5; i++) await bot.handleMessage(makeMsg(t, UIDS.spammer, 'Deux'));
  await until(() => lastBody(adapter).includes('EXCLUSION'), 3000);
  const body = lastBody(adapter);
  assert.ok(body.includes(`Ton spam t'a conduit à ta perte`) || body.includes('Bye bye'), 'message de ban demandé');
  assert.strictEqual(db.getUser(UIDS.spammer).banned, true, 'membre banni côté bot');

  // Le banni est ignoré par le bot
  await bot.handleMessage(makeMsg(t, UIDS.spammer, 'hello ?'));
  await bot.handleMessage(makeMsg(t, UIDS.spammer, 'Xcoins'));
  assert.ok(lastBody(adapter).includes('Bye bye') || lastBody(adapter).includes('EXCLUSION'), 'aucune réponse au banni');
});

test('anti-spam : 5 messages différents en moins de 10 s (flood) → avertissement', async () => {
  const { bot, adapter, db } = await boot({ spam: { duplicateLimit: 5, floodWindowMs: 10000, warnLimit: 2 } });
  const t = 'flood-thread';
  const msgs = ['hello', 'les', 'amis', 'comment', 'allez vous'];
  for (const m of msgs) await bot.handleMessage(makeMsg(t, UIDS.spammer, m));
  await until(() => lastBody(adapter).includes('ANTI-SPAM'), 3000);
  assert.ok(lastBody(adapter).includes('Avertissement 1/2'), 'flood détecté → warn 1/2');
  assert.strictEqual(db.getUser(UIDS.spammer).warnings, 1);
});

test('les admins ne sont jamais sanctionnés par l’anti-spam', async () => {
  const { bot, adapter, db } = await boot({ spam: { duplicateLimit: 5, floodWindowMs: 10000, warnLimit: 2 } });
  const t = 'admin-thread';
  for (let i = 0; i < 8; i++) await bot.handleMessage(makeMsg(t, UIDS.admin, 'Un'));
  assert.strictEqual(db.getUser(UIDS.admin).warnings, 0);
  assert.ok(!lastBody(adapter).includes('ANTI-SPAM'));
});

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
