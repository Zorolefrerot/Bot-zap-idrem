'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { makeChecker } = require('../systems/mangaQuiz');
const { boot, until, makeMsg, lastBody, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
const cgBank = require('../systems/questions/cg.json');
const multiversBank = require('../systems/questions/multivers.json');

async function nextFrame(adapter, re, ms = 15000, from = 0) {
  const ok = await until(() => bodies(adapter).slice(from).some((b) => re.test(b)), ms);
  if (!ok) return null;
  return bodies(adapter).slice(from).find((b) => re.test(b)) || null;
}

/* ═══════════ VÉRIFICATEUR STRICT (Xid + tous les quiz) ═══════════ */

test('makeChecker STRICT : une autre réponse du quiz = FAUX même bien orthographiée', () => {
  const others = ['Naruto Uzumaki', 'Sakura Haruno', 'Kakashi Hatake', 'Monkey D. Luffy'];
  const ck = makeChecker(['Sasuke Uchiha'], others);
  assert.equal(ck('Sasuke Uchiha'), true, 'exact accepté');
  assert.equal(ck('sasuke'), true, 'nom seul accepté');
  assert.equal(ck('sasuké'), true, 'accent toléré');
  assert.equal(ck('sasuk'), true, 'petite faute tolérée (mot ≥5)');
  assert.equal(ck('Sakura Haruno'), false, 'autre réponse = faux');
  assert.equal(ck('Sakoura'), false, 'autre réponse MAL ORTHOGRAPHIÉE = faux (le strict anti-triche)');
  assert.equal(ck('Narouto'), false, 'autre réponse avec faute = faux');
  assert.equal(ck('Luffy'), false, 'autre prénom = faux');
});

test('makeChecker : mot court → tolérance de faute désactivée (variantes OK)', () => {
  const ck = makeChecker(['Gojo'], ['Geto', 'Nanami']);
  assert.equal(ck('gojo'), true);
  assert.equal(ck('gojoo'), true, 'oo→o = variante légitime');
  assert.equal(ck('goujou'), true, 'variante phonétique connue (ou→o)');
  assert.equal(ck('goj'), false, 'mot court : pas de flou sur lettres manquantes');
  assert.equal(ck('gojos'), false, 'mot court : pas de flou sur lettres ajoutées');
  assert.equal(ck('geto'), false, 'autre réponse = faux');
});

test('makeChecker : banque vide (Xid solo) reste permissive sur les fautes', () => {
  const ck = makeChecker(['Kinshasa'], []);
  assert.equal(ck('kinshasa'), true);
  assert.equal(ck('kinchasa'), true, '1 faute sur mot long');
  assert.equal(ck('kin'), false);
});

/* ═══════════ XQUIZ : TAGS À LA FIN + REGROUPEMENT ═══════════ */

test('Xquiz CG : le THÈME est affiché À LA FIN de chaque question (🏷️)', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  const q = await nextFrame(adapter, /QUESTION 1\/5/, 15000, from);
  assert.ok(q, 'question posée');
  const plain = unbold(q);
  assert.ok(/🏷️\s*Thème\s*:/.test(plain), 'ligne Thème présente');
  const linesArr = plain.trim().split('\n');
  const qi = linesArr.findIndex((l) => l.includes('🧩'));
  const ti = linesArr.findIndex((l) => l.includes('🏷️'));
  const footer = linesArr.findIndex((l) => l.includes('MeR~NEL'));
  assert.ok(ti > qi && ti < footer, `le thème est APRÈS la question, en fin de cadre (q=${qi}, tag=${ti}, footer=${footer})`);
  const label = ((plain.match(/🧩\s*(.+)/) || [])[1] || '').trim();
  const item = cgBank.find((x) => x.q === label);
  assert.ok(item, `question retrouvée dans la banque (${label})`);
  assert.ok(plain.includes(item.tag), `tag correct : ${item.tag}`);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

test('Xquiz MULTIVERS : le MANGA est affiché À LA FIN (📚), pas comme indice', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'MULTIVERS'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  const q = await nextFrame(adapter, /QUESTION 1\/5/, 15000, from);
  assert.ok(q, 'question posée');
  const plain = unbold(q);
  assert.ok(/📚\s*Manga\s*:/.test(plain), 'ligne Manga présente');
  const linesArr = plain.trim().split('\n');
  const qi = linesArr.findIndex((l) => l.includes('🧩'));
  const ti = linesArr.findIndex((l) => l.includes('📚'));
  const footer = linesArr.findIndex((l) => l.includes('MeR~NEL'));
  assert.ok(ti > qi && ti < footer, `le manga est APRÈS la question, en fin de cadre (q=${qi}, tag=${ti}, footer=${footer})`);
  const tag = (plain.match(/📚\s*Manga\s*:\s*(.+)/) || [])[1];
  const knownTags = new Set(multiversBank.map((x) => x.tag));
  assert.ok(tag && knownTags.has(tag), `tag = un vrai manga de la banque (${tag})`);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

test('Xquiz : questions REGROUPÉES par manga/thème (ordre des groupes aléatoire)', async () => {
  const { GroupQuizSession } = require('../systems/quiz');
  const { bot } = await boot();
  const s = new GroupQuizSession(bot, 'thread-1', 'cg', 10);
  const tags = s.questions.map((q) => q.tag || '');
  const seq = [];
  for (const t of tags) {
    if (seq[seq.length - 1] !== t) seq.push(t);
  }
  const uniqueTags = new Set(tags);
  assert.equal(seq.length, uniqueTags.size, 'chaque tag forme UN bloc contigu');
  assert.ok(s.questions.every((q) => q.tag), 'toutes les questions CG ont un tag');
});

test('Xquiz : réponse d’UN AUTRE PERSONNAGE du quiz rejetée même avec fautes', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'CG'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '5'));
  const q = await nextFrame(adapter, /QUESTION 1\/5/, 15000, from);
  assert.ok(q, 'cadre question');
  const plain = unbold(q);
  const label = ((plain.match(/🧩\s*(.+)/) || [])[1] || '').trim();
  const item = cgBank.find((x) => x.q === label);
  assert.ok(item, `question retrouvée (${label})`);
  // Prend une AUTRE réponse de la banque, mal orthographiée.
  const other = cgBank.find((x) => x.a !== item.a && !item.alts?.includes(x.a));
  assert.ok(other, 'autre réponse trouvée');
  const typo = other.a.slice(0, -1); // on retire la dernière lettre → « faute »
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, typo));
  await new Promise((r) => setTimeout(r, 300));
  const noPoint = bodies(adapter).slice(from).every((b) => !b.includes('@Paul') || !b.includes('prend le point'));
  assert.ok(noPoint, 'pas de point donné pour une autre réponse');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cancel'));
});

/* ═══════════ XPOLICE ═══════════ */

const fmt = require('../utils/formatter');

function miniCtx(send, args) {
  return { args, fmt, send };
}

test('Xpolice seul : liste des 20 styles', async () => {
  const sent = [];
  const xpolice = require('../commands/fun/xpolice');
  await xpolice.run(miniCtx((p) => sent.push(p.body || p), []));
  const out = unbold(sent.join('\n'));
  const listed = out.split('\n').filter((l) => l.includes('▸')).length;
  assert.equal(listed, 20, 'exactement 20 styles listés');
  assert.match(out, /20 POLICES/);
  const ids = ['gras', 'italique', 'italique-gras', 'script', 'script-gras', 'gothique', 'gothique-gras', 'double', 'sans', 'sans-gras', 'sans-italique', 'sans-italique-gras', 'monospace', 'cerclé', 'cerclé-noir', 'carré', 'carré-noir', 'parenthese', 'petites-caps', 'renversé'];
  for (const id of ids) assert.ok(out.includes(id), `style ${id} listé`);
});

test('Xpolice italique : texte transformé en italique Unicode', async () => {
  const sent = [];
  const xpolice = require('../commands/fun/xpolice');
  await xpolice.run(miniCtx((p) => sent.push(p.body || p), ['italique', 'j’aime', 'mernel']));
  const out = sent[0];
  assert.ok(out.length > 0);
  assert.ok(!out.includes('gras'), 'pas la liste');
  assert.ok(/[\u{1D434}-\u{1D467}]/u.test(out), 'caractères italique math');
});

test('Xpolice style inconnu : liste renvoyée avec les 20 noms', async () => {
  const sent = [];
  const xpolice = require('../commands/fun/xpolice');
  await xpolice.run(miniCtx((p) => sent.push(p.body || p), ['wingdings', 'coucou']));
  const out = unbold(sent.join('\n'));
  assert.match(out, /inconnue/);
  assert.ok(out.includes('gras') && out.includes('renversé'), 'liste des styles en secours');
});

/* ═══════════ XRPS ═══════════ */

test('Xrps : coup joué → résultat tranché (gagné/perdu/égalité)', async () => {
  const sent = [];
  const xrps = require('../commands/games/xrps');
  await xrps.run(miniCtx((p) => sent.push(p.body || p), ['pierre']));
  const out = unbold(sent.join('\n'));
  assert.ok(/GAGNE|ÉGALITÉ/.test(out), `verdict présent: ${out.slice(0, 80)}`);
  assert.ok(out.includes('pierre'));
  await xrps.run(miniCtx((p) => sent.push(p.body || p), ['shifumi']));
  assert.ok(unbold(sent[sent.length - 1]).includes('Choisis'), 'sans arme → rappel des choix');
});

/* ═══════════ XBET ═══════════ */

const { BetEngine, TEAMS, MIN_MISE, simulate } = require('../systems/xbet');

function fakeBot() {
  const data = {};
  return {
    db: {
      betState: (g) => {
        if (!data[g]) data[g] = { pairs: [], card: null, bets: {} };
        return data[g];
      },
      bets: { save: () => {}, data: {} },
      ensureUser: (uid) => ({ xcoins: 10000 }),
      users: { save: () => {} },
      stats: { add: () => {} },
    },
    fmt,
    sendLog: [],
  };
}

test('Xbet : manche = 10 affrontements d’équipes réelles, duos JAMAIS répétés entre manches', () => {
  const bot = fakeBot();
  const engine = new BetEngine(bot);
  const card1 = engine.newRound('g1');
  assert.equal(card1.length, 10);
  for (const m of card1) {
    assert.ok(m.a[0] && m.b[0], 'équipes nommées');
    assert.ok(m.a[1] >= 50 && m.a[1] <= 100, 'puissance /100');
    assert.ok(m.odds.vA >= 1 && m.odds.vB >= 1);
  }
  const card2 = engine.newRound('g1');
  const pairs1 = new Set(card1.map((m) => [m.a[0], m.b[0]].sort().join('|')));
  for (const m of card2) {
    assert.ok(!pairs1.has([m.a[0], m.b[0]].sort().join('|')), 'duo jamais rejoué');
  }
});

test('Xbet : validations (n° invalide, match pris, mise < 100, mauvaise équipe)', () => {
  const bot = fakeBot();
  const engine = new BetEngine(bot);
  engine.newRound('g1');
  assert.equal(engine.placeBet('g1', 'u1', '99', 'a', 'v', 100).error, 'numero');
  assert.ok(engine.placeBet('g1', 'u1', '1', 'a', 'v', 50).message.includes('100'), 'mise minimum');
  assert.equal(engine.placeBet('g1', 'u1', '1', 'z', 'v', 100).error, 'equipe');
  assert.equal(engine.placeBet('g1', 'u1', '1', 'a', 'x', 100).error, 'issue');
  const ok = engine.placeBet('g1', 'u1', '1', 'a', 'v', 100);
  assert.equal(ok.ok, true, 'pari valide accepté');
  assert.equal(engine.placeBet('g1', 'u2', '1', 'b', 'n', 500).error, 'pris', '1 pari par match');
});

test('Xbet : résolution 30 s → gain/perte XCoins, match retiré de la carte', async () => {
  const bot = fakeBot();
  const engine = new BetEngine(bot);
  engine.newRound('g1');
  const bet = engine.placeBet('g1', 'u1', '1', 'a', 'v', 100);
  assert.equal(bet.ok, true);
  const st = bot.db.betState('g1');
  // Force l'échéance dans le passé → sweep la résout.
  st.bets[0].resolvesAt = Date.now() - 1000;
  const msgs = await engine.sweep('g1');
  assert.equal(msgs.length, 1, 'message de résultat');
  assert.ok(/XBET — RÉSULTAT/.test(unbold(msgs[0].body)));
  assert.ok(!st.bets[0], 'pari réglé et retiré');
  assert.equal(st.card.length, 9, 'match retiré de la carte');
});

test('Xbet : simulate réaliste — le favori gagne nettement plus souvent', () => {
  const strong = ['Real Madrid', 95];
  const weak = ['Everton', 66];
  let fav = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    if (simulate(strong, weak) === 'A') fav++;
  }
  const ratio = fav / N;
  // Espérance ≈ 63 % (pA = 0.5 + 29/220) — bande large = zéro flocon statistique.
  assert.ok(ratio > 0.55 && ratio < 0.75, `favori ~63 % (obtenu ${(ratio * 100).toFixed(0)} %)`);
});

test('Xbet via le bot : carte affichée puis pari complet accepté', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xbet'));
  const card = await nextFrame(adapter, /XBET — MANCHE/, 15000, from);
  assert.ok(card, 'manche affichée');
  const cardPlain = unbold(card);
  assert.ok(cardPlain.includes('Xbet <n°> <a|b> <v|n|d> <mise>'), 'format du pari rappelé');
  clearCooldowns(bot); // anti-répétition 3 s sinon le 2e Xbet est ignoré
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xbet 1 a v 150'));
  const ok = await nextFrame(adapter, /🎲/, 15000, from);
  assert.ok(ok, 'pari enregistré');
  const okPlain = unbold(ok);
  assert.ok(okPlain.includes('30 secondes'));
  assert.ok(okPlain.includes('150'), 'mise reprise');
});

/* ═══════════ XUPT ═══════════ */

test('Xupt : uptime + capacités + vitalité', async () => {
  const { bot, adapter } = await boot();
  clearCooldowns(bot);
  const from = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xupt'));
  const out = await nextFrame(adapter, /XUPT|En activité/, 15000, from);
  assert.ok(out, 'cadre Xupt');
  const plain = unbold(out);
  assert.ok(plain.includes('CAPACITÉS'));
  assert.ok(plain.includes('VITALITÉ'));
  assert.ok(plain.includes('Veille auto'));
});

/* ═══════════ XANIME (AniList stubbé) ═══════════ */

test('Xanime : fiche wiki (image téléchargée + infos)', async () => {
  const sent = [];
  const xanime = require('../commands/media/xanime');
  const fakeFetch = async (url, opts) => {
    if (String(url).includes('graphql.anilist.co')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            Media: {
              id: 1,
              title: { romaji: 'Death Note', native: 'デスノート' },
              format: 'TV',
              episodes: 37,
              duration: 23,
              status: 'FINISHED',
              season: 'WINTER',
              seasonYear: 2007,
              averageScore: 84,
              popularity: 500000,
              genres: ['Mystère', 'Thriller'],
              studios: { nodes: [{ name: 'Madhouse' }] },
              description: '<p>Un carnet mortel.</p>',
              coverImage: { extraLarge: 'https://s4.anilist.co/fake.jpg' },
              siteUrl: 'https://anilist.co/anime/1',
            },
          },
        }),
        headers: { get: () => 'application/json' },
      };
    }
    // downloadImage
    return {
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => new ArrayBuffer(2000),
    };
  };
  const ctx = {
    args: ['death', 'note'],
    fmt,
    fetchImpl: fakeFetch,
    config: { tmpDir: '/tmp/xanime-test' },
    send: async (p) => sent.push(p),
  };
  await xanime.run(ctx);
  assert.equal(sent.length, 1);
  const payload = sent[0];
  const plain = unbold(payload.body);
  assert.ok(plain.includes('DEATH NOTE'), 'titre dans le cadre');
  assert.ok(plain.includes('Madhouse'), 'studio');
  assert.ok(plain.includes('37'), 'épisodes');
  assert.ok(plain.includes('84/100'), 'note');
  assert.ok(payload.attachment && String(payload.attachment).endsWith('.jpg'), 'image attachée');
  require('fs').rmSync('/tmp/xanime-test', { recursive: true, force: true });
});

test('Xanime sans argument → exemple ; animé inconnu → message propre', async () => {
  const sent = [];
  const xanime = require('../commands/media/xanime');
  await xanime.run({ args: [], fmt, send: (p) => sent.push(p), fetchImpl: async () => ({ ok: false }), config: { tmpDir: '/tmp' } });
  assert.match(unbold(String(sent[0].body || sent[0])), /Exemple/);
  await xanime.run({
    args: ['zzzz-inconnu'],
    fmt,
    fetchImpl: async () => ({ ok: true, json: async () => ({ data: { Media: null } }), headers: { get: () => 'application/json' } }),
    config: { tmpDir: '/tmp' },
    send: (p) => sent.push(p),
  });
  assert.ok(/introuvable/.test(unbold(String(sent[1].body || sent[1]))));
});

/* ═══════════ XCHAT : persona enrichie + format OpenAI ═══════════ */

test('Xchat : persona drôle/intelligent/empathique/s’énerve vite/blagues', async () => {
  const { createChatService } = require('../services/chat');
  const config = require('../core/config');
  let capturedSystem = '';
  const fakePool = {
    ask: async (q, opts) => {
      capturedSystem = opts.system;
      return { text: 'Héhé 😄', provider: 'test' };
    },
  };
  const chat = createChatService({ warn: () => {} }, fakePool);
  const answer = await chat.reply({ threadID: 't1', userID: 'u1', userName: 'Shadow', text: 'salut' });
  assert.equal(answer, 'Héhé 😄');
  for (const word of ['drôle', 'intelligent', 'empathique', 'énerves', 'blagues', 'rigoles']) {
    assert.ok(capturedSystem.includes(word), `persona contient « ${word} »`);
  }
  assert.ok(capturedSystem.includes(config.botName));
});

test('aiPool : format OpenAI JSON parsé (choices[].message.content) + 6 fournisseurs', async () => {
  const { createAiPool } = require('../services/aiPool');
  let call = 0;
  const fake = async () => {
    call++;
    if (call === 1) return { ok: false, status: 500, headers: { get: () => '' } }; // 1er down
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: 'Réponse OpenAI-format 😄' } }] }),
    };
  };
  const pool = createAiPool({ warn: () => {} }, { fetchImpl: fake });
  assert.equal(pool.providersList().length, 6, '6 fournisseurs dans le pool');
  const r = await pool.ask('test');
  assert.ok(r.text.includes('Réponse OpenAI-format'));
  assert.ok(/ollinations/i.test(r.provider), `fournisseur pollinations (${r.provider})`);
});
