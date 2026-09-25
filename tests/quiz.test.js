'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { boot, until, makeMsg, lastBody, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
const cgBank = require('../systems/questions/cg.json');
const capitaleBank = require('../systems/questions/capitale.json');
const drapeauBank = require('../systems/questions/drapeau.json');

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

/* Extrait le libellé de la question courante depuis un cadre (🧩 / 🌍 / drapeau). */
function questionLabel(frame) {
  const m = frame.split('\n').find((l) => l.includes('🧩') || l.includes('🌍') || /🇦-🇿|[\uD83C][\uDDE6-\uDDFF]/.test(l));
  if (!m) return null;
  return m.replace(/^\s*(🧩|🌍)\s*/, '').replace(/(Pays)\s*:\s*/, '').trim();
}

/* Trouve la réponse attendue d'une question dans la banque donnée. */
function findInBank(bank, label) {
  const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return bank.find((q) => norm(q.q).includes(norm(label)) || norm(label).includes(norm(q.q)));
}

test('Xquiz v4 : 5 catégories proposées + flux complet CG en réponse LIBRE', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  const start = lastBody(adapter);
  for (const cat of ['ID', 'MULTIVERS', 'CG', 'CAPITALE', 'DRAPEAU']) {
    assert.ok(start.includes(cat), `catégorie ${cat} proposée`);
  }
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  assert.ok(lastBody(adapter).includes('NOMBRE DE QUESTIONS'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '10'));
  const launch = await nextFrame(adapter, /QUIZ LANCÉ/, 15000, from);
  assert.ok(launch, 'annonce de lancement');
  assert.ok(launch.includes('Thème : CG'));
  assert.ok(launch.includes('10'));
  assert.ok(launch.includes('Tout le monde peut jouer'));
  const q = await nextFrame(adapter, /QUESTION 1\/10/, 15000, from);
  assert.ok(q, 'première question posée');
  assert.ok(!q.includes('Réponds directement'), 'pas d’instructions répétées sous la question');
  assert.ok(!/[▸]\s*[A-F]\)/.test(q), 'PLUS de QCM (aucune proposition A-D)');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

test('FIX VOL DE POINTS : +10 au senderID qui répond, tagué sur l’annonce', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '10'));
  await nextFrame(adapter, /QUIZ LANCÉ/, 15000, from);
  const q = await nextFrame(adapter, /QUESTION 1\/10/, 15000, from);
  assert.ok(q, 'question 1 posée');

  // Paul répond le premier correctement (prénom/nom seul suffit)
  const label = questionLabel(q);
  const item = findInBank(cgBank, label);
  assert.ok(item, `question connue: ${label}`);
  const answerWord = item.a.split(' ')[0]; // premier mot = prénom OU nom
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, answerWord));

  const scored = await nextFrame(adapter, /prend le point|CLASSEMENT/, 20000, from);
  assert.ok(scored, 'message de point');
  assert.ok(scored.includes('@Paul'), 'Paul TAGUÉ');
  assert.ok(scored.includes('+10'), '+10 points');
  const session = bot.sessions.get('thread-1', 'quiz');
  assert.ok(session.scores.get(UIDS.paul), 'PAUL (le répondeur) a les points');
  assert.strictEqual(session.scores.get(UIDS.paul).score, 10);
  assert.ok(!session.scores.get(UIDS.shadow), 'le lanceur n’a rien volé');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

test('TOLÉRANCE : accent, variante (alts) et petite faute acceptés', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  await nextFrame(adapter, /QUESTION 1\/5/, 15000, from);
  const session = bot.sessions.get('thread-1', 'quiz');
  const item = session.questions[0];

  // 1) faute de frappe : retirer une lettre au dernier mot
  const words = item.a.replace(/[^a-zA-Z0-9 ]/g, '').split(' ').filter(Boolean);
  let last = words[words.length - 1];
  const typo = last.length > 3 ? last.slice(0, -1) : last + 'x';
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, typo));
  const t1 = await nextFrame(adapter, /prend le point|CLASSEMENT|TEMPS/, 15000, from);
  if (t1 && t1.includes('prend le point')) {
    await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
    return; // la faute a été acceptée comme attendu
  }
  // (si la question a expiré entre-temps — jamais attendu ici)
  assert.fail('la faute de frappe n’a pas été acceptée');
});

test('mauvaise réponse SILENCIEUSE → on peut retenter tout de suite', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  await nextFrame(adapter, /QUESTION 1\/5/, 15000, from);
  const session = bot.sessions.get('thread-1', 'quiz');
  const item = session.questions[0];
  const wrong = /gojo/i.test(item.a) ? 'ichigo' : 'gojo'; // jamais la bonne

  const before = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, wrong));
  await new Promise((r) => setTimeout(r, 900));
  assert.strictEqual(adapter.sent.length, before, 'aucun message sur une mauvaise réponse');
  assert.strictEqual(session.awaitingAnswer, true, 'la question reste ouverte');

  // Réessai correct
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, item.a));
  await until(() => session.scores.get(UIDS.shadow), 15000);
  assert.ok(session.scores.get(UIDS.shadow), 'le 2e essai marque');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

test('CAPITALE : le bot donne un pays, la capitale est la réponse (alts acceptés)', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CAPITALE'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  await nextFrame(adapter, /QUESTION 1\/5/, 15000, from);
  const session = bot.sessions.get('thread-1', 'quiz');
  assert.strictEqual(session.category, 'capitale');
  const item = session.questions[0];
  const q = await nextFrame(adapter, /Capitale \?/, 5000, from);
  assert.ok(q, 'cadre capitales');
  assert.ok(q.includes(item.q), `pays affiché: ${item.q}`);
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, item.a));
  await until(() => session.scores.get(UIDS.paul), 15000);
  assert.ok(session.scores.get(UIDS.paul), 'capitale acceptée');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

test('DRAPEAU : le bot envoie un drapeau, le pays est la réponse', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'DRAPEAU'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  await nextFrame(adapter, /QUESTION 1\/5/, 15000, from);
  const session = bot.sessions.get('thread-1', 'quiz');
  assert.strictEqual(session.category, 'drapeau');
  const item = session.questions[0];
  const q = await nextFrame(adapter, /Quel pays \?/, 5000, from);
  assert.ok(q, 'cadre drapeau');
  assert.ok(q.includes(item.q), `drapeau affiché (${item.q})`);
  // Réponse avec la variante EN si elle existe, sinon le nom principal
  const answer = item.alts && item.alts[0] ? item.alts[0] : item.a;
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, answer));
  await until(() => session.scores.get(UIDS.paul), 15000);
  assert.ok(session.scores.get(UIDS.paul), 'pays accepté (nom principal ou variante)');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

test('personne ne répond → « Temps écoulé + réponse » → question suivante', async () => {
  const { bot, adapter } = await boot();
  bot.config.games.quizTimeoutMs = 800;
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  await nextFrame(adapter, /QUESTION 1\/5/, 15000, from);
  const timeoutMsg = await nextFrame(adapter, /TEMPS ÉCOULÉ/, 8000, from);
  assert.ok(timeoutMsg, 'annonce timeout');
  assert.ok(timeoutMsg.includes('Réponse'), 'réponse révélée');
  const next = await nextFrame(adapter, /QUESTION 2\/5/, 8000, from);
  assert.ok(next, 'question suivante lancée');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

test('fin du quiz : 🏁 CLASSEMENT GÉNÉRAL + gains XCoins', async () => {
  const { bot, adapter, db } = await boot();
  bot.config.games.quizTimeoutMs = 900;
  clearCooldowns(bot);
  db.ensureUser(UIDS.shadow, 'Shadow');
  db.ensureUser(UIDS.paul, 'Paul');
  let cursor = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));

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
    const label = questionLabel(body);
    const item = findInBank(cgBank, label);
    if (!item) break;
    await bot.handleMessage(makeMsg('thread-1', UIDS.paul, item.a));
  }
  assert.ok(finished, 'le quiz s’est terminé avec le classement');
  const final = bodies(adapter).reverse().find((b) => b.includes('CLASSEMENT GÉNÉRAL'));
  assert.ok(final, 'classement général affiché');
  const paul = db.getUser(UIDS.paul);
  assert.ok(paul.xcoins > 0, 'gains crédités au joueur');
  assert.ok(bot.sessions.get('thread-1', 'quiz') === null, 'session purgée');
});

test('seul le lanceur navigue la configuration ; un autre ne peut pas annuler', async () => {
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

test('plusieurs quiz simultanés dans des groupes différents + banques 220+', async () => {
  const { bot } = await boot();
  await bot.handleMessage(makeMsg('group-A', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('group-B', UIDS.paul, 'Xquiz'));
  await bot.handleMessage(makeMsg('group-A', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('group-B', UIDS.paul, 'ID'));
  assert.ok(bot.sessions.get('group-A', 'quiz'), 'quiz A actif');
  assert.ok(bot.sessions.get('group-B', 'quiz'), 'quiz B actif');
  await bot.handleMessage(makeMsg('group-A', UIDS.shadow, 'cancel'));
  await bot.handleMessage(makeMsg('group-B', UIDS.paul, 'cancel'));
  const { loadBank } = require('../systems/questions');
  for (const [cat, min] of [['id', 220], ['multivers', 220], ['cg', 220], ['capitale', 200], ['drapeau', 200]]) {
    assert.ok(loadBank(cat).length >= min, `banque ${cat}: ${loadBank(cat).length} >= ${min}`);
  }
});
