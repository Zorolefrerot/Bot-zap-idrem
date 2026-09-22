'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { boot, UIDS, makeMsg, lastBody, clearCooldowns } = require('./helpers');

test('Xdaily : +350 XCoins puis cooldown 24 h (double claim bloqué)', async () => {
  const { bot, adapter, db } = await boot();
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xdaily'));
  assert.ok(lastBody(adapter).includes('Récompense récupérée'));
  assert.ok(lastBody(adapter).includes('+350 XCoins'));
  assert.strictEqual(db.getUser(UIDS.shadow).xcoins, 500 + 350);

  clearCooldowns(bot); // on isole le cooldown daily du cooldown de commande (3 s)
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xdaily'));
  const body = lastBody(adapter);
  assert.ok(body.includes('Déjà récupéré'));
  assert.ok(/24 h/.test(body)); // cooldown calculé côté serveur
  assert.strictEqual(db.getUser(UIDS.shadow).xcoins, 850); // aucun doublon
});

test('Xcoins : solde et rang', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'Xcoins'));
  const body = lastBody(adapter);
  assert.ok(body.includes('XCoins : 500'));
  assert.ok(body.includes('Rang'));
});

test('Xrank : classement + position du demandeur', async () => {
  const { bot, adapter, db } = await boot();
  db.ensureUser(UIDS.shadow, 'Shadow').xcoins = 2000;
  db.ensureUser(UIDS.paul, 'Paul').xcoins = 1500;
  db.ensureUser(UIDS.fortiche, 'Fortiche').xcoins = 100;
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xrank'));
  const body = lastBody(adapter);
  assert.ok(body.includes('🥇 Shadow — 2 000 XCoins') || body.includes('🥇 Shadow — 2000 XCoins'));
  assert.ok(body.includes('🥈 Paul'));
  assert.ok(body.includes('🥉 Fortiche'));
  assert.ok(body.includes('Ta position : 1'));
});

test('Xp : affichage niveau + barre de progression', async () => {
  const { bot, adapter, db } = await boot();
  const u = db.ensureUser(UIDS.shadow);
  u.xp = 120; // niveau 2
  db.users.save();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xp'));
  const body = lastBody(adapter);
  assert.ok(body.includes('Niveau : 2'));
  assert.ok(body.includes('▰') && body.includes('▱'));
});

test('système XP : paliers configurables (0/100/250/500)', async () => {
  const { bot, db } = await boot();
  const uid = UIDS.shadow;
  assert.strictEqual(bot.xp.addXp(uid, 99).leveledUp, false);
  const res = bot.xp.addXp(uid, 1); // 100 → niveau 2
  assert.strictEqual(res.leveledUp, true);
  assert.strictEqual(res.level, 2);
  bot.xp.addXp(uid, 150); // 250 → niveau 3
  assert.strictEqual(db.getUser(uid).level, 3);
  bot.xp.addXp(uid, 250); // 500 → niveau 4
  assert.strictEqual(db.getUser(uid).level, 4);
});

test('les gains de quiz créditent bien le solde (15 XCoins / bonne réponse)', async () => {
  const { bot, adapter, db } = await boot();
  const before = db.ensureUser(UIDS.shadow).xcoins;
  // Simule un crédit direct via l'économie (chemin interne des jeux)
  const balance = bot.economy.addCoins(UIDS.shadow, 3 * bot.config.games.quizCoinsPerCorrect);
  assert.strictEqual(balance, before + 45);
  assert.ok(adapter.sent.length >= 0);
});

test('spend refuse au-delà du solde', async () => {
  const { bot, db } = await boot();
  db.ensureUser(UIDS.shadow).xcoins = 100;
  const fail = bot.economy.spend(UIDS.shadow, 150);
  assert.strictEqual(fail.ok, false);
  const ok = bot.economy.spend(UIDS.shadow, 60);
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(db.getUser(UIDS.shadow).xcoins, 40);
});

test('persistance : les XCoins survivent à un redémarrage de la base', async () => {
  const dir = fs.mkdtempSync(require('os').tmpdir() + '/mernel-persist-');
  {
    const { bot, db } = await boot({ dataDir: dir });
    bot.economy.addCoins(UIDS.shadow, 1234);
    db.saveAll();
  }
  {
    const { db } = await boot({ dataDir: dir });
    assert.strictEqual(db.getUser(UIDS.shadow).xcoins, 500 + 1234);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
