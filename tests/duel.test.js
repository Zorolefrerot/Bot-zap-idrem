'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { boot, until, makeMsg, lastBody, bodies, UIDS, NAME_TO_UID, clearCooldowns } = require('./helpers');
const cgBank = require('../systems/questions/duel-cg.json');

/* Joue un duel automatiquement.
 * doubleFail : index d'une question où LES DEUX joueurs échouent volontairement
 *              (double échec → personne ne marque → le perdant logique est le
 *              joueur qui avait la main sur cette question). */
async function playDuel(adapter, bot, threadID, doubleFail = -1) {
  let lastFrame = '';
  for (let guard = 0; guard < 200; guard++) {
    // Attendre un NOUVEAU cadre (question ou fin) — évite de répondre
    // deux fois à la même question pendant la pause inter-questions.
    const ok = await until(() => {
      const b = lastBody(adapter);
      return b !== lastFrame && (/Q \d+\/\d+/.test(b) || /DUEL TERMINÉ/.test(b));
    }, 15000);
    if (!ok) break;
    const body = lastBody(adapter);
    lastFrame = body;
    if (body.includes('DUEL TERMINÉ')) return body;
    const m = body.match(/Q (\d+)\/(\d+)/);
    const idx = Number(m[1]) - 1;
    // Qui a la main ?
    const turnLine = body.split('\n').find((l) => l.includes('Au tour de'));
    const name = turnLine.replace(/.*Au tour de\s*/, '').trim().split(/\s+/)[0];
    const uid = NAME_TO_UID[name];
    assert.ok(uid, `joueur inconnu: ${name}`);
    // Trouver la question puis la bonne réponse dans la banque
    const qLine = body.split('\n').find((l) => l.trim().startsWith('🧠'));
    const qText = qLine ? qLine.replace(/^\s*🧠\s*/, '').trim() : '';
    const item = cgBank.find((q) => q.q === qText);
    assert.ok(item, `question inconnue: ${qText}`);
    if (idx === doubleFail) {
      // Mauvaise lettre déterministe : on repère la VRAIE bonne option,
      // puis on répond une autre lettre (échec garanti → double échec).
      const optionLetters = [...body.matchAll(/([A-F])\) (.+)/g)].map((mm) => ({
        letter: mm[1],
        text: mm[2].trim(),
      }));
      const correct = optionLetters.find((o) => o.text === item.answer);
      const wrong = correct && correct.letter === 'A' ? 'B' : 'A';
      await bot.handleMessage(makeMsg(threadID, uid, wrong));
      continue;
    }
    await bot.handleMessage(makeMsg(threadID, uid, item.answer));
  }
  return lastBody(adapter);
}

test('Xduel : mise refusée si trop élevée, puis déroulé complet et gains', async () => {
  const { bot, adapter, db } = await boot();
  clearCooldowns(bot);
  db.ensureUser(UIDS.shadow).xcoins = 1000;
  db.ensureUser(UIDS.paul).xcoins = 1000;
  db.users.save();

  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xduel'));
  assert.ok(lastBody(adapter).includes('PREMIER DUELLISTE'));

  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'moi'));
  assert.ok(lastBody(adapter).includes('Duelliste 1 : Shadow'));
  assert.ok(lastBody(adapter).includes('DEUXIEME DUELLISTE'));

  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '@Paul', {
    mentions: { [UIDS.paul]: '@Paul' },
  }));
  assert.ok(lastBody(adapter).includes('CHOOSE YOUR CATEGORY'));

  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  assert.ok(lastBody(adapter).includes('NOMBRE DE QUESTIONS'));

  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '10'));
  assert.ok(lastBody(adapter).includes('MISE'));
  assert.ok(lastBody(adapter).includes('Mise max : 1 000') || lastBody(adapter).includes('Mise max : 1000'));

  // Mise au-dessus du solde → refus, pas de débit
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '999999'));
  assert.ok(lastBody(adapter).includes('MISE REFUSÉE'));
  assert.strictEqual(db.getUser(UIDS.shadow).xcoins, 1000);

  // Mise valide → débit immédiat des deux joueurs
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '100'));
  assert.ok(bodies(adapter).some((b) => b.includes('DUEL LANCÉ')), 'annonce du duel');
  assert.strictEqual(db.getUser(UIDS.shadow).xcoins, 900);
  assert.strictEqual(db.getUser(UIDS.paul).xcoins, 900);

  // Double échec sur Q3 → le joueur qui avait la main perd sa question → 5-4
  const result = await playDuel(adapter, bot, 'thread-1', 2);
  assert.ok(result.includes('DUEL TERMINÉ'), 'doit se terminer');
  assert.ok(result.includes('VAINQUEUR'));
  assert.ok(/Score final : [45] — [45]/.test(result));

  const s = db.getUser(UIDS.shadow);
  const p = db.getUser(UIDS.paul);
  const winner = s.xcoins > p.xcoins ? s : p;
  const loser = winner === s ? p : s;
  assert.strictEqual(winner.xcoins, 900 + 200); // cagne = mise x2
  assert.strictEqual(loser.xcoins, 900);
  assert.strictEqual(winner.stats.duelWins, 1);
  assert.strictEqual(loser.stats.duelLosses, 1);
  assert.strictEqual(db.stats.data.duelsPlayed >= 1, true);
  assert.strictEqual(bot.sessions.get('thread-1', 'duel'), null);
});

test('Xduel : égalité → mises remboursées intégralement', async () => {
  const { bot, adapter, db } = await boot();
  db.ensureUser(UIDS.shadow).xcoins = 800;
  db.ensureUser(UIDS.paul).xcoins = 800;
  db.users.save();

  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xduel'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'moi'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '@Paul', { mentions: { [UIDS.paul]: '@Paul' } }));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '10'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '50'));
  assert.strictEqual(db.getUser(UIDS.shadow).xcoins, 750);

  const result = await playDuel(adapter, bot, 'thread-1'); // personne ne rate → 5-5
  assert.ok(result.includes('ÉGALITÉ'), '5 bonnes réponses chacun → égalité');
  assert.ok(result.includes('Mises remboursées'));
  assert.strictEqual(db.getUser(UIDS.shadow).xcoins, 800);
  assert.strictEqual(db.getUser(UIDS.paul).xcoins, 800);
});

test('Xduel : cancel en cours de mise → remboursement', async () => {
  const { bot, adapter, db } = await boot();
  db.ensureUser(UIDS.shadow).xcoins = 500;
  db.ensureUser(UIDS.paul).xcoins = 500;
  db.users.save();

  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xduel'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'moi'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '@Paul', { mentions: { [UIDS.paul]: '@Paul' } }));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '10'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '200'));
  assert.strictEqual(db.getUser(UIDS.shadow).xcoins, 300);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
  assert.ok(lastBody(adapter).includes('remboursées'));
  assert.strictEqual(db.getUser(UIDS.shadow).xcoins, 500);
  assert.strictEqual(db.getUser(UIDS.paul).xcoins, 500);
  assert.strictEqual(bot.sessions.get('thread-1', 'duel'), null);
});

test('Xduel : solde zéro → refus immédiat', async () => {
  const { bot, adapter, db } = await boot();
  db.ensureUser(UIDS.fortiche).xcoins = 0;
  db.users.save();
  await bot.handleMessage(makeMsg('thread-1', UIDS.fortiche, 'Xduel'));
  assert.ok(lastBody(adapter).includes('Solde insuffisant'));
});
