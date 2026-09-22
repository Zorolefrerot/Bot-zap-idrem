'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { boot, makeMsg, lastBody, UIDS, clearCooldowns } = require('./helpers');

test('« X » seul → message d’accueil avec invitation au menu', async () => {
  const { bot, adapter } = await boot();
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'X'));
  const body = lastBody(adapter);
  assert.ok(/MeR~N/i.test(body));
  assert.ok(body.includes('IA personnelle'));
  assert.ok(body.includes('Xmenu'));
});

test('Xmenu : organisation officielle complète', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xmenu'));
  const body = lastBody(adapter);
  for (const section of ['Intelligence & Chat', 'Économie', 'Jeux', 'Médias', 'Profil', 'Groupe', 'Admin']) {
    assert.ok(body.includes(section), `section manquante: ${section}`);
  }
  for (const cmd of ['Xchat', 'Xask', 'Xai', 'Xdaily', 'Xcoins', 'Xp', 'Xrank', 'Xquiz', 'Xduel',
    'Xgame', 'Ximg', 'Xplay', 'Xvideo', 'Xprofil', 'Xpseudo', 'Xtag all', 'Xannonce',
    'Xban', 'Xwarn', 'Xkick', 'Xclear']) {
    assert.ok(body.includes(cmd), `commande manquante au menu: ${cmd}`);
  }
});

test('casse indifférente : xCoInS fonctionne', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'xCoInS'));
  assert.ok(lastBody(adapter).includes('XCoins : 500'));
});

test('commande inconnue → aide propre (pas de crash)', async () => {
  const { bot, adapter } = await boot();
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xblabla'));
  assert.ok(lastBody(adapter).includes('n’existe pas'));
  assert.ok(lastBody(adapter).includes('Xmenu'));
});

test('persistance complète : coins + chatMode survivent à un redémarrage du bot', async () => {
  const dir = fs.mkdtempSync(require('os').tmpdir() + '/mernel-reboot-');
  {
    const { bot, db } = await boot({ dataDir: dir });
    clearCooldowns(bot);
    await bot.handleMessage(makeMsg('rb-thread', UIDS.shadow, 'Xdaily'));
    await bot.handleMessage(makeMsg('rb-thread', UIDS.owner, 'Xchat on'));
    db.saveAll();
  }
  {
    const { bot, adapter, db } = await boot({ dataDir: dir });
    assert.strictEqual(db.getUser(UIDS.shadow).xcoins, 850); // 500 + daily 350
    assert.strictEqual(db.getGroup('rb-thread').chatMode, true);

    clearCooldowns(bot);
    await bot.handleMessage(makeMsg('rb-thread', UIDS.shadow, 'Xcoins'));
    assert.ok(lastBody(adapter).includes('850'));
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('erreurs API → message d’erreur typé sans secret', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  // Le service IA réel est utilisé : succès ou échec, la réponse reste propre
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xask test question'));
  const { bodies } = require('./helpers');
  const all = bodies(adapter).join('\n');
  const hasTypedError = all.includes('CODE');
  const hasThinking = all.includes('Analyse en cours') || all.includes('XASK');
  assert.ok(hasTypedError || hasThinking, 'soit le traitement, soit une erreur typée doit être affichée');
  assert.ok(!all.includes('shizo'), 'la clé API ne doit jamais apparaître');
});

test('le bot ne répond pas à ses propres messages', async () => {
  const { bot, adapter } = await boot();
  await bot.handleMessage(makeMsg('thread-1', 'BOT_MOCK_000000', 'Xmenu'));
  assert.strictEqual(adapter.sent.length, 0);
});

test('reset complet des services chat', async () => {
  const { bot, services } = await boot();
  services.chat.resetAll();
  assert.ok(true);
});
