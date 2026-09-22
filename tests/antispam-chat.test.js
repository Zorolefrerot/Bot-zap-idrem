'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { boot, until, makeMsg, lastBody, UIDS, clearCooldowns } = require('./helpers');

test('anti-spam : répétitions détectées → avertissements → mode silence', async () => {
  const { bot, adapter, db } = await boot();
  const t = 'spam-thread';

  // 5 messages identiques → 1er avertissement
  for (let i = 0; i < 5; i++) await bot.handleMessage(makeMsg(t, UIDS.spammer, 'Un'));
  await until(() => lastBody(adapter).includes('SPAM DÉTECTÉ'), 2000);
  assert.ok(lastBody(adapter).includes('Avertissement 1/3'));
  assert.strictEqual(db.getUser(UIDS.spammer).warnings, 1);

  // 5 autres → 2e avertissement
  for (let i = 0; i < 5; i++) await bot.handleMessage(makeMsg(t, UIDS.spammer, 'Un'));
  await until(() => lastBody(adapter).includes('Avertissement 2/3'), 2000);

  // 5 autres → mute
  for (let i = 0; i < 5; i++) await bot.handleMessage(makeMsg(t, UIDS.spammer, 'Un'));
  await until(() => lastBody(adapter).includes('mode silence'), 2000);
  assert.ok(lastBody(adapter).includes('causé ta perte'));
  assert.ok(db.getUser(UIDS.spammer).mutedUntil > Date.now());
  assert.strictEqual(db.getUser(UIDS.spammer).warnings, 0); // compteur remis après sanction

  // En mute → messages ignorés (un seul avis de silence par minute au maximum)
  await bot.handleMessage(makeMsg(t, UIDS.spammer, 'hello ?'));
  const afterNotice = adapter.sent.length;
  await bot.handleMessage(makeMsg(t, UIDS.spammer, 'Xcoins'));
  assert.strictEqual(adapter.sent.length, afterNotice);
});

test('les admins ne sont pas sanctionnés par l’anti-spam', async () => {
  const { bot, adapter, db } = await boot();
  const t = 'admin-thread';
  for (let i = 0; i < 8; i++) await bot.handleMessage(makeMsg(t, UIDS.admin, 'Un'));
  assert.strictEqual(db.getUser(UIDS.admin).warnings, 0);
  assert.strictEqual(bot.antiSpam.isMuted(UIDS.admin), false);
});

test('Xchat : activation persistante par groupe (admin uniquement)', async () => {
  const { bot, adapter, db } = await boot({
    serviceStubs: { chat: { reply: async () => 'réponse simulée', clear() {}, resetAll() {} } },
  });
  const t = 'chat-thread';

  // Non-admin → refusé
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'Xchat on'));
  assert.ok(lastBody(adapter).includes('ACCÈS REFUSÉ'));
  assert.strictEqual(db.getGroup(t).chatMode, false);

  // Admin → activé
  await bot.handleMessage(makeMsg(t, UIDS.owner, 'Xchat on'));
  assert.ok(lastBody(adapter).includes('MODE DISCUSSION ACTIVÉ'));
  assert.strictEqual(db.getGroup(t).chatMode, true);

  // Message sans préfixe → réponse du chat automatique
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'Salut MeR~NeL, comment tu vas ?'));
  await until(() => lastBody(adapter).includes('réponse simulée'), 2000);
  assert.ok(lastBody(adapter).includes('réponse simulée'));

  // Désactivation
  await bot.handleMessage(makeMsg(t, UIDS.owner, 'Xchat off'));
  assert.ok(lastBody(adapter).includes('DÉSACTIVÉ'));
  assert.strictEqual(db.getGroup(t).chatMode, false);

  // Persistance sur disque (écritures différées → flush explicite)
  db.groups.saveNow();
  const raw = JSON.parse(require('fs').readFileSync(db.groups.file, 'utf8'));
  assert.strictEqual(raw[t].chatMode, false);
});

test('Xchat status', async () => {
  const { bot, adapter } = await boot();
  await bot.handleMessage(makeMsg('st-thread', UIDS.owner, 'Xchat status'));
  assert.ok(lastBody(adapter).includes('INACTIF'));
});
