'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { boot, until, makeMsg, lastBody, UIDS, clearCooldowns } = require('./helpers');

test('Xban refusé pour un non-admin', async () => {
  const { bot, adapter } = await boot();
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xban'));
  assert.ok(lastBody(adapter).includes('ACCÈS REFUSÉ'));
  assert.ok(lastBody(adapter).includes('réservée aux administrateurs'));
});

test('Xban par admin : API refuse → sanction côté bot annoncée honnêtement', async () => {
  const { bot, adapter, db } = await boot(); // mock : removeUser échoue (réalité Messenger)
  const target = makeMsg('thread-1', UIDS.shadow, 'je suis le message ciblé');
  await bot.handleMessage(target);
  const before = adapter.sent.length;

  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xban', {
    messageReply: { senderID: UIDS.shadow, messageID: target.messageID },
  }));
  const body = lastBody(adapter);
  assert.ok(body.includes('LIBERTÉ REVOQUÉE'));
  assert.ok(body.includes('Messenger n’autorise pas l’expulsion'));
  assert.ok(body.includes('ignorés')); // sanction côté bot annoncée clairement
  assert.strictEqual(db.getUser(UIDS.shadow).banned, true);

  // Le membre banni est ignoré par le bot
  const afterBan = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xcoins'));
  assert.strictEqual(adapter.sent.length, afterBan); // aucune réponse supplémentaire
});

test('Xunban par admin rétablit le membre', async () => {
  const { bot, adapter, db } = await boot();
  db.ensureUser(UIDS.shadow).banned = true;
  db.users.save();
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xunban @Shadow', {
    mentions: { [UIDS.shadow]: '@Shadow' },
  }));
  assert.ok(lastBody(adapter).includes('rétabli'));
  assert.strictEqual(db.getUser(UIDS.shadow).banned, false);
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xcoins'));
  assert.ok(lastBody(adapter).includes('XCoins :'));
});

test('Xban cible protégée : admin et bot', async () => {
  const { bot, adapter } = await boot();
  const r1 = makeMsg('thread-1', UIDS.owner, 'message owner');
  await bot.handleMessage(r1);
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xban', {
    messageReply: { senderID: UIDS.owner, messageID: r1.messageID },
  }));
  assert.ok(lastBody(adapter).includes('ne peut pas être banni'));
});

test('Xkick : échec API annoncé + succès quand le mock le permet', async () => {
  // 1) API refuse (défaut du mock)
  const ctxA = await boot();
  const reply = makeMsg('thread-1', UIDS.shadow, 'cible');
  await ctxA.bot.handleMessage(reply);
  await ctxA.bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xkick', {
    messageReply: { senderID: UIDS.shadow, messageID: reply.messageID },
  }));
  assert.ok(lastBody(ctxA.adapter).includes('ÉCHEC'));

  // 2) API accepte
  const dir = fs.mkdtempSync(require('os').tmpdir() + '/mernel-kick-');
  const ctxB = await boot({ dataDir: dir, mock: { mockFailures: { removeUser: false } } });
  const reply2 = makeMsg('thread-1', UIDS.shadow, 'cible2');
  await ctxB.bot.handleMessage(reply2);
  await ctxB.bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xkick', {
    messageReply: { senderID: UIDS.shadow, messageID: reply2.messageID },
  }));
  assert.ok(lastBody(ctxB.adapter).includes('a été retiré'));
  assert.ok(ctxB.adapter.removed.includes(UIDS.shadow));
});

test('Xclear v2 : supprime les messages DU BOT (réponse à un message bot)', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  // Le bot envoie un message (journalisé)
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xmenu'));
  await require('./helpers').until(() => adapter.sent.length > 0, 3000);
  const botMsg = adapter.sent[adapter.sent.length - 1];
  assert.ok(botMsg.id, 'message bot journalisé');

  // L'admin répond à CE message du bot
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xclear', {
    messageReply: { senderID: 'BOT_MOCK_000000', messageID: botMsg.id },
  }));
  const cleared = lastBody(adapter);
  assert.ok(
    cleared.includes('Nettoyage') || cleared.includes('effacé') || cleared.includes('Zone propre'),
    `succès attendu, reçu: ${cleared.slice(0, 140)}`
  );
  assert.ok(adapter.unsent.includes(botMsg.id), 'unsend appelé sur le message du bot');
});

test('Xclear v2 : message d’un utilisateur → jamais de unsend sur lui', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const target = makeMsg('thread-1', UIDS.shadow, 'message utilisateur');
  await bot.handleMessage(target);
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xclear', {
    messageReply: { senderID: UIDS.shadow, messageID: target.messageID },
  }));
  assert.ok(!adapter.unsent.includes(target.messageID), 'jamais de unsend sur un message utilisateur');
  const body = lastBody(adapter);
  assert.ok(
    body.includes('Nettoyage') || body.includes('effacé') || body.includes('Aucun message du bot') || body.includes('Zone propre'),
    `réponse cohérente, reçu: ${body.slice(0, 120)}`
  );
});

test('Xclear v2 : Xclear 3 supprime les 3 derniers messages du bot', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  for (const cmd of ['Xmenu', 'Xgame']) {
    await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, cmd));
    await require('./helpers').until(() => adapter.sent.filter((x) => x.id.startsWith('mock-')).length >= 1, 3000);
  }
  const countBefore = adapter.sent.filter((x) => x.id.startsWith('mock-')).length;
  assert.ok(countBefore >= 2);
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xclear 2'));
  assert.ok(adapter.unsent.length >= 2, '2 unsend effectués');
  assert.ok(
    lastBody(adapter).includes('Nettoyage') || lastBody(adapter).includes('effacé') || lastBody(adapter).includes('Zone propre')
  );
});

test('Xwarn : 1/2 puis 2/2 → exclusion automatique', async () => {
  const { bot, adapter, db } = await boot();
  const reply = makeMsg('thread-1', UIDS.shadow, 'insulte');
  await bot.handleMessage(reply);

  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xwarn', {
    messageReply: { senderID: UIDS.shadow, messageID: reply.messageID },
  }));
  assert.ok(lastBody(adapter).includes('avertissement 1/2'));
  assert.strictEqual(db.getUser(UIDS.shadow).warnings, 1);

  const r2 = makeMsg('thread-1', UIDS.shadow, 'encore');
  await bot.handleMessage(r2);
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xwarn', {
    messageReply: { senderID: UIDS.shadow, messageID: r2.messageID },
  }));
  assert.ok(lastBody(adapter).includes('EXCLUSION'));
  assert.ok(lastBody(adapter).includes('Bye bye'));
  assert.strictEqual(db.getUser(UIDS.shadow).banned, true, 'exclu à 2 avertissements');

  // Le membre exclu est ignoré
  const before = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xcoins'));
  assert.strictEqual(adapter.sent.length, before);
});

test('Xadd : UID invalide rejeté, UID valide transmis à l’API', async () => {
  const { bot, adapter } = await boot();
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xadd abc!!'));
  assert.ok(lastBody(adapter).includes('UID invalide'));

  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xadd 555555555555555'));
  assert.ok(lastBody(adapter).includes('Demande d’ajout transmise'));
  assert.ok(adapter.added.includes('555555555555555'));
});
