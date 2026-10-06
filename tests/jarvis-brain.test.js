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

/* ════════ CERVEAU v2 — CONSCIENCE DU CONTEXTE, MATHS, PROBAS, WEB ════════ */

test('CONTEXTE : « met fin » pendant un quiz → la session s\u2019arrête', () => {
  const brain = createJarvisBrain({ botName: 'MeR~NeL' }, { getSessionInfo: () => ({ scope: 'quiz', state: 'RUNNING', total: 10, index: 3, scores: [{ name: 'Paul', score: 20 }] }) });
  for (const phrase of ['met fin', 'arrête le quiz', 'annule tout', 'termine le quiz']) {
    const r = brain.think({ threadID: 't', senderID: 'u1', senderName: 'P', text: phrase });
    assert.equal(r.session, 'cancel', `« ${phrase} » → annulation`);
    assert.ok(/arrête|j'arrête/i.test(r.text), 'annonce l\u2019arrêt');
  }
});

test('CONTEXTE : « qui gagne ? » → le tableau des scores en direct', () => {
  const brain = createJarvisBrain({ botName: 'MeR~NeL' }, { getSessionInfo: () => ({ scope: 'quiz', state: 'RUNNING', scores: [{ name: 'Paul', score: 20 }, { name: 'Shadow', score: 10 }] }) });
  const r = brain.think({ threadID: 't', senderID: 'u1', senderName: 'P', text: 'qui gagne ?' });
  assert.ok(/Paul/.test(r.text) && /20/.test(r.text), 'meneur + score');
  assert.ok(!r.command && !r.session, 'réponse informative');
});

test('CONTEXTE : « on en est où ? » → progression de la partie', () => {
  const brain = createJarvisBrain({ botName: 'MeR~NeL' }, { getSessionInfo: () => ({ scope: 'quiz', state: 'RUNNING', total: 15, index: 4 }) });
  const r = brain.think({ threadID: 't', senderID: 'u1', senderName: 'P', text: 'on en est où ?' });
  assert.ok(/5 sur 15/.test(r.text), 'question 5 sur 15');
});

test('MATHS : puissance, racine, pourcentage via le langage naturel', () => {
  const brain = createJarvisBrain({ botName: 'MeR~NeL' });
  assert.ok(brain.think({ threadID: 't', senderID: 'u', text: 'combien font 2 puissance 8 ?' }).text.includes('256'));
  assert.ok(brain.think({ threadID: 't', senderID: 'u', text: 'racine carrée de 81' }).text.includes('9'));
  assert.ok(brain.think({ threadID: 't', senderID: 'u', text: 'c est quoi 20 % de 300 ?' }).text.includes('60'));
  assert.ok(brain.think({ threadID: 't', senderID: 'u', text: 'moyenne de 8 12 10' }).text.includes('10'));
});

test('PROBABILITÉS : dé, pièce, cartes, deux dés — tout est calculé localement', () => {
  const brain = createJarvisBrain({ botName: 'MeR~NeL' });
  const r6 = brain.think({ threadID: 't', senderID: 'u', text: 'probabilité de faire 6 au dé ?' });
  assert.ok(/1 chance sur 6/.test(r6.text) && /16,67/.test(r6.text), 'dé : 1/6 = 16,67 %');
  assert.ok(/50 %/.test(brain.think({ threadID: 't', senderID: 'u', text: 'probabilité de pile ?' }).text));
  assert.ok(/7,7 %/.test(brain.think({ threadID: 't', senderID: 'u', text: 'probabilité de tirer un as ?' }).text));
  assert.ok(/36 combinaisons/.test(brain.think({ threadID: 't', senderID: 'u', text: 'probabilité avec deux dés ?' }).text));
  assert.ok(/Donne-moi le contexte/.test(brain.think({ threadID: 't', senderID: 'u', text: 'probabilité de réussir sa vie ?' }).text));
});

test('RELANCE : « encore » répète la dernière commande', () => {
  const brain = createJarvisBrain({ botName: 'MeR~NeL' });
  brain.think({ threadID: 't', senderID: 'u1', senderName: 'P', text: 'lance un quiz multivers' });
  const r = brain.think({ threadID: 't', senderID: 'u1', senderName: 'P', text: 'encore' });
  assert.equal(r.command, 'xquiz');
  assert.equal(r.args, 'multivers');
  const r2 = brain.think({ threadID: 't', senderID: 'u2', senderName: 'Q', text: 'relance' });
  assert.ok(!r2.command, 'rien à relancer → suggestion');
});

test('MODULES WEB : image, musique, vidéo — routés vers les bons services', () => {
  const brain = createJarvisBrain({ botName: 'MeR~NeL' });
  const img = brain.think({ threadID: 't', senderID: 'u', text: 'génère une image de chat astronaute' });
  assert.equal(img.command, 'ximg');
  assert.ok(/chat astronaute/.test(img.args));
  const song = brain.think({ threadID: 't', senderID: 'u', text: 'mets la chanson de dadju' });
  assert.equal(song.command, 'xplay');
  assert.ok(/dadju/i.test(song.args));
  const vid = brain.think({ threadID: 't', senderID: 'u', text: 'vidéo de chat drôle' });
  assert.equal(vid.command, 'xvideo');
  assert.ok(/chat dr/i.test(vid.args), 'sujet extrait (sans accents)');
});

test('CRÉATEURS & NATURE : Merdi, Nelson, robot, tag au milieu de phrase', () => {
  const brain = createJarvisBrain({ botName: 'MeR~NeL' });
  assert.ok(/père|informaticien/i.test(brain.think({ threadID: 't', senderID: 'u', text: 'qui est Merdi ?' }).text));
  assert.ok(/Nelson/.test(brain.think({ threadID: 't', senderID: 'u', text: 'qui est Nelson ?' }).text));
  assert.ok(/intelligence artificielle MAISON|cerveau/i.test(brain.think({ threadID: 't', senderID: 'u', text: 'tu es un robot ?' }).text));
  const tag = brain.think({ threadID: 't', senderID: 'u', senderName: 'Paul', text: 'salut @MeR~NeL tu es là ?' });
  assert.ok(/Salut/.test(tag.text), 'tag au milieu → conversation normale');
});

test('INTÉGRATION : Xquiz lancé → « met fin » ANNULE la session (sans jarvis)', async () => {
  const { boot, until, makeMsg, bodies, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({});
  bot.adapter.getThreadInfo = async () => ({ threadName: 'G', adminIDs: [{ id: UIDS.admin }], userInfo: [{ id: UIDS.shadow, name: 'Shadow' }], participantIDs: [UIDS.shadow, UIDS.admin] });
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cg'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cinq'));
  assert.ok(await until(() => bodies(adapter).some((b) => /QUESTION 1\/5/.test(b)), 5000), '« cinq » accepté : quiz 5 questions');
  assert.ok(bot.sessions.get('thread-1', 'quiz'), 'session active');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'met fin'));
  assert.ok(await until(() => !bot.sessions.get('thread-1', 'quiz'), 3000), '« met fin » → session arrêtée');
  assert.ok(bodies(adapter).some((b) => /annul/i.test(b)), 'annonce d\u2019annulation');
});

test('INTÉGRATION : Xjarvis + quiz en cours → « Jarvis mets fin » annule aussi', async () => {
  const { boot, until, makeMsg, bodies, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({});
  bot.adapter.getThreadInfo = async () => ({ threadName: 'G', adminIDs: [{ id: UIDS.admin }], userInfo: [{ id: UIDS.shadow, name: 'Shadow' }], participantIDs: [UIDS.shadow, UIDS.admin] });
  bot.services.aiPool.ask = async () => { throw new Error('API INTERDITE'); };
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xjarvis on'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'multivers'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  assert.ok(await until(() => bot.sessions.get('thread-1', 'quiz'), 3000), 'quiz lancé');
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'jarvis mets fin au quiz'));
  assert.ok(await until(() => !bot.sessions.get('thread-1', 'quiz'), 3000), 'annulé via le cerveau');
});
