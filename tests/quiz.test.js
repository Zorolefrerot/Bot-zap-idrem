'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { boot, until, makeMsg, lastBody, UIDS, clearCooldowns } = require('./helpers');

test('Xquiz : flux complet CG → 10 questions → résultat et gains', async () => {
  const { bot, adapter, db } = await boot();
  clearCooldowns(bot);
  const balanceBefore = db.ensureUser(UIDS.shadow).xcoins;

  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  assert.ok(lastBody(adapter).includes('CHOOSE YOUR CATEGORY'));

  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  assert.ok(lastBody(adapter).includes('NOMBRE DE QUESTIONS'));

  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '10'));
  const allBodies = require('./helpers').bodies(adapter);
  assert.ok(allBodies.some((b) => b.includes('XQUIZ LANCÉ')), 'confirmation de lancement');
  await until(() => /Q 1\/10/.test(lastBody(adapter)), 8000);
  assert.ok(/Q 1\/10/.test(lastBody(adapter)), 'première question posée');

  // Répondre aux 10 questions : on relit la question posée et on répond
  // avec le texte exact de la réponse (toujours accepté par le moteur).
  const cgBank = require('../systems/questions/cg.json');
  let answered = 0;
  let lastFrame = '';
  for (let guard = 0; guard < 200 && answered < 10; guard++) {
    // Attendre un NOUVEAU cadre-question (jamais répondre 2x sur le même)
    const progressOk = await until(() => {
      const b = lastBody(adapter);
      return b !== lastFrame && /Q \d+\/10/.test(b);
    }, 15000);
    if (!progressOk) break;
    const body = lastBody(adapter);
    lastFrame = body;
    const qLine = body.split('\n').find((l) => l.trim().startsWith('🧠'));
    const qText = qLine ? qLine.replace(/^\s*🧠\s*/, '').trim() : '';
    const item = cgBank.find((q) => q.q === qText);
    assert.ok(item, `question inconnue: ${qText}`);
    await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, item.answer));
    answered++;
  }
  assert.strictEqual(answered, 10);

  const finished = await until(() => lastBody(adapter).includes('Quiz terminé') || lastBody(adapter).includes('Score final'), 8000);
  assert.ok(finished, 'la session doit se terminer par les résultats');
  const body = lastBody(adapter);
  assert.ok(/Score final : \d+\/10/.test(body));
  assert.ok(body.includes('Gain :'));
  assert.ok(body.includes('XCoins'));

  const user = db.getUser(UIDS.shadow);
  assert.strictEqual(user.stats.quizPlayed, 1);
  assert.ok(user.stats.quizBestScore >= 1);
  assert.ok(user.xcoins > balanceBefore);
  assert.ok(bot.sessions.get('thread-1', `quiz:${UIDS.shadow}`) === null); // session purgée
});

test('Xquiz : mauvaise catégorie → erreur puis reprise', async () => {
  const { bot, adapter } = await boot();
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CUISINE'));
  assert.ok(lastBody(adapter).includes('Catégorie inconnue'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'MULTIVERS'));
  assert.ok(lastBody(adapter).includes('NOMBRE DE QUESTIONS'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '7'));
  assert.ok(lastBody(adapter).includes('Choisis')); // 7 n'est pas dans 10/20/30/40/50
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
  assert.ok(lastBody(adapter).includes('annulé'));
});

test('Xquiz : isolation des joueurs — un autre membre ne perturbe pas la session', async () => {
  const { bot, adapter, db } = await boot();
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '10'));
  await until(() => /Q 1\/10/.test(lastBody(adapter)), 8000);

  // Paul (autre joueur) tente de répondre — ignoré par la session de Shadow
  const scoreBefore = 0;
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'A'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'B'));
  // La session appartient toujours à Shadow : Paul ne peut pas démarrer la sienne dans le même… si !
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'Xquiz'));
  assert.ok(lastBody(adapter).includes('CHOOSE YOUR CATEGORY')); // session séparée pour Paul

  // Shadow poursuit sans interference
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'cancel'));
  assert.strictEqual(db.getUser(UIDS.shadow).stats.quizPlayed, scoreBefore);
});

test('plusieurs quiz simultanés dans des groupes différents', async () => {
  const { bot, adapter } = await boot();
  await bot.handleMessage(makeMsg('group-A', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('group-B', UIDS.paul, 'Xquiz'));
  await bot.handleMessage(makeMsg('group-A', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('group-B', UIDS.paul, 'ID'));
  const lastA = adapter.sent.filter((s) => s.threadID === 'group-A').map((s) => s.payload.body || '').pop();
  const lastB = adapter.sent.filter((s) => s.threadID === 'group-B').map((s) => s.payload.body || '').pop();
  const { unbold } = require('./helpers');
  assert.ok(unbold(lastA).includes('NOMBRE DE QUESTIONS'));
  assert.ok(unbold(lastB).includes('NOMBRE DE QUESTIONS'));
  // Les deux sessions coexistent
  assert.ok(bot.sessions.get('group-A', `quiz:${UIDS.shadow}`));
  assert.ok(bot.sessions.get('group-B', `quiz:${UIDS.paul}`));
});

test('régression : cancel pendant la pause inter-questions → aucune question fantôme', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('ghost-thread', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('ghost-thread', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('ghost-thread', UIDS.shadow, '10'));
  await until(() => /Q 1\/10/.test(lastBody(adapter)), 8000);
  // Répondre puis annuler immédiatement (pendant la pause de 15 ms si mauvaise réponse,
  // sinon la session se termine proprement — dans les deux cas, aucun message après).
  const body = lastBody(adapter);
  const qLine = body.split('\n').find((l) => l.trim().startsWith('🧠'));
  const qText = qLine ? qLine.replace(/^\s*🧠\s*/, '').trim() : '';
  const item = require('../systems/questions/cg.json').find((q) => q.q === qText);
  await bot.handleMessage(makeMsg('ghost-thread', UIDS.shadow, item ? item.answer : 'A'));
  await bot.handleMessage(makeMsg('ghost-thread', UIDS.shadow, 'cancel'));
  const countAfterCancel = adapter.sent.length;
  // Laisser largement le temps à un éventuel timer orphelin de tirer
  await new Promise((r) => setTimeout(r, 400));
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(
    adapter.sent.length,
    countAfterCancel,
    'aucune question/message fantôme ne doit arriver après le cancel'
  );
  assert.strictEqual(bot.sessions.get('ghost-thread', `quiz:${UIDS.shadow}`), null);
});
