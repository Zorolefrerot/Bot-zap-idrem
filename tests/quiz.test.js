'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { boot, until, makeMsg, lastBody, bodies, UIDS, clearCooldowns } = require('./helpers');
const cgBank = require('../systems/questions/cg.json');

const BOT_ID = 'BOT_MOCK_000000';

/* Réponse au message QUESTION courant du bot (mode REPLY obligatoire). */
function answerMsg(bot, threadID, uid, text) {
  const session = bot.sessions.get(threadID, 'quiz');
  assert.ok(session && session.currentQuestionID, 'question active avec messageID');
  return makeMsg(threadID, uid, text, {
    messageReply: { senderID: BOT_ID, messageID: session.currentQuestionID },
  });
}

/*
 * Attend qu'un cadre correspondant à `re` apparaisse parmi les corps envoyés
 * APRÈS l'indice `from` (les reveal éphémères ne restent que quelques ms en
 * tête de file : on balaie tout l'historique du mock, pas seulement le dernier).
 * IMPORTANT : capturer `from` AVANT le message déclencheur (le lancement du
 * quiz part pendant le handleMessage).
 */
async function nextFrame(adapter, re, ms = 15000, from = 0) {
  const ok = await until(() => bodies(adapter).slice(from).some((b) => re.test(b)), ms);
  if (!ok) return null;
  return bodies(adapter).slice(from).find((b) => re.test(b)) || null;
}

test('Xquiz v3 : question TAGUÉE + consigne REPLY + flux complet', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  assert.ok(lastBody(adapter).includes('CHOOSE YOUR CATEGORY'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  assert.ok(lastBody(adapter).includes('NOMBRE DE QUESTIONS'));
  assert.ok(/5\s+\/\s+10\s+\/\s+15/.test(lastBody(adapter)), 'choix 5/10/15 proposé');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '10'));
  const launch = await nextFrame(adapter, /QUIZ LANCÉ/, 15000, from);
  assert.ok(launch, 'annonce de lancement');
  assert.ok(launch.includes('Thème : CG'));
  assert.ok(launch.includes('10'));
  assert.ok(launch.includes('Tout le monde peut jouer'));
  const q = await nextFrame(adapter, /QUESTION 1\/10/, 15000, from);
  assert.ok(q, 'première question posée au groupe');
  // 📢 Question TAGUÉE : mentions + membres du groupe
  const qIdx = bodies(adapter).slice(from).findIndex((b) => /QUESTION 1\/10/.test(b));
  const qPayload = adapter.sent[from + qIdx].payload;
  assert.ok(qPayload.mentions && Object.keys(qPayload.mentions).length >= 2, 'le groupe est tagué sur la question');
  assert.ok(q.includes('@Shadow'), 'le lanceur figure dans les tags');
  assert.ok(q.includes('RÉPONDEZ à ce message'), 'consigne REPLY affichée');
  const session = bot.sessions.get('thread-1', 'quiz');
  assert.ok(session.currentQuestionID, 'messageID de la question capturé');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

test('FIX VOL DE POINTS : le point va à celui qui RÉPOND (reply), tagué sur l’annonce', async () => {
  const { bot, adapter, db } = await boot();
  clearCooldowns(bot);
  db.ensureUser(UIDS.shadow, 'Shadow');
  db.ensureUser(UIDS.paul, 'Paul');
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz')); // Shadow lance
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '10'));
  await nextFrame(adapter, /QUIZ LANCÉ/, 15000, from);
  const q = await nextFrame(adapter, /QUESTION 1\/10/, 15000, from);
  assert.ok(q, 'question 1 posée');

  // Paul (PAS le lanceur) répond en REPLY à la question du bot
  const qText = (q.split('\n').find((l) => l.trim().startsWith('🧠')) || '').replace(/^\s*🧠\s*/, '').trim();
  const item = cgBank.find((x) => x.q === qText);
  assert.ok(item, 'question connue');
  await bot.handleMessage(answerMsg(bot, 'thread-1', UIDS.paul, item.answer));

  const scored = await nextFrame(adapter, /prend le point|CLASSEMENT/, 20000, from);
  assert.ok(scored, 'message de point');
  assert.ok(scored.includes('@Paul'), 'Paul est TAGUÉ sur l’annonce');
  const session = bot.sessions.get('thread-1', 'quiz');
  assert.ok(session.scores.get(UIDS.paul), 'PAUL (le répondeur) a le point');
  assert.ok(!session.scores.get(UIDS.shadow), 'le lanceur n’a PAS volé le point');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

test('plusieurs essais : une mauvaise réponse NE BLOQUE PAS (pas de frame RATÉ)', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '10'));
  const q = await nextFrame(adapter, /QUESTION 1\/10/, 15000, from);
  assert.ok(q, 'question 1 posée');

  const qText = (q.split('\n').find((l) => l.trim().startsWith('🧠')) || '').replace(/^\s*🧠\s*/, '').trim();
  const item = cgBank.find((x) => x.q === qText);
  const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const options = [...q.matchAll(/([A-F])\)\s*(.+)/g)].map((m) => ({ letter: m[1], text: m[2].trim() }));
  const goodLetter = (options.find((o) => norm(o.text) === norm(item.answer)) || {}).letter || 'A';
  const wrong = goodLetter === 'A' ? 'B' : 'A';

  // 1er essai : faux → silencieux, pas de blocage
  await bot.handleMessage(answerMsg(bot, 'thread-1', UIDS.shadow, wrong));
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(!bodies(adapter).slice(from).some((b) => b.includes('RATÉ')), 'aucun message « RATÉ »');
  const session = bot.sessions.get('thread-1', 'quiz');
  assert.strictEqual(session.awaitingAnswer, true, 'toujours possible de répondre');

  // 2e essai : bon → Shadow marque
  await bot.handleMessage(answerMsg(bot, 'thread-1', UIDS.shadow, item.answer));
  const scored = await nextFrame(adapter, /prend le point|CLASSEMENT/, 20000, from);
  assert.ok(scored, 'le 2e essai marque');
  assert.ok(session.scores.get(UIDS.shadow), 'Shadow a son point après réessai');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

test('réponse SANS reply au message de la question → pas comptée', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '10'));
  const q = await nextFrame(adapter, /QUESTION 1\/10/, 15000, from);
  const qText = (q.split('\n').find((l) => l.trim().startsWith('🧠')) || '').replace(/^\s*🧠\s*/, '').trim();
  const item = cgBank.find((x) => x.q === qText);

  // Bonne réponse… mais SANS reply au message de la question
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, item.answer));
  await new Promise((r) => setTimeout(r, 400));
  const session = bot.sessions.get('thread-1', 'quiz');
  assert.ok(!session.scores.get(UIDS.paul), 'pas de point sans reply');
  assert.strictEqual(session.awaitingAnswer, true, 'la question reste ouverte');

  // Puis en reply → ça compte
  await bot.handleMessage(answerMsg(bot, 'thread-1', UIDS.paul, item.answer));
  await nextFrame(adapter, /prend le point|CLASSEMENT/, 20000, from);
  assert.ok(session.scores.get(UIDS.paul), 'le reply marque');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

test('reply à une ANCIENNE question (ID périmé) → pas comptée', async () => {
  const { bot, adapter } = await boot();
  bot.config.games.quizTimeoutMs = 600;
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  await nextFrame(adapter, /QUESTION 1\/5/, 15000, from);
  const session = bot.sessions.get('thread-1', 'quiz');
  const staleID = session.currentQuestionID;

  // On attend la question 2 (temps écoulé sur la 1)
  const timeoutMsg = await nextFrame(adapter, /TEMPS ÉCOULÉ/, 8000, from);
  assert.ok(timeoutMsg, 'timeout de la question 1');
  // Le messageID de la question arrive via le callback d'envoi (tick suivant) :
  // on attend le CHANGEMENT d'ID, pas seulement l'apparition du cadre.
  await until(() => session.currentQuestionID && session.currentQuestionID !== staleID, 8000);
  assert.ok(session.currentQuestionID && session.currentQuestionID !== staleID, 'nouvelle question = nouveau messageID');

  // Réponse à l'ANCIENNE question → ignorée
  const q2 = session.questions[1];
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, q2.answer, {
    messageReply: { senderID: BOT_ID, messageID: staleID },
  }));
  await new Promise((r) => setTimeout(r, 400));
  assert.ok(!session.scores.get(UIDS.paul), 'pas de point sur une question périmée');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

test('personne ne répond → « Temps écoulé, réponse: X » → question suivante', async () => {
  const { bot, adapter } = await boot();
  bot.config.games.quizTimeoutMs = 800; // accélérer le test
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  await nextFrame(adapter, /QUESTION 1\/5/, 15000, from);
  const timeoutMsg = await nextFrame(adapter, /TEMPS ÉCOULÉ/, 8000, from);
  assert.ok(timeoutMsg, 'annonce timeout');
  assert.ok(timeoutMsg.includes('Réponse :'), 'réponse révélée');
  const next = await nextFrame(adapter, /QUESTION 2\/5/, 8000, from);
  assert.ok(next, 'question suivante lancée');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

test('fin du quiz : classement général avec gains pour le joueur', async () => {
  const { bot, adapter, db } = await boot();
  bot.config.games.quizTimeoutMs = 900;
  clearCooldowns(bot);
  db.ensureUser(UIDS.shadow, 'Shadow');
  db.ensureUser(UIDS.paul, 'Paul');
  let cursor = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));

  // Jouer les 5 questions : Paul répond (en reply) correctement à chaque fois
  let finished = false;
  for (let guard = 0; guard < 40 && !finished; guard++) {
    const appeared = await until(() => bodies(adapter).slice(cursor).some((b) => /QUESTION \d+\/\d+|CLASSEMENT GÉNÉRAL/.test(b)), 12000);
    if (!appeared) break;
    const rel = bodies(adapter).slice(cursor);
    const i = rel.findIndex((b) => /QUESTION \d+\/\d+|CLASSEMENT GÉNÉRAL/.test(b));
    const body = rel[i];
    cursor = cursor + i + 1;
    if (body.includes('CLASSEMENT GÉNÉRAL')) {
      assert.ok(body.includes('Paul'), 'Paul au classement');
      finished = true;
      break;
    }
    const qText = (body.split('\n').find((l) => l.trim().startsWith('🧠')) || '').replace(/^\s*🧠\s*/, '').trim();
    const item = cgBank.find((x) => x.q === qText);
    if (!item) break;
    await bot.handleMessage(answerMsg(bot, 'thread-1', UIDS.paul, item.answer));
  }
  assert.ok(finished, 'le quiz s’est terminé avec le classement');
  const final = bodies(adapter).reverse().find((b) => b.includes('CLASSEMENT GÉNÉRAL'));
  assert.ok(final, 'classement général affiché');
  const paul = db.getUser(UIDS.paul);
  assert.ok(paul.xcoins > 0, 'gains crédités au joueur');
  assert.strictEqual(paul.stats.quizPlayed, 1);
  assert.ok(bot.sessions.get('thread-1', 'quiz') === null, 'session purgée');
});

test('seul le lanceur navigue la configuration ; un autre ne peut pas annuler en jeu', async () => {
  const { bot, adapter } = await boot();
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'CG')); // pas le lanceur → ignoré
  assert.ok(lastBody(adapter).includes('CHOOSE YOUR CATEGORY'), 'toujours en attente de catégorie');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  await nextFrame(adapter, /QUESTION 1\/5/, 15000, from);
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'cancel')); // pas le lanceur
  const refused = await nextFrame(adapter, /Seul le lanceur/, 5000, from);
  assert.ok(refused, 'annulation refusée pour un tiers');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
  assert.strictEqual(bot.sessions.get('thread-1', 'quiz'), null);
});

test('plusieurs quiz simultanés dans des groupes différents (scope par groupe)', async () => {
  const { bot, adapter } = await boot();
  await bot.handleMessage(makeMsg('group-A', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('group-B', UIDS.paul, 'Xquiz'));
  await bot.handleMessage(makeMsg('group-A', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('group-B', UIDS.paul, 'ID'));
  assert.ok(bot.sessions.get('group-A', 'quiz'), 'quiz A actif');
  assert.ok(bot.sessions.get('group-B', 'quiz'), 'quiz B actif');
  await bot.handleMessage(makeMsg('group-A', UIDS.shadow, 'cancel'));
  await bot.handleMessage(makeMsg('group-B', UIDS.paul, 'cancel'));
});
