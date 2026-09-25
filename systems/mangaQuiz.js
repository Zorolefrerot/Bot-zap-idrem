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
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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

/* Les DEUX sources sont tombées → erreur combinée honnête.
 * Si les deux sont en limite de débit → code dédié (message adapté). */
function sourcesDown(errA, errB) {
  const bothRate = /RATE_LIMIT/.test(String(errA.code || '')) && /RATE_LIMIT/.test(String(errB.code || ''));
  return Object.assign(
    new Error(`AniList (${errA.code || errA.message}) + Jikan (${errB.code || errB.message}) indisponibles`),
    { code: bothRate ? 'QUIZ_RATE_LIMITED' : 'QUIZ_SOURCES_DOWN' }
  );
}

/* Requête Jikan (repli) → data ou erreur typée. */
const CANCEL_WORDS = new Set(['cancel', 'annuler', 'stop', 'quit', 'quitter', 'exit', '!stop']);
const MAX_IMAGES = 20;

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
    if (CANCEL_WORDS.has(fmt.normalizeAnswer(raw))) {
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
        `${fmt.bold(5)}  /  ${fmt.bold(10)}  /  ${fmt.bold(15)}   ${fmt.bold('(max')} ${fmt.bold(MAX_IMAGES)}${fmt.bold(')')}`,
        '',
        fmt.bold('Réponds simplement par le nombre.'),
      ])
    );
    return true;
  }

  async _onCount(raw) {
    const n = safeInt(raw, { min: 1, max: MAX_IMAGES });
    if (!n) {
      this.tries++;
      if (this.tries >= 3) {
        this.dispose();
        await this.send(fmt.frame('🎌 XID', '🛑 ' + fmt.bold('Trop d’erreurs — quiz annulé.')));
        return true;
      }
      await this.send(fmt.frame('🎌 XID', '⚠️ ' + fmt.bold('Choisis :') + ` ${fmt.bold(5)} / ${fmt.bold(10)} / ${fmt.bold(15)}`));
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
   * Charge les personnages — AniList d'abord, Jikan en repli automatique.
   * Une seule source suffit pour lancer le quiz.
   */
  async _loadCharacters(count) {
    if (this.manga === 'multivers') {
      try {
        return await this._multiversAniList(count);
      } catch (errA) {
        try {
          return await this._multiversJikan(count);
        } catch (errB) {
          throw sourcesDown(errA, errB);
        }
      }
    }
    try {
      return await this._mangaAniList(count);
    } catch (errA) {
      try {
        return await this._mangaJikan(count);
      } catch (errB) {
        throw sourcesDown(errA, errB);
      }
    }
  }

  /* 🌌 Multivers — top personnages (par popularité) via AniList. */
  async _multiversAniList(count) {
    const query = `query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        characters(sort: FAVOURITES_DESC) { name { full } image { large } }
      }
    }`;
    const data = await anilistQuery(query, { page: 1, perPage: 50 }, this.fetchImpl);
    const list = (((data.Page || {}).characters) || [])
      .filter((c) => c && c.name && c.name.full && c.image && c.image.large)
      .map((c) => ({ name: c.name.full, image: c.image.large }));
    if (list.length === 0) throw Object.assign(new Error('AniList vide'), { code: 'ANILIST_BAD_RESPONSE' });
    this.source = 'Multivers';
    return shuffle(list).slice(0, count);
  }

  /* 📚 Manga précis via AniList (replie sur ANIME si le titre est un anime). */
  async _mangaAniList(count) {
    const build = (type) => `query ($search: String, $perPage: Int) {
      Media(search: $search, type: ${type}) {
        title { romaji english }
        characters(sort: FAVOURITES_DESC, perPage: $perPage) {
          edges { node { name { full } image { large } } }
        }
      }
    }`;
    const vars = { search: this.manga, perPage: 50 };
    let media = (await anilistQuery(build('MANGA'), vars, this.fetchImpl)).Media;
    if (!media) media = (await anilistQuery(build('ANIME'), vars, this.fetchImpl)).Media;
    if (!media) throw Object.assign(new Error('introuvable sur AniList'), { code: 'ANILIST_NOT_FOUND' });
    const list = (((media.characters || {}).edges) || [])
      .map((e) => e && e.node)
      .filter((n) => n && n.name && n.name.full && n.image && n.image.large)
      .map((n) => ({ name: n.name.full, image: n.image.large }));
    if (list.length === 0) throw Object.assign(new Error('AniList sans personnages'), { code: 'ANILIST_BAD_RESPONSE' });
    const t = media.title || {};
    this.source = t.english || t.romaji || this.manga;
    return shuffle(list).slice(0, count);
  }

  /* 🌌 Multivers via Jikan (repli). */
  async _multiversJikan(count) {
    const data = await jikanGet(`${JIKAN}/top/characters`, { page: 1 }, this.fetchImpl);
    this.source = 'Multivers';
    const list = ((data && data.data) || [])
      .filter((c) => c && c.images && c.images.jpg && c.images.jpg.image_url)
      .map((c) => ({ name: c.name, image: c.images.jpg.image_url }));
    if (list.length === 0) throw Object.assign(new Error('Jikan vide'), { code: 'JIKAN_BAD_RESPONSE' });
    return shuffle(list).slice(0, count);
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
    const lines = [
      `🖼️ ${fmt.boldNum(this.index + 1)}/${fmt.boldNum(this.total)}  —  📚 ${fmt.bold(this.source)}`,
      '',
      '❓ ' + fmt.bold('QUI EST-CE ?'),
      '',
      '⏱️ ' + fmt.bold(`${Math.round(this.bot.config.games.quizTimeoutMs / 1000)}s`),
    ];
    payload.body = fmt.frame(`🎌 IDENTIFICATION ${this.index + 1}/${this.total}`, lines);

    const img = await downloadImage(c.image, this.bot.config.tmpDir, this.fetchImpl);
    if (img) payload.attachment = img; // sinon : question sans image (dégradé honnête)

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

    // Tolérance : prénom / nom / nom complet / variantes romaji / petites fautes.
    if (!matchAnswer(raw, c.name)) return true; // silencieux — réessaie !

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

module.exports = { MangaQuizSession, matchAnswer, canonical, loose, lev };
