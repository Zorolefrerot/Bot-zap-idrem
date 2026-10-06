'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { boot, makeMsg, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
const { resetSourceHealth, resetSourceCache } = require('../systems/footQuiz');
const mangaQuiz = require('../systems/mangaQuiz');

const realFetch = global.fetch;
const realRandom = Math.random;

/* unbold + espaces insécables fr-FR (U+202F/U+2009/U+00A0 → espace simple) */
function norm(t) {
  return unbold(String(t)).replace(/[\u202f\u2009\u00a0]/g, ' ');
}

after(() => {
  global.fetch = realFetch;
  Math.random = realRandom;
});

/* Stub réseau pour le test de cache Xid */
function stubManga(overrides = {}) {
  const makeJson = (d) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => d, text: async () => JSON.stringify(d) });
  const CH = [
    { name: 'Satoru Gojo', image: 'https://s4.anilist.co/gojo.jpg' },
    { name: 'Naruto Uzumaki', image: 'https://s4.anilist.co/naruto.jpg' },
  ];
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('graphql.anilist.co')) {
      if (overrides.anilistFail) throw new Error('ECONNREFUSED anilist');
      return makeJson({ data: { Media: { title: { romaji: 'Naruto' }, characters: { edges: CH.map((c) => ({ node: { name: { full: c.name }, image: { large: c.image } } })) } } } });
    }
    if (u.includes('kitsu.io') || u.includes('api.jikan.moe')) throw new Error('ECONNREFUSED');
    if (u.includes('s4.anilist.co')) return { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(3000) };
    throw new Error('ECONNREFUSED ' + u.slice(0, 40));
  };
}

test('FIABILITÉ Xid : 2e quiz même manga = CACHE (aucune requête même tout en panne)', async () => {
  mangaQuiz.resetSourceHealth();
  mangaQuiz.resetSourceCache();
  const { boot: b } = require('./helpers');
  stubManga({});
  const { bot } = await b();
  const { MangaQuizSession } = mangaQuiz;
  const send = () => {};
  const s1 = new MangaQuizSession(bot, { threadID: 'tc', ownerID: '111', ownerName: 'X', send });
  const r1 = await s1._loadCharacters(2);
  assert.equal(r1.length, 2);
  // TOUT tombe en panne → le cache FRAIS répond quand même.
  stubManga({ anilistFail: true });
  const s2 = new MangaQuizSession(bot, { threadID: 'tc', ownerID: '111', ownerName: 'X', send });
  const r2 = await s2._loadCharacters(2);
  assert.equal(r2.length, 2, 'servi depuis le cache frais');
  assert.equal(s2.source, 'Naruto');
});

test('FIABILITÉ Xfoot : cache frais après une 1re réussite', async () => {
  resetSourceHealth();
  resetSourceCache();
  const makeJson = (d) => ({ ok: true, status: 200, headers: { get: () => 'application/sparql-results+json' }, json: async () => d, text: async () => JSON.stringify(d) });
  const bindings = [
    { pLabel: { value: 'Lionel Messi' }, image: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/m.jpg' } },
    { pLabel: { value: 'Neymar' }, image: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/n.jpg' } },
  ];
  global.fetch = async (url) => {
    if (String(url).includes('query.wikidata.org')) {
      if (global.__wikidataFail) throw new Error('ECONNREFUSED wd');
      return makeJson({ results: { bindings } });
    }
    if (String(url).includes('commons.wikimedia.org')) return { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(3000) };
    throw new Error('ECONNREFUSED');
  };
  const { bot } = await boot();
  const { FootQuizSession } = require('../systems/footQuiz');
  const s1 = new FootQuizSession(bot, { threadID: 'tf', ownerID: '111', ownerName: 'X', send: () => {} });
  s1.filter = 'multivers';
  const r1 = await s1._loadPlayers(2);
  assert.equal(r1.length, 2);
  global.__wikidataFail = true;
  const s2 = new FootQuizSession(bot, { threadID: 'tf', ownerID: '111', ownerName: 'X', send: () => {} });
  s2.filter = 'multivers';
  const r2 = await s2._loadPlayers(2);
  assert.equal(r2.length, 2, 'cache frais Xfoot');
});

/* ═══════════ NOUVEAUX JEUX ═══════════ */

test('Xslots 🎰 : jackpot ×25 crédité, perte nette si rien, mise minimale', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  // rng → 0.999 ×3 : trois 💎 (index 5)
  Math.random = () => 0.999;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xslots 100'));
  let out = norm(bodies(adapter)[bodies(adapter).length - 1]);
  assert.ok(/JACKPOT|TRIPLE|EN FEU/.test(out), 'jackpot déclenché');
  assert.ok(out.includes('2 500'), 'gain ×25 = 2500');
  assert.ok(out.includes('2 900'), 'solde 500−100+2500=2900');

  clearCooldowns(bot);
  // rng en séquence → trois symboles DIFFÉRENTS (🍒, 🍋, 🍇)
  const seq = [0.05, 0.2, 0.4];
  Math.random = () => seq.shift() ?? 0.5;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xslots 100'));
  out = norm(bodies(adapter)[bodies(adapter).length - 1]);
  assert.ok(out.includes('PERDU'), 'perte affichée');
  assert.ok(out.includes('2 800'), 'solde 2900−100=2800');

  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xslots 10'));
  out = unbold(bodies(adapter)[bodies(adapter).length - 1]);
  assert.ok(out.includes('Mise minimum'), 'mise minimale imposée');
});

test('Xpile 🪙 : gain ×2 sur bon choix, perte sinon', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  Math.random = () => 0.2; // < 0.5 → PILE
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xpile pile 100'));
  let out = unbold(bodies(adapter)[bodies(adapter).length - 1]);
  assert.ok(out.includes('PILE'), 'la pièce montre pile');
  assert.ok(out.includes('600'), 'solde 500−100+200=600');
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xpile face 100'));
  out = unbold(bodies(adapter)[bodies(adapter).length - 1]);
  assert.ok(out.includes('PERDU'), 'face perd quand la pièce = pile');
  assert.ok(out.includes('500'), 'solde 600−100=500');
});

test('Xcourse 🏇 : pari gagnant ×3.5, mauvais cheval = perte', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  Math.random = () => 0.95; // winner = floor(0.95×4)=3 (Comète n°4)
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xcourse 4 100'));
  let out = unbold(bodies(adapter)[bodies(adapter).length - 1]);
  assert.ok(out.includes('Comète'), 'Comète dans le résultat');
  assert.ok(out.includes('750'), 'solde 500−100+350=750');
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xcourse 1 100'));
  out = unbold(bodies(adapter)[bodies(adapter).length - 1]);
  assert.ok(out.includes('650'), 'solde 750−100=650 (pari perdu)');
});

test('Xrestart : refusé pour un simple membre, OK pour un admin (mock → pas de exit)', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'Xrestart'));
  assert.ok(norm(bodies(adapter)[bodies(adapter).length - 1]).includes('réservée aux administrateurs'), 'refus non-admin');
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xrestart'));
  const out = norm(bodies(adapter)[bodies(adapter).length - 1]);
  assert.ok(out.includes('REDÉMARRAGE'), 'annonce admin');
  assert.ok(out.includes('Sauvegarde'), 'sauvegarde annoncée');
});

test('Xmenu : TOUTES les nouvelles commandes listées, Xwarn absent', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xmenu'));
  const out = unbold(bodies(adapter)[bodies(adapter).length - 1]);
  for (const cmd of ['Xfoot', 'Xbet', 'Xslots', 'Xpile', 'Xcourse', 'Xrps', 'Xanime', 'Xpolice', 'Xlove', 'Xupt', 'Xrestart', 'Xstop', 'Xrank', 'Xgame']) {
    assert.ok(out.includes(cmd), `menu contient ${cmd}`);
  }
  assert.ok(!out.includes('Xwarn'), 'Xwarn retiré du menu');
});

test('PERSISTANCE : saveAll écrit AUSSI les paris (bets.json sur disque)', async () => {
  const { bot } = await boot();
  const st = bot.db.betState('g-persist');
  st.card = [{ a: ['Real Madrid', 95], b: ['Everton', 66], odds: { vA: 1.2, vB: 3, nul: 3.2, dA: 4, dB: 1.4 }, taken: true }];
  st.bets[0] = { senderID: '111', side: 'a', outcome: 'v', mise: 100, odds: 1.2, team: 'Real Madrid', matchLabel: 'Real Madrid vs Everton', resolvesAt: Date.now() + 30000 };
  bot.db.saveAll();
  const file = bot.db.bets.file;
  assert.ok(fs.existsSync(file), 'bets.json existe : ' + file);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(data['g-persist'] && data['g-persist'].card.length === 1, 'paris persistés sur disque');
});

test('PERSISTANCE : les XCoins survivent à un cycle saveAll (users.json)', async () => {
  const { bot, db } = await boot();
  bot.economy.addCoins(UIDS.shadow, 777);
  db.saveAll();
  const file = db.users.file;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(data[String(UIDS.shadow)].xcoins >= 777, 'XCoins écrits sur disque');
});
