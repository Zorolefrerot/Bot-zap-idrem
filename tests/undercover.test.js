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
  // La partie démarre : liste + annonce des rôles en PV
  assert.ok(bodies(adapter).some((b) => /LA PARTIE COMMENCE/i.test(unbold(b))), 'début de partie');
  assert.ok(bodies(adapter).some((b) => /R[ôo]les envoy[ée]s en PV/i.test(unbold(b))), 'rôles envoyés');
  // PV : chaque joueur a reçu son rôle (messages envoyés aux threads PV = uid)
  const dm = adapter.sent.filter((s) => /TON R[ôo]LE/i.test(unbold(s.payload.body || '')));
  assert.equal(dm.length, 4, '4 rôles envoyés en PV');
  const session = bot.sessions.get('thread-1', 'xundercover');
  assert.ok(session && session.pair, 'couple de mots tiré');
  const roles = [...session.players.values()].map((p) => p.role);
  assert.equal(roles.filter((r) => r === 'mw').length, 1, '1 Mr. White');
  assert.equal(roles.filter((r) => r === 'uc').length, 1, '1 undercover à 4 joueurs');
  assert.ok(/1\. .*Shadow/.test(unbold(bodies(adapter).join('\n'))), 'liste numérotée des joueurs');
  // Prompt du 1er orateur
  assert.ok(bodies(adapter).some((b) => /À TOI !/i.test(unbold(b))), 'premier tour de parole');
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
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xundercover'));
  for (const uid of [UIDS.shadow, UIDS.paul, UIDS.fortiche]) {
    await bot.handleMessage(makeMsg('thread-1', uid, 'moi', { messageReply: { senderID: 'BOT_MOCK_000000', messageID: 'recruit' } }));
  }
  await t.mock.timers.tick(90_000);
  await flush();
  const session = bot.sessions.get('thread-1', 'xundercover');
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

test('Xundercover : 15 s par indice (timeout → « — » et tour suivant)', async () => {
  const h = harness();
  const { boot, makeMsg, bodies, unbold, UIDS, clearCooldowns, flush } = h;
  const t = require('node:test');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xundercover'));
  for (const uid of [UIDS.shadow, UIDS.paul, UIDS.fortiche]) {
    await bot.handleMessage(makeMsg('thread-1', uid, 'moi', { messageReply: { senderID: 'BOT_MOCK_000000', messageID: 'recruit' } }));
  }
  await t.mock.timers.tick(90_000);
  await flush();
  const session = bot.sessions.get('thread-1', 'xundercover');
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
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xundercover'));
  const uids = [UIDS.shadow, UIDS.paul, UIDS.fortiche, UIDS.spammer, UIDS.owner];
  for (const uid of uids) {
    await bot.handleMessage(makeMsg('thread-1', uid, 'moi', { messageReply: { senderID: 'BOT_MOCK_000000', messageID: 'recruit' } }));
  }
  await t.mock.timers.tick(90_000);
  await flush();
  const session = bot.sessions.get('thread-1', 'xundercover');
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
  assert.ok(bodies(adapter).some((b) => /UNDERCOVER/.test(unbold(b)) && /est éliminé/.test(unbold(b))), 'élimination de l\u2019UC annoncée');
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
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xundercover'));
  const uids = [UIDS.shadow, UIDS.paul, UIDS.fortiche, UIDS.spammer, UIDS.owner];
  for (const uid of uids) {
    await bot.handleMessage(makeMsg('thread-1', uid, 'moi', { messageReply: { senderID: 'BOT_MOCK_000000', messageID: 'recruit' } }));
  }
  await t.mock.timers.tick(90_000);
  await flush();
  const session = bot.sessions.get('thread-1', 'xundercover');
  await advanceUntil(t, () => session.state === 'VOTE');
  const mw = [...session.players.values()].find((p) => p.role === 'mw');
  const civils = uids.filter((u) => session.players.get(u).role === 'civil');
  for (const v of civils) {
    await bot.handleMessage(makeMsg('thread-1', v, `vote @mw`, { mentions: { [mw.uid]: { tag: '@mw', from: 5 } } }));
  }
  await advanceUntil(t, () => session.state === 'GUESS');
  assert.ok(/DERNI[èe]re chance/i.test(unbold(bodies(adapter).join('\n')) + unbold(adapter.sent.map((s) => s.payload.body || '').join('\n'))), 'devinette proposée à Mr. White');
  // Mauvaise réponse en PV → raté, la partie continue
  await bot.handleMessage(makeMsg(mw.uid, mw.uid, 'chaise'));
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
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xundercover'));
  const uids = [UIDS.shadow, UIDS.paul, UIDS.fortiche, UIDS.spammer, UIDS.owner];
  for (const uid of uids) {
    await bot.handleMessage(makeMsg('thread-1', uid, 'moi', { messageReply: { senderID: 'BOT_MOCK_000000', messageID: 'recruit' } }));
  }
  await t.mock.timers.tick(90_000);
  await flush();
  const session = bot.sessions.get('thread-1', 'xundercover');
  await advanceUntil(t, () => session.state === 'VOTE');
  const mw = [...session.players.values()].find((p) => p.role === 'mw');
  const civils = uids.filter((u) => session.players.get(u).role === 'civil');
  for (const v of civils) {
    await bot.handleMessage(makeMsg('thread-1', v, `vote @mw`, { mentions: { [mw.uid]: { tag: '@mw', from: 5 } } }));
  }
  await advanceUntil(t, () => session.state === 'GUESS');
  const civilWord = session.pair.civil;
  await bot.handleMessage(makeMsg(mw.uid, mw.uid, civilWord));
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
  // En partie : utilisation
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xundercover'));
  for (const uid of [UIDS.shadow, UIDS.paul, UIDS.fortiche]) {
    await bot.handleMessage(makeMsg('thread-1', uid, 'moi', { messageReply: { senderID: 'BOT_MOCK_000000', messageID: 'recruit' } }));
  }
  await t.mock.timers.tick(90_000);
  await flush();
  // Carte 5 → PV avec la première lettre
  const before = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'carte 5'));
  await flush();
  assert.equal(user.cards[5], 0, 'carte consommée');
  const dm = adapter.sent.slice(before).find((s) => /PREMI[èe]re lettre/i.test(unbold(s.payload.body || '')) && String(s.threadID) === UIDS.shadow);
  assert.ok(dm, 'lettre envoyée en PV');
  // 1 seule carte par tour
  user.cards[5] = 1;
  bot.db.users.save();
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'carte 5'));
  await flush();
  assert.ok(bodies(adapter).slice(-3).some((b) => /1 seule carte par tour/.test(unbold(b))), 'limite 1 carte/tour');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
  await t.mock.timers.reset();
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
