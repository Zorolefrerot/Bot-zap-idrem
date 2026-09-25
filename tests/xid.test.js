'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert');
const { boot, until, makeMsg, lastBody, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
const { matchAnswer, loose } = require('../systems/mangaQuiz');

const BOT_ID = 'BOT_MOCK_000000';
const realFetch = global.fetch;

/* ── Stub Jikan + CDN images ── */
const CHARACTERS = [
  { name: 'Satoru Gojo', image: 'https://cdn.myanimelist.net/gojo.jpg' },
  { name: 'Naruto Uzumaki', image: 'https://cdn.myanimelist.net/naruto.jpg' },
  { name: 'Sasuke Uchiha', image: 'https://cdn.myanimelist.net/sasuke.jpg' },
  { name: 'Kakashi Hatake', image: 'https://cdn.myanimelist.net/kakashi.jpg' },
  { name: 'Hinata Hyuuga', image: 'https://cdn.myanimelist.net/hinata.jpg' },
  { name: 'Monkey D. Luffy', image: 'https://cdn.myanimelist.net/luffy.jpg' },
];

function makeJson(data) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function makeImage() {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: async () => new ArrayBuffer(3000),
  };
}

function stubFetch(overrides = {}) {
  global.fetch = async (url) => {
    const u = String(url);
    if (overrides.jikanFail) {
      if (u.includes('api.jikan.moe')) throw new Error('ECONNREFUSED');
    }
    if (overrides.rateLimit && u.includes('api.jikan.moe')) {
      return { ok: false, status: 429, headers: { get: () => 'application/json' }, json: async () => ({}) };
    }
    if (u.includes('/top/characters')) return makeJson({ data: CHARACTERS.map((c) => ({ name: c.name, images: { jpg: { image_url: c.image } } })) });
    if (u.includes('/manga?') || (u.includes('/manga') && u.includes('q='))) return makeJson({ data: [{ mal_id: 1, title: 'Naruto' }] });
    if (u.includes('/manga/1/characters')) {
      return makeJson({ data: CHARACTERS.map((c) => ({ character: { name: c.name, images: { jpg: { image_url: c.image } } } })) });
    }
    if (u.includes('cdn.myanimelist.net')) return makeImage();
    throw new Error('ECONNREFUSED');
  };
}

after(() => {
  global.fetch = realFetch;
});

/* Lancement utilitaire : Xid → manga → nombre → question 1 affichée */
async function launch(bot, adapter, manga = 'naruto', count = '2') {
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xid'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, manga));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, count));
  await until(() => bodies(adapter).slice(from).some((b) => /IDENTIFICATION 1\//.test(b)), 15000);
  return from;
}

test('Xid : flux complet — manga → nombre → image du personnage posée', async () => {
  stubFetch();
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xid'));
  assert.ok(lastBody(adapter).includes('QUEL MANGA'), 'cadre choix du manga');
  // Un autre joueur ne peut pas configurer
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'one piece'));
  assert.ok(lastBody(adapter).includes('QUEL MANGA'), 'config refusée à un non-lanceur');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'naruto'));
  assert.ok(lastBody(adapter).includes('NOMBRE'), 'cadre nombre');
  assert.ok(/5\s+\/\s+10\s+\/\s+15/.test(lastBody(adapter)), 'propositions 5/10/15');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '2'));
  const launched = await until(() => bodies(adapter).slice(from).some((b) => b.includes('QUIZ LANCÉ')), 15000);
  assert.ok(launched, 'annonce de lancement');
  assert.ok(bodies(adapter).slice(from).some((b) => b.includes('Naruto')), 'thème Naruto');
  const qIdx = bodies(adapter).slice(from).findIndex((b) => /IDENTIFICATION 1\//.test(b));
  assert.ok(qIdx >= 0, 'première image posée');
  const qPayload = adapter.sent[from + qIdx].payload;
  assert.ok(qPayload.attachment, 'image du personnage en pièce jointe');
  assert.ok(unbold(qPayload.body || '').includes('QUI EST-CE'), 'consigne posée');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
});

test('Xid : PRÉNOM seul accepté — le point va au senderID qui répond', async () => {
  stubFetch();
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = await launch(bot, adapter, 'naruto', '2');
  const session = bot.sessions.get('thread-1', 'xid');
  // La question 1 est un des 6 personnages — on répond avec son PRÉNOM uniquement
  const current = session.characters[0];
  const firstName = current.name.split(' ')[0];
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, firstName));
  await until(() => bodies(adapter).slice(from).some((b) => /prend le point/.test(b)), 10000);
  assert.ok(session.scores.get(UIDS.paul), 'Paul (le répondeur) a les points');
  assert.strictEqual(session.scores.get(UIDS.paul).score, 10, '+10 points');
  assert.ok(!session.scores.get(UIDS.shadow), 'le lanceur n’a rien volé');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
});

test('matchAnswer : variantes de traduction romaji + fautes, sans faux positifs', () => {
  // Prénom, nom seul, nom complet
  assert.strictEqual(matchAnswer('satoru', 'Satoru Gojo'), true);
  assert.strictEqual(matchAnswer('gojo', 'Satoru Gojo'), true);
  assert.strictEqual(matchAnswer('Satoru Gojo', 'Satoru Gojo'), true);
  assert.strictEqual(matchAnswer('gojo satoru', 'Satoru Gojo'), true, 'ordre des mots indifférent');
  // Variantes de traduction (le cœur de la demande)
  assert.strictEqual(matchAnswer('goujou', 'Satoru Gojo'), true, 'goujou = gojo');
  assert.strictEqual(matchAnswer('Gōjo', 'Satoru Gojo'), true, 'macron romaji');
  assert.strictEqual(matchAnswer('ryuuji', 'Ryuuji Takasu'), true);
  assert.strictEqual(matchAnswer('ryuji', 'Ryuuji Takasu'), true, 'sens inverse aussi');
  assert.strictEqual(matchAnswer('hinata hyuga', 'Hinata Hyuuga'), true, 'Hyuuga/Hyuga');
  assert.strictEqual(matchAnswer('sasuké', 'Sasuke Uchiha'), true, 'accent');
  assert.strictEqual(matchAnswer('SÔSUKE', 'Sosuke Aizen'), true, 'accents + casse');
  assert.strictEqual(matchAnswer('lufy', 'Monkey D. Luffy'), true, 'faute de frappe 1 lettre');
  assert.strictEqual(matchAnswer('kakachi', 'Kakashi Hatake'), true, 'faute de frappe 1 lettre');
  assert.strictEqual(matchAnswer('monkey luffy', 'Monkey D. Luffy'), true, 'particule omise');
  // Négatifs
  assert.strictEqual(matchAnswer('pain', 'Naruto Uzumaki'), false);
  assert.strictEqual(matchAnswer('sa', 'Sasuke Uchiha'), false, 'trop court');
  assert.strictEqual(matchAnswer('sakura', 'Sasuke Uchiha'), false, 'autre personnage');
  assert.strictEqual(matchAnswer('', 'Naruto'), false);
  // Rapidité : loose/lev sont locaux (aucun réseau)
  assert.ok(loose('Gōūjōū') !== undefined);
});

test('Xid : mauvaise réponse SILENCIEUSE — on peut retenter tout de suite', async () => {
  stubFetch();
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = await launch(bot, adapter, 'naruto', '2');
  const session = bot.sessions.get('thread-1', 'xid');
  const current = session.characters[0];
  const wrong = current.name.split(' ')[0] === 'gojo' ? 'ichigo' : 'gojo';
  const before = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, wrong));
  await new Promise((r) => setTimeout(r, 400));
  assert.strictEqual(adapter.sent.length, before, 'aucun message envoyé sur une mauvaise réponse');
  assert.strictEqual(session.awaitingAnswer, true, 'la question reste ouverte');
  // Réessai correct
  const firstName = current.name.split(' ')[0];
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, firstName));
  await until(() => bodies(adapter).slice(from).some((b) => /prend le point/.test(b)), 10000);
  assert.ok(session.scores.get(UIDS.shadow), 'le 2e essai marque');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
});

test('Xid : MULTIVERS (top personnages) fonctionne aussi', async () => {
  stubFetch();
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = await launch(bot, adapter, 'MULTIVERS', '3');
  const session = bot.sessions.get('thread-1', 'xid');
  assert.strictEqual(session.source, 'Multivers');
  assert.strictEqual(session.total, 3, '3 images demandées');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
});

test('Xid : temps écoulé → réponse révélée → question suivante', async () => {
  stubFetch();
  const { bot, adapter } = await boot();
  bot.config.games.quizTimeoutMs = 600;
  clearCooldowns(bot);
  const from = await launch(bot, adapter, 'naruto', '2');
  await until(() => bodies(adapter).slice(from).some((b) => /TEMPS ÉCOULÉ/.test(b)), 8000);
  const reveal = bodies(adapter).slice(from).find((b) => /TEMPS ÉCOULÉ/.test(b));
  assert.ok(reveal.includes('Réponse'), 'réponse révélée');
  const session = bot.sessions.get('thread-1', 'xid');
  await until(() => bodies(adapter).slice(from).some((b) => /IDENTIFICATION 2\//.test(b)), 8000);
  assert.strictEqual(session.index, 1, 'passé à la question 2');
  assert.strictEqual(session.awaitingAnswer, true, 'question 2 ouverte');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
});

test('Xid : fin du quiz → 🏁 tableau des scores FINAL + gains XCoins', async () => {
  stubFetch();
  const { bot, adapter, db } = await boot();
  clearCooldowns(bot);
  const from = await launch(bot, adapter, 'naruto', '2');
  const session = bot.sessions.get('thread-1', 'xid');

  // Répondre correctement aux 2 questions (Paul puis Shadow)
  const q1 = session.characters[0].name.split(' ')[0];
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, q1));
  await until(() => bodies(adapter).slice(from).some((b) => /IDENTIFICATION 2\//.test(b)), 15000);
  const q2 = session.characters[1].name.split(' ')[0];
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, q2));

  const final = await until(() => bodies(adapter).slice(from).some((b) => b.includes('CLASSEMENT')), 15000);
  assert.ok(final, 'tableau des scores final affiché');
  const board = bodies(adapter).slice(from).find((b) => b.includes('CLASSEMENT'));
  assert.ok(board.includes('Paul'), 'Paul au classement');
  assert.ok(board.includes('Shadow'), 'Shadow au classement');
  assert.ok(board.includes('10'), 'points affichés au classement');
  assert.ok(board.includes('XCoins'), 'gains annoncés');
  assert.strictEqual(bot.sessions.get('thread-1', 'xid'), null, 'session purgée');
  const paul = db.getUser(UIDS.paul);
  assert.ok(paul.xcoins >= 2, 'XCoins crédités à Paul');
});

test('Xid : stop par un tiers refusé, par le lanceur accepté', async () => {
  stubFetch();
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = await launch(bot, adapter, 'naruto', '2');
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'stop'));
  const refused = await until(() => bodies(adapter).slice(from).some((b) => b.includes('Seul le lanceur')), 5000);
  assert.ok(refused, 'annulation refusée pour un tiers');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
  assert.strictEqual(bot.sessions.get('thread-1', 'xid'), null, 'annulé par le lanceur');
});

test('Xid : Jikan en panne / 429 → message honnête, jamais de crash', async () => {
  stubFetch({ jikanFail: true });
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xid'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'naruto'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  await until(() => bodies(adapter).some((b) => b.includes('JIKAN INDISPONIBLE')), 10000);
  assert.ok(bodies(adapter).some((b) => b.includes('CODE')), 'code typé affiché');
  assert.strictEqual(bot.sessions.get('thread-1', 'xid'), null, 'session nettoyée');

  stubFetch({ rateLimit: true });
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xid'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'naruto'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  const paused = await until(() => bodies(adapter).some((b) => b.includes('JIKAN EN PAUSE')), 10000);
  assert.ok(paused, 'Jikan en pause annoncé');
  assert.ok(bodies(adapter).some((b) => b.includes('JIKAN_RATE_LIMIT')), 'rate limit annoncé');
});
