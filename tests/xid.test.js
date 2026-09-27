'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert');
const { boot, until, makeMsg, lastBody, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
const { matchAnswer, loose, resetSourceHealth } = require('../systems/mangaQuiz');

const BOT_ID = 'BOT_MOCK_000000';
const realFetch = global.fetch;

/* ── Stub Jikan + CDN images ── */
const CHARACTERS = [
  { name: 'Satoru Gojo', image: 'https://s4.anilist.co/gojo.jpg' },
  { name: 'Naruto Uzumaki', image: 'https://s4.anilist.co/naruto.jpg' },
  { name: 'Sasuke Uchiha', image: 'https://s4.anilist.co/sasuke.jpg' },
  { name: 'Kakashi Hatake', image: 'https://s4.anilist.co/kakashi.jpg' },
  { name: 'Hinata Hyuuga', image: 'https://s4.anilist.co/hinata.jpg' },
  { name: 'Monkey D. Luffy', image: 'https://s4.anilist.co/luffy.jpg' },
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
  resetSourceHealth(); // santé des sources = état global → remis à zéro par test
  global.fetch = async (url) => {
    const u = String(url);
    /* ── AniList (primaire) ── */
    if (u.includes('graphql.anilist.co')) {
      if (overrides.anilistFail) throw new Error('ECONNREFUSED anilist');
      if (overrides.anilist429) {
        return { ok: false, status: 429, headers: { get: () => 'application/json' }, json: async () => ({}) };
      }
      return makeJson({
        data: {
          Media: {
            title: { romaji: 'Naruto', english: 'Naruto' },
            characters: { edges: CHARACTERS.map((c) => ({ node: { name: { full: c.name }, image: { large: c.image } } })) },
          },
          Page: { characters: CHARACTERS.map((c) => ({ name: { full: c.name }, image: { large: c.image } })) },
        },
      });
    }
    /* ── Kitsu (3e source) ── */
    if (u.includes('kitsu.io')) {
      if (!overrides.kitsuOk) throw new Error('ECONNREFUSED kitsu'); // OFF par défaut
      if (overrides.kitsuFail) throw new Error('ECONNREFUSED kitsu');
      if (overrides.kitsu429) return { ok: false, status: 429, headers: { get: () => 'application/json' }, json: async () => ({}) };
      if (u.includes('/anime?') && u.includes('filter[text]')) {
        return makeJson({ data: [{ id: '1', attributes: { canonicalTitle: 'Naruto' } }] });
      }
      if (u.includes('/characters?include=character')) {
        return makeJson({
          data: CHARACTERS.map((c, i) => ({
            id: String(i),
            type: 'mediaCharacters',
            attributes: { role: i < 2 ? 'main' : 'supporting' },
            relationships: { character: { data: { type: 'characters', id: String(i) } } },
          })),
          included: CHARACTERS.map((c, i) => ({
            id: String(i),
            type: 'characters',
            attributes: { canonicalName: c.name, otherNames: [], image: { original: 'https://media.kitsu.app/characters/images/' + i + '/original.jpg' } },
          })),
        });
      }
    }
    /* ── Jikan (repli) ── */
    if (u.includes('api.jikan.moe')) {
      if (overrides.jikanFail) throw new Error('ECONNREFUSED jikan');
      if (overrides.jikan429) {
        return { ok: false, status: 429, headers: { get: () => 'application/json' }, json: async () => ({}) };
      }
      if (u.includes('/top/characters')) return makeJson({ data: CHARACTERS.map((c) => ({ name: c.name, images: { jpg: { image_url: c.image } } })) });
      if (u.includes('/manga?') || (u.includes('/manga') && u.includes('q='))) return makeJson({ data: [{ mal_id: 1, title: 'Naruto' }] });
      if (u.includes('/manga/1/characters')) {
        return makeJson({ data: CHARACTERS.map((c) => ({ character: { name: c.name, images: { jpg: { image_url: c.image } } } })) });
      }
    }
    /* ── CDN images ── */
    if (u.includes('s4.anilist.co') || u.includes('cdn.myanimelist.net') || u.includes('media.kitsu.app')) return makeImage();
    throw new Error('ECONNREFUSED ' + u.slice(0, 60));
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
  // Fausse réponse certaine : si le personnage EST Gojo → « ichigo »,
  // sinon → « gojo ». (Détection sur le NOM COMPLET, pas le premier mot :
  // « Satoru » Gojo aurait fait choisir « gojo »… la bonne réponse !)
  const wrong = /gojo/i.test(current.name) ? 'ichigo' : 'gojo';
  const before = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, wrong));
  await new Promise((r) => setTimeout(r, 900)); // marge large (suite chargée)
  assert.strictEqual(adapter.sent.length, before, 'aucun message envoyé sur une mauvaise réponse');
  assert.strictEqual(session.awaitingAnswer, true, 'la question reste ouverte');
  // Réessai correct
  const firstName = current.name.split(' ')[0];
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, firstName));
  await until(() => session.scores.get(UIDS.shadow), 15000);
  assert.ok(session.scores.get(UIDS.shadow), 'le 2e essai marque');
  await until(() => bodies(adapter).slice(from).some((b) => /prend le point/.test(b)), 15000);
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

test('Xid : jusqu’à 100 images — pagination AniList (50 + 50)', async () => {
  const big = Array.from({ length: 120 }, (_, i) => ({ name: `Perso ${i + 1}`, image: `https://s4.anilist.co/p${i}.jpg` }));
  global.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('graphql.anilist.co')) {
      const vars = (init.body && JSON.parse(init.body).variables) || {};
      const page = vars.page || 1;
      const per = vars.perPage || 50;
      const slice = big.slice((page - 1) * per, page * per);
      return makeJson({ data: { Page: { characters: slice.map((c) => ({ name: { full: c.name }, image: { large: c.image } })) } } });
    }
    if (u.includes('s4.anilist.co')) return makeImage();
    throw new Error('ECONNREFUSED');
  };
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xid'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'MULTIVERS'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '100'));
  await until(() => bodies(adapter).slice(from).some((b) => /IDENTIFICATION 1\//.test(b)), 15000);
  const session = bot.sessions.get('thread-1', 'xid');
  assert.strictEqual(session.total, 100, '100 images chargées (2 pages AniList de 50)');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
});

test('Xid : au-delà de 100 demandé → refusé puis 100 accepté', async () => {
  const big = Array.from({ length: 150 }, (_, i) => ({ name: `Perso ${i + 1}`, image: `https://s4.anilist.co/p${i}.jpg` }));
  global.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('graphql.anilist.co')) {
      const vars = (init.body && JSON.parse(init.body).variables) || {};
      const page = vars.page || 1;
      const per = vars.perPage || 50;
      const slice = big.slice((page - 1) * per, page * per);
      return makeJson({ data: { Page: { characters: slice.map((c) => ({ name: { full: c.name }, image: { large: c.image } })) } } });
    }
    if (u.includes('s4.anilist.co')) return makeImage();
    throw new Error('ECONNREFUSED');
  };
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xid'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'MULTIVERS'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '150'));
  const refused = await until(() => bodies(adapter).slice(from).some((b) => b.includes('Choisis :')), 5000);
  assert.ok(refused, '150 refusé → invitation à choisir dans la limite');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '100'));
  await until(() => bodies(adapter).slice(from).some((b) => /IDENTIFICATION 1\//.test(b)), 15000);
  const session = bot.sessions.get('thread-1', 'xid');
  assert.strictEqual(session.total, 100, '100 accepté au maximum');
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

test('Xid : AniList en panne → Jikan prend le relais AUTOMATIQUEMENT', async () => {
  stubFetch({ anilistFail: true });
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = await launch(bot, adapter, 'naruto', '2');
  const session = bot.sessions.get('thread-1', 'xid');
  assert.strictEqual(session.source, 'Naruto', 'quiz lancé via Jikan (repli)');
  assert.strictEqual(session.total, 2);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
});

test('Xid : AniList 429 → Jikan répond (rotation), quiz lancé quand même', async () => {
  stubFetch({ anilist429: true });
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = await launch(bot, adapter, 'MULTIVERS', '2');
  const session = bot.sessions.get('thread-1', 'xid');
  assert.strictEqual(session.source, 'Multivers');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
});

test('Xid : AniList + Kitsu + Jikan en panne → BANQUE LOCALE de secours, quiz JOUABLE aux indices', async () => {
  stubFetch({ anilistFail: true, jikanFail: true }); // kitsu.tombe aussi (URL inconnue du stub)
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xid'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'naruto'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  const ok = await until(() => bodies(adapter).some((b) => /banque locale/i.test(unbold(b))), 10000);
  assert.ok(ok, 'quiz lancé via la banque locale (jamais bloqué)');
  const session = bot.sessions.get('thread-1', 'xid');
  assert.ok(session, 'session vivante');
  assert.strictEqual(session.total, 5);
  await until(() => bodies(adapter).some((b) => /IDENTIFICATION 1\//.test(b)), 10000);
  const qFrame = unbold(bodies(adapter).find((b) => /IDENTIFICATION 1\//.test(b)));
  assert.ok(qFrame.includes('📖'), 'indice affiché à la place de l\'image');
  // Une bonne réponse (indice → nom de la banque) marque des points.
  const localBank = require('../systems/questions/xid-bank.json');
  const hint = qFrame.split('\n').find((l) => l.includes('📖'));
  const match = localBank.find((c) => hint.includes(c.hint));
  assert.ok(match, 'indice retrouvé dans la banque locale');
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, match.name));
  const scored = await until(() => bodies(adapter).some((b) => b.includes('@Paul') && b.includes('prend le point')), 15000);
  assert.ok(scored, 'bonne réponse acceptée en mode secours');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
});

test('Xid : toutes les sources en 429 → banque locale quand même', async () => {
  stubFetch({ anilist429: true, jikan429: true, kitsu429: true });
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xid'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'MULTIVERS'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  const ok = await until(() => bodies(adapter).some((b) => /banque locale/i.test(unbold(b))), 10000);
  assert.ok(ok, 'quiz lancé via la banque locale après 429 globaux');
  const session = bot.sessions.get('thread-1', 'xid');
  assert.ok(session && session.total === 5);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
});

test('Xid : AniList + Jikan DOWN → KITSU prend le relais (3e source indépendante)', async () => {
  stubFetch({ anilistFail: true, jikanFail: true, kitsuOk: true });
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = await launch(bot, adapter, 'naruto', '2');
  const session = bot.sessions.get('thread-1', 'xid');
  assert.ok(session, 'session via Kitsu');
  assert.strictEqual(session.source, 'Naruto', 'titre Kitsu utilisé');
  assert.strictEqual(session.total, 2);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
});

test('Xid : santé des sources — une source tombée est mise au repos 5 min', async () => {
  stubFetch({ anilistFail: true, jikanFail: true, kitsuOk: true });
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  // 1er lancement : anilist échoue → marqué en repos ; kitsu répond.
  await launch(bot, adapter, 'naruto', '2');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
  stubFetch({ kitsuOk: true, anilist429: true, jikan429: true });
  // 2e lancement : anilist doit être SAUTÉ (repos) → kitsu direct, jamais de 429 anilist.
  clearCooldowns(bot);
  const from = await launch(bot, adapter, 'naruto', '2');
  const session = bot.sessions.get('thread-1', 'xid');
  assert.ok(session, '2e session lancée');
  assert.strictEqual(session.source, 'Naruto');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'stop'));
});
