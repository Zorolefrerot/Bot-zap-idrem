'use strict';
/*
 * 🧬 MeR~NeL — tests/undercover.test.js
 * 🎭 Xundercover : mots (anti-répétition), enrôlement 90 s, rôles en PV,
 * indices 15 s (pas de double), vote 75 s, éliminations (UC direct,
 * Mr. White → devinette), cartes (shop/achat/utilisation), Xucrank.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');

const { pickPair } = require('../systems/ucWords');
const { CARDS } = require('../systems/ucCards');

function flushFactory() {
  return async function flush(n = 10) {
    for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
  };
}

async function advanceUntil(t, cond, maxSec = 600) {
  for (let i = 0; i < maxSec / 5 && !cond(); i++) {
    await t.mock.timers.tick(5_000);
    await flushFactory()();
  }
  assert.ok(cond(), 'condition atteinte dans le délai imparti');
}

const QG_TID = '99990000111122';

const flushN = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

/* Lance une partie complète : Xundercover → enrôlement → 90 s → TID → Go. */
async function startGame(t, bot, launcher, uids) {
  const { makeMsg } = require('./helpers');
  await bot.handleMessage(makeMsg('thread-1', launcher, 'Xundercover'));
  for (const uid of uids) {
    await bot.handleMessage(makeMsg('thread-1', uid, 'moi', { messageReply: { senderID: 'BOT_MOCK_000000', messageID: 'recruit' } }));
  }
  await t.mock.timers.tick(90_000);
  await flushN();
  // Le lanceur fournit le TID du QG → rôles envoyés → pause WAITING_GO
  await bot.handleMessage(makeMsg('thread-1', launcher, QG_TID));
  await flushN();
  const session = bot.sessions.get('thread-1', 'xundercover');
  // Le lanceur donne le Go → la partie démarre
  await bot.handleMessage(makeMsg('thread-1', launcher, 'Go'));
  await flushN();
  return session;
}

/* Avance le temps en ré-enclenchant automatiquement les « Go » du lanceur. */
async function advanceWithGo(t, bot, session, launcher, cond, maxLoops = 200) {
  const { makeMsg } = require('./helpers');
  for (let i = 0; i < maxLoops && !cond(); i++) {
    await t.mock.timers.tick(5_000);
    await flushN();
    if (session.state === 'WAITING_GO' && !cond()) {
      await bot.handleMessage(makeMsg('thread-1', launcher, 'Go'));
      await flushN();
    }
  }
  assert.ok(cond(), 'condition atteinte (avec Go)');
}

function harness() {
  const { boot, until, makeMsg, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
  return { boot, until, makeMsg, bodies, unbold, UIDS, clearCooldowns, flush: flushFactory() };
}

async function join(h, bot, adapter, thread, uid, name) {
  await bot.handleMessage(h.makeMsg(thread, uid, 'moi', { messageReply: { senderID: 'BOT_MOCK_000000', messageID: 'recruit' } }));
}

async function tickClueRound(h, bot, count) {
  // Laisser chaque joueur écoulé (indice « — ») : 15 s × joueurs
  for (let i = 0; i < count; i++) {
    bot.mockTick && bot.mockTick();
    h.tick15();
  }
}

test('Xucards : 20 cartes, de 500 à 1 000 000 XCoins, toutes uniques', () => {
  assert.equal(CARDS.length, 20);
  assert.equal(Math.min(...CARDS.map((c) => c.price)), 500);
  assert.equal(Math.max(...CARDS.map((c) => c.price)), 1000000);
  assert.equal(new Set(CARDS.map((c) => c.id)).size, 20);
  assert.equal(new Set(CARDS.map((c) => c.name)).size, 20);
  const sorted = CARDS.map((c) => c.price).sort((a, b) => a - b);
  assert.deepEqual(sorted, CARDS.map((c) => c.price), 'prix croissants par numéro');
});

test('Mots Undercover : ~4000+ mots, mêmes catégories, anti-répétition des couples', () => {
  const WORDS = require('../systems/questions/uc-words.json');
  const total = Object.values(WORDS).reduce((s, v) => s + v.length, 0);
  assert.ok(total >= 3800, `banque de mots suffisante (reçu : ${total})`);
  for (const [cat, words] of Object.entries(WORDS)) {
    assert.ok(words.length >= 2, `catégorie ${cat} jouable`);
  }
  // 400 tirages : un mot civil ne redonne JAMAIS le même undercover
  const store = { history: {}, recent: [] };
  for (let i = 0; i < 400; i++) {
    const { civil, under, categorie } = pickPair(store);
    assert.notEqual(civil.toLowerCase(), under.toLowerCase(), `paire distincte (${civil}/${under})`);
    assert.ok(WORDS[categorie].includes(civil) && WORDS[categorie].includes(under), 'mots de la même catégorie');
    assert.ok(!(store.history[civil] || []).filter((u, idx, arr) => arr.indexOf(u) !== idx).length, `jamais 2× le même couple pour ${civil}`);
  }
  // Récence : pas 2× le même mot civil sur les 8 derniers tirages
  const seen = [];
  for (let i = 0; i < 60; i++) {
    const { civil } = pickPair(store);
    if (seen.length >= 8) {
      assert.ok(!seen.slice(-8).includes(civil.toLowerCase()), `rotation du mot civil (${civil})`);
    }
    seen.push(civil.toLowerCase());
  }
});

test('Xundercover : enrôlement, rôles EN PV, liste des joueurs', async () => {
  const h = harness();
  const { boot, makeMsg, bodies, unbold, UIDS, clearCooldowns, flush } = h;
  const t = require('node:test');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xundercover'));
  assert.ok(bodies(adapter).some((b) => /ENR[ôo]lement/i.test(unbold(b))), 'message d\u2019enrôlement');
  // 4 joueurs répondent « moi » au message du bot
  for (const [uid, name] of [[UIDS.shadow, 'Shadow'], [UIDS.paul, 'Paul'], [UIDS.fortiche, 'Fortiche'], [UIDS.spammer, 'Spammer']]) {
    await bot.handleMessage(makeMsg('thread-1', uid, 'moi', { messageReply: { senderID: 'BOT_MOCK_000000', messageID: 'recruit' } }));
  }
  assert.ok(bodies(adapter).some((b) => /rejoint la partie/.test(unbold(b))), 'confirmations d\u2019enrôlement');
  await t.mock.timers.tick(90_000);
  await flush();
  // Le bot DEMANDE le TID du QG (pas d'envoi PV automatique)
  assert.ok(bodies(adapter).some((b) => /DISTRIBUER LES R[ôo]LES/i.test(unbold(b))), 'demande du TID');
  const session0 = bot.sessions.get('thread-1', 'xundercover');
  assert.equal(session0.state, 'WAITING_TID', 'état WAITING_TID');
  // Le lanceur colle le TID du QG
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, QG_TID));
  await flush();
  assert.ok(bodies(adapter).some((b) => /R[ôo]les envoy[ée]s|R[ôo]LES DEPOS[ée]S|EN ATTENTE DU GO/i.test(unbold(b))), 'annonce QG');
  // Les rôles de CHACUN sont dans le QG (thread = TID fourni)
  const qg = adapter.sent.find((s) => String(s.threadID) === QG_TID && /QG — R[ôo]LES DE LA PARTIE/i.test(unbold(s.payload.body || '')));
  assert.ok(qg, 'message des rôles envoyé AU TID fourni');
  const qgBody = unbold(qg.payload.body);
  for (const name of ['Shadow', 'Paul', 'Fortiche', 'Spammer']) {
    assert.ok(qgBody.includes(name), `rôle de ${name} dans le QG`);
  }
  assert.ok(qgBody.includes('mot :'), 'mots secrets visibles dans le QG');
  const session = bot.sessions.get('thread-1', 'xundercover');
  assert.ok(session && session.pair, 'couple de mots tiré');
  assert.equal(session.distributionTID, QG_TID, 'TID mémorisé');
  // ⏸️ PAUSE : le jeu attend le Go (rien ne démarre sans lui)
  assert.equal(session.state, 'WAITING_GO', 'pause Go après envoi des rôles');
  assert.ok(bodies(adapter).some((b) => /R[ôo]LES ENVOY[ée]S/i.test(unbold(b)) && /Go/i.test(unbold(b))), 'annonce de pause (attente du Go)');
  const beforeGo = bodies(adapter).length;
  // Un NON-lanceur ne peut pas donner le Go
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'Go'));
  await flushN();
  assert.equal(session.state, 'WAITING_GO', 'Go refusé aux non-lanceurs');
  // Le message des rôles du QG s'AUTO-DETRUIT après 10 s
  const roleMsgId = adapter.sent.find((s2) => String(s2.threadID) === QG_TID && /QG — R[ôo]LES/i.test(unbold(s2.payload.body || ''))).id;
  await t.mock.timers.tick(10_000);
  await flushN();
  assert.ok(adapter.unsent.includes(roleMsgId), 'message des rôles supprimé après 10 s');
  // Le lanceur donne le Go → le jeu démarre
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Go'));
  await flushN();
  assert.equal(session.state, 'TURNS', 'Go du lanceur → le tour 1 démarre');
  assert.ok(bodies(adapter).slice(beforeGo).some((b) => /LA PARTIE COMMENCE/i.test(unbold(b))), 'annonce après le Go');
  assert.ok(bodies(adapter).slice(beforeGo).some((b) => /À TOI !/i.test(unbold(b))), 'premier prompt après le Go');
  const roles = [...session.players.values()].map((p) => p.role);
  assert.equal(roles.filter((r) => r === 'mw').length, 1, '1 Mr. White');
  assert.equal(roles.filter((r) => r === 'uc').length, 1, '1 undercover à 4 joueurs');
  assert.ok(/1\. .*Shadow/.test(unbold(bodies(adapter).join('\n'))), 'liste numérotée des joueurs');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
  await t.mock.timers.reset();
});

test('Xundercover : indice par réponse au bot, liste accumulée, PAS de double indice', async () => {
  const h = harness();
  const { boot, makeMsg, bodies, unbold, UIDS, clearCooldowns, flush } = h;
  const t = require('node:test');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  const session = await startGame(t, bot, UIDS.shadow, [UIDS.shadow, UIDS.paul, UIDS.fortiche, UIDS.spammer]);
  const order = session.order;
  // Joueur 1 donne son indice en répondant au bot
  await bot.handleMessage(
    makeMsg('thread-1', order[0], 'c\u2019est chaud', { messageReply: { senderID: 'BOT_MOCK_000000', messageID: 'prompt' } })
  );
  const joined = unbold(bodies(adapter).join('\n'));
  assert.ok(new RegExp(`1\\. .*: c['’]est chaud`).test(joined), 'la liste affiche « 1. Nom : c\u2019est chaud »');
  // Le joueur 1 tente un DEUXIÈME indice → ignoré (pas d\u2019ajout)
  const before = adapter.sent.length;
  await bot.handleMessage(
    makeMsg('thread-1', order[0], 'brûlant', { messageReply: { senderID: 'BOT_MOCK_000000', messageID: 'prompt' } })
  );
  assert.ok(!/brûlant/.test(unbold(bodies(adapter).slice(before).join('\n'))) || !new RegExp('2\\. .*brûlant').test(unbold(bodies(adapter).slice(before).join('\n'))), 'pas de second indice');
  const clues1 = session.players.get(order[0]).clues.filter((c) => c && c !== '—');
  assert.equal(clues1.length, 1, 'un seul indice enregistré');
  // Joueur 2 : le prompt suivant est pour lui
  assert.ok(bodies(adapter).some((b) => /Au tour de/.test(unbold(b))), 'passage au joueur suivant');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
  await t.mock.timers.reset();
});

test('Xundercover : 20 s par indice (timeout → « — » et tour suivant)', async () => {
  const h = harness();
  const { boot, makeMsg, bodies, unbold, UIDS, clearCooldowns, flush } = h;
  const t = require('node:test');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  const session = await startGame(t, bot, UIDS.shadow, [UIDS.shadow, UIDS.paul, UIDS.fortiche]);
  const order = session.order;
  await advanceUntil(t, () => session.players.get(order[0]).clues[0] === '—');
  assert.equal(session._currentSpeaker().uid, order[1], 'passage au joueur 2');
  assert.ok(/À TOI !/i.test(unbold(bodies(adapter).slice(-1)[0])), 'prompt du joueur 2');
  // Le vote démarre après le dernier joueur muet
  await advanceUntil(t, () => session.state === 'VOTE');
  assert.ok(bodies(adapter).some((b) => /VOTE — TOUR 1/i.test(unbold(b))), 'vote lancé après la liste d\u2019indices');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
  await t.mock.timers.reset();
});

test('Xundercover : vote 75 s, UC démasqué → ÉLIMINÉ DIRECT (mot révélé)', async () => {
  const h = harness();
  const { boot, makeMsg, bodies, unbold, UIDS, clearCooldowns, flush } = h;
  const t = require('node:test');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  const uids = [UIDS.shadow, UIDS.paul, UIDS.fortiche, UIDS.spammer, UIDS.owner];
  const session = await startGame(t, bot, UIDS.shadow, uids);
  // 5 joueurs → indices muets → vote
  await advanceUntil(t, () => session.state === 'VOTE');
  const uc = [...session.players.values()].find((p) => p.role === 'uc');
  const civils = uids.filter((u) => session.players.get(u).role === 'civil');
  // Les civils votent l\u2019UC
  for (const v of civils) {
    await bot.handleMessage(makeMsg('thread-1', v, `vote @uc`, { mentions: { [uc.uid]: { tag: '@uc', from: 5 } } }));
  }
  await advanceUntil(t, () => !session.players.get(uc.uid).alive);
  assert.ok(!session.players.get(uc.uid).alive, 'UC éliminé');
  assert.ok(bodies(adapter).some((b) => /UNDERCOVER/.test(unbold(b)) && /ÉLIMINATION/.test(unbold(b))), 'élimination de l\u2019UC annoncée');
  assert.ok(bodies(adapter).some((b) => new RegExp(`Son mot : ${session.pair.under}`).test(unbold(b))), 'mot de l\u2019UC révélé');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
  await t.mock.timers.reset();
});

test('Xundercover : Mr. White démasqué → devinette ; BONNE réponse = victoire volée (+400)', async () => {
  const h = harness();
  const { boot, makeMsg, bodies, unbold, UIDS, clearCooldowns, flush } = h;
  const t = require('node:test');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  const uids = [UIDS.shadow, UIDS.paul, UIDS.fortiche, UIDS.spammer, UIDS.owner];
  const session = await startGame(t, bot, UIDS.shadow, uids);
  await advanceUntil(t, () => session.state === 'VOTE');
  const mw = [...session.players.values()].find((p) => p.role === 'mw');
  const civils = uids.filter((u) => session.players.get(u).role === 'civil');
  for (const v of civils) {
    await bot.handleMessage(makeMsg('thread-1', v, `vote @mw`, { mentions: { [mw.uid]: { tag: '@mw', from: 5 } } }));
  }
  await advanceUntil(t, () => session.state === 'GUESS');
  assert.ok(/DERNI[èe]re chance/i.test(unbold(bodies(adapter).join('\n')) + unbold(adapter.sent.map((s) => s.payload.body || '').join('\n'))), 'devinette proposée à Mr. White');
  // Mauvaise réponse DANS LE GROUPE (à voix haute) → raté, la partie continue
  await bot.handleMessage(makeMsg('thread-1', mw.uid, 'chaise'));
  await flush();
  assert.ok(bodies(adapter).some((b) => /Rat[ée]/.test(unbold(b))), 'mauvaise devinette → raté');
  // On relance un cycle : indices muets → vote MW à nouveau? MW est mort. On stoppe.
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
  assert.ok(!bot.sessions.get('thread-1', 'xundercover'), 'partie stoppée proprement');
  await t.mock.timers.reset();
});

test('Xundercover : devinette CORRECTE de Mr. White → « VOLE LA VICTOIRE » +400 XCoins', async () => {
  const h = harness();
  const { boot, makeMsg, bodies, unbold, UIDS, clearCooldowns, flush } = h;
  const t = require('node:test');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  const uids = [UIDS.shadow, UIDS.paul, UIDS.fortiche, UIDS.spammer, UIDS.owner];
  const session = await startGame(t, bot, UIDS.shadow, uids);
  await advanceUntil(t, () => session.state === 'VOTE');
  const mw = [...session.players.values()].find((p) => p.role === 'mw');
  const civils = uids.filter((u) => session.players.get(u).role === 'civil');
  for (const v of civils) {
    await bot.handleMessage(makeMsg('thread-1', v, `vote @mw`, { mentions: { [mw.uid]: { tag: '@mw', from: 5 } } }));
  }
  await advanceUntil(t, () => session.state === 'GUESS');
  const civilWord = session.pair.civil;
  // La tentative se fait DANS LE GROUPE (à voix haute)
  await bot.handleMessage(makeMsg('thread-1', mw.uid, civilWord));
  await flush();
  const all = unbold(adapter.sent.map((s) => s.payload.body || '').join('\n'));
  assert.ok(/VOLE LA VICTOIRE/i.test(all), 'Mr. White vole la victoire');
  const user = bot.db.getUser(mw.uid);
  assert.ok(user.xcoins >= 400 + 100, `+400 XCoins (solde : ${user.xcoins})`);
  assert.equal(bot.sessions.get('thread-1', 'xundercover'), null, 'session terminée');
  await t.mock.timers.reset();
});

test('Xucards : shop, achat (débit + inventaire), utilisation en partie, 1/tour', async () => {
  const h = harness();
  const { boot, makeMsg, bodies, unbold, UIDS, clearCooldowns, flush } = h;
  const t = require('node:test');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  const user = bot.db.ensureUser(UIDS.shadow);
  user.xcoins = 10000;
  bot.db.users.save();
  // Shop
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xucards'));
  assert.ok(/XCARTES — BOUTIQUE/i.test(unbold(bodies(adapter).slice(-1)[0])), 'shop affiché');
  assert.ok(/1[\s\u00a0\u202f]000[\s\u00a0\u202f]000/.test(unbold(bodies(adapter).slice(-1)[0])), 'carte à 1M affichée');
  // Achat de la carte 5 (première lettre, 4 000)
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xucards buy 5'));
  assert.ok(/CARTE ACHET[ée]/i.test(unbold(bodies(adapter).slice(-1)[0])), 'achat OK');
  assert.equal(user.xcoins, 6000, 'débit de 4 000');
  assert.equal(user.cards[5], 1, 'inventaire +1');
  // Acheter sans argent
  user.xcoins = 100;
  bot.db.users.save();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xucards buy 6'));
  assert.ok(/insuffisant/i.test(unbold(bodies(adapter).slice(-1)[0])), 'achat refusé sans XCoins');
  user.xcoins = 50000;
  bot.db.users.save();
  // Xucards info : détails d'une carte
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xucards info 20'));
  const info20 = unbold(bodies(adapter).slice(-1)[0]);
  assert.ok(/OEIL DE MER~NEL|ŒIL DE MER~NEL|CARTE 20/i.test(info20), 'info carte 20 affichée');
  assert.ok(/1[\s\u00a0\u202f]000[\s\u00a0\u202f]000/.test(info20), 'prix dans info');
  assert.ok(/Utilit[ée]/i.test(info20), 'utilité expliquée dans info');
  // En partie (avec TID du QG)
  const session = await startGame(t, bot, UIDS.shadow, [UIDS.shadow, UIDS.paul, UIDS.fortiche]);
  // Carte 5 (self) → la lettre part dans le QG (PAS en PV)
  const before = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'carte 5'));
  await flush();
  assert.equal(user.cards[5], 0, 'carte consommée');
  const qgMsg = adapter.sent.slice(before).find((s) => /PREMI[èe]re lettre/i.test(unbold(s.payload.body || '')) && String(s.threadID) === QG_TID);
  assert.ok(qgMsg, 'lettre envoyée AU QG (TID fourni au lancement)');
  // 1 seule carte par tour
  user.cards[5] = 1;
  bot.db.users.save();
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'carte 5'));
  await flush();
  assert.ok(bodies(adapter).slice(-3).some((b) => /1 seule carte par tour/.test(unbold(b))), 'limite 1 carte/tour');
  // Xucard : le LANCEUR déclare la carte d'un AUTRE joueur (au tour suivant)
  await advanceWithGo(t, bot, session, UIDS.shadow, () => session.round === 2 && session.state === 'TURNS');
  user.cards[3] = 0;
  bot.db.ensureUser(UIDS.paul).cards[3] = 1; // Paul a un bouclier
  bot.db.users.save();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xucard 3 @Paul', { mentions: { [UIDS.paul]: { tag: '@Paul', from: 8 } } }));
  await flush();
  assert.equal(bot.db.getUser(UIDS.paul).cards[3], 0, 'carte de Paul consommée via déclaration du lanceur');
  const shield = session.players.get(UIDS.paul);
  assert.ok(shield.shield === true || session.round !== 2, 'bouclier activé pour Paul');
  // Déclaration par un NON-lanceur → refusée
  bot.db.ensureUser(UIDS.paul).cards[4] = 1;
  bot.db.users.save();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'Xucard 4 @Fortiche', { mentions: { [UIDS.fortiche]: { tag: '@Fortiche', from: 8 } } }));
  await flush();
  assert.equal(bot.db.getUser(UIDS.paul).cards[4], 1, 'non-lanceur ne peut pas déclarer une carte');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
  await t.mock.timers.reset();
});

test('Xtid : le bot donne le TID de la conversation (groupe et PV)', async () => {
  const { boot, makeMsg, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  // En groupe
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xtid'));
  let b = unbold(bodies(adapter).slice(-1)[0]);
  assert.ok(/TID DU GROUPE/.test(b), 'titre groupe');
  assert.ok(b.includes('thread-1'), 'le TID du groupe est affiché');
  // En PV
  clearCooldowns(bot);
  const dm = UIDS.shadow;
  await bot.handleMessage(makeMsg(dm, dm, 'Xtid'));
  b = unbold(bodies(adapter).slice(-1)[0]);
  assert.ok(/TID DE CE PV/.test(b), 'titre PV');
  assert.ok(b.includes(dm), 'le TID du PV est affiché');
});

test('Xucrank : tableau des meilleurs joueurs après une partie', async () => {
  const h = harness();
  const { boot, makeMsg, bodies, unbold, UIDS, clearCooldowns, flush } = h;
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  const u = bot.db.ensureUser(UIDS.shadow);
  u.uc = { games: 5, wins: 3, mvp: 1, clues: 20, votesOK: 4 };
  bot.db.users.save();
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xucrank'));
  const b = unbold(bodies(adapter).slice(-1)[0]);
  assert.ok(/XUCRANK/.test(b), 'tableau affiché');
  assert.ok(/🥇/.test(b), 'médaille de tête');
  assert.ok(/57 pts/.test(b), `points calculés (3×10+1×15+4×3=57)`);
});

/* ════════ VOTE PAR RÉPONSE, PHRASES DE MORT, DÉCOMPTE LIVE, XTEST ════════ */

test('Phrases d\u2019élimination : 200+ drôles, noms insérés, 2-4 lignes', () => {
  const { PHRASES, pickDeathPhrase } = require('../systems/ucPhrases');
  const total = Object.values(PHRASES).reduce((s, v) => s + v.length, 0);
  assert.ok(total >= 200, `au moins 200 phrases (reçu : ${total})`);
  assert.ok(PHRASES.civil.length >= 60 && PHRASES.uc.length >= 60 && PHRASES.mw.length >= 60, 'remplies pour chaque rôle');
  for (const [role, arr] of Object.entries(PHRASES)) {
    for (const p of arr) {
      assert.ok(p.join('').includes('{name}'), `${role} : {name} insérable`);
      assert.ok(p.length >= 2 && p.length <= 4, `${role} : 2-4 lignes`);
    }
  }
  // Les noms sont bien remplacés
  for (const role of ['civil', 'uc', 'mw']) {
    const lines = pickDeathPhrase(role, { name: 'Sydmas', voter: 'Merdi', word: 'test' });
    assert.ok(lines.join(' ').includes('Sydmas'), `${role} : nom de la victime inséré`);
    assert.ok(!lines.join(' ').includes('{'), `${role} : plus aucun placeholder`);
  }
  // Deux tirages différents existent (banque variée)
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(pickDeathPhrase('civil', { name: 'X', voter: 'Y' }).join('|'));
  assert.ok(seen.size >= 10, `banque variée (${seen.size} phrases différentes en 50 tirages)`);
});

test('Xundercover : vote par RÉPONSE au message du joueur avec xvote + décompte live', async () => {
  const t = require('node:test');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { boot, makeMsg, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
  const flush = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  const uids = [UIDS.shadow, UIDS.paul, UIDS.fortiche, UIDS.spammer, UIDS.owner];
  const session = await startGame(t, bot, UIDS.shadow, uids);
  for (let i = 0; i < 120 && session.state === 'TURNS'; i++) { await t.mock.timers.tick(5_000); await flush(); }
  assert.equal(session.state, 'VOTE');
  // Paul répond au message de Shadow (messageReply senderID = Shadow) avec « xvote »
  await bot.handleMessage(
    makeMsg('thread-1', UIDS.paul, 'xvote', { messageReply: { senderID: UIDS.shadow, messageID: 'msg-shadow' } })
  );
  assert.ok(session.votes.get(UIDS.paul) === UIDS.shadow, 'vote par réponse enregistré');
  const last = unbold(bodies(adapter).slice(-1)[0]);
  assert.ok(/Paul → Shadow/.test(last), 'confirmation du vote');
  assert.ok(/ÉTAT DES VOTES/.test(last), 'décompte live affiché');
  assert.ok(/1 vote/.test(last), 'compteur de votes visible');
  // Un 2e vote → le décompte passe à 2
  await bot.handleMessage(
    makeMsg('thread-1', UIDS.fortiche, 'xvote', { messageReply: { senderID: UIDS.shadow, messageID: 'msg-shadow-2' } })
  );
  assert.ok(/2 votes/.test(unbold(bodies(adapter).slice(-1)[0])), 'décompte mis à jour (2 votes)');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
  await t.mock.timers.reset();
});

test('Xundercover : l\u2019élimination affiche une PHRASE DRÔLE avec le nom du joueur', async () => {
  const t = require('node:test');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { boot, makeMsg, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
  const flush = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  const uids = [UIDS.shadow, UIDS.paul, UIDS.fortiche, UIDS.spammer, UIDS.owner];
  const session = await startGame(t, bot, UIDS.shadow, uids);
  for (let i = 0; i < 120 && session.state === 'TURNS'; i++) { await t.mock.timers.tick(5_000); await flush(); }
  const uc = [...session.players.values()].find((p) => p.role === 'uc');
  const civils = uids.filter((u) => session.players.get(u).role === 'civil');
  for (const v of civils) {
    await bot.handleMessage(makeMsg('thread-1', v, `vote @uc`, { mentions: { [uc.uid]: { tag: '@uc', from: 5 } } }));
  }
  for (let i = 0; i < 120 && session.players.get(uc.uid).alive; i++) { await t.mock.timers.tick(5_000); await flush(); }
  assert.ok(!session.players.get(uc.uid).alive, 'UC éliminé');
  const elim = bodies(adapter).map((b) => unbold(b)).find((b) => /XUNDERCOVER — ÉLIMINATION/.test(b));
  assert.ok(elim, 'message d\u2019élimination');
  assert.ok(elim.includes(uc.name), 'le nom du joueur est DANS la phrase');
  assert.ok(/FIN DES VOTES/.test(elim), 'titre « fin des votes »');
  assert.ok(/Il était|était :/i.test(elim), 'rôle révélé après la phrase');
  // Message ÉPURÉ : ni décompte, ni liste d'indices en dessous
  assert.ok(!/Décompte|ÉTAT DES VOTES/i.test(elim), 'pas de décompte dans l\u2019élimination');
  assert.ok(!/🪦/.test(elim), 'pas de liste d\u2019indices dans l\u2019élimination');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
  await t.mock.timers.reset();
});

test('Xtest : le bot envoie « Je suis présent ✅ » EN PV, sans erreur', async () => {
  const { boot, makeMsg, unbold, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xtest'));
  const dm = adapter.sent.find((s) => String(s.threadID) === UIDS.shadow);
  assert.ok(dm, 'un message PV a été envoyé (thread = UID du joueur)');
  const b = unbold(dm.payload.body);
  assert.ok(/Je suis présent/.test(b), 'le message contient « Je suis présent »');
  assert.ok(/✅/.test(b), 'avec la coche ✅');
  assert.ok(b.length < 300, 'message court');
});

/* ════════ GO ANTICIPÉ + FIN DIRECTE DU VOTE ════════ */

test('Xundercover : Go anticipé du lanceur — démarrage sans attendre 90 s', async () => {
  const t = require('node:test');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { boot, makeMsg, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xundercover'));
  for (const uid of [UIDS.shadow, UIDS.paul, UIDS.fortiche]) {
    await bot.handleMessage(makeMsg('thread-1', uid, 'moi', { messageReply: { senderID: 'BOT_MOCK_000000', messageID: 'recruit' } }));
  }
  // Go d'un NON-lanceur → ignoré
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'Go'));
  await flushN();
  let session = bot.sessions.get('thread-1', 'xundercover');
  assert.equal(session.state, 'RECRUIT', 'Go refusé aux non-lanceurs');
  // Go du lanceur avec TROP PEU de joueurs (3 = OK ici, donc on teste à 2)
  // → 3 joueurs suffisent : le Go passe direct à la distribution
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Go'));
  await flushN();
  session = bot.sessions.get('thread-1', 'xundercover');
  assert.equal(session.state, 'WAITING_TID', 'Go anticipé → distribution (sans attendre 90 s)');
  assert.ok(bodies(adapter).some((b) => /Go anticip[ée]/i.test(unbold(b))), 'annonce du Go anticipé');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
  // Cas « pas assez » : nouvelle partie à 2 joueurs
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xundercover'));
  for (const uid of [UIDS.shadow, UIDS.paul]) {
    await bot.handleMessage(makeMsg('thread-1', uid, 'moi', { messageReply: { senderID: 'BOT_MOCK_000000', messageID: 'recruit2' } }));
  }
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Go'));
  await flushN();
  session = bot.sessions.get('thread-1', 'xundercover');
  assert.equal(session.state, 'RECRUIT', '2 joueurs → Go refusé');
  assert.ok(bodies(adapter).some((b) => /Pas assez de joueurs/.test(unbold(b))), 'message pas assez de joueurs');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
  await t.mock.timers.reset();
});

test('Xundercover : vote terminé DÈS QUE tous ont voté (pas d\u2019attente des 75 s)', async () => {
  const t = require('node:test');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { boot, makeMsg, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  const uids = [UIDS.shadow, UIDS.paul, UIDS.fortiche, UIDS.spammer, UIDS.owner];
  const session = await startGame(t, bot, UIDS.shadow, uids);
  // Indices muets → vote
  for (let i = 0; i < 120 && session.state === 'TURNS'; i++) { await t.mock.timers.tick(5_000); await flushN(); }
  assert.equal(session.state, 'VOTE');
  const uc = [...session.players.values()].find((p) => p.role === 'uc');
  // Les 5 vivants votent (chacun pour quelqu'un d'autre) → fin IMMÉDIATE
  for (const v of uids) {
    const tgt = v === uc.uid ? uids.find((u) => u !== v) : uc.uid;
    await bot.handleMessage(makeMsg('thread-1', v, 'vote @cible', { mentions: { [tgt]: { tag: '@cible', from: 5 } } }));
  }
  await flushN();
  // Sans avoir avancé les 75 s : le vote est DÉJÀ résolu (pause prochain tour)
  assert.equal(session.state, 'WAITING_GO', 'vote résolu immédiatement → pause du prochain tour');
  assert.ok(!session.players.get(uc.uid).alive, 'l\u2019UC (majorité) est bien éliminé');
  assert.ok(bodies(adapter).some((b) => /Tout le monde a vot[ée]/i.test(unbold(b))), 'annonce « tout le monde a voté »');
  assert.ok(bodies(adapter).some((b) => /FIN DES VOTES/i.test(unbold(b))), 'annonce d\u2019élimination directe');
  await t.mock.timers.reset();
});
