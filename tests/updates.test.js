'use strict';
/*
 * 🧬 MeR~NeL — tests/updates.test.js
 * Tests du round « Jarvis / Xteam / strict / reply-gate / images » :
 * Xmenu sans descriptions, reply-gate selon Xchat, Xonlyadmin, Xjarvis,
 * Xteam (flux complet + récompenses), Xduel drapeau, Xanime headers,
 * Xask/Xai neutres, Xprofil/Xlove images.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

const { boot, until, makeMsg, lastBody, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
const { resolveDuelCategory, loadDuelBank } = require('../systems/questions');
const { makeChecker } = require('../systems/mangaQuiz');

const BOT_ID = 'BOT_MOCK_000000';

/* Groupe de test : threadInfo mocké + options chat/jarvis. */
async function bootGroup(opts = {}) {
  const { bot, adapter, db, config, services } = await boot(opts);
  bot.adapter.getThreadInfo = async () => ({
    threadName: 'Groupe Test',
    adminIDs: [{ id: UIDS.admin }, { id: UIDS.fortiche }],
    userInfo: [
      { id: UIDS.shadow, name: 'Shadow' },
      { id: UIDS.paul, name: 'Paul' },
      { id: UIDS.fortiche, name: 'Fortiche' },
    ],
    participantIDs: [UIDS.shadow, UIDS.paul, UIDS.fortiche, UIDS.admin, BOT_ID],
  });
  return { bot, adapter, db, config, services };
}

function replyTo(botMsgId, senderID, threadID, text) {
  return makeMsg(threadID || 'thread-1', senderID, text, {
    messageReply: { senderID: BOT_ID, messageID: botMsgId },
  });
}

test('Xmenu : noms de commandes SEULS — aucune explication', async () => {
  const { bot, adapter } = await bootGroup();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xmenu'));
  assert.ok(await until(() => bodies(adapter).some((b) => /MENU/.test(b)), 3000));
  const body = bodies(adapter).find((b) => /MENU/.test(b));
  for (const name of ['Xquiz', 'Xid', 'Xfoot', 'Xduel', 'Xteam', 'Xslots', 'Xjarvis', 'Xonlyadmin', 'Xlove', 'Xprofil', 'Xrestart', 'Xmenu']) {
    assert.ok(new RegExp(name, 'i').test(body), `commande ${name} listée`);
  }
  const descLines = body.split('\n').filter((l) => /[├└]/.test(l) && l.includes('—'));
  assert.equal(descLines.length, 0, 'aucune description après un nom de commande');
});

test('Reply au bot en groupe : PAS de chat si Xchat OFF — chat OK si ON', async () => {
  let received = '';
  const { bot, adapter } = await bootGroup({
    serviceStubs: { chat: { reply: async (p) => { received = p.text; return 'Réponse IA test.'; }, clear() {}, resetAll() {} } },
  });
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xmenu'));
  await until(() => adapter.sent.length > 0, 3000);
  const botMsg = adapter.sent[adapter.sent.length - 1];

  // Xchat OFF (défaut) → AUCUNE réponse au reply
  await bot.handleMessage(replyTo(botMsg.id, UIDS.shadow, 'thread-1', 'salut le bot'));
  await new Promise((r) => setTimeout(r, 400));
  assert.ok(!bodies(adapter).some((b) => b.includes('Réponse IA test')), 'Xchat OFF : le bot ne discute pas');
  assert.equal(received, '', 'aucun texte transmis au chat');

  // Xchat ON → le reply déclenche le chat
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xchat on'));
  assert.ok(await until(() => bodies(adapter).some((b) => /MODE DISCUSSION ACTIV/.test(b)), 3000), 'confirmation Xchat');
  clearCooldowns(bot);
  await bot.handleMessage(replyTo(botMsg.id, UIDS.shadow, 'thread-1', 'et maintenant ?'));
  assert.ok(await until(() => bodies(adapter).some((b) => b.includes('Réponse IA test')), 3000), 'Xchat ON : réponse au reply');
  assert.equal(received, 'et maintenant ?');
});

test('Reply au bot en PRIVÉ : toujours une réponse (même sans Xchat)', async () => {
  const { bot, adapter } = await bootGroup({
    serviceStubs: { chat: { reply: async () => 'Salut en privé !', clear() {}, resetAll() {} } },
  });
  clearCooldowns(bot);
  await bot.handleMessage(replyTo('m-priv', UIDS.shadow, UIDS.shadow, 'coucou'));
  assert.ok(await until(() => bodies(adapter).some((b) => b.includes('Salut en privé')), 3000));
});

test('Xonlyadmin ON : non-admins ignorés silencieusement — OFF : tout revient', async () => {
  const { bot, adapter, db } = await bootGroup();
  clearCooldowns(bot);
  const before = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xmenu'));
  await until(() => adapter.sent.length > before, 3000);

  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xonlyadmin on'));
  assert.ok(await until(() => bodies(adapter).some((b) => /XONLYADMIN — ACTIV[ÉE]/.test(b)), 3000), 'confirmation ON');
  assert.equal(db.getGroup('thread-1').onlyAdmin, true, 'état persisté');

  const marked = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xmenu'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'Xquiz'));
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(adapter.sent.length, marked, 'aucune réponse aux non-admins');

  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xonlyadmin off'));
  assert.ok(await until(() => bodies(adapter).some((b) => /XONLYADMIN — DÉSACTIV[ÉE]/.test(b)), 3000), 'confirmation OFF');
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xmenu'));
  assert.ok(await until(() => adapter.sent.length > marked, 3000), 'non-admins servis à nouveau');
});

test('Xjarvis : CERVEAU 100 % LOCAL — « shifumi » exécute Xrps SANS AUCUNE API', async () => {
  const { bot, adapter } = await bootGroup();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xjarvis on'));
  assert.ok(await until(() => bodies(adapter).some((b) => /JARVIS — ACTIV[ÉE]/.test(b)), 3000), 'mode activé');

  bot.services.aiPool.ask = async () => {
    throw new Error('API EXTERNE INTERDITE EN MODE JARVIS');
  };
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'mernel on joue au shifumi'));
  const all = bodies(adapter);
  assert.ok(all.some((b) => /Pierre, feuille, ciseaux/.test(b)), 'annonce du cerveau local');
  assert.ok(all.some((b) => /PIERRE-FEUILLE-CISEAUX|Choisis ton arme/.test(b)), 'Xrps exécuté automatiquement');
  assert.ok(!all.some((b) => b.includes('API EXTERNE INTERDITE')), 'aucune API appelée');
});

test('Xjarvis : mémoire des prénoms PERSISTÉE en base (le cerveau se souvient)', async () => {
  const { bot, adapter, db } = await bootGroup();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xjarvis on'));
  await until(() => bodies(adapter).some((b) => /JARVIS — ACTIV/.test(b)), 3000);

  bot.services.aiPool.ask = async () => {
    throw new Error('API EXTERNE INTERDITE EN MODE JARVIS');
  };
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, "je m'appelle Paul"));
  assert.ok(await until(() => bodies(adapter).some((b) => /Enchanté Paul/.test(b)), 3000), 'prénom appris');
  assert.equal(db.getUser(UIDS.paul).jarvisName, 'Paul', 'prénom persisté en base');

  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'qui suis-je ?'));
  assert.ok(await until(() => bodies(adapter).some((b) => /Tu es Paul/.test(b)), 3000), 'le cerveau se souvient');
});

test('Xjarvis : commandes ADMIN jamais exécutées (refus du cerveau local)', async () => {
  const { bot, adapter, db } = await bootGroup();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xjarvis on'));
  await until(() => bodies(adapter).some((b) => /JARVIS — ACTIV/.test(b)), 3000);

  bot.services.aiPool.ask = async () => {
    throw new Error('API EXTERNE INTERDITE EN MODE JARVIS');
  };
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'banne Paul'));
  const all = bodies(adapter);
  assert.ok(all.some((b) => /administration/.test(b)), 'refus expliqué par le cerveau');
  assert.ok(!db.ensureUser(UIDS.paul).banned, 'aucun ban appliqué');
});

test('Xteam : flux complet — refus non-admin, 2 groupes, recrutement par reply, lancement, réponse, stop', async () => {
  const { bot, adapter } = await bootGroup();
  clearCooldowns(bot);

  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xteam'));
  assert.ok(await until(() => bodies(adapter).some((b) => /ACCÈS REFUSÉ/.test(b)), 3000), 'non-admin refusé');

  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xteam'));
  assert.ok(await until(() => bodies(adapter).some((b) => /COMBIEN DE GROUPES/.test(b)), 3000), 'nb groupes demandé');

  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, '2'));
  assert.ok(await until(() => bodies(adapter).some((b) => /COMBIEN DE MEMBRES PAR GROUPE/.test(b)), 3000), 'taille demandée');

  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, '1'));
  assert.ok(await until(() => bodies(adapter).some((b) => /RECRUTEMENT — GROUPE 1/.test(b)), 3000), 'recrutement groupe 1');

  // Paul rejoint en répondant au message du bot
  await bot.handleMessage(replyTo('x1', UIDS.paul, 'thread-1', 'moi !'));
  assert.ok(await until(() => bodies(adapter).some((b) => /RECRUTEMENT — GROUPE 2/.test(b)), 3000), 'paul enregistré → groupe 2');
  assert.ok(bodies(adapter).some((b) => /rejoint/.test(b) && /Groupe 1/.test(b)), 'annonce de join');

  // Fortiche rejoint le groupe 2 → DERNIER groupe rempli = lancement direct
  await bot.handleMessage(replyTo('x1', UIDS.fortiche, 'thread-1', 'présent'));
  assert.ok(await until(() => bodies(adapter).some((b) => /XTEAM LANC[ÉE]/.test(b)), 5000), 'groupes pleins → quiz lancé');
  assert.ok(await until(() => bodies(adapter).some((b) => /1\/50/.test(unbold(b))), 5000), '50 questions (5 rubriques × 10)');

  // Bonne réponse de Paul (Groupe 1)
  const session = bot.sessions.get('thread-1', 'xteam');
  assert.ok(session && Array.isArray(session.questions) && session.questions[0], 'session active avec questions');
  const q = session.questions[0];
  const before = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, String(q.a)));
  assert.ok(await until(() => adapter.sent.length > before && /BONNE R[ÉE]PONSE/.test(unbold(adapter.sent[adapter.sent.length - 1].payload.body || '')), 3000), 'réponse acceptée');
  assert.ok(/Groupe 1/.test(unbold(adapter.sent[adapter.sent.length - 1].payload.body || '')), 'point pour le Groupe 1');

  // Stop par l admin lanceur
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'stop'));
  assert.ok(await until(() => bodies(adapter).some((b) => /annul[ée]/i.test(b)), 3000), 'annulé proprement');
});

test('Xteam : récompenses — équipe gagnante +200/membre, meilleur buteur +600', async () => {
  const { bot, adapter } = await bootGroup();
  const { TeamQuizSession } = require('../systems/teamQuiz');
  const s = new TeamQuizSession(bot, { threadID: 't-rw', ownerID: UIDS.admin, ownerName: 'Admin', send: async () => {} });
  s.teams = [
    { name: 'Groupe 1', members: new Map([[UIDS.shadow, { name: 'Shadow', score: 3 }], [UIDS.paul, { name: 'Paul', score: 1 }]]) },
    { name: 'Groupe 2', members: new Map([[UIDS.fortiche, { name: 'Fortiche', score: 1 }]]) },
  ];
  bot.db.ensureUser(UIDS.shadow);
  bot.db.ensureUser(UIDS.paul);
  bot.db.ensureUser(UIDS.fortiche);
  const beforeShadow = bot.economy.getBalance(UIDS.shadow);
  const beforePaul = bot.economy.getBalance(UIDS.paul);
  const beforeFortiche = bot.economy.getBalance(UIDS.fortiche);
  await s._finish();
  assert.equal(bot.economy.getBalance(UIDS.shadow), beforeShadow + 200 + 600, 'Shadow : +200 (équipe) +600 (MVP)');
  assert.equal(bot.economy.getBalance(UIDS.paul), beforePaul + 200, 'Paul : +200 (équipe gagnante)');
  assert.equal(bot.economy.getBalance(UIDS.fortiche), beforeFortiche, 'équipe perdante : rien');
  void adapter;
});

test('Xduel : catégorie drapeau (pays) — banque QCM 4 options', async () => {
  assert.equal(resolveDuelCategory('drapeau'), 'drapeau');
  assert.equal(resolveDuelCategory('flag'), 'drapeau');
  assert.equal(resolveDuelCategory('pays'), 'drapeau');
  const bank = loadDuelBank('drapeau');
  assert.ok(bank.length >= 100, `banque drapeau chargée (${bank.length} ≥ 100)`);
  for (const q of bank.slice(0, 20)) {
    assert.equal(q.options.length, 4, 'QCM 4 options');
    assert.ok(q.options.includes(q.answer), 'answer ∈ options');
  }
});

test('Xanime : requêtes AniList avec Referer + User-Agent identifiables', async () => {
  const { bot } = await bootGroup();
  const seen = [];
  const fetchImpl = async (url, opts = {}) => {
    seen.push({ url: String(url), opts });
    return { ok: true, status: 200, json: async () => ({ data: { Media: null } }) };
  };
  const xanime = require('../commands/media/xanime');
  await xanime.run({
    bot,
    args: ['death note'],
    event: makeMsg(UIDS.shadow, UIDS.shadow, 'Xanime death note'),
    send: async () => {},
    reply: async () => {},
    typingIndicator: async () => {},
    sendTyping: async () => {},
    adapter: bot.adapter,
    fetchImpl,
    config: bot.config,
    fmt: require('../utils/formatter'),
  });
  const gql = seen.find((s) => /graphql/.test(s.url));
  assert.ok(gql, 'appel GraphQL AniList');
  assert.equal(gql.opts.headers.Referer, 'https://anilist.co/', 'header Referer requis (anti-403)');
  assert.ok(/MeR~NeL|MERNEL/i.test(gql.opts.headers['User-Agent']), 'User-Agent identifiable');
  assert.ok(/death note/i.test(String(gql.opts.body)), 'recherche par titre');
});

test('Xask / Xai : prompt NEUTRE FACTUEL — aucune persona', async () => {
  const captured = [];
  const fakePool = {
    ask: async (q, opts = {}) => {
      captured.push(opts.system || '');
      return { text: 'La Tour Eiffel mesure 330 m.', provider: 't' };
    },
  };
  const silent = { warn() {}, error() {}, info() {}, debug() {} };
  const { createAiService } = require('../services/ai');
  const ai = createAiService(silent, fakePool);
  const out = await ai.ask('Taille de la Tour Eiffel ?');
  assert.ok(out.includes('330'), 'réponse renvoyée');
  const sys = captured[0];
  assert.ok(/factuel/i.test(sys), 'prompt factuel');
  assert.ok(!/sarcastique/i.test(sys), 'persona sarcastique supprimée');
  assert.ok(!/PAS ChatGPT/.test(sys), 'identité MeR~NEL absente de Xask/Xai');
});

test('Xprofil : la carte est GÉNÉRÉE EN IMAGE (PNG)', async () => {
  const { bot, adapter, config } = await bootGroup();
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xprofil'));
  assert.ok(
    await until(() => adapter.sent.some((s) => s.payload && s.payload.attachment), 8000),
    'un fichier image est envoyé'
  );
  const item = adapter.sent.find((s) => s.payload && s.payload.attachment);
  assert.ok(/PROFIL/i.test(unbold(item.payload.body || '')), 'légende profil');
  const p = item.payload.attachment.path;
  assert.ok(p && fs.existsSync(p), 'fichier PNG existant');
  const head = fs.readFileSync(p).subarray(0, 8);
  assert.deepEqual([...head], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'signature PNG');
  void config;
});

test('Xlove : image composée (PNG) ou repli propre — jamais de crash', async () => {
  const { bot, adapter } = await bootGroup();
  clearCooldowns(bot);
  bot.adapter.getThreadInfo = async () => ({
    userInfo: [
      { id: UIDS.shadow, name: 'Shadow', thumbSrc: '' },
      { id: UIDS.paul, name: 'Paul', thumbSrc: '' },
    ],
    participantIDs: [UIDS.shadow, UIDS.paul],
  });
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xlove'));
  assert.ok(await until(() => bodies(adapter).some((b) => /XLOVE/.test(b)), 5000), 'réponse Xlove');
  const body = bodies(adapter).find((b) => /XLOVE/.test(b));
  assert.ok(body, 'frame Xlove');
});

test('makeChecker STRICT : fautes sur mots < 7 refusées, ≥ 7 tolérées (1 max)', () => {
  const ck = makeChecker(['Attaque des Titans'], []);
  assert.equal(ck('attaque des titans'), true, 'exact');
  assert.equal(ck('titans'), true, 'mot clé seul');
  assert.equal(ck('titan'), false, 'tronqué refusé');
  const ck2 = makeChecker(['Demon Slayer'], []);
  assert.equal(ck2('demon slayerr'), false, 'mot 6 lettres : faute refusée');
  const ck3 = makeChecker(['Kimetsu no Yaiba'], []);
  assert.equal(ck3('kimetsu no yaiba'), true);
  assert.equal(ck3('yaiba'), true);
  assert.equal(ck3('yaib'), false);
});
