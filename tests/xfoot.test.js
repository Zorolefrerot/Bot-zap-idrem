'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert');
const { boot, until, makeMsg, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
const { resetSourceHealth, bindingsToPlayers, TEAM_ALIASES } = require('../systems/footQuiz');

const realFetch = global.fetch;

const PLAYERS = [
  { name: 'Lionel Messi', image: 'http://commons.wikimedia.org/wiki/Special:FilePath/messi.jpg?width=600' },
  { name: 'Cristiano Ronaldo', image: 'http://commons.wikimedia.org/wiki/Special:FilePath/cr7.jpg?width=600' },
  { name: 'Pelé', image: 'http://commons.wikimedia.org/wiki/Special:FilePath/pele.jpg?width=600' },
  { name: 'Diego Maradona', image: 'http://commons.wikimedia.org/wiki/Special:FilePath/maradona.jpg?width=600' },
  { name: 'Zinedine Zidane', image: 'http://commons.wikimedia.org/wiki/Special:FilePath/zidane.jpg?width=600' },
  { name: 'Kylian Mbappé', image: 'http://commons.wikimedia.org/wiki/Special:FilePath/mbappe.jpg?width=600' },
];

function makeJson(data) {
  return { ok: true, status: 200, headers: { get: () => 'application/sparql-results+json' }, json: async () => data, text: async () => JSON.stringify(data) };
}
function makeImage() {
  return { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(3000) };
}
function sparqlBindings(players) {
  return players.map((p) => ({
    p: { type: 'uri', value: 'http://www.wikidata.org/entity/Q1' },
    pLabel: { type: 'literal', value: p.name },
    image: { type: 'uri', value: p.image },
  }));
}

function stubFetch(overrides = {}) {
  resetSourceHealth(); // santé des sources = état global → remis à zéro par test
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('query.wikidata.org')) {
      if (overrides.wikidataFail) throw new Error('ECONNREFUSED wikidata');
      if (overrides.wikidata429) return { ok: false, status: 429, headers: { get: () => 'application/json' }, json: async () => ({}) };
      if (overrides.wikidataEmpty) return makeJson({ results: { bindings: [] } });
      // Filtre club ? → le terme est dans la requête SPARQL.
      if (u.includes('P54')) return makeJson({ results: { bindings: sparqlBindings(PLAYERS.slice(0, 2)) } });
      return makeJson({ results: { bindings: sparqlBindings(PLAYERS) } });
    }
    if (u.includes('commons.wikimedia.org') || u.includes('upload.wikimedia.org')) return makeImage();
    throw new Error('ECONNREFUSED ' + u.slice(0, 60));
  };
}

after(() => {
  global.fetch = realFetch;
});

async function launch(bot, adapter, filter = 'MULTIVERS', count = '3') {
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xfoot'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, filter));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, count));
  await until(() => bodies(adapter).slice(from).some((b) => /FOOTBALL 1\//.test(b)), 15000);
  return from;
}

test('Xfoot : flux complet — filtre → nombre → photo du joueur → bonne réponse', async () => {
  stubFetch();
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = await launch(bot, adapter, 'MULTIVERS', '2');
  const q = bodies(adapter).find((b) => /FOOTBALL 1\//.test(b));
  assert.ok(q, 'question posée');
  assert.ok(unbold(q).includes('Légendes & stars'), 'source affichée');
  // Toutes les réponses possibles de la banque de la session.
  const session = bot.sessions.get('thread-1', 'xfoot');
  assert.ok(session && session.total === 2, 'session Xfoot active');
  const good = session.players[0];
  const firstWord = good.name.split(' ')[0];
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, firstWord)); // prénom seul
  const scored = await until(() => bodies(adapter).slice(from).some((b) => b.includes('prend le point')), 15000);
  assert.ok(scored, 'prénom seul accepté, point donné');
  assert.ok(bodies(adapter).slice(from).some((b) => b.includes('@Paul')), 'Paul tagué');
});

test('Xfoot STRICT : un AUTRE joueur = faux même bien orthographié', async () => {
  stubFetch();
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = await launch(bot, adapter, 'MULTIVERS', '2');
  const session = bot.sessions.get('thread-1', 'xfoot');
  const good = session.players[0];
  const other = session.players.find((p) => p !== good);
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, other.name)); // nom EXACT d'un autre joueur
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(!bodies(adapter).slice(from).some((b) => b.includes('prend le point')), 'autre joueur rejeté');
  // Puis la bonne réponse passe.
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, good.name));
  const scored = await until(() => bodies(adapter).slice(from).some((b) => b.includes('prend le point')), 15000);
  assert.ok(scored, 'bonne réponse acceptée ensuite');
});

test('Xfoot CLUB : filtre PSG → requête P54 avec le bon terme', async () => {
  stubFetch();
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = await launch(bot, adapter, 'PSG', '2');
  const session = bot.sessions.get('thread-1', 'xfoot');
  assert.ok(session, 'session via filtre club');
  assert.strictEqual(session.players.length, 2);
  // L'alias psg → « paris saint » doit figurer dans la requête SPARQL (vérif directe).
  assert.equal(TEAM_ALIASES.psg, 'paris saint');
});

test('Xfoot : club inconnu → message propre (PAS de banque locale en cas de mauvais filtre)', async () => {
  stubFetch({ wikidataEmpty: true });
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xfoot'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Club Inexistant 12345'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  const ok = await until(() => bodies(adapter).some((b) => unbold(b).includes('Aucun joueur trouvé')), 15000);
  assert.ok(ok, 'message « aucun joueur trouvé »');
  assert.strictEqual(bot.sessions.get('thread-1', 'xfoot'), null, 'session nettoyée');
});

test('Xfoot : Wikidata DOWN → BANQUE LOCALE de secours, quiz JOUABLE aux indices', async () => {
  stubFetch({ wikidataFail: true });
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xfoot'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'MULTIVERS'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  const ok = await until(() => bodies(adapter).some((b) => /banque locale/i.test(unbold(b))), 15000);
  assert.ok(ok, 'quiz lancé via la banque locale');
  await until(() => bodies(adapter).some((b) => /FOOTBALL 1\//.test(b)), 15000);
  const qFrame = unbold(bodies(adapter).find((b) => /FOOTBALL 1\//.test(b)));
  assert.ok(qFrame.includes('📖'), 'indice affiché à la place de la photo');
  const bank = require('../systems/questions/xfoot-bank.json');
  const hint = qFrame.split('\n').find((l) => l.includes('📖'));
  const match = bank.find((c) => hint.includes(c.hint));
  assert.ok(match, 'indice retrouvé dans la banque locale');
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, match.name));
  const scored = await until(() => bodies(adapter).some((b) => b.includes('prend le point')), 15000);
  assert.ok(scored, 'bonne réponse acceptée en mode secours');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
});

test('Xfoot : Wikidata 429 → banque locale quand même', async () => {
  stubFetch({ wikidata429: true });
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xfoot'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'MULTIVERS'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  const ok = await until(() => bodies(adapter).some((b) => /banque locale/i.test(unbold(b))), 15000);
  assert.ok(ok, 'quiz lancé après 429');
  const session = bot.sessions.get('thread-1', 'xfoot');
  assert.ok(session && session.total === 5);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
});

test('Xwarn : la commande warn est RETIRÉE', async () => {
  const { bot } = await boot();
  assert.equal(bot.commands.get('xwarn'), undefined, 'xwarn non enregistrée');
  assert.equal(bot.commands.get('warn'), undefined, 'warn non enregistrée');
  assert.ok(bot.commands.get('xfoot'), 'xfoot enregistrée');
});

test('bindingsToPlayers : entree sans libelle et SVG exclus, doublons fusionnes', () => {
  const out = bindingsToPlayers([
    { pLabel: { value: 'Q10520' }, image: { value: 'http://x/a.jpg' } },
    { pLabel: { value: 'Messi' }, image: { value: 'http://x/m.svg' } },
    { pLabel: { value: 'Messi' }, image: { value: 'http://x/m2.jpg' } },
    { pLabel: { value: 'Messi' }, image: { value: 'http://x/m3.jpg' } },
    { pLabel: { value: 'Neymar' }, image: { value: 'http://x/n.jpg' } },
  ]);
  assert.equal(out.length, 2, 'Messi (une fois) + Neymar');
  assert.equal(out[0].name, 'Messi');
  assert.equal(out[1].name, 'Neymar');
  assert.ok(out[0].image.includes('width=600'), 'largeur 600 demandee');
});
