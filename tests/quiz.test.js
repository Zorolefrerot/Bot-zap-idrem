'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { boot, until, makeMsg, lastBody, bodies, UIDS, NAME_TO_UID, clearCooldowns } = require('./helpers');
const cgBank = require('../systems/questions/cg.json');

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

test('Xquiz v2 : flux complet CG → 10 → « tout le monde peut jouer » → première question', async () => {
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
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

test('FIX VOL DE POINTS : le point va à celui qui RÉPOND, pas au lanceur', async () => {
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

  // Paul (PAS le lanceur) répond le premier correctement
  const body = q;
  const qLine = body.split('\n').find((l) => l.trim().startsWith('🧠'));
  const qText = qLine ? qLine.replace(/^\s*🧠\s*/, '').trim() : '';
  const item = cgBank.find((q) => q.q === qText);
  assert.ok(item, 'question connue');
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, item.answer));

  const scored = await nextFrame(adapter, /Point pour|marque|prend le point|CLASSEMENT/, 20000);
  assert.ok(scored, 'message de point');
  const session = bot.sessions.get('thread-1', 'quiz');
  if (session && session.scores) {
    const paulScore = session.scores.get(UIDS.paul);
    const shadowScore = session.scores.get(UIDS.shadow);
    assert.ok(paulScore && paulScore.score >= 1, 'PAUL (le répondeur) a le point');
    assert.ok(!shadowScore || shadowScore.score === 0, 'le lanceur n’a PAS volé le point');
  }
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

test('mauvaise réponse → exclu de la question ; un autre joueur peut encore marquer', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '10'));
  const q = await nextFrame(adapter, /QUESTION 1\/10/, 15000, from);
  assert.ok(q, 'question 1 posée');

  // Shadow se trompe VOLONTAIREMENT : on identifie la bonne lettre via la banque
  // et on répond une AUTRE lettre (jamais la bonne, pas de hasard).
  const qText = (q.split('\n').find((l) => l.trim().startsWith('🧠')) || '').replace(/^\s*🧠\s*/, '').trim();
  const item = cgBank.find((x) => x.q === qText);
  assert.ok(item, 'question connue');
  const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const options = [...q.matchAll(/([A-F])\)\s*(.+)/g)].map((m) => ({ letter: m[1], text: m[2].trim() }));
  const goodLetter = (options.find((o) => norm(o.text) === norm(item.answer)) || {}).letter || 'A';
  const wrong = goodLetter === 'A' ? 'B' : 'A';
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, wrong));
  const missed = await nextFrame(adapter, /RATÉ/, 5000);
  assert.ok(missed && missed.includes('ne peux plus répondre'), 'exclusion de la question annoncée');

  // Paul répond correctement malgré l'erreur de Shadow
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, item.answer));
  await nextFrame(adapter, /Point pour|marque|prend le point|CLASSEMENT/, 20000);
  const session = bot.sessions.get('thread-1', 'quiz');
  if (session && session.scores) {
    assert.ok(session.scores.get(UIDS.paul), 'Paul marque après l’échec de Shadow');
  }
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

test('personne ne répond → « Temps écoulé, réponse: X » → question suivante', async () => {
  const { bot, adapter } = await boot();
  bot.config.games.quizTimeoutMs = 800; // accélérer le test (mais laisse le temps de répondre)
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

test('fin du quiz : classement général avec vainqueur et gains', async () => {
  const { bot, adapter, db } = await boot();
  bot.config.games.quizTimeoutMs = 800;
  clearCooldowns(bot);
  db.ensureUser(UIDS.shadow, 'Shadow');
  db.ensureUser(UIDS.paul, 'Paul');
  const beforeShadow = db.ensureUser(UIDS.shadow).xcoins;
  let cursor = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));

  // Jouer les 5 questions : Paul répond correctement à chaque fois
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
    const item = cgBank.find((q) => q.q === qText);
    if (!item) break;
    await bot.handleMessage(makeMsg('thread-1', UIDS.paul, item.answer));
  }
  assert.ok(finished, 'le quiz s’est terminé avec le classement');
  const final = bodies(adapter).reverse().find((b) => b.includes('CLASSEMENT GÉNÉRAL'));
  assert.ok(final, 'classement général affiché');
  const paul = db.getUser(UIDS.paul);
  assert.ok(paul.xcoins > 0, 'gains crédités au joueur');
  assert.strictEqual(paul.stats.quizPlayed, 1);
  assert.ok(bot.sessions.get('thread-1', 'quiz') === null, 'session purgée');
  void beforeShadow;
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
