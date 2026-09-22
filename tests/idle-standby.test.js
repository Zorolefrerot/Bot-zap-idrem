'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { boot, until, makeMsg, lastBody, bodies, UIDS, unbold, clearCooldowns } = require('./helpers');

/* Endort un thread « manuellement » (simule 30+ min d'inactivité). */
async function sleepThread(bot, threadID) {
  bot.idle.lastActivity.set(threadID, Date.now() - (bot.config.idle.standbyMs + 500));
  await bot.idle.sweep();
}

test('annonce MODE VEILLE après inactivité — une seule fois', async () => {
  const { bot, adapter } = await boot();
  bot.config.idle.standbyMs = 300;
  await bot.handleMessage(makeMsg('idle-thread', UIDS.shadow, 'Xcoins')); // activité
  const before = adapter.sent.length;
  await sleepThread(bot, 'idle-thread');
  assert.ok(bot.idle.isSleeping('idle-thread'), 'le thread doit être endormi');
  const body = lastBody(adapter);
  assert.ok(body.includes('MODE VEILLE'), 'annonce de veille envoyée');
  assert.ok(body.includes('Écris X'), 'indication de réveil présente');
  await bot.idle.sweep(); // 2e sweep → pas de doublon
  assert.strictEqual(adapter.sent.length, before + 1);
});

test('thread jamais actif : aucune annonce de veille', async () => {
  const { bot, adapter } = await boot();
  bot.config.idle.standbyMs = 300;
  await bot.idle.sweep();
  assert.strictEqual(adapter.sent.length, 0);
});

test('pendant la veille : messages ordinaires ignorés, chat auto suspendu, puis réveil par « X »', async () => {
  const { bot, adapter, db } = await boot({
    serviceStubs: { chat: { reply: async () => 'réponse simulée', clear() {}, resetAll() {} } },
  });
  bot.config.idle.standbyMs = 300;
  const t = 'veille-chat';
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg(t, UIDS.owner, 'Xchat on'));
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'Salut toi !'));
  await until(() => lastBody(adapter).includes('réponse simulée'), 3000); // actif → répond

  await sleepThread(bot, t);
  const before = adapter.sent.length;
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'toujours là ?'));
  await bot.handleMessage(makeMsg(t, UIDS.paul, 'coucou'));
  assert.strictEqual(adapter.sent.length, before, 'le bot dort : silence total');

  clearCooldowns(bot);
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'X')); // réveil
  await until(() => lastBody(adapter).includes('IA personnelle'), 3000); // accueil
  assert.strictEqual(bot.idle.isSleeping(t), false, 'réveillé par le préfixe');
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'Salut toi !'));
  await until(() => lastBody(adapter).includes('réponse simulée'), 3000); // chat auto remarche
});

test('réveil par commande : réponse directe, sans message de réveil superflu', async () => {
  const { bot, adapter } = await boot();
  bot.config.idle.standbyMs = 300;
  const t = 'veille-cmd';
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'Xcoins'));
  await sleepThread(bot, t);
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'Xcoins'));
  const b = lastBody(adapter);
  assert.ok(b.includes('XCoins :'), 'la commande répond normalement');
  assert.ok(!b.includes('réveillé') && !b.includes('RÉVEIL'), 'pas d’annonce de réveil en plus');
  assert.strictEqual(bot.idle.isSleeping(t), false);
});

test('réveil par mention du bot : message de réveil + reprise du chat', async () => {
  const { bot, adapter } = await boot({
    serviceStubs: { chat: { reply: async () => 'réponse simulée', clear() {}, resetAll() {} } },
  });
  bot.config.idle.standbyMs = 300;
  const t = 'veille-mention';
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg(t, UIDS.owner, 'Xchat on'));
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'hello'));
  await sleepThread(bot, t);
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'MeR~NeL tu es là ?', {
    mentions: { BOT_MOCK_000000: '@MeR~NeL' },
  }));
  await until(() => bodies(adapter).some((b) => b.includes('RÉVEIL') || b.includes('réveillé')), 3000);
  await until(() => lastBody(adapter).includes('réponse simulée'), 3000);
  assert.strictEqual(bot.idle.isSleeping(t), false);
});

test('réveil par phrase (« réveil ! ») sans préfixe', async () => {
  const { bot, adapter } = await boot();
  bot.config.idle.standbyMs = 300;
  const t = 'veille-phrase';
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'Xcoins'));
  await sleepThread(bot, t);
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'réveil !'));
  const b = lastBody(adapter);
  assert.ok(b.includes('réveillé') || b.includes('RÉVEIL'));
  assert.strictEqual(bot.idle.isSleeping(t), false);
});

test('les admins réveillent le bot d’un simple message', async () => {
  const { bot, adapter } = await boot();
  bot.config.idle.standbyMs = 300;
  const t = 'veille-admin';
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'Xcoins'));
  await sleepThread(bot, t);
  await bot.handleMessage(makeMsg(t, UIDS.owner, 'bonjour le bot'));
  assert.strictEqual(bot.idle.isSleeping(t), false);
});

test('un nouveau membre réveille le bot (accueil envoyé)', async () => {
  const { bot, adapter } = await boot();
  bot.config.idle.standbyMs = 300;
  const t = 'veille-join';
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'Xcoins'));
  await sleepThread(bot, t);
  await bot.handleEvent({
    type: 'event',
    threadID: t,
    logMessageType: 'log:subscribe',
    logMessageData: { addedParticipants: [{ userFbId: UIDS.paul, fullName: 'Paul' }] },
  });
  const last = adapter.sent[adapter.sent.length - 1];
  assert.ok(unbold(last.payload.body || '').includes('NOUVEAU MEMBRE'), 'accueil envoyé malgré la veille');
  assert.strictEqual(bot.idle.isSleeping(t), false);
});

test('une session de quiz en cours réveille son joueur (pas de quiz bloqué)', async () => {
  const { bot, adapter } = await boot();
  bot.config.idle.standbyMs = 300;
  const t = 'veille-quiz';
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg(t, UIDS.shadow, '10'));
  await until(() => /Q 1\/10/.test(lastBody(adapter)), 8000);
  // Le bot s'endort pendant le quiz (aucune activité depuis la dernière réponse)
  await sleepThread(bot, t);
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'A')); // réponse du joueur
  assert.strictEqual(bot.idle.isSleeping(t), false, 'la session accepte le joueur → réveil');
  // La réponse a bien été traitée (retour correct/incorrect, pas de silence)
  await until(() => /Correct|MAUVAISE|TEMPS/.test(lastBody(adapter)), 5000);
  await bot.handleMessage(makeMsg(t, UIDS.shadow, 'cancel'));
});

test('hygiène : quand toutes les conversations dorment, les contextes de chat sont libérés', async () => {
  let resets = 0;
  const { bot } = await boot({
    serviceStubs: { chat: { reply: async () => null, clear() {}, resetAll() { resets++; } } },
  });
  bot.config.idle.standbyMs = 300;
  await bot.handleMessage(makeMsg('g1', UIDS.shadow, 'Xcoins'));
  await sleepThread(bot, 'g1');
  assert.ok(resets >= 1, 'resetAll appelé quand tout dort');
});
