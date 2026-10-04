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
  assert.equal(ck('sasuk'), false, 'mot 6 lettres : AUCUNE faute tolérée (strict)');
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

test('makeChecker : banque vide (Xid solo) — fautes sur mots ≥7 uniquement', () => {
  const ck = makeChecker(['Kinshasa'], []);
  assert.equal(ck('kinshasa'), true);
  assert.equal(ck('kinchasa'), true, '1 faute sur mot 8 lettres (≥7) OK');
  assert.equal(ck('sakura'), false, 'mot 6 lettres : fautes refusées');
  const ck2 = makeChecker(['Wakanda Forever'], []);
  assert.equal(ck2('Wakanda Foreve'), false, 'mot 6 lettres : pas de flou');
  assert.equal(ck2('Wakanda Forrver'), true, 'mot 7 lettres : 1 substitution acceptée');
  assert.equal(ck2('Wakanda Forrvex'), false, '2 fautes refusées');
  assert.equal(ck2('Wakanda Forrrever'), false);
  assert.equal(ck2('Wakanda Fornever'), true, 'mot 8 lettres : 1 faute acceptée');
  assert.equal(ck2('wakanda forever'), true);
  assert.equal(ck2('Wakanda'), true, 'mot clé seul');
  assert.equal(ck2('Forever Wakanda'), true, 'mots inversés');
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

/* ════════ NOUVELLES RUBRIQUES : EMOJI, ZIK, MÉMORIAL, LOGO ════════ */

const { CATEGORIES, loadBank, resolveCategory, resolveDuelCategory, loadDuelBank } = require('../systems/questions');

test('NOUVELLES BANQUES : emoji ≥200, zik ≥200, memorial ≥200, logo ≥200, multivers & cg ≥500', () => {
  assert.ok(loadBank('emoji').length >= 200, `emoji: ${loadBank('emoji').length}`);
  assert.ok(loadBank('zik').length >= 200, `zik: ${loadBank('zik').length}`);
  assert.ok(loadBank('memorial').length >= 200, `memorial: ${loadBank('memorial').length}`);
  assert.ok(loadBank('logo').length >= 200, `logo: ${loadBank('logo').length}`);
  assert.ok(loadBank('multivers').length >= 500, `multivers: ${loadBank('multivers').length}`);
  assert.ok(loadBank('cg').length >= 500, `cg: ${loadBank('cg').length}`);
});

test('EMOJI : jamais de visage émotionnel, réponses courtes uniques', () => {
  const bank = loadBank('emoji');
  const faceRe = /[\u{1F600}-\u{1F64F}]/u; // bloc des visages/émotions
  for (const q of bank) {
    assert.ok(!faceRe.test(q.q), `pas d\u2019emoji visage : ${q.q}`);
    assert.ok(q.a && q.a.length >= 2, 'réponse présente');
  }
  assert.equal(new Set(bank.map((q) => q.q)).size, bank.length, 'chaque emoji = UNE seule question');
});

test('ZIK : chaque question relie artiste ↔ titre', () => {
  const bank = loadBank('zik');
  const artists = new Set(bank.map((q) => q.a.toLowerCase()));
  assert.ok(artists.has('fally ipupa'), 'Fally Ipupa présent');
  assert.ok(artists.has('aya nakamura'), 'Aya Nakamura présente');
  assert.ok(bank.some((q) => /Jerusalema/i.test(q.q)), 'Jerusalema dans la banque');
});

test('resolveCategory : emoji, zik, memorial (monument), logo (marque)', () => {
  assert.equal(resolveCategory('emoji'), 'emoji');
  assert.equal(resolveCategory('emoticone'), 'emoji');
  assert.equal(resolveCategory('zik'), 'zik');
  assert.equal(resolveCategory('musique'), 'zik');
  assert.equal(resolveCategory('memorial'), 'memorial');
  assert.equal(resolveCategory('monument'), 'memorial');
  assert.equal(resolveCategory('logo'), 'logo');
  assert.equal(resolveCategory('marque'), 'logo');
  // DUEL : emoji ajouté
  assert.equal(resolveDuelCategory('emoji'), 'emoji');
  const dbank = loadDuelBank('emoji');
  assert.ok(dbank.length >= 150, `duel emoji: ${dbank.length}`);
  assert.ok(dbank.every((q) => q.options && q.options.length === 4 && q.options.includes(q.answer)), 'QCM 4 options valides');
});

test('Xquiz EMOJI : l\u2019emoji s\u2019affiche en question et la réponse est acceptée', async () => {
  const { boot, until, makeMsg, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'emoji'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cinq'));
  assert.ok(await until(() => bodies(adapter).some((b) => /QUESTION 1\/5/.test(b)), 5000), 'quiz emoji 3 questions');
  const session = bot.sessions.get('thread-1', 'quiz');
  assert.ok(session && session.category === 'emoji', 'catégorie emoji');
  const q0 = session.questions[0];
  assert.ok(bodies(adapter).some((b) => b.includes(q0.q)), 'l\u2019emoji est affiché');
  const before = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, q0.a));
  assert.ok(await until(() => adapter.sent.length > before && /BONNE R[ÉE]PONSE/.test(unbold(adapter.sent[adapter.sent.length - 1].payload.body || '')), 3000), 'réponse acceptée');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'met fin'));
  await until(() => !bot.sessions.get('thread-1', 'quiz'), 3000);
});

test('Xquiz ZIK : le tube est demandé et l\u2019artiste accepté', async () => {
  const { boot, until, makeMsg, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'zik'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cinq'));
  assert.ok(await until(() => bodies(adapter).some((b) => /QUESTION 1\/5/.test(b)), 5000), 'quiz zik lancé');
  const session = bot.sessions.get('thread-1', 'quiz');
  const q0 = session.questions[0];
  const before = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, q0.a));
  assert.ok(await until(() => adapter.sent.length > before && /BONNE R[ÉE]PONSE/.test(unbold(adapter.sent[adapter.sent.length - 1].payload.body || '')), 3000), `réponse « ${q0.a} » acceptée`);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'met fin'));
  await until(() => !bot.sessions.get('thread-1', 'quiz'), 3000);
});

test('Xquiz MÉMORIAL : l\u2019image Wikipedia est téléchargée et envoyée', async () => {
  const { boot, until, makeMsg, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
  const { resetWikiCache } = require('../systems/wikiImage');
  resetWikiCache();
  const { bot, adapter } = await boot({});
  // stub fetch : summary Wikipedia → image ; téléchargement → buffer
  global.fetch = async (url) => {
    const u = String(url);
    if (/page\/summary/.test(u)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ originalimage: { source: 'https://upload.wikimedia.org/test/eiffel.jpg' } }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => new ArrayBuffer(2000),
    };
  };
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'memorial'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cinq'));
  assert.ok(await until(() => bodies(adapter).some((b) => /Quel est ce lieu c[ée]l[è]bre/.test(b)), 8000), 'question mémorial posée');
  assert.ok(adapter.sent.some((s) => s.payload && s.payload.attachment), 'IMAGE envoyée avec la question');
  const session = bot.sessions.get('thread-1', 'quiz');
  const q0 = session.questions[0];
  const before = adapter.sent.length;
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, q0.a));
  assert.ok(await until(() => adapter.sent.length > before && /BONNE R[ÉE]PONSE/.test(unbold(adapter.sent[adapter.sent.length - 1].payload.body || '')), 3000), `« ${q0.a} » accepté`);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'met fin'));
  await until(() => !bot.sessions.get('thread-1', 'quiz'), 3000);
});

test('Xquiz MÉMORIAL : image indisponible → item SAUTÉ, quiz continue', async () => {
  const { boot, until, makeMsg, bodies, UIDS, clearCooldowns } = require('./helpers');
  const { resetWikiCache } = require('../systems/wikiImage');
  resetWikiCache();
  const { bot, adapter } = await boot({});
  global.fetch = async () => ({ ok: false, status: 503 }); // tout en panne
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'memorial'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cinq'));
  await until(() => bodies(adapter).some((b) => /INDISPONIBLES/.test(b)), 20000);
  assert.ok(bodies(adapter).some((b) => /INDISPONIBLES/.test(b)), 'quiz arrêté proprement quand TOUT échoue');
  await until(() => !bot.sessions.get('thread-1', 'quiz'), 3000);
});

test('Xquiz LOGO : la question demande le logo et le thème est affiché', async () => {
  const { boot, until, makeMsg, bodies, UIDS, clearCooldowns } = require('./helpers');
  const { resetWikiCache } = require('../systems/wikiImage');
  resetWikiCache();
  const { bot, adapter } = await boot({});
  global.fetch = async (url) => {
    const u = String(url);
    if (/page\/summary/.test(u)) {
      return { ok: true, status: 200, json: async () => ({ thumbnail: { source: 'https://upload.wikimedia.org/test/logo.png' } }) };
    }
    return { ok: true, status: 200, headers: { get: () => 'image/png' }, arrayBuffer: async () => new ArrayBuffer(2000) };
  };
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xquiz'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'logo'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'cinq'));
  assert.ok(await until(() => bodies(adapter).some((b) => /Quel est ce logo/.test(b)), 8000), 'question logo posée');
  assert.ok(await until(() => bodies(adapter).some((b) => /Th[èe]me/.test(b)), 3000), 'thème affiché (Football, Auto, Tech…)');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'met fin'));
  await until(() => !bot.sessions.get('thread-1', 'quiz'), 3000);
});

test('Xduel : la catégorie EMOJI est acceptée dans le flux du duel', async () => {
  const { boot, until, makeMsg, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({});
  bot.adapter.getThreadInfo = async () => ({ threadName: 'G', adminIDs: [{ id: UIDS.admin }], userInfo: [{ id: UIDS.paul, name: 'Paul' }], participantIDs: [UIDS.shadow, UIDS.paul, UIDS.admin] });
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xduel'));
  assert.ok(await until(() => bodies(adapter).some((b) => /DUEL/.test(b)), 5000), 'duel ouvert');
  // Choix du dueliste 1 (soi-même) puis adversaire via mention de Paul
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'moi'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, `@Paul`, { mentions: { [UIDS.paul]: { tag: '@Paul', from: 0 } } }));
  // Catégorie EMOJI → acceptée : le duel passe directement au NOMBRE DE QUESTIONS
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'emoji'));
  assert.ok(await until(() => bodies(adapter).some((b) => /NOMBRE DE QUESTIONS/.test(b)), 3000), 'emoji accepté → choix du nombre de questions');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, '10'));
  assert.ok(await until(() => bodies(adapter).some((b) => /MISE|1v1/.test(unbold(b))), 3000), 'puis la mise');
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'met fin'));
  await until(() => !bot.sessions.get('thread-1', 'duel'), 3000);
});

test('Xteam : 9 rubriques × 5 questions = 45 au total', async () => {
  const { boot, until, makeMsg, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({});
  bot.adapter.getThreadInfo = async () => ({ threadName: 'G', adminIDs: [{ id: UIDS.admin }], userInfo: [{ id: UIDS.paul, name: 'Paul' }, { id: UIDS.fortiche, name: 'Fortiche' }], participantIDs: [UIDS.paul, UIDS.fortiche, UIDS.admin] });
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'Xteam'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, '2'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, '1'));
  await bot.handleMessage(makeMsg('thread-1', UIDS.paul, 'moi', { messageReply: { senderID: 'BOT_MOCK_000000', messageID: 'x1' } }));
  await bot.handleMessage(makeMsg('thread-1', UIDS.fortiche, 'moi', { messageReply: { senderID: 'BOT_MOCK_000000', messageID: 'x1' } }));
  assert.ok(await until(() => bodies(adapter).some((b) => /XTEAM LANC/.test(b)), 5000), 'lancé dès que les groupes sont pleins');
  assert.ok(await until(() => bodies(adapter).some((b) => /1\/45/.test(unbold(b))), 5000), '45 questions (9 rubriques × 5)');
  const session = bot.sessions.get('thread-1', 'xteam');
  assert.ok(session && session.total === 45, `total = 45 (reçu : ${session && session.total})`);
  const cats = new Set(session.questions.map((q) => q.cat));
  assert.equal(cats.size, 9, 'les 9 rubriques sont représentées');
  await bot.handleMessage(makeMsg('thread-1', UIDS.admin, 'stop'));
  await until(() => !bot.sessions.get('thread-1', 'xteam'), 3000);
});

/* ════════ XBET : carte propre, cotes haussées, résultat poussé à 30 s ════════ */

test('Xbet : carte TRIÉE (grosses affiches d’abord), sans puissance affichée', () => {
  const bot = fakeBot();
  const engine = new BetEngine(bot);
  const card = engine.newRound('g1');
  for (let i = 1; i < card.length; i++) {
    const prev = card[i - 1].a[1] + card[i - 1].b[1];
    const cur = card[i].a[1] + card[i].b[1];
    assert.ok(prev >= cur, `carte triée par affiche (${i})`);
  }
});

test('Xbet : cotes un peu plus hausses, SANS exagération', () => {
  const { oddsFor } = require('../systems/xbet');
  const top = oddsFor(['Real Madrid', 95], ['Modeste', 70]);
  const mid = oddsFor(['Moyenne', 75], ['Moyenne B', 74]);
  // Favori : ×1.25 (avant ×1.2) — mieux payé mais pas gifté
  assert.ok(top.vA >= 1.25 && top.vA <= 1.35, `favori ≈×1.25 (reçu ×${top.vA})`);
  // Nul passé de ×3.2 à ×3.8 (plafonné loin de l'exagération)
  assert.equal(top.nul, 3.8);
  // Défaites mieux payées (×1.9–3.4) mais plafonnées à ×5
  assert.ok(top.dA >= 3.0 && top.dA <= 3.6, `défaite du favori ≈×3.4 (reçu ×${top.dA})`);
  assert.ok(mid.vA >= 1.5 && mid.vA <= 1.7, `équilibre ≈×1.6 (reçu ×${mid.vA})`);
  // Plafonds absolus
  assert.ok(top.vA <= 4.5 && top.dA <= 5.0, 'jamais de cote mirobolante');
});

test('Xbet : le résultat part TOUT SEUL 30 s après le pari (somme + nouveau solde)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const bot = fakeBot();
  const sent = [];
  bot.send = async (payload, tid) => {
    sent.push({ tid, body: payload.body });
  };
  const engine = new BetEngine(bot);
  engine.newRound('g1');
  const bet = engine.placeBet('g1', 'u1', '1', 'a', 'v', 500);
  assert.equal(bet.ok, true);
  assert.equal(sent.length, 0, 'rien avant 30 s');
  t.mock.timers.tick(30_000);
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); // flush des promesses
  assert.equal(sent.length, 1, 'le résultat est poussé automatiquement');
  assert.equal(sent[0].tid, 'g1', 'dans la bonne conversation');
  const b = unbold(sent[0].body);
  assert.ok(/XBET — R[ÉE]SULTAT/.test(b), 'cadre résultat');
  assert.ok(/GAGN[ÉE] : \+|PERDU : −/.test(b), 'somme gagnée ou perdue explicite');
  assert.ok(/Nouveau solde/.test(b), 'nouveau solde affiché');
});

test('Xbet (bot réel) : carte sans /100 avec cotes, résultat + solde poussés', async () => {
  const { boot, until, makeMsg, bodies, unbold, UIDS, clearCooldowns } = require('./helpers');
  const { bot, adapter } = await boot({});
  clearCooldowns(bot);
  const u = bot.db.ensureUser(UIDS.shadow);
  u.xcoins = 5000;
  bot.db.users.save();
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xbet'));
  const cardBody = unbold(bodies(adapter).find((b) => /AFFRONTEMENTS/.test(b)) || '');
  assert.ok(cardBody.includes('×1.'), 'cotes affichées sur la carte');
  assert.ok(!/Puissance/.test(cardBody) && !/\/100/.test(cardBody), 'plus aucune puissance /100');
  assert.ok(/\d\. .*🆚/.test(cardBody), 'matchs numérotés proprement');
  // Pari (cooldown nettoyé entre chaque commande)
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xbet 1 a v 500'));
  const st = bot.db.betState('thread-1');
  assert.ok(st.bets && st.bets[0], 'pari enregistré');
  // Échéance forcée → le prochain Xbet (sweep) résout ET pousse le résultat
  st.bets[0].resolvesAt = Date.now() - 1000;
  clearCooldowns(bot);
  await bot.handleMessage(makeMsg('thread-1', UIDS.shadow, 'Xbet'));
  assert.ok(
    await until(() => bodies(adapter).some((b) => /XBET — R[ÉE]SULTAT/.test(unbold(b)) && /Nouveau solde/.test(unbold(b))), 5000),
    'résultat + somme + nouveau solde poussés dans la conversation'
  );
});
