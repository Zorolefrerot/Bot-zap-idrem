'use strict';
/*
 * 🧬 MeR~NeL — systems/footQuiz.js
 * Xfoot — quiz d'identification de JOUEURS DE FOOTBALL (comme Xid).
 *
 * Sources (chaîne de secours) :
 *   1) Wikidata SPARQL (sans clé, infrastructure Wikimedia) :
 *      footballeurs PROFESSIONNELS avec photo (P18), filtrés par
 *      occupation + ID Transfermarkt (exclut les célébrités amateurs),
 *      classés par notoriété (nb de sitelinks) — TOP 200.
 *      Filtre CLUB/SÉLECTION possible via P54 (ancien/actuel club).
 *   2) Banque locale de secours (71 joueurs célèbres, indices FR)
 *      → le quiz reste JOUABLE même internet coupé.
 *
 * Flux : QUEL FILTRE (MULTIVERS ou club/équipe) → NOMBRE (5…100) →
 * QUIZ LANCÉ → photo du joueur → réponses DIRECTES (prénom OU nom OU
 * complet) → +10 au premier bon → 🏁 CLASSEMENT final.
 */

const { safeInt } = require('../utils/sanitize');
const { makeChecker } = require('./mangaQuiz');
const { downloadImage } = require('./mangaQuiz');

const WD_SPARQL = 'https://query.wikidata.org/sparql';
const MAX_IMAGES = 100;
const CANCEL_WORDS = new Set(['cancel', 'annuler', 'stop', 'quit', 'quitter', 'exit', '!stop']);

const fmt = require('../utils/formatter');

/* ── Requête SPARQL ── */
/* Footballeurs PROS avec photo : occupation Q937857 (footballeur) + ID
 * Transfermarkt (P2446 — exclut Camus/Bohr & co) + photo P18 + notoriété. */
const PRO_FILTER = `
  ?p wdt:P106 wd:Q937857 .
  ?p wdt:P18 ?image .
  ?p wdt:P2446 ?tm .
  ?p wikibase:sitelinks ?sl .
  FILTER(?sl > 25)`;

const TOP_QUERY = `
SELECT ?p ?pLabel ?image WHERE {
${PRO_FILTER}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en,de,es,pt". }
} ORDER BY DESC(?sl) LIMIT 200`;

/* Filtre CLUB / SÉLECTION : P54 = membre de l'équipe (ancien OU actuel). */
function teamQuery(term) {
  return `
SELECT ?p ?pLabel ?image WHERE {
${PRO_FILTER}
  ?p wdt:P54 ?team .
  ?team rdfs:label ?tl .
  FILTER(LANG(?tl) IN ("fr","en","es","de","pt"))
  FILTER(CONTAINS(LCASE(?tl), ${JSON.stringify(term.toLowerCase())}))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
} ORDER BY DESC(?sl) LIMIT 200`;
}

/* Alias rapides → sous-chaîne du libellé Wikidata (fr/en). */
const TEAM_ALIASES = {
  psg: 'paris saint', om: 'olympique de marseille', ol: 'olympique lyonnais',
  losc: 'lille', 'rc lens': 'lens', barca: 'barcelon', 'barça': 'barcelon',
  real: 'real madrid', chelsea: 'chelsea', united: 'manchester united',
  city: 'manchester city', liverpool: 'liverpool', arsenal: 'arsenal',
  juve: 'juvent', inter: 'internazionale', milan: 'milan',
  bayern: 'bayern', dortmund: 'dortmund', ajax: 'ajax',
  mazembe: 'mazembe', vita: 'vita club', manchester: 'manchester',
  rdc: 'démocratique du congo', drc: 'démocratique du congo', congo: 'congo',
  drcongo: 'démocratique du congo', rcd: 'démocratique du congo',
  argentine: 'argentine', bresil: 'brésil', brasil: 'brésil', france: 'france',
  angleterre: 'angleterre', england: 'england', espagne: 'espagne', spain: 'spain',
  portugal: 'portugal', allemagne: 'allemagne', germany: 'germany',
  belgique: 'belgique', maroc: 'maroc', senegal: 'sénégal', cameroun: 'cameroun',
  egypte: 'égypte', nigeria: 'nigeria', ghana: 'ghana', tunisie: 'tunisie',
  algerie: 'algérie', cotedivoire: 'ivoire', italie: 'italie', italy: 'italy',
};

/* Requête → bindings ou erreur typée. */
async function sparql(query, fetchImpl) {
  const f = fetchImpl || global.fetch;
  const url = `${WD_SPARQL}?query=${encodeURIComponent(query)}&format=json`;
  let res;
  try {
    res = await f(url, {
      headers: {
        Accept: 'application/sparql-results+json',
        // Wikimedia exige un User-Agent identifiable.
        'User-Agent': 'MeRNeL-Bot/4 (quiz de groupe; +https://github.com/Zorolefrerot/Bot-zap-idrem)',
      },
      signal: AbortSignal.timeout(25000),
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw Object.assign(new Error('Wikidata timeout'), { code: 'WIKIDATA_TIMEOUT' });
    }
    throw Object.assign(new Error('Wikidata injoignable'), { code: 'WIKIDATA_UNREACHABLE' });
  }
  if (res.status === 429) throw Object.assign(new Error('Wikidata 429'), { code: 'WIKIDATA_RATE_LIMIT' });
  if (!res.ok) throw Object.assign(new Error(`Wikidata HTTP ${res.status}`), { code: 'WIKIDATA_ERROR' });
  const ctype = ((res.headers && res.headers.get && res.headers.get('content-type')) || '').toLowerCase();
  if (!ctype.includes('json')) throw Object.assign(new Error('Wikidata HTML'), { code: 'WIKIDATA_BAD_RESPONSE' });
  const body = await res.json().catch(() => null);
  if (!body || !body.results || !Array.isArray(body.results.bindings)) {
    throw Object.assign(new Error('Wikidata vide'), { code: 'WIKIDATA_BAD_RESPONSE' });
  }
  return body.results.bindings;
}

/* Bindings → liste de joueurs { name, image, alts } nettoyée. */
function bindingsToPlayers(bindings) {
  const seen = new Set();
  const out = [];
  for (const b of bindings) {
    const name = b.pLabel && b.pLabel.value;
    const image = b.image && b.image.value;
    if (!name || !image) continue;
    if (/^Q\d+$/.test(name)) continue; // pas de libellé → hors quiz
    if (/\.(svg|tif|tiff)$/i.test(image)) continue; // formats non-photo
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, image: `${image}?width=600`, alts: [] });
  }
  return out;
}

/* ═══ FIABILITÉ : réessais + cache des réussites ═══ */
const NOT_FOUND_CODES = new Set(['WIKIDATA_NOT_FOUND']);

async function withRetry(fn, tries = 2, delayMs = 1200) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (NOT_FOUND_CODES.has(err.code)) throw err;
      lastErr = err;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

const CACHE_FRESH_MS = 10 * 60 * 1000;
const CACHE_STALE_MS = 6 * 60 * 60 * 1000;
const successCache = new Map();
function cacheGet(key) {
  return successCache.get(key) || null;
}
function cacheSet(key, source, players) {
  successCache.set(key, { at: Date.now(), source, players });
}
/* Reset du cache (tests / redémarrage). */
function resetSourceCache() {
  successCache.clear();
}

/* ── Santé des sources (source tombée = repos 5 min) ── */
const SOURCE_COOLDOWN_MS = 5 * 60 * 1000;
const sourceFailAt = { wikidata: 0 };
const isCoolingDown = (src) => Date.now() - sourceFailAt[src] < SOURCE_COOLDOWN_MS;
const markFail = (src) => {
  sourceFailAt[src] = Date.now();
};
const markOk = (src) => {
  sourceFailAt[src] = 0;
};
/* Reset de la santé des sources (tests / redémarrage). */
function resetSourceHealth() {
  sourceFailAt.wikidata = 0;
}

/* ═══ Session (même architecture que Xid) ═══ */
class FootQuizSession {
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
    this.scope = 'xfoot'; // UN quiz foot par groupe
    this.triggerCommand = 'xfoot';
    this.inactivityMs = bot.config.games.stepTimeoutMs;

    this.state = 'WAITING_FILTER';
    this.filter = null;
    this.filterLabel = null;
    this.source = null;
    this.total = 0;
    this.players = [];
    this.index = 0;

    /** Map<uid, {name, score}> — +10 par bonne réponse. */
    this.scores = new Map();
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
    this.send(fmt.frame('⚽ XFOOT', '⌛ ' + fmt.bold('Quiz annulé — trop longtemps sans réponse.'))).catch(() => {});
  }

  async start() {
    await this.send(
      fmt.frame('⚽ XFOOT — QUIZ FOOTBALL', [
        '「' + fmt.bold('QUEL FILTRE ?') + '」',
        '',
        `🌍 ${fmt.bold('MULTIVERS')} — ${fmt.bold('top joueurs de tous les temps')}`,
        `🏟️ ${fmt.bold('Ou un club / une sélection')} — ${fmt.bold('ex')} : ${fmt.bold('PSG')}, ${fmt.bold('Real Madrid')}, ${fmt.bold('RDC')}, ${fmt.bold('Argentine')}`,
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
      await this.send(fmt.frame('⚽ XFOOT', '⚠️ ' + fmt.bold('Un quiz foot est déjà en cours.') + '\n🛑 ' + fmt.bold('Le lanceur peut taper « stop ».')));
      return true;
    }
    if (CANCEL_WORDS.has(fmt.normalizeAnswer(raw))) {
      const isAdmin = this.bot.config.isAdmin(ctx.senderID);
      if (this.state === 'RUNNING' && String(ctx.senderID) !== this.ownerID && !isAdmin) {
        await this.send(fmt.frame('⚽ XFOOT', '⛔ ' + fmt.bold('Seul le lanceur (ou un admin) peut arrêter un quiz en cours.')));
        return true;
      }
      this.dispose();
      await this.send(fmt.frame('⚽ XFOOT', '🛑 ' + fmt.bold('Quiz foot arrêté.') + ' À bientôt.'));
      return true;
    }

    switch (this.state) {
      case 'WAITING_FILTER':
        return this._onFilter(raw);
      case 'WAITING_COUNT':
        return this._onCount(raw);
      case 'RUNNING':
        return this._onAnswer(ctx, raw);
      default:
        return false;
    }
  }

  async _onFilter(raw) {
    const isMultivers = fmt.normalizeAnswer(raw) === 'multivers';
    const term = isMultivers ? null : TEAM_ALIASES[fmt.normalizeAnswer(raw)] || raw;
    this.filter = isMultivers ? 'multivers' : String(term);
    this.filterLabel = isMultivers ? 'MULTIVERS' : raw;
    this.state = 'WAITING_COUNT';
    await this.send(
      fmt.frame('⚽ XFOOT', [
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
    const n = safeInt(raw, { min: 1, max: MAX_IMAGES });
    if (!n) {
      this.tries++;
      if (this.tries >= 3) {
        this.dispose();
        await this.send(fmt.frame('⚽ XFOOT', '🛑 ' + fmt.bold('Trop d’erreurs — quiz annulé.')));
        return true;
      }
      await this.send(fmt.frame('⚽ XFOOT', '⚠️ ' + fmt.bold('Choisis :') + ` ${fmt.bold(5)} / ${fmt.bold(10)} / ${fmt.bold(15)} … ${fmt.bold(MAX_IMAGES)}`));
      return true;
    }

    await this.send('⏳ ' + fmt.bold('Chargement des joueurs…'));
    try {
      this.players = await this._loadPlayers(n);
    } catch (err) {
      this.dispose();
      if (err.code === 'WIKIDATA_NOT_FOUND') {
        await this.send(fmt.frame('⚽ XFOOT', '❌ ' + fmt.bold('Aucun joueur trouvé pour ce filtre.') + ' Essaie un autre club ou pays.'));
        return true;
      }
      const msg =
        err.code === 'QUIZ_RATE_LIMITED'
          ? ['⚽ ' + fmt.bold('SOURCES EN PAUSE'), '⚠️ ' + fmt.bold('Limite de débit — réessaie dans ~1 minute.'), `🧾 ${fmt.bold('CODE')} : ${fmt.bold('RATE_LIMITED')}`]
          : ['⚽ ' + fmt.bold('SOURCES INDISPONIBLES'), '⚠️ ' + fmt.bold('Impossible de charger les joueurs pour le moment.'), `🧾 ${fmt.bold('CODE')} : ${fmt.bold(String(err.code || 'QUIZ_SOURCES_DOWN').toUpperCase())}`];
      await this.send(fmt.frame('⚠️ SYSTÈME EN PAUSE', msg));
      return true;
    }

    if (this.players.length === 0) {
      this.dispose();
      await this.send(fmt.frame('⚽ XFOOT', '❌ ' + fmt.bold('Aucun joueur trouvé pour ce filtre.') + ' Essaie un autre club ou pays.'));
      return true;
    }

    this.total = this.players.length;
    this.index = 0;
    this.state = 'RUNNING';

    await this.send(
      fmt.frame('⚽ QUIZ LANCÉ', [
        `📚 ${fmt.bold('Filtre')} : ${fmt.bold(this.filterLabel || this.source)} — ${fmt.bold('Joueurs')} : ${fmt.boldNum(this.total)}`,
        '',
        '📢 ' + fmt.bold('Tout le monde peut jouer !'),
        '⚡ ' + fmt.bold('Première bonne réponse = +10 points (prénom OU nom suffit).'),
      ])
    );
    await this._askQuestion();
    return true;
  }

  /*
   * Charge les joueurs — Xfoot = PHOTOS uniquement.
   * Mauvais filtre → WIKIDATA_NOT_FOUND (message propre) ;
   * panne/429/repos → QUIZ_SOURCES_DOWN / QUIZ_RATE_LIMITED.
   * JAMAIS de quiz aux indices.
   */
  async _loadPlayers(count) {
    const key = `xfoot:${fmt.normalizeAnswer(this.filter || '')}`;
    // 0) Cache FRAIS (< 10 min) → aucune requête.
    const fresh = cacheGet(key);
    if (fresh && Date.now() - fresh.at < CACHE_FRESH_MS && fresh.players.length >= count) {
      this.source = fresh.source;
      return shuffle(fresh.players).slice(0, count);
    }
    // 1) Repos post-panne ? → cache périmé possible, sinon échec direct.
    if (isCoolingDown('wikidata')) {
      const stale = cacheGet(key);
      if (stale && Date.now() - stale.at < CACHE_STALE_MS && stale.players.length > 0) {
        this.source = `${stale.source} (cache)`;
        return shuffle(stale.players).slice(0, count);
      }
      throw Object.assign(new Error('source en repos'), { code: 'QUIZ_SOURCES_DOWN' });
    }
    try {
      const result = await withRetry(() => this._wikidata(count));
      cacheSet(key, this.source, result);
      return result;
    } catch (err) {
      if (err.code === 'WIKIDATA_NOT_FOUND') throw err; // mauvais filtre ≠ panne
      markFail('wikidata');
      // 2) Cache PÉRIMÉ mais < 6 h → vraies photos plutôt qu'un refus.
      const stale = cacheGet(key);
      if (stale && Date.now() - stale.at < CACHE_STALE_MS && stale.players.length > 0) {
        this.source = `${stale.source} (cache)`;
        return shuffle(stale.players).slice(0, count);
      }
      throw Object.assign(new Error('Wikidata indisponible'), {
        code: err.code === 'WIKIDATA_RATE_LIMIT' ? 'QUIZ_RATE_LIMITED' : 'QUIZ_SOURCES_DOWN',
      });
    }
  }

  /* 🌍 Wikidata SPARQL — top 200 pros (MULTIVERS) ou filtre club/sélection. */
  async _wikidata(count) {
    const query = this.filter === 'multivers' ? TOP_QUERY : teamQuery(this.filter);
    const bindings = await sparql(query, this.fetchImpl);
    const players = bindingsToPlayers(bindings);
    if (players.length === 0) {
      throw Object.assign(
        new Error(this.filter === 'multivers' ? 'Wikidata vide' : `aucun joueur pour « ${this.filter} »`),
        { code: this.filter === 'multivers' ? 'WIKIDATA_BAD_RESPONSE' : 'WIKIDATA_NOT_FOUND' }
      );
    }
    this.source = this.filter === 'multivers' ? 'Légendes & stars du foot' : `Club/Sélection : ${this.filterLabel}`;
    return shuffle(players).slice(0, count);
  }

  /* ── Pose la question courante (photo du joueur) ── */
  async _askQuestion() {
    if (this.finished) return;
    this._clearTimers();
    const c = this.players[this.index];
    if (!c) return this._finish();

    this.firstCorrectPending = true;

    const payload = { body: null };
    // Xfoot = PHOTOS uniquement : photo non chargeable → joueur SAUTÉ
    // (jamais de question sans photo, jamais d'indice).
    const img = await downloadImage(c.image, this.bot.config.tmpDir, this.fetchImpl);
    if (!img) {
      this.players.splice(this.index, 1);
      this.total = this.players.length;
      if (this.total === 0) return this._finish('⚠️ ' + fmt.bold('Photos indisponibles — quiz arrêté.'));
      return this._askQuestion();
    }
    payload.attachment = img;

    const lines = [
      `🖼️ ${fmt.boldNum(this.index + 1)}/${fmt.boldNum(this.total)}  —  📚 ${fmt.bold(this.source)}`,
      '',
      '❓ ' + fmt.bold('QUI EST CE JOUEUR ?'),
      '',
      '⏱️ ' + fmt.bold(`${Math.round(this.bot.config.games.quizTimeoutMs / 1000)}s`),
    ];
    payload.body = fmt.frame(`⚽ FOOTBALL ${this.index + 1}/${this.total}`, lines);

    // ⚖️ Vérificateur STRICT : les AUTRES joueurs de la manche servent de
    // garde-fou — répondre un autre nom (même mal orthographié) = faux.
    const others = this.players.filter((x) => x !== c).flatMap((x) => [x.name, ...(x.alts || [])]);
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
    const c = this.players[this.index];
    await this.send(
      fmt.frame('⏱️ TEMPS ÉCOULÉ', [
        '⚽ ' + fmt.bold('C’était') + ' : ' + fmt.bold(c ? c.name : '—'),
      ])
    );
    this.firstCorrectPending = false;
    await this._next();
  }

  async _onAnswer(ctx, raw) {
    if (!this.awaitingAnswer) return false; // pause entre questions → ignoré
    const c = this.players[this.index];
    if (!c) return true;
    const uid = String(ctx.senderID); // ← l'auteur RÉEL de la réponse
    const name = ctx.senderName || (await this.bot.getUserName(uid));

    // Question déjà remportée → réponses tardives ignorées.
    if (!this.firstCorrectPending) return true;

    // Vérification STRICTE (autres joueurs = garde-fou anti faux-positifs).
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
      `⚽ ${fmt.bold('Joueur')} : ${fmt.bold(c.name)}`,
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
    lines.push('', '📚 ' + fmt.bold('Filtre') + ' : ' + fmt.bold(this.filterLabel || this.source || '—'));

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

    await this.send(fmt.frame('🏁 CLASSEMENT — QUIZ FOOT', lines));
    this.dispose();
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

module.exports = { FootQuizSession, resetSourceHealth, resetSourceCache, TEAM_ALIASES, bindingsToPlayers };
