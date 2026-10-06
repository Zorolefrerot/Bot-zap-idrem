'use strict';
/*
 * 🧬 MeR~NeL — systems/mangaQuiz.js  (Xid — quiz d'identification manga)
 * Sources SANS clé, en ROTATION automatique :
 *   1) AniList (GraphQL graphql.anilist.co — primaire, ~90 req/min) ;
 *   2) Jikan / MyAnimeList (repli si AniList tombe).
 *
 * Déroulé :
 *  - configuration réservée au lanceur : nom du manga (ou MULTIVERS) →
 *    nombre d'images (5 / 10 / 15 — accepté jusqu'à 20) ;
 *  - CHAQUE question : image du personnage → tout le groupe répond
 *    DIRECTEMENT (pas besoin de reply) — prénom OU nom OU nom complet ;
 *  - tolérance orthographique + variantes de traduction romaji
 *    (« Goujou » = « Gojo », accents, petites fautes de frappe) ;
 *  - première bonne réponse = +10 points AU senderID de celui qui répond ;
 *  - mauvaise réponse = silencieuse, on peut retenter (aucun blocage) ;
 *  - timer 15 s → « Temps écoulé + réponse » → suivante ;
 *  - fin : 🏁 CLASSEMENT (tableau de scores) + petits gains XCoins/XP.
 */

const fs = require('fs');
const path = require('path');
const fmt = require('../utils/formatter');
const { safeInt } = require('../utils/sanitize');

const JIKAN = 'https://api.jikan.moe/v4';
const ANILIST = 'https://graphql.anilist.co';

/* Requête GraphQL AniList (POST JSON, sans clé) → data ou erreur typée. */
async function anilistQuery(query, variables, fetchImpl) {
  const f = fetchImpl || global.fetch;
  let res;
  try {
    res = await f(ANILIST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // ⚠️ AniList refuse toute requête SANS Referer ni Authorization (HTTP 403
        // « disabled due to severe stability issues ») — le Referer suffit.
        Referer: 'https://anilist.co/',
        Origin: 'https://anilist.co',
        'User-Agent': 'MeRNeL-Bot/4 (+https://github.com/Zorolefrerot/Bot-zap-idrem)',
      },
      body: JSON.stringify({ query, variables: variables || {} }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw Object.assign(new Error('AniList timeout'), { code: 'ANILIST_TIMEOUT' });
    }
    throw Object.assign(new Error('AniList injoignable'), { code: 'ANILIST_UNREACHABLE' });
  }
  if (res.status === 429) throw Object.assign(new Error('AniList 429'), { code: 'ANILIST_RATE_LIMIT' });
  if (!res.ok) throw Object.assign(new Error(`AniList HTTP ${res.status}`), { code: 'ANILIST_ERROR' });
  const ctype = ((res.headers && res.headers.get && res.headers.get('content-type')) || '').toLowerCase();
  if (ctype.includes('text/html')) throw Object.assign(new Error('AniList HTML'), { code: 'ANILIST_BAD_RESPONSE' });
  const body = await res.json().catch(() => null);
  if (!body || body.errors) throw Object.assign(new Error('AniList errors'), { code: 'ANILIST_ERROR' });
  return body.data || {};
}

/* ═══ SANTÉ DES SOURCES ═══
 * Une source qui vient d'échouer est mise au repos 5 min (on ne retente pas
 * à chaque lancement) — la chaîne passe automatiquement à la suivante. */
const SOURCE_COOLDOWN_MS = 5 * 60 * 1000;
const sourceFailAt = { anilist: 0, kitsu: 0, jikan: 0 };
const isCoolingDown = (src) => Date.now() - sourceFailAt[src] < SOURCE_COOLDOWN_MS;
const markFail = (src) => {
  sourceFailAt[src] = Date.now();
};
const markOk = (src) => {
  sourceFailAt[src] = 0;
};
/* Reset de la santé des sources (tests / redémarrage). */
function resetSourceHealth() {
  sourceFailAt.anilist = 0;
  sourceFailAt.kitsu = 0;
  sourceFailAt.jikan = 0;
}

/* TOUTES les sources sont tombées → erreur combinée honnête (avant banque). */
function sourcesDown(errors) {
  const anyRate = errors.some((e) => /RATE_LIMIT/.test(e));
  return Object.assign(new Error(`Sources indisponibles (${errors.join(', ')})`), {
    code: anyRate ? 'QUIZ_RATE_LIMITED' : 'QUIZ_SOURCES_DOWN',
  });
}

/* ═══ FIABILITÉ : réessais + cache des réussites ═══
 * Transient (timeout, 429, 5xx) → 2ᵉ tentative après 1,2 s.
 * Chaque chargement réussi est mis en cache 10 min : un 2ᵉ quiz sur le
 * même manga ne refait AUCUNE requête. En cas de panne totale, le cache
 * reste utilisable jusqu'à 6 h (vraies images, pas d'indices). */
const NOT_FOUND_CODES = new Set(['ANILIST_NOT_FOUND', 'KITSU_NOT_FOUND', 'JIKAN_NOT_FOUND']);

async function withRetry(fn, tries = 2, delayMs = 1200) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (NOT_FOUND_CODES.has(err.code)) throw err; // inutile de réessayer
      lastErr = err;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

const CACHE_FRESH_MS = 10 * 60 * 1000; // frais : réutilisé sans réseau
const CACHE_STALE_MS = 6 * 60 * 60 * 1000; // périmé : secours si panne totale
const successCache = new Map(); // key → { at, source, players }
function cacheGet(key) {
  const hit = successCache.get(key);
  return hit || null;
}
function cacheSet(key, source, players) {
  successCache.set(key, { at: Date.now(), source, players });
}
/* Reset du cache (tests / redémarrage). */
function resetSourceCache() {
  successCache.clear();
}

/* ═══ KITSU — 3e source INDÉPENDANTE (ni AniList, ni MyAnimeList) ═══ */
const KITSU = 'https://kitsu.io/api/edge';

async function kitsuGet(url, fetchImpl) {
  const f = fetchImpl || global.fetch;
  let res;
  try {
    res = await f(url, {
      headers: { Accept: 'application/vnd.api+json', 'User-Agent': 'MeRNeL-Bot/4' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw Object.assign(new Error('Kitsu timeout'), { code: 'KITSU_TIMEOUT' });
    }
    throw Object.assign(new Error('Kitsu injoignable'), { code: 'KITSU_UNREACHABLE' });
  }
  if (res.status === 429) throw Object.assign(new Error('Kitsu 429'), { code: 'KITSU_RATE_LIMIT' });
  if (!res.ok) throw Object.assign(new Error(`Kitsu HTTP ${res.status}`), { code: 'KITSU_ERROR' });
  const ctype = ((res.headers && res.headers.get && res.headers.get('content-type')) || '').toLowerCase();
  if (!ctype.includes('json')) throw Object.assign(new Error('Kitsu HTML'), { code: 'KITSU_BAD_RESPONSE' });
  const body = await res.json().catch(() => null);
  if (!body || !Array.isArray(body.data)) throw Object.assign(new Error('Kitsu vide'), { code: 'KITSU_BAD_RESPONSE' });
  return body;
}

/* Anime le plus proche d'un nom → { id, titre } */
async function kitsuFindAnime(name, fetchImpl) {
  const url = `${KITSU}/anime?filter[text]=${encodeURIComponent(name)}&page[limit]=1`;
  const body = await kitsuGet(url, fetchImpl);
  const item = body.data[0];
  if (!item) throw Object.assign(new Error('anime introuvable sur Kitsu'), { code: 'KITSU_NOT_FOUND' });
  const t = (item.attributes && (item.attributes.canonicalTitle || (item.attributes.titles && (item.attributes.titles.en || item.attributes.titles.en_jp)))) || name;
  return { id: item.id, titre: t };
}

/* Personnages (avec portrait) d'un animé Kitsu, priorité aux RÔLES PRINCIPAUX. */
async function kitsuCharactersOf(animeId, max, fetchImpl) {
  const url = `${KITSU}/anime/${animeId}/characters?include=character&page[limit]=20`;
  const body = await kitsuGet(url, fetchImpl);
  const byId = new Map();
  for (const inc of body.included || []) {
    if (inc.type === 'characters') byId.set(inc.id, inc.attributes || {}); // Kitsu : type PLURIEL
  }
  const rows = (body.data || [])
    .map((row) => {
      const ref = ((row.relationships || {}).character || {}).data;
      const attr = ref ? byId.get(ref.id) : null;
      if (!attr || !attr.canonicalName) return null;
      const img = attr.image && (attr.image.original || attr.image.large || attr.image.medium);
      if (!img) return null;
      const alts = ((attr.otherNames || [])).filter(Boolean).slice(0, 3);
      return { name: attr.canonicalName, image: img, alts, role: (row.attributes && row.attributes.role) || '' };
    })
    .filter(Boolean);
  rows.sort((a, b) => (a.role === 'main' ? -1 : 0) - (b.role === 'main' ? -1 : 0));
  return rows.slice(0, max);
}

/* Animes vedettes pour le mode MULTIVERS Kitsu. */
const KITSU_POPULAR = [
  'Naruto', 'One Piece', 'Dragon Ball', 'Attack on Titan', 'Bleach', 'Death Note',
  'Fullmetal Alchemist', 'Hunter x Hunter', 'My Hero Academia', 'Demon Slayer',
  'Jujutsu Kaisen', 'One Punch Man', 'Fairy Tail', 'Haikyu', 'Cowboy Bebop',
  'Steins;Gate', 'Code Geass', 'Vinland Saga',
];

/* Requête Jikan (repli) → data ou erreur typée. */
const { isCancelIntent, parseCount } = require('./natural');
const MAX_IMAGES = 100;

/* ── Comparaison de noms (rapide, 100 % local — aucun appel externe) ── */

/* Minuscules, sans accents, sans ponctuation, espaces réduits. */
function canonical(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/*
 * Variantes romaji courantes des traductions : « goujou » ≈ « gojo »,
 * « ryuuji » ≈ « ryuji », « kaabii » ≈ « kabi »… On absorbe les voyelles
 * doublées et « ou » (traductions différentes du même mot japonais).
 */
function loose(s) {
  let out = canonical(s);
  out = out.replace(/ou/g, 'o');
  out = out.replace(/oo/g, 'o').replace(/uu/g, 'u').replace(/aa/g, 'a').replace(/ee/g, 'e');
  return out;
}

/* Distance de Levenshtein avec coupure anticipée (rapide). */
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a === b) return 0;
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/*
 * La réponse `answer` vaut-elle le personnage `name` ?
 * ✅ prénom seul (« satoru ») · nom seul (« gojo ») · nom complet
 * ✅ variantes romaji (« goujou », « sasuké », « ryuuji »)
 * ✅ petites fautes de frappe (1 lettre — 2 pour les noms longs)
 * ❌ trop court (« sa »), autre personnage
 */
/*
 * ⚖️ makeChecker — vérificateur STRICT partagé (Xid + tous les quiz).
 * correctList  : bonnes réponses de LA question (réponse + alts).
 * otherAnswers : TOUTES les autres réponses de la banque → garde-fou :
 *                répondre une AUTRE réponse (même mal orthographiée) = FAUX.
 * Tolérance : variantes phonétiques connues (ou/oo→o, uu/aa/ee→1), accents,
 * prénom OU nom OU nom complet ; fautes seulement sur les mots ≥5 lettres.
 */
function makeChecker(correctList, otherAnswers = []) {
  const correct = correctList.filter(Boolean).map(canonical);
  const correctLoose = correct.map(loose);
  const othersLoose = [...new Set(otherAnswers.filter(Boolean).map(canonical))]
    .filter((o) => o && !correct.includes(o))
    .map(loose);
  const sortTok = (t) => t.split(' ').filter(Boolean).sort().join(' ');

  return function check(raw) {
    const aCanon = canonical(raw);
    if (!aCanon || aCanon.length < 2) return false;
    const aLoose = loose(raw);
    const aTok = aCanon.split(' ').filter((t) => t.length >= 2);

    // 1) correspondance directe (canonique, variante, mots triés, prénom/nom)
    for (let i = 0; i < correct.length; i++) {
      const c = correct[i];
      if (aCanon === c) return true;
      if (aLoose === correctLoose[i]) return true;
      if (aTok.length > 1 && sortTok(aCanon) === sortTok(c)) return true;
      // prénom OU nom seul : mot ENTIER exact ou variante (pas de flou ici)
      if (aTok.length === 1 && c.split(' ').length > 1) {
        if (c.split(' ').some((w) => w === aCanon || loose(w) === aLoose)) return true;
      }
    }

    // 2) faute sur UN mot de la réponse (prénom/nom mal tapé) — AVANT la
    //    comparaison aux autres : « Dwyan » ≈ « Dwyane », pas « Durant ».
    // STRICT : 1 faute seulement sur les mots ≥7 (2 fautes à partir de 11).
    const tol = (w) => (w.length >= 11 ? 2 : w.length >= 7 ? 1 : 0);
    // Faute acceptée = substitution/transposition légère. Une TRONCATURE
    // (le mot tapé est le début du mot attendu) = réponse incomplète → refus.
    const isTypo = (typed, ans) => {
      if (typed === ans) return true;
      const t = tol(ans);
      return t > 0 && lev(typed, ans, t) <= t && !ans.startsWith(typed);
    };
    // Mot tapé seul : tolérance de faute UNIQUEMENT si le mot tapé est lui
    // même long (≥5) et vise un mot long — jamais sur les mots courts.
    if (aTok.length === 1 && aTok[0].length >= 5) {
      for (const cl of correctLoose) {
        for (const w of cl.split(' ')) {
          if (isTypo(aTok[0], w)) return true;
        }
      }
    }

    // 3) distance à la bonne réponse vs aux AUTRES réponses :
    //    si plus proche d'une autre → FAUSSE (c'est probablement cette autre réponse).
    let best = Infinity;
    for (const cl of correctLoose) best = Math.min(best, lev(aLoose, cl, 3));
    for (const ol of othersLoose) {
      const d = lev(aLoose, ol, 3);
      if (d < best) return false; // autre réponse STRICTEMENT plus proche → mauvaise réponse
    }

    // 4) fautes de frappe sur la réponse ENTIÈRE : mot À MOT uniquement —
    //    même nombre de mots, tolérance par mot (≥7 : 1 faute ; <7 : 0).
    {
      const aw = aLoose.split(' ');
      for (let i = 0; i < correctLoose.length; i++) {
        const cw = correctLoose[i].split(' ');
        if (aw.length !== cw.length || aw.length < 1) continue;
        if (aw.every((w, k) => isTypo(w, cw[k]))) return true;
      }
    }
    return false;
  };
}

/* Rétro-compat : ancienne signature (réponse simple, aucun garde-fou). */
function matchAnswer(answer, name) {
  const a = loose(answer);
  const n = loose(name);
  if (!a) return false;
  const aTok = a.split(' ').filter((t) => t.length >= 2);
  const nTok = n.split(' ').filter(Boolean);
  if (aTok.length === 0 || nTok.length === 0) return false;

  // 1) Nom complet (ordre des mots indifférent), petite tolérance.
  const aFull = aTok.slice().sort().join('');
  const nFull = nTok.slice().sort().join('');
  if (aFull === nFull) return true;
  if (lev(aFull, nFull, 2) <= (nFull.length >= 8 ? 2 : 1)) return true;

  // 2) Un seul mot de la réponse suffit (prénom OU nom).
  for (const at of aTok) {
    if (at.length < 3) continue; // évite « go », « de »…
    for (const nt of nTok) {
      if (at === nt) return true;
      const max = nt.length >= 4 ? 1 : 0;
      if (max > 0 && lev(at, nt, max) <= max) return true;
    }
  }
  return false;
}

/* ── API Jikan (fetch injectable pour les tests) ── */
async function jikanGet(url, params, fetchImpl) {
  const f = fetchImpl || global.fetch;
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  let res;
  try {
    res = await f(`${url}${qs}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw Object.assign(new Error('Jikan timeout'), { code: 'JIKAN_TIMEOUT' });
    }
    throw Object.assign(new Error('Jikan injoignable'), { code: 'JIKAN_UNREACHABLE' });
  }
  if (res.status === 429) throw Object.assign(new Error('Jikan 429'), { code: 'JIKAN_RATE_LIMIT' });
  if (!res.ok) throw Object.assign(new Error(`Jikan HTTP ${res.status}`), { code: 'JIKAN_ERROR' });
  const ctype = ((res.headers && res.headers.get && res.headers.get('content-type')) || '').toLowerCase();
  if (ctype.includes('text/html')) throw Object.assign(new Error('Jikan HTML'), { code: 'JIKAN_BAD_RESPONSE' });
  const data = await res.json().catch(() => null);
  if (!data) throw Object.assign(new Error('Jikan JSON'), { code: 'JIKAN_BAD_RESPONSE' });
  return data;
}

/* Télécharge l'image du personnage dans tmp/ (repli : null si échec). */
async function downloadImage(url, tmpDir, fetchImpl) {
  const f = fetchImpl || global.fetch;
  try {
    const res = await f(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const ctype = ((res.headers && res.headers.get && res.headers.get('content-type')) || '').toLowerCase();
    if (ctype.includes('text/html')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return null;
    fs.mkdirSync(tmpDir, { recursive: true });
    const dest = path.join(tmpDir, `xid-${Date.now()}-${Math.floor(Math.random() * 1e6)}.jpg`);
    fs.writeFileSync(dest, buf);
    return dest;
  } catch (_) {
    return null;
  }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ── Session ── */
class MangaQuizSession {
  /**
   * @param {object} bot contexte global
   * @param {object} p  { threadID, ownerID, ownerName, send, fetchImpl? }
   */
  constructor(bot, p) {
    this.bot = bot;
    this.threadID = String(p.threadID);
    this.ownerID = String(p.ownerID);
    this.ownerName = p.ownerName || 'Joueur';
    this.send = p.send;
    this.fetchImpl = p.fetchImpl || null;
    this.scope = 'xid'; // UN quiz manga par groupe
    this.triggerCommand = 'xid';
    this.inactivityMs = bot.config.games.stepTimeoutMs;

    this.state = 'WAITING_MANGA';
    this.manga = null;
    this.source = null;
    this.total = 0;
    this.characters = [];
    this.index = 0;

    /** Map<uid, {name, score}> — points (+10 par bonne réponse). */
    this.scores = new Map();
    /** true tant que personne n'a trouvé l'image courante. */
    this.firstCorrectPending = false;

    this.tries = 0;
    this.questionTimer = null;
    this.interTimer = null;
    this.awaitingAnswer = false;
    this.finished = false;
  }

  /* Configuration = lanceur seul. En jeu = tout le monde. */
  accepts(userID) {
    if (this.state === 'RUNNING') return true;
    return String(userID) === this.ownerID;
  }

  _clearTimers() {
    if (this.questionTimer) {
      clearTimeout(this.questionTimer);
      this.questionTimer = null;
    }
    if (this.interTimer) {
      clearTimeout(this.interTimer);
      this.interTimer = null;
    }
  }

  dispose() {
    this._clearTimers();
    this.finished = true;
    this.awaitingAnswer = false;
    if (this.bot && this.bot.sessions) {
      this.bot.sessions.remove(this.threadID, this.scope);
    }
  }

  expire() {
    if (this.finished) return;
    if (this.state === 'RUNNING') return this._finish('⏱️ Session expirée.');
    this.dispose();
    this.send(fmt.frame('🎌 XID', '⌛ ' + fmt.bold('Quiz annulé — trop longtemps sans réponse.'))).catch(() => {});
  }

  async start() {
    await this.send(
      fmt.frame('🎌 XID — QUIZ MANGA', [
        '「' + fmt.bold('QUEL MANGA ?') + '」',
        '',
        `📚 ${fmt.bold('Écris le nom du manga')} — ${fmt.bold('ex')} : ${fmt.bold('Naruto')}, ${fmt.bold('One Piece')}, ${fmt.bold('Jujutsu Kaisen')}`,
        `🌌 ${fmt.bold('MULTIVERS')} — ${fmt.bold('personnages de tous les univers')}`,
        '',
        '⚠️ ' + fmt.bold('Réponds directement (prénom OU nom OU nom complet accepté).'),
        '🛑 ' + fmt.bold('Tape « stop » pour annuler.'),
      ])
    );
  }

  /* ── Route un message. Retourne true si consommé. ── */
  async handle(ctx) {
    const raw = String(ctx.text || '').trim();
    if (!raw) return false;

    // Laisser passer les AUTRES commandes du bot.
    if (ctx.commandName && ctx.commandName !== this.triggerCommand) return false;
    if (ctx.commandName === this.triggerCommand) {
      await this.send(fmt.frame('🎌 XID', '⚠️ ' + fmt.bold('Un quiz manga est déjà en cours.') + '\n🛑 ' + fmt.bold('Le lanceur peut taper « stop ».')));
      return true;
    }
    if (isCancelIntent(raw)) {
      const isAdmin = this.bot.config.isAdmin(ctx.senderID);
      if (this.state === 'RUNNING' && String(ctx.senderID) !== this.ownerID && !isAdmin) {
        await this.send(fmt.frame('🎌 XID', '⛔ ' + fmt.bold('Seul le lanceur (ou un admin) peut arrêter un quiz en cours.')));
        return true;
      }
      this.dispose();
      await this.send(fmt.frame('🎌 XID', '🛑 ' + fmt.bold('Quiz manga arrêté.') + ' À bientôt.'));
      return true;
    }

    switch (this.state) {
      case 'WAITING_MANGA':
        return this._onManga(raw);
      case 'WAITING_COUNT':
        return this._onCount(raw);
      case 'RUNNING':
        return this._onAnswer(ctx, raw);
      default:
        return false;
    }
  }

  async _onManga(raw) {
    const isMultivers = fmt.normalizeAnswer(raw) === 'multivers';
    this.manga = isMultivers ? 'multivers' : raw;
    this.state = 'WAITING_COUNT';
    await this.send(
      fmt.frame('🎌 XID', [
        '『' + fmt.bold('NOMBRE D’IMAGES') + '』',
        '',
        `${fmt.bold(5)}  /  ${fmt.bold(10)}  /  ${fmt.bold(15)}  …  ${fmt.bold(MAX_IMAGES)}   ${fmt.bold('(max')} ${fmt.bold(MAX_IMAGES)}${fmt.bold(')')}`,
        '',
        fmt.bold('Réponds simplement par le nombre.'),
      ])
    );
    return true;
  }

  async _onCount(raw) {
    const n = parseCount(raw, { min: 1, max: MAX_IMAGES });
    if (!n) {
      this.tries++;
      if (this.tries >= 3) {
        this.dispose();
        await this.send(fmt.frame('🎌 XID', '🛑 ' + fmt.bold('Trop d’erreurs — quiz annulé.')));
        return true;
      }
      await this.send(fmt.frame('🎌 XID', '⚠️ ' + fmt.bold('Choisis :') + ` ${fmt.bold(5)} / ${fmt.bold(10)} / ${fmt.bold(15)} … ${fmt.bold(MAX_IMAGES)}`));
      return true;
    }

    await this.send('⏳ ' + fmt.bold('Chargement des personnages…'));
    try {
      this.characters = await this._loadCharacters(n);
    } catch (err) {
      this.dispose();
      const msg =
        err.code === 'QUIZ_RATE_LIMITED'
          ? ['🎌 ' + fmt.bold('SOURCES EN PAUSE'), '⚠️ ' + fmt.bold('Limite de débit des serveurs — réessaie dans ~1 minute.'), `🧾 ${fmt.bold('CODE')} : ${fmt.bold('RATE_LIMITED')}`]
          : ['🎌 ' + fmt.bold('SOURCES INDISPONIBLES'), '⚠️ ' + fmt.bold('Impossible de charger les personnages pour le moment (AniList + Jikan).'), `🧾 ${fmt.bold('CODE')} : ${fmt.bold(String(err.code || 'QUIZ_SOURCES_DOWN').toUpperCase())}`];
      await this.send(fmt.frame('⚠️ SYSTÈME EN PAUSE', msg));
      return true;
    }

    if (this.characters.length === 0) {
      this.dispose();
      await this.send(fmt.frame('🎌 XID', '❌ ' + fmt.bold('Aucun personnage trouvé pour ce manga.')));
      return true;
    }

    this.total = this.characters.length;
    this.index = 0;
    this.state = 'RUNNING';

    await this.send(
      fmt.frame('🎌 QUIZ LANCÉ', [
        `📚 ${fmt.bold('Thème')} : ${fmt.bold(this.source)} — ${fmt.bold('Images')} : ${fmt.boldNum(this.total)}`,
        '',
        '📢 ' + fmt.bold('Tout le monde peut jouer !'),
        '⚡ ' + fmt.bold('Première bonne réponse = +10 points (prénom OU nom suffit).'),
      ])
    );
    await this._askQuestion();
    return true;
  }

  /*
   * Charge les personnages — CHAÎNE DE SECOURS à 4 niveaux :
   *   AniList → Kitsu (indépendant) → Jikan → banque locale (toujours dispo).
   * Une source récemment tombée est mise au repos 5 min (pas de retentée inutile).
   */
  async _loadCharacters(count) {
    const key = `xid:${fmt.normalizeAnswer(this.manga)}`;
    // 0) Cache FRAIS (< 10 min) → aucune requête, réponse immédiate.
    const fresh = cacheGet(key);
    if (fresh && Date.now() - fresh.at < CACHE_FRESH_MS && fresh.players.length >= count) {
      this.source = fresh.source;
      return shuffle(fresh.players).slice(0, count);
    }

    const chain = this.manga === 'multivers'
      ? [['_multiversAniList', 'anilist'], ['_multiversKitsu', 'kitsu'], ['_multiversJikan', 'jikan']]
      : [['_mangaAniList', 'anilist'], ['_mangaKitsu', 'kitsu'], ['_mangaJikan', 'jikan']];
    const errors = [];
    for (const [method, src] of chain) {
      if (isCoolingDown(src)) {
        errors.push(`${src}:repos`);
        continue;
      }
      try {
        // Chaque source a droit à 2 tentatives (pannes transient fréquentes).
        const result = await withRetry(() => this[method](count));
        markOk(src);
        cacheSet(key, this.source, result);
        return result;
      } catch (err) {
        markFail(src);
        errors.push(`${src}:${err.code || err.message}`);
      }
    }
    // 2) Cache PÉRIMÉ mais < 6 h → vraies images, meilleure issue qu'un refus.
    const stale = cacheGet(key);
    if (stale && Date.now() - stale.at < CACHE_STALE_MS && stale.players.length > 0) {
      this.source = `${stale.source} (cache)`;
      return shuffle(stale.players).slice(0, count);
    }
    // Xid = IMAGES uniquement : aucune source dispo → message propre,
    // JAMAIS de quiz aux indices.
    throw sourcesDown(errors);
  }

  /* 🌌 Multivers via Kitsu (3e source indépendante). */
  async _multiversKitsu(count) {
    const seen = new Set();
    const all = [];
    for (const animeName of shuffle(KITSU_POPULAR)) {
      if (all.length >= count + 4) break;
      try {
        const anime = await kitsuFindAnime(animeName, this.fetchImpl);
        const chars = await kitsuCharactersOf(anime.id, 8, this.fetchImpl);
        for (const c of chars) {
          if (!seen.has(c.name)) {
            seen.add(c.name);
            all.push({ name: c.name, image: c.image, alts: c.alts });
          }
        }
      } catch (_) {
        /* anime suivant — un seul anime suffit à faire vivre la source */
      }
    }
    if (all.length === 0) throw Object.assign(new Error('Kitsu multivers vide'), { code: 'KITSU_BAD_RESPONSE' });
    this.source = 'Multivers';
    return shuffle(all).slice(0, count);
  }

  /* 📚 Manga précis via Kitsu (3e source indépendante). */
  async _mangaKitsu(count) {
    const anime = await kitsuFindAnime(this.manga, this.fetchImpl);
    const rows = await kitsuCharactersOf(anime.id, Math.max(count, 12), this.fetchImpl);
    if (rows.length === 0) throw Object.assign(new Error('Kitsu sans personnages'), { code: 'KITSU_BAD_RESPONSE' });
    this.source = anime.titre;
    return shuffle(rows.map((c) => ({ name: c.name, image: c.image, alts: c.alts }))).slice(0, count);
  }

  /* 🌌 Multivers — top personnages (par popularité) via AniList.
   * Pagination : 50 personnages par requête, jusqu'à 2 pages pour 100. */
  async _multiversAniList(count) {
    const query = `query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        characters(sort: FAVOURITES_DESC) { name { full } image { large } }
      }
    }`;
    const perPage = 50;
    const pages = Math.ceil(count / perPage);
    const seen = new Set();
    let all = [];
    for (let page = 1; page <= Math.min(pages, 4); page++) {
      const data = await anilistQuery(query, { page, perPage }, this.fetchImpl);
      const list = (((data.Page || {}).characters) || [])
        .filter((c) => c && c.name && c.name.full && c.image && c.image.large)
        .map((c) => ({ name: c.name.full, image: c.image.large }))
        .filter((c) => !seen.has(c.name) && seen.add(c.name));
      all = all.concat(list);
      if (list.length < perPage) break; // dernière page atteinte
    }
    if (all.length === 0) throw Object.assign(new Error('AniList vide'), { code: 'ANILIST_BAD_RESPONSE' });
    this.source = 'Multivers';
    return shuffle(all).slice(0, count);
  }

  /* 📚 Manga précis via AniList (replie sur ANIME si le titre est un anime).
   * Pagination : 50 personnages par requête, jusqu'à 2 pages pour 100. */
  async _mangaAniList(count) {
    const build = (type) => `query ($search: String, $perPage: Int, $page: Int) {
      Media(search: $search, type: ${type}) {
        title { romaji english }
        characters(sort: FAVOURITES_DESC, page: $page, perPage: $perPage) {
          edges { node { name { full } image { large } } }
        }
      }
    }`;
    const perPage = 50;
    const pages = Math.ceil(count / perPage);
    const seen = new Set();
    let all = [];
    let title = null;
    for (let page = 1; page <= Math.min(pages, 4); page++) {
      const vars = { search: this.manga, perPage, page };
      let media = (await anilistQuery(build('MANGA'), vars, this.fetchImpl)).Media;
      if (!media && page === 1) media = (await anilistQuery(build('ANIME'), vars, this.fetchImpl)).Media;
      if (!media) throw Object.assign(new Error('introuvable sur AniList'), { code: 'ANILIST_NOT_FOUND' });
      const t = media.title || {};
      if (!title) title = t.english || t.romaji || this.manga;
      const edges = (((media.characters || {}).edges) || [])
        .map((e) => e && e.node)
        .filter((n) => n && n.name && n.name.full && n.image && n.image.large)
        .map((n) => ({ name: n.name.full, image: n.image.large }))
        .filter((c) => !seen.has(c.name) && seen.add(c.name));
      all = all.concat(edges);
      if (edges.length < perPage) break; // dernière page atteinte
    }
    if (all.length === 0) throw Object.assign(new Error('AniList sans personnages'), { code: 'ANILIST_BAD_RESPONSE' });
    this.source = title;
    return shuffle(all).slice(0, count);
  }

  /* 🌌 Multivers via Jikan (repli) — 25 personnages par page. */
  async _multiversJikan(count) {
    const pages = Math.ceil(count / 25);
    const seen = new Set();
    let all = [];
    for (let page = 1; page <= Math.min(pages, 4); page++) {
      const data = await jikanGet(`${JIKAN}/top/characters`, { page }, this.fetchImpl);
      const list = ((data && data.data) || [])
        .filter((c) => c && c.images && c.images.jpg && c.images.jpg.image_url)
        .map((c) => ({ name: c.name, image: c.images.jpg.image_url }))
        .filter((c) => !seen.has(c.name) && seen.add(c.name));
      all = all.concat(list);
      if (list.length < 25) break; // dernière page atteinte
    }
    if (all.length === 0) throw Object.assign(new Error('Jikan vide'), { code: 'JIKAN_BAD_RESPONSE' });
    this.source = 'Multivers';
    return shuffle(all).slice(0, count);
  }

  /* 📚 Manga précis via Jikan (repli). */
  async _mangaJikan(count) {
    const search = await jikanGet(`${JIKAN}/manga`, { q: this.manga, limit: 1 }, this.fetchImpl);
    const manga = search && search.data && search.data[0];
    if (!manga) throw Object.assign(new Error('manga introuvable'), { code: 'JIKAN_NOT_FOUND' });
    this.source = manga.title || this.manga;
    const chars = await jikanGet(`${JIKAN}/manga/${manga.mal_id}/characters`, null, this.fetchImpl);
    const list = ((chars && chars.data) || [])
      .filter((x) => x && x.character && x.character.images && x.character.images.jpg && x.character.images.jpg.image_url)
      .map((x) => ({ name: x.character.name, image: x.character.images.jpg.image_url }));
    if (list.length === 0) throw Object.assign(new Error('Jikan sans personnages'), { code: 'JIKAN_BAD_RESPONSE' });
    return shuffle(list).slice(0, count);
  }

  /* ── Pose la question courante (image du personnage) ── */
  async _askQuestion() {
    if (this.finished) return;
    this._clearTimers();
    const c = this.characters[this.index];
    if (!c) return this._finish();

    this.firstCorrectPending = true;

    const payload = { body: null };
    /* Question en GRAND — les règles sont annoncées une seule fois au
     * lancement : pas d'instructions répétées sous chaque image. */
    // Xid = IMAGES uniquement : image non chargeable → personnage SAUTÉ
    // (jamais de question sans image, jamais d'indice).
    const img = await downloadImage(c.image, this.bot.config.tmpDir, this.fetchImpl);
    if (!img) {
      this.characters.splice(this.index, 1);
      this.total = this.characters.length;
      if (this.total === 0) return this._finish('⚠️ ' + fmt.bold('Images indisponibles — quiz arrêté.'));
      return this._askQuestion();
    }
    payload.attachment = img;

    const lines = [
      `🖼️ ${fmt.boldNum(this.index + 1)}/${fmt.boldNum(this.total)}  —  📚 ${fmt.bold(this.source)}`,
      '',
      '❓ ' + fmt.bold('QUI EST-CE ?'),
      '',
      '⏱️ ' + fmt.bold(`${Math.round(this.bot.config.games.quizTimeoutMs / 1000)}s`),
    ];
    payload.body = fmt.frame(`🎌 IDENTIFICATION ${this.index + 1}/${this.total}`, lines);

    // ⚖️ Vérificateur STRICT : les AUTRES personnages de la manche servent de
    // garde-fou — répondre un autre nom (même mal orthographié) = faux.
    const others = this.characters.filter((x) => x !== c).flatMap((x) => [x.name, ...(x.alts || [])]);
    this._checker = makeChecker([c.name, ...(c.alts || [])], others);

    // La question devient « live » AVANT l'envoi.
    this.awaitingAnswer = true;
    await this.send(payload);

    const timeoutMs = this.bot.config.games.quizTimeoutMs;
    this.questionTimer = setTimeout(() => {
      this.questionTimer = null;
      this._onTimeout().catch(() => {});
    }, timeoutMs);
  }

  async _onTimeout() {
    if (this.finished) return;
    this.awaitingAnswer = false;
    const c = this.characters[this.index];
    await this.send(
      fmt.frame('⏱️ TEMPS ÉCOULÉ', [
        '❌ ' + fmt.bold('Personne n’a trouvé.'),
        '🎭 ' + fmt.bold('Réponse') + ' : ' + fmt.bold(c.name),
      ])
    );
    await this._next();
  }

  /*
   * ⚡ Première bonne réponse = +10 points AU senderID de celui qui répond.
   * Mauvaise réponse = silencieuse, on peut retenter (aucun blocage).
   */
  async _onAnswer(ctx, raw) {
    if (!this.awaitingAnswer) return false; // pause entre questions → ignoré
    const c = this.characters[this.index];
    if (!c) return true;
    const uid = String(ctx.senderID); // ← l'auteur RÉEL de la réponse
    const name = ctx.senderName || (await this.bot.getUserName(uid));

    // Question déjà remportée → réponses tardives ignorées.
    if (!this.firstCorrectPending) return true;

    // Vérification STRICTE (autres personnages = garde-fou anti faux-positifs).
    if (!this._checker || !this._checker(raw)) return true; // silencieux — réessaie !

    this.firstCorrectPending = false;
    this.awaitingAnswer = false;
    this._clearTimers();

    const rec = this.scores.get(uid) || { name, score: 0 };
    rec.name = name;
    rec.score += 10;
    this.scores.set(uid, rec);

    // 📢 Annonce TAGUÉE : le gagnant est mentionné.
    const tag = `@${String(name).split(/\s+/)[0]}`;
    const bodyText = fmt.frame('⚡ BONNE RÉPONSE', [
      `✅ ${tag} ${fmt.bold('prend le point')} ! (+10)`,
      `🎭 ${fmt.bold('Personnage')} : ${fmt.bold(c.name)}`,
      `🏁 ${fmt.bold('Score')} : ${fmt.boldNum(rec.score)}`,
    ]);
    const payload = { body: bodyText };
    const from = bodyText.indexOf(tag);
    if (from >= 0) payload.mentions = { [uid]: { tag, from } };
    await this.send(payload);

    await this._next();
    return true;
  }

  async _next() {
    this.index++;
    if (this.index >= this.total) return this._finish();
    this.awaitingAnswer = false;
    this.interTimer = setTimeout(() => {
      this.interTimer = null;
      if (this.finished) return;
      this._askQuestion().catch(() => {});
    }, this.bot.config.games.interDelayMs);
  }

  /* ── 🏁 Tableau des scores FINAL (seul, comme demandé) ── */
  async _finish(notice) {
    if (this.finished) return;
    this.finished = true;
    this.awaitingAnswer = false;
    this._clearTimers();

    const ranking = [...this.scores.values()].sort((a, b) => b.score - a.score);
    const medals = ['🏆', '🥈', '🥉'];
    const lines = [];

    if (notice) lines.push(notice, '');
    if (ranking.length === 0) {
      lines.push('📭 ' + fmt.bold('Personne n’a marqué pendant ce quiz.'));
    } else {
      ranking.forEach((rec, i) => {
        const icon = i < 3 ? medals[i] : '▸';
        const coins = Math.round((rec.score / 10) * 2); // 2 XCoins par bonne réponse
        lines.push(`${icon} ${fmt.bold(rec.name)} — ${fmt.boldNum(rec.score)} ${fmt.bold('pts')}  (+${fmt.boldNum(coins)} XCoins)`);
      });
    }
    lines.push('', '📚 ' + fmt.bold('Thème') + ' : ' + fmt.bold(this.source || '—'));

    // Gains, XP — par joueur, selon SON score.
    for (const [uid, rec] of this.scores) {
      const coins = Math.round((rec.score / 10) * 2);
      if (coins > 0) this.bot.economy.addCoins(uid, coins);
      const xpGain = Math.round(rec.score / 10) * 2 + 5;
      const xpRes = this.bot.xp.addXp(uid, xpGain);
      if (xpRes && xpRes.leveledUp) lines.push(`🎉 ${fmt.bold(rec.name)} ${fmt.bold('passe niveau')} ${fmt.boldNum(xpRes.level)} !`);
    }
    this.bot.db.users.save();
    this.bot.db.bumpStat('quizzesPlayed');

    await this.send(fmt.frame('🏁 CLASSEMENT — QUIZ MANGA', lines));
    this.dispose();
  }
}

module.exports = { MangaQuizSession, matchAnswer, makeChecker, canonical, loose, lev, downloadImage, resetSourceHealth, resetSourceCache };
