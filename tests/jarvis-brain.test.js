'use strict';
/*
 * 🧬 MeR~NeL — tests/jarvis-brain.test.js
 * LE CERVEAU JARVIS 100 % LOCAL : compréhension, réflexion, mémoire,
 * exécution — SANS AUCUNE API (les stubs IA lancent une erreur s'ils
 * sont appelés : le test échouerait immédiatement).
 */

const test = require('node:test');
const assert = require('node:assert');
const { boot, until, makeMsg, bodies, UIDS, clearCooldowns } = require('./helpers');
const { createJarvisBrain } = require('../systems/jarvisBrain');

const BOT_ID = 'BOT_MOCK_000000';
const API_INTERDITE = 'API EXTERNE INTERDITE EN MODE JARVIS';

/* Boot groupe avec Xjarvis ON + cerveau LOCAL (toute API → exception). */
async function bootJarvis(opts = {}) {
  const { bot, adapter, db } = await boot(opts);
  bot.adapter.getThreadInfo = async () => ({
    threadName: 'Groupe Test',
    adminIDs: [{ id: UIDS.admin }],
    userInfo: [
      { id: UIDS.shadow, name: 'Shadow' },
      { id: UIDS.paul, name: 'Paul' },
    ],
    participantIDs: [UIDS.shadow, UIDS.paul, UIDS.admin, BOT_ID],
  });
  bot.services.aiPool.ask = async () => {
    throw new Error(API_INTERDITE);
  };
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xjarvis on'));
  assert.ok(await until(() => bodies(adapter).some((b) => /JARVIS — ACTIV/.test(b)), 3000), 'JARVIS activé');
  clearCooldowns(bot);
  return { bot, adapter, db };
}

test('CERVEAU : identité — Mernel, fils de Merdi, RDC & Bénin, conçu par Merdi et Nelson', () => {
  const brain = createJarvisBrain({ botName: 'MeR~NeL' });
  const r = brain.think({ threadID: 't', senderID: 'u1', senderName: 'Paul', text: 'qui es tu ?' });
  assert.ok(/Mernel/.test(r.text), 'prénom Mernel');
  assert.ok(/Merdi/.test(r.text), 'fils de Merdi');
  assert.ok(/RDC/.test(r.text) && /Bénin/.test(r.text), 'RDC & Bénin');
  assert.ok(/Nelson/.test(r.text), 'conçu par Merdi et Nelson');
  assert.ok(!r.command, 'simple réponse, aucune commande');
});

test('CERVEAU : « mernel lance nous un quizz manga multivers » → Xquiz MULTIVERS', () => {
  const brain = createJarvisBrain({ botName: 'MeR~NeL' });
  const r = brain.think({ threadID: 't', senderID: 'u1', senderName: 'Paul', text: 'mernel lance nous un quizz manga multivers' });
  assert.equal(r.command, 'xquiz');
  assert.equal(r.args, 'multivers');
});

test('CERVEAU : dispatch complet des quiz et jeux', () => {
  const brain = createJarvisBrain({ botName: 'MeR~NeL' });
  const t = (text) => brain.think({ threadID: 't', senderID: 'u1', senderName: 'P', text }).command;
  assert.equal(t('lance un quiz manga'), 'xid');
  assert.equal(t('on fait un quiz foot ?'), 'xfoot');
  assert.equal(t('lance un quiz drapeau'), 'xquiz');
  assert.equal(brain.think({ threadID: 't', senderID: 'u', text: 'quiz drapeau' }).args, 'drapeau');
  assert.equal(t('un duel avec Paul'), 'xduel');
  assert.equal(t('on joue au shifumi'), 'xrps');
  assert.equal(t('fais une blague'), undefined, 'blague = réponse texte');
  const pile = brain.think({ threadID: 't', senderID: 'u', text: 'pile ou face 100' });
  assert.equal(pile.command, 'xpile');
  assert.equal(pile.args, 'pile 100');
  const slots = brain.think({ threadID: 't', senderID: 'u', text: 'slots 200' });
  assert.equal(slots.command, 'xslots');
  assert.equal(slots.args, '200');
  const course = brain.think({ threadID: 't', senderID: 'u', text: 'course 2 100' });
  assert.equal(course.command, 'xcourse');
  assert.equal(course.args, '2 100');
});

test('CERVEAU : vie du bot — solde, daily, rang, profil, menu, XP', () => {
  const brain = createJarvisBrain({ botName: 'MeR~NeL' });
  const t = (text) => brain.think({ threadID: 't', senderID: 'u1', senderName: 'P', text }).command;
  assert.equal(t('quel est mon solde ?'), 'xcoins');
  assert.equal(t('récupère mon daily'), 'xdaily');
  assert.equal(t('montre-moi le classement'), 'xrank');
  assert.equal(t('affiche mon profil'), 'xprofil');
  assert.equal(t('donne-moi le menu'), 'xmenu');
  assert.equal(t('c est quoi mon xp ?'), 'xp');
});

test('CERVEAU : calcul mental local — « combien font 12 + 7 ? » → 19', () => {
  const brain = createJarvisBrain({ botName: 'MeR~NeL' });
  assert.ok(brain.think({ threadID: 't', senderID: 'u', text: 'combien font 12 + 7 ?' }).text.includes('19'));
  assert.ok(brain.think({ threadID: 't', senderID: 'u', text: 'calcule 5 x 3' }).text.includes('15'));
  assert.ok(brain.think({ threadID: 't', senderID: 'u', text: '10 / 0' }).text.includes('zéro'));
});

test('CERVEAU : mémoire des prénoms — apprend, retient, oublie', () => {
  const names = new Map();
  const brain = createJarvisBrain(
    { botName: 'MeR~NeL' },
    { getName: (u) => names.get(u) || '', setName: (u, n) => names.set(u, n), forget: (u) => names.delete(u) }
  );
  const r1 = brain.think({ threadID: 't', senderID: 'u1', senderName: 'X', text: "je m'appelle Paul" });
  assert.ok(/Paul/.test(r1.text), 'prénom appris');
  assert.equal(names.get('u1'), 'Paul', 'stocké');
  const r2 = brain.think({ threadID: 't', senderID: 'u1', senderName: 'X', text: 'qui suis je ?' });
  assert.ok(/Tu es Paul/.test(r2.text), 'retenu');
  brain.think({ threadID: 't', senderID: 'u1', senderName: 'X', text: 'oublie moi' });
  assert.ok(!names.has('u1'), 'oublié');
  const r3 = brain.think({ threadID: 't', senderID: 'u2', senderName: 'X', text: 'je suis fatigué' });
  assert.ok(!names.has('u2'), '« je suis fatigué » ≠ prénom');
  assert.ok(r3.text.length > 0);
});

test('CERVEAU : refuse JAMAIS d\u2019exécuter une commande d\u2019administration', () => {
  const brain = createJarvisBrain({ botName: 'MeR~NeL' });
  for (const txt of ['banne Paul', 'kick ce membre', 'expulse Paul du groupe']) {
    const r = brain.think({ threadID: 't', senderID: 'u1', senderName: 'P', text: txt });
    assert.ok(!r.command, `aucune commande pour « ${txt} »`);
    assert.ok(/administration|règle/i.test(r.text), 'refus expliqué');
  }
});

test('CERVEAU : anime, heure, blague, limitation météo honnête', () => {
  const brain = createJarvisBrain({ botName: 'MeR~NeL' });
  const anime = brain.think({ threadID: 't', senderID: 'u', text: "parle moi de l'anime naruto" });
  assert.equal(anime.command, 'xanime');
  assert.ok(/naruto/i.test(anime.args));
  assert.ok(/Il est/.test(brain.think({ threadID: 't', senderID: 'u', text: 'quelle heure est-il ?' }).text));
  const joke = brain.think({ threadID: 't', senderID: 'u', text: 'raconte une blague' });
  assert.ok(joke.text.length > 20 && !joke.command);
  assert.ok(/datacenter|quiz/.test(brain.think({ threadID: 't', senderID: 'u', text: 'quelle méteo aujourd hui ?' }).text));
});

test('CERVEAU : invocation « mernel … » retirée + fallback avec suggestions', () => {
  const brain = createJarvisBrain({ botName: 'MeR~NeL' });
  const r = brain.think({ threadID: 't', senderID: 'u1', senderName: 'Paul', text: 'mernel salut' });
  assert.ok(/Salut/.test(r.text), 'salut après invocation');
  const fb = brain.think({ threadID: 't', senderID: 'u1', senderName: 'Paul', text: 'xkldjsqmlkj mlkjqsdmlkj' });
  assert.ok(!fb.command, 'inconnu → pas de commande');
  assert.ok(/quiz|solde|blague/.test(fb.text), 'suggestions proposées');
});

test('INTÉGRATION : Xjarvis ON → « lance un quiz multivers » exécute Xquiz SANS API', async () => {
  const { bot, adapter } = await bootJarvis();
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'mernel lance un quiz multivers'));
  assert.ok(await until(() => bodies(adapter).some((b) => /MULTIVERS ! Je lance/.test(b)), 3000), 'annonce du cerveau');
  assert.ok(await until(() => bodies(adapter).some((b) => /NOMBRE DE QUESTIONS/.test(b)), 5000), 'Xquiz pré-sélectionné → demande le nombre');
  const all = bodies(adapter).join('\n');
  assert.ok(!all.includes(API_INTERDITE), 'aucune API appelée (stub = exception)');
  assert.ok(bot.sessions.get('thread-1', 'quiz'), 'session quiz active');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

test('INTÉGRATION : mémoire persistante — « je m appelle Paul » puis « qui suis je »', async () => {
  const { bot, adapter, db } = await bootJarvis();
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, "je m'appelle Paul"));
  assert.ok(await until(() => bodies(adapter).some((b) => /Enchanté Paul/.test(b)), 3000), 'prénom appris');
  assert.equal(db.getUser(UIDS.paul).jarvisName, 'Paul', 'prénom PERSISTÉ en base');
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'qui suis je ?'));
  assert.ok(await until(() => bodies(adapter).some((b) => /Tu es Paul/.test(b)), 3000), 'retenu de mémoire');
});

test('INTÉGRATION : calcul + solde exécutés localement (toujours zéro API)', async () => {
  const { bot, adapter } = await bootJarvis();
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'combien font 9 x 9 ?'));
  assert.ok(await until(() => bodies(adapter).some((b) => /9 × 9 = 81/.test(b)), 3000), 'calcul local');
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'mon solde'));
  assert.ok(await until(() => bodies(adapter).some((b) => /XCOINS/i.test(b) || /Solde/i.test(b)), 5000), 'Xcoins exécuté');
  assert.ok(!bodies(adapter).join('\n').includes(API_INTERDITE), 'jamais d API');
});

test('INTÉGRATION : « banne-le » → refus du cerveau, aucun ban', async () => {
  const { bot, adapter, db } = await bootJarvis();
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'banne Paul'));
  assert.ok(await until(() => bodies(adapter).some((b) => /administration/.test(b)), 3000), 'refus expliqué');
  assert.ok(!db.ensureUser(UIDS.paul).banned, 'personne banni');
});
