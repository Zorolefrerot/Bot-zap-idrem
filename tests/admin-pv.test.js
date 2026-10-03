'use strict';
/*
 * 🧬 MeR~NeL — tests/admin-pv.test.js
 * Xadmin / Xremove (hiérarchie d'admins à 2 niveaux) + réponses en PV (inbox).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('Xadmin : les suprêmes nomment, les non-admins sont refusés', async () => {
  const { boot, makeMsg, lastBody, unbold, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  // Non-admin → ACCÈS REFUSÉ
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xadmin'));
  assert.ok(/ACC[ÈE]S REFUS[ÉE]/.test(unbold(lastBody(adapter))), 'non-admin refusé');
  // Super admin nomme Paul via mention
  await bot.handleMessage(
    makeMsg('thread-1', UIDS.admin, 'Xadmin @Paul', { mentions: { [UIDS.paul]: { tag: '@Paul', from: 0 } } })
  );
  assert.ok(/ADMIN NOMM[ÉE]/.test(unbold(lastBody(adapter))), 'Paul nommé');
  assert.ok(bot.db.isNamedAdmin(UIDS.paul), 'persistant en base');
  // Double nomination → déjà admin
  await bot.handleMessage(
    makeMsg('thread-1', UIDS.admin, 'Xadmin @Paul', { mentions: { [UIDS.paul]: { tag: '@Paul', from: 0 } } })
  );
  assert.ok(/d[ée]j[à] admin/.test(unbold(lastBody(adapter))), 'pas de double nomination');
  // Liste
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xadmin liste'));
  assert.ok(/ADMINS NOMM[ÉE]S/.test(unbold(lastBody(adapter))), 'liste affichée');
});

test('Xadmin : les admin NOMMÉS ne peuvent PAS nommer ni retirer (superOnly)', async () => {
  const { boot, makeMsg, lastBody, unbold, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  bot.db.addNamedAdmin(UIDS.paul, UIDS.admin, 'Paul');
  await bot.handleMessage(
    makeMsg('thread-1', UIDS.paul, 'Xadmin @Fortiche', { mentions: { [UIDS.fortiche]: { tag: '@Fortiche', from: 0 } } })
  );
  assert.ok(/SUPR[ÊE]MES/.test(unbold(lastBody(adapter))), 'Xadmin refusé aux nommés');
  assert.ok(!bot.db.isNamedAdmin(UIDS.fortiche), 'aucune nomination accidentelle');
  await bot.handleMessage(
    makeMsg('thread-1', UIDS.paul, 'Xremove @Fortiche', { mentions: { [UIDS.fortiche]: { tag: '@Fortiche', from: 0 } } })
  );
  assert.ok(/SUPR[ÊE]MES/.test(unbold(lastBody(adapter))), 'Xremove refusé aux nommés');
});

test('Admin nommé : tous les pouvoirs admin (Xban/Xunban), perdus après Xremove', async () => {
  const { boot, makeMsg, lastBody, unbold, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  // Avant nomination : refusé
  await bot.handleMessage(
    makeMsg('thread-1', UIDS.paul, 'Xban @Fortiche', { mentions: { [UIDS.fortiche]: { tag: '@Fortiche', from: 0 } } })
  );
  assert.ok(/ACC[ÈE]S REFUS[ÉE]/.test(unbold(lastBody(adapter))), 'non-nommé sans pouvoir');
  // Nommé → peut bannir/débannir
  bot.db.addNamedAdmin(UIDS.paul, UIDS.admin, 'Paul');
  await bot.handleMessage(
    makeMsg('thread-1', UIDS.paul, 'Xban @Fortiche', { mentions: { [UIDS.fortiche]: { tag: '@Fortiche', from: 0 } } })
  );
  assert.ok(bot.db.getUser(UIDS.fortiche).banned, 'admin nommé peut bannir');
  await bot.handleMessage(
    makeMsg('thread-1', UIDS.paul, 'Xunban @Fortiche', { mentions: { [UIDS.fortiche]: { tag: '@Fortiche', from: 0 } } })
  );
  assert.ok(!bot.db.getUser(UIDS.fortiche).banned, 'unban OK');
  // Xremove par un suprême → pouvoirs perdus
  await bot.handleMessage(
    makeMsg('thread-1', UIDS.admin, 'Xremove @Paul', { mentions: { [UIDS.paul]: { tag: '@Paul', from: 0 } } })
  );
  assert.ok(/plus admin/.test(unbold(lastBody(adapter))), 'Paul retiré');
  assert.ok(!bot.db.isNamedAdmin(UIDS.paul), 'retiré de la base');
  await bot.handleMessage(
    makeMsg('thread-1', UIDS.paul, 'Xban @Fortiche', { mentions: { [UIDS.fortiche]: { tag: '@Fortiche', from: 0 } } })
  );
  assert.ok(/ACC[ÈE]S REFUS[ÉE]/.test(unbold(lastBody(adapter))), 'pouvoirs perdus après retrait');
});

test('Xremove : les admins SUPRÊMES sont intouchables, Xremove tout vide la liste', async () => {
  const { boot, makeMsg, lastBody, unbold, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  bot.db.addNamedAdmin(UIDS.paul, UIDS.admin, 'Paul');
  bot.db.addNamedAdmin(UIDS.fortiche, UIDS.admin, 'Fortiche');
  // Tenter de retirer un suprême → intouchable
  await bot.handleMessage(
    makeMsg('thread-1', UIDS.admin, 'Xremove @Admin', { mentions: { [UIDS.admin]: { tag: '@Admin', from: 0 } } })
  );
  assert.ok(/intouchable|SUPR[ÊE]ME/.test(unbold(lastBody(adapter))), 'suprême intouchable');
  assert.ok(bot.db.isNamedAdmin(UIDS.paul) && bot.db.isNamedAdmin(UIDS.fortiche), 'rien n’a bougé');
  // Xremove tout
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xremove tout'));
  assert.ok(/retir[ée]/i.test(unbold(lastBody(adapter))), 'tout retiré');
  assert.ok(bot.db.namedAdmins().length === 0, 'liste vide');
});

test('Admins nommés : PERSISTANCE (fichier admins.json)', async () => {
  const { boot, makeMsg, UIDS, clearCooldowns } = require('./helpers');
  const { bot } = await boot({});
  clearCooldowns(bot);
  bot.db.addNamedAdmin(UIDS.paul, UIDS.admin, 'Paul');
  bot.db.admins.saveNow();
  const file = path.join(bot.config.dataDir, 'admins.json');
  assert.ok(fs.existsSync(file), 'admins.json existe');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(Array.isArray(data.list) && data.list.some((e) => e.uid === UIDS.paul), 'Paul dans le fichier');
});

test('PV : le cerveau LOCAL répond aux maths sans préfixe', async () => {
  const { boot, until, makeMsg, lastBody, unbold, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  const dm = UIDS.shadow; // en PV, threadID === senderID
  await bot.handleMessage(makeMsg(dm, dm, '√144'));
  assert.ok(await until(() => /\b12\b/.test(unbold(lastBody(adapter))), 4000), '√144 → 12 en PV');
});

test('PV : message libre → l’IA répond (service stubbé)', async () => {
  const { boot, until, makeMsg, lastBody, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({
    serviceStubs: {
      chat: { available: () => true, clear() {}, reply: async () => 'Coucou en PV !' },
    },
  });
  clearCooldowns(bot);
  const dm = UIDS.shadow;
  await bot.handleMessage(makeMsg(dm, dm, 'blorp zonk miracle'));
  assert.ok(await until(() => /Coucou en PV/.test(lastBody(adapter)), 4000), 'IA répond en PV');
});

test('PV : commande inconnue → le cerveau prend le relais (jamais muet)', async () => {
  const { boot, until, makeMsg, lastBody, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({
    serviceStubs: {
      chat: { available: () => true, clear() {}, reply: async () => 'Réponse du cerveau !' },
    },
  });
  clearCooldowns(bot);
  const dm = UIDS.shadow;
  await bot.handleMessage(makeMsg(dm, dm, 'Xblorp'));
  assert.ok(await until(() => /Réponse du cerveau/.test(lastBody(adapter)), 4000), 'Xinconnu → cerveau');
});

test('PV : les commandes préfixées marchent aussi en privé', async () => {
  const { boot, until, makeMsg, lastBody, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  const dm = UIDS.shadow;
  await bot.handleMessage(makeMsg(dm, dm, 'Xmenu'));
  assert.ok(await until(() => /MENU|COMMANDES/i.test(lastBody(adapter)), 5000), 'Xmenu répond en PV');
});

test('PV : reply à un message du bot → conversation (flux privé)', async () => {
  const { boot, until, makeMsg, lastBody, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({
    serviceStubs: {
      chat: { available: () => true, clear() {}, reply: async () => 'Je te réponds !' },
    },
  });
  clearCooldowns(bot);
  const dm = UIDS.shadow;
  await bot.handleMessage(
    makeMsg(dm, dm, 'et toi ?', { messageReply: { senderID: 'BOT_MOCK_000000', messageID: 'm1' } })
  );
  assert.ok(await until(() => /Je te réponds/.test(lastBody(adapter)), 4000), 'reply au bot en PV → IA');
});
