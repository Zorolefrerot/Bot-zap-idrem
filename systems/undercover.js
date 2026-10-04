'use strict';
/*
 * 🧬 MeR~NeL — systems/undercover.js
 * 🎭 XUNDERCOVER — Civils 🏛️ · Undercover 🕵️ · Mr. White ⚪
 *
 * DÉROULEMENT :
 *   1. ENRÔLEMENT 90 s — on répond « moi » ; le lanceur peut faire « Go »
 *      dès qu'il veut (min 3 joueurs) pour démarrer sans attendre.
 *   2. Le lanceur colle le TID d'un groupe QG (commande Xtid) → le bot y
 *      dépose les rôles de CHACUN ; il les redistribue en PV lui-même.
 *   3. TOURS D'INDICE — chaque joueur a 20 s (réponse au message du bot).
 *      Un joueur ne peut ni doubler ni modifier son indice. La LISTE
 *      s'allonge à chaque indice (« Merdi : c'est chaud, brûlant »).
 *   4. VOTE 75 s MAX — « vote @pseudo » ; fin DIRECTE quand tous ont voté.
 *      Le plus voté sort :
 *      🕵️ UC démasqué → ÉLIMINÉ DIRECT · ⚪ MW démasqué → il tente de
 *      deviner le mot des civils (75 s) : bon → il VOLE la victoire.
 *   5. Victoire : civils vs infiltrés — annonce des gagnants, du PLUS
 *      MALIN (MVP) et des XCoins. Tableau de rang : Xucrank.
 *   6. 🃏 Cartes spéciales (Xucards) : 500 → 1 000 000 XCoins,
 *      1 carte / joueur / tour.
 */

const fmt = require('../utils/formatter');
const { pickPair } = require('./ucWords');
const { pickDeathPhrase } = require('./ucPhrases');
const { CARDS, cardById, shopLine } = require('./ucCards');

const REGISTRATION_MS = 90 * 1000; // enregistrement
const CLUE_MS = 20 * 1000; // 20 s par joueur
const VOTE_MS = 75 * 1000; // vote
const GUESS_MS = 75 * 1000; // devinette de Mr. White
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;

const ROLE_LABEL = {
  civil: '🏛️ CIVIL',
  uc: '🕵️ UNDERCOVER',
  mw: '⚪ MR. WHITE',
};

function normWord(w) {
  return fmt.normalizeAnswer(w);
}

class UCSession {
  constructor(bot, p) {
    this.bot = bot;
    this.threadID = String(p.threadID);
    this.ownerID = String(p.ownerID);
    this.ownerName = p.ownerName || 'Lanceur';
    this.send = p.send;
    this.scope = 'xundercover'; // UNE partie par groupe
    this.triggerCommand = 'xundercover';
    this.inactivityMs = Math.max(bot.config.games.stepTimeoutMs || 120000, 12 * 60 * 1000);

    this.state = 'RECRUIT';
    this.order = []; // [uid] — ordre d'arrivée = ordre de la liste
    this.players = new Map(); // uid → joueur
    this.round = 0;
    this.speakerIdx = 0;
    this.votes = new Map(); // voter → cible (le dernier vote compte)
    this.pair = null;
    this.swapPair = null; // permutation de votes
    this.finished = false;

    this._timers = [];
    this._voteCast = []; // votes du tour en cours (score « malin »)
    this._pending = null; // action en attente du « Go » du lanceur
  }

  /* Tout le monde peut rejoindre et parler pendant la partie. */
  accepts() {
    return true;
  }

  _timer(fn, ms) {
    const t = setTimeout(() => {
      fn().catch((e) => this.bot.logger && this.bot.logger.error('[undercover]', e));
    }, ms);
    if (t.unref) t.unref();
    this._timers.push(t);
    return t;
  }

  _clearTimers() {
    for (const t of this._timers) clearTimeout(t);
    this._timers = [];
  }

  dispose() {
    if (this.finished) return;
    this._clearTimers();
    this.finished = true;
    if (this.bot && this.bot.sessions) this.bot.sessions.remove(this.threadID, this.scope);
  }

  expire() {
    if (this.finished) return;
    if (this.state === 'RECRUIT') {
      this.dispose();
      this.send(fmt.frame('🎭 XUNDERCOVER', '⌛ ' + fmt.bold('Trop longtemps sans joueurs — annulé.'))).catch(() => {});
      return;
    }
    if (this.state === 'WAITING_TID' || this.state === 'WAITING_GO') {
      this.dispose();
      this.send(fmt.frame('🎭 XUNDERCOVER', '⌛ ' + fmt.bold('Partie abandonnée — trop de temps en pause.'))).catch(() => {});
    }
  }

  /* ── Affichage de la LISTE (noms + indices accumulés) ── */
  _ledgerLines(onlyAlive) {
    const lines = [];
    let n = 0;
    for (const uid of this.order) {
      const pl = this.players.get(uid);
      if (!pl) continue;
      if (onlyAlive && !pl.alive) continue;
      n++;
      const clue = pl.alive ? pl.clues.join(', ') || '—' : '🪦 éliminé';
      lines.push(`${n}. ${pl.name} : ${clue}`);
    }
    return lines;
  }

  _namesList() {
    const lines = [];
    this.order.forEach((uid, i) => {
      const pl = this.players.get(uid);
      lines.push(`${i + 1}. ${fmt.bold(pl.name)}`);
    });
    return lines;
  }

  alivePlayers() {
    return this.order.map((u) => this.players.get(u)).filter((p) => p && p.alive);
  }

  infiltratesAlive() {
    return this.alivePlayers().filter((p) => p.role !== 'civil');
  }

  async start() {
    await this.send(
      fmt.frame('🎭 XUNDERCOVER — ENRÔLEMENT', [
        '👥 ' + fmt.bold('Réponds à CE message avec « moi »') + ' pour jouer !',
        `⏱️ ${fmt.bold('90 secondes')} — ${fmt.bold('3 à 8 joueurs')}`,
        '',
        '🏛️ ' + fmt.bold('Civils') + ' : un mot commun — décrivez-le sans le dire.',
        '🕵️ ' + fmt.bold('Undercover') + ' : un mot différent — fondez-vous dans la masse.',
        '⚪ ' + fmt.bold('Mr. White') + ' : AUCUN mot — bluffez !',
        '',
        '🤫 ' + fmt.bold('Les rôles arrivent EN PV.') + ' Ouvrez votre conversation avec le bot !',
      ])
    );
    this._timer(() => this._closeRegistration(), REGISTRATION_MS);
    return true;
  }

  /* ════════════════ ROUTAGE ════════════════ */

  async handle(ctx) {
    const raw = String(ctx.text || '').trim();
    if (!raw) return false;
    const uid = String(ctx.senderID);

    /* 🛑 Arrêt : lanceur ou admin — vérifié D'ABORD, dans tous les états. */
    if (fmt.normalizeAnswer(raw) === 'stop' || (ctx.commandName === this.triggerCommand && /^stop$/i.test(raw))) {
      if (uid !== this.ownerID && !this.bot._isAdminAny(uid)) return true;
      this.dispose();
      await this.send(fmt.frame('🎭 XUNDERCOVER', '🛑 ' + fmt.bold('Partie annulée.')));
      return true;
    }

    if (this.state === 'RECRUIT') return this._handleRecruit(ctx, raw, uid);
    if (this.state === 'WAITING_TID') return this._onTID(ctx, raw, uid);
    if (this.state === 'WAITING_GO') return this._handleGo(ctx, raw, uid);

    /* 🃏 Cartes spéciales : « carte <n°> [@cible] » ou « Xucards use … » */
    const carteM = /^(?:carte|xucards use)\s+(\d{1,2})/i.exec(raw);
    if (carteM && ['TURNS', 'VOTE'].includes(this.state)) {
      await this._useCard(ctx, Number(carteM[1]), uid);
      return true;
    }

    if (this.state === 'GUESS') return this._handleGuessInThread(ctx, raw, uid);
    if (this.state === 'TURNS') return this._handleClue(ctx, raw, uid);
    if (this.state === 'VOTE') return this._handleVote(ctx, raw, uid);
    return false;
  }

  /* ════════════════ ENRÔLEMENT ════════════════ */

  async _handleRecruit(ctx, raw, uid) {
    const reply = ctx.event && ctx.event.messageReply;
    const botID = String((this.bot.adapter && this.bot.adapter.botID) || '');
    const isReplyToBot = Boolean(reply && reply.messageID && String(reply.senderID) === botID);

    if (fmt.normalizeAnswer(raw) === 'stop' && (uid === this.ownerID || this.bot._isAdminAny(uid))) {
      this.dispose();
      await this.send(fmt.frame('🎭 XUNDERCOVER', '🛑 ' + fmt.bold('Enrôlement annulé.')));
      return true;
    }
    /* ▶️ Go ANTICIPÉ : le lanceur démarre sans attendre les 90 s. */
    if (['go', 'start', 'lancer', 'c parti'].includes(fmt.normalizeAnswer(raw))) {
      if (uid !== this.ownerID && !this.bot._isAdminAny(uid)) return false;
      if (this.order.length < MIN_PLAYERS) {
        await this.send(
          fmt.frame('🎭 XUNDERCOVER', `⚠️ ${fmt.bold(`Pas assez de joueurs (${this.order.length}/${MIN_PLAYERS}).`)}`)
        );
        return true;
      }
      await this.send(
        fmt.frame('🎭 XUNDERCOVER', `▶️ ${fmt.bold('Go anticipé !')} ${fmt.bold(String(this.order.length) + ' joueurs')} — place à la distribution.`)
      );
      return this._closeRegistration();
    }

    if (!isReplyToBot) return false;
    if (!/^moi$/i.test(fmt.normalizeAnswer(raw))) return true;
    if (this.players.has(uid)) return true;

    const name = ctx.senderName || (await this.bot.getUserName(uid)) || 'Joueur';
    this.players.set(uid, {
      uid,
      name,
      role: null,
      word: '',
      alive: true,
      clues: [], // historique complet (indices accumulés)
      score: 0, // « plus malin »
      shield: false,
      doubleVote: false,
      frozen: false,
      gaggedRound: 0,
      immunity: 0,
      masque: false,
      secondSouffle: false,
      cardRound: 0,
    });
    this.order.push(uid);

    if (this.order.length >= MAX_PLAYERS) {
      await this.send(fmt.frame('🎭 XUNDERCOVER', `🎉 ${fmt.bold('8 joueurs réunis')} — c'est parti !`));
      await this._beginGame();
    } else {
      await this.send(
        fmt.frame('🎭 XUNDERCOVER', `✅ ${fmt.bold(name)} rejoint la partie ! (${this.order.length}/${MAX_PLAYERS})`)
      );
    }
    return true;
  }

  async _closeRegistration() {
    if (this.finished || this.state !== 'RECRUIT') return;
    if (this.order.length < MIN_PLAYERS) {
      this.dispose();
      await this.send(
        fmt.frame('🎭 XUNDERCOVER', `⚠️ ${fmt.bold(`Pas assez de joueurs (${this.order.length}/${MIN_PLAYERS}).`)} Annulé.`)
      );
      return;
    }
    /* 📥 Les PV automatiques ne marchent pas partout → le lanceur fournit
     * le TID d'un groupe QG où le bot déposera les rôles de chacun. */
    this.state = 'WAITING_TID';
    await this.send(
      fmt.frame('🎭 XUNDERCOVER — DISTRIBUER LES RÔLES', [
        '👥 ' + fmt.bold('Joueurs :'),
        ...this._namesList(),
        '📩 Lanceur : colle le TID du QG ' + fmt.bold('(Xtid') + ' dans un autre groupe' + fmt.bold(')') + ' — ⏱️ 90 s',
      ])
    );
    this._timer(async () => {
      if (this.finished || this.state !== 'WAITING_TID') return;
      this.dispose();
      await this.send(fmt.frame('🎭 XUNDERCOVER', '⌛ ' + fmt.bold('Aucun TID fourni — annulé.')));
    }, REGISTRATION_MS);
    return true;
  }

  /* Réception du TID du QG (lanceur ou admin). */
  async _onTID(ctx, raw, uid) {
    if (uid !== this.ownerID && !this.bot._isAdminAny(uid)) return true;
    const tid = String(raw).trim().replace(/[^0-9]/g, '');
    if (tid.length < 5) {
      this.tries = (this.tries || 0) + 1;
      if (this.tries >= 3) {
        this.dispose();
        return this.send(fmt.frame('🎭 XUNDERCOVER', '🛑 ' + fmt.bold('Trop de TID invalides — annulé.')));
      }
      return this.send(fmt.frame('🎭 XUNDERCOVER', '⚠️ ' + fmt.bold('TID invalide.') + ' Colle le NUMÉRO du groupe (Xtid).'));
    }
    this.distributionTID = tid;
    await this.send(
      fmt.frame('🎭 XUNDERCOVER', [
        `✅ ${fmt.bold('QG enregistré')} : ${fmt.bold(tid)}`,
        '📨 J’y envoie les rôles de CHACUN — redistribue-les en PV !',
      ])
    );
    return this._beginGame();
  }

  /* ════════════════ DÉBUT DE PARTIE ════════════════ */

  async _beginGame() {
    if (this.finished) return;
    this.state = 'TURNS';
    const n = this.order.length;

    /* 🎭 Tirage du couple de mots (anti-répétition persistante). */
    const store = this.bot.db.ucpairs.data;
    this.pair = pickPair(store);
    if (store.__dirty) {
      this.bot.db.ucpairs.save();
      store.__dirty = false;
    }

    /* Rôles : 1 Mr. White ; 2 undercover à 6+ joueurs. */
    const shuffled = this.order.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const nbUC = n >= 6 ? 2 : 1;
    this.players.get(shuffled[0]).role = 'mw';
    for (let i = 1; i <= nbUC; i++) this.players.get(shuffled[i]).role = 'uc';
    for (const uid of this.order) {
      const pl = this.players.get(uid);
      if (!pl.role) pl.role = 'civil';
      pl.word = pl.role === 'uc' ? this.pair.under : this.pair.civil;
    }

    /* 📨 Les rôles de CHACUN partent dans le groupe QG (distributionTID) :
     * le lanceur les redistribue ensuite manuellement en PV. */
    const roleLines = [`📨 ${fmt.bold('RÔLES À REDISTRIBUER EN PV')} (${this.order.length} joueurs) :`, ''];
    for (const uid of this.order) {
      const pl = this.players.get(uid);
      const label = pl.role === 'mw' ? '⚪ MR. WHITE — AUCUN mot (bluff !)' : `${ROLE_LABEL[pl.role]} — mot : ${fmt.bold(pl.word)}`;
      roleLines.push(`▸ ${fmt.bold(pl.name)} : ${label}`);
    }
    roleLines.push('', '🤫 Transmets à chacun SON rôle en message privé.');
    const sent = await this.bot
      .send(fmt.frame('🎭 QG — RÔLES DE LA PARTIE', roleLines), this.distributionTID)
      .catch(() => null);
    /* 🧹 Le message des rôles s'AUTO-DETRUIT après 10 s (secret). */
    if (sent && sent.messageID && typeof this.bot.adapter.unsend === 'function') {
      this._timer(async () => {
        try {
          await this.bot.adapter.unsend(sent.messageID);
        } catch (_) {
          /* déjà supprimé — pas grave */
        }
      }, 10 * 1000);
    }

    await this.send(
      fmt.frame('🎭 XUNDERCOVER — RÔLES ENVOYÉS', [
        `📨 QG : ${fmt.bold(this.distributionTID)} — 🧹 auto-effacé dans ${fmt.bold('10 s')}`,
        '🤫 Redistribue chaque rôle en PV.',
        '▶️ ' + fmt.bold('Tape « Go » ici') + ' quand tout le monde a son rôle !',
      ])
    );
    return this._waitGo(
      async () => {
        await this.send(
          fmt.frame('🎭 XUNDERCOVER — LA PARTIE COMMENCE', [
            `👥 ${fmt.bold(String(this.order.length) + ' joueurs')} — 🗣️ Tour 1 : ${fmt.bold('20 s')} par indice`,
            '💬 Réponds au message du bot pour donner ton indice.',
          ])
        );
        await this._startTurn();
      },
      'Rôles distribués ?',
      false
    );
  }

  /* ⏸️ PAUSE : le jeu attend le « Go » du lanceur (distribution des rôles,
   * fin d'un vote…). Rien n'avance sans lui. */
  async _waitGo(pendingFn, reason, announce = true) {
    if (this.finished) return;
    this.state = 'WAITING_GO';
    this._pending = pendingFn;
    if (announce) {
      await this.send(
        fmt.frame('⏸️ XUNDERCOVER — PAUSE', [
          `⏳ ${fmt.bold(reason)}`,
          `▶️ ${fmt.bold('Le lanceur tape « Go »')} pour lancer la suite.`,
        ])
      );
    }
  }

  /* ▶️ Réception du signal Go (lanceur ou admin uniquement). */
  async _handleGo(ctx, raw, uid) {
    const n = fmt.normalizeAnswer(raw);
    if (!['go', 'start', 'lancer', 'c parti'].includes(n)) return false; // bavardage libre pendant la pause
    if (uid !== this.ownerID && !this.bot._isAdminAny(uid)) {
      await this.send(fmt.frame('🎭 XUNDERCOVER', `⏳ ${fmt.bold('Seul le lanceur')} (${fmt.bold(this.ownerName || 'créateur')}) peut donner le « Go ».`));
      return true;
    }
    const fn = this._pending;
    this._pending = null;
    if (typeof fn === 'function') await fn();
    return true;
  }

  /* ════════════════ TOURS D'INDICE ════════════════ */

  async _startTurn() {
    if (this.finished) return;
    this.state = 'TURNS'; // ⚠️ essentiel après une élimination (state = RESOLVE)
    this.round++;
    this.speakerIdx = 0;
    this._roundReset();
    await this._promptSpeaker();
  }

  _roundReset() {
    for (const uid of this.order) {
      const pl = this.players.get(uid);
      pl.shield = false;
      pl.doubleVote = false;
      pl.frozen = false;
      if (pl.immunity > 0 && this.round > 1) pl.immunity--;
    }
    this.swapPair = null;
  }

  _currentSpeaker() {
    const alive = this.alivePlayers();
    return alive[this.speakerIdx] || null;
  }

  async _promptSpeaker() {
    if (this.finished) return;
    const sp = this._currentSpeaker();
    if (!sp) return this._startVote();

    const gagged = sp.gaggedRound >= this.round;
    const lines = [];
    if (gagged) {
      lines.push(`🔒 ${fmt.bold(sp.name)} est BÂILLONNÉ ce tour — pas d'indice !`);
      lines.push('', ...this._ledgerLines(true));
      await this.send(fmt.frame(`🎭 TOUR ${this.round} — INDICE`, lines));
      this.speakerIdx++;
      return this._promptSpeaker();
    }
    lines.push(`🎤 ${fmt.bold(sp.name)} — à toi ! (${fmt.bold('20 s')})`);
    lines.push('💬 Réponds à CE message avec ton indice.');
    lines.push('', ...this._ledgerLines(true));
    await this.send(fmt.frame(`🎭 TOUR ${this.round} — INDICE`, lines));

    const extra = sp.extraTime ? 10 * 1000 : 0;
    sp.extraTime = false;
    this._timer(async () => {
      if (this.finished) return;
      const cur = this._currentSpeaker();
      if (!cur || cur.uid !== sp.uid) return;
      if (!cur.clues[this.round - 1]) cur.clues.push('—'); // absence d'indice
      this.speakerIdx++;
      await this._promptSpeaker();
    }, CLUE_MS + extra);
  }

  async _handleClue(ctx, raw, uid) {
    const sp = this._currentSpeaker();
    if (!sp || sp.uid !== uid) return false;
    const reply = ctx.event && ctx.event.messageReply;
    const botID = String((this.bot.adapter && this.bot.adapter.botID) || '');
    const isReplyToBot = Boolean(reply && reply.messageID && String(reply.senderID) === botID);
    if (!isReplyToBot) return false;

    /* ❌ Un joueur ne peut PAS donner 2 indices ni modifier celui donné. */
    if (sp.clues[this.round - 1] && sp.clues[this.round - 1] !== '—') {
      await this.send(
        fmt.frame('🎭 XUNDERCOVER', `🚫 ${fmt.bold(sp.name)}, tu as déjà donné ton indice pour ce tour !`)
      );
      return true;
    }
    let clue = raw.slice(0, 60).trim();
    if (normWord(clue) === normWord(sp.word)) {
      /* Jamais de révélation publique — l'explication part EN PV. */
      this.bot
        .send(fmt.frame('🎭 XUNDERCOVER', ['🤫 ' + fmt.bold('On ne donne pas SON mot comme indice !') + ' Réponds avec un AUTRE indice.']), uid)
        .catch(() => {});
      await this.send(fmt.frame('🎭 XUNDERCOVER', `🤫 Indice refusé pour ${fmt.bold(sp.name)} — donne-en un autre !`));
      return true;
    }
    sp.clues[this.round - 1] = clue;
    sp.cluePending = true;
    const xpRes = this.bot.xp.addXp(uid, this.bot.config.xp.perCommand);
    if (xpRes.leveledUp) await this.bot._announceLevelUp(this.threadID, sp.name, xpRes.level).catch(() => {});
    const u = this.bot.db.ensureUser(uid);
    u.uc.clues = (u.uc.clues || 0) + 1;
    this.bot.db.users.save();

    this.speakerIdx++;
    /* La LISTE mise à jour annonce l'indice ET le prochain joueur. */
    const next = this._currentSpeaker();
    const lines = [`✅ ${fmt.bold(sp.name)} : « ${clue} »`, '', ...this._ledgerLines(true)];
    if (next) {
      lines.push('', `🎤 Au tour de ${fmt.bold(next.name)} (${fmt.bold('20 s')})`);
      await this.send(fmt.frame(`🎭 TOUR ${this.round} — INDICE`, lines));
      await this._promptSpeaker();
    } else {
      await this.send(fmt.frame(`🎭 TOUR ${this.round} — INDICE`, lines));
      await this._startVote();
    }
    return true;
  }

  /* ════════════════ VOTE ════════════════ */

  async _startVote() {
    if (this.finished) return;
    this.state = 'VOTE';
    this.voteDeadline = Date.now() + VOTE_MS;
    this.voteReopened = false; // « Cri du peuple »
    await this.send(
      fmt.frame(`🗳️ VOTE — TOUR ${this.round}`, [
        `vote @pseudo — ou réponds à son message avec ${fmt.bold('xvote')} (${fmt.bold('75 s max')})`,
        '💀 Le plus voté sort · ⚖️ égalité = personne · ✅ fin directe si tous ont voté',
        '',
        ...this._ledgerLines(true),
      ])
    );
    this._timer(async () => {
      if (this.finished || this.state !== 'VOTE') return;
      if (this.voteReopened) return; // le vote a été ROUVERT → un autre timer résoudra
      await this._resolveVote();
    }, VOTE_MS);
  }

  async _handleVote(ctx, raw, uid) {
    const voter = this.players.get(uid);
    if (!voter || !voter.alive) return false;
    const isVote = /^vote\b/i.test(raw) || ctx.commandName === 'xvote' || /^xvote\b/i.test(raw);
    if (!isVote) return false;

    if (voter.frozen) {
      await this.send(fmt.frame('🎭 VOTE', `🧊 ${fmt.bold(voter.name)}, ton vote est GELÉ ce tour (carte adverse) !`));
      return true;
    }
    /* 🎯 Cible : mention @pseudo, OU réponse au message du joueur avec xvote. */
    const mentions = Object.keys(ctx.event.mentions || {}).map(String);
    let target = mentions.find((m) => this.players.has(m) && this.players.get(m).alive && m !== uid);
    if (!target) {
      const reply = ctx.event && ctx.event.messageReply;
      const replySender = reply && String(reply.senderID || '');
      if (replySender && replySender !== uid && this.players.has(replySender) && this.players.get(replySender).alive) {
        target = replySender;
      }
    }
    if (!target) {
      await this.send(
        fmt.frame('🎭 VOTE', [
          '⚠️ ' + fmt.bold('Deux façons de voter :'),
          `1. ${fmt.bold('vote @pseudo')} (joueur vivant, pas toi)`,
          `2. ${fmt.bold('Réponds à un de SES messages')} avec ${fmt.bold('xvote')}`,
        ])
      );
      return true;
    }
    this.votes.set(uid, target);
    const name = this.players.get(target).name;

    /* 📊 Décompte LIVE : combien de votes a chaque joueur. */
    const live = new Map();
    for (const u of this.order) {
      const pl = this.players.get(u);
      if (pl.alive) live.set(u, 0);
    }
    for (const [voterUid, targetUid] of this.votes) {
      const v = this.players.get(voterUid);
      if (live.has(targetUid) && v) live.set(targetUid, (live.get(targetUid) || 0) + (v.doubleVote ? 2 : 1));
    }
    const tallyLines = [...live.entries()].map(([u, n], i) => {
      const pl = this.players.get(u);
      const arrow = u === target ? ' 🎯' : '';
      return `${i + 1}. ${fmt.bold(pl.name)} — ${fmt.bold(String(n))} vote${n > 1 ? 's' : ''}${arrow}`;
    });
    await this.send(
      fmt.frame('🎭 VOTE', [
        `🗳️ ${fmt.bold(voter.name)} → ${fmt.bold(name)}` + (voter.doubleVote ? ' ×2 🗳️' : ''),
        '',
        fmt.bold('📊 ÉTAT DES VOTES :'),
        ...tallyLines,
      ])
    );
    /* ✅ FIN DIRECTE : tous les vivants (non gelés) ont voté → on résout NOW. */
    const mustVote = this.alivePlayers().filter((p) => !p.frozen).length;
    if (this.votes.size >= mustVote) {
      await this.send(fmt.frame('🎭 VOTE', `✅ ${fmt.bold('Tout le monde a voté')} — on compte !`));
      return this._resolveVote();
    }
    return true;
  }

  async _resolveVote() {
    if (this.finished || this.state !== 'VOTE') return;
    this.state = 'RESOLVE';

    /* Décompte (ordre d'arrivée) avec boucliers / immunité / double vote. */
    const totals = new Map();
    for (const uid of this.order) totals.set(uid, 0);
    const shieldUsed = new Set();
    for (const uid of this.order) {
      const target = this.votes.get(uid);
      if (!target) continue;
      const voter = this.players.get(uid);
      const tgt = this.players.get(target);
      if (!tgt || !tgt.alive) continue;
      if (tgt.immunity > 0) continue; // intouchable
      if (tgt.shield && !shieldUsed.has(target)) {
        shieldUsed.add(target); // le 1er vote est annulé
        continue;
      }
      const w = voter && voter.doubleVote ? 2 : 1;
      totals.set(target, (totals.get(target) || 0) + w);
      /* Score « malin » : voter juste (réglé à la révélation). */
      this._voteCast.push({ voter: uid, target });
    }

    /* 🔁 Permutation : échange des totaux. */
    if (this.swapPair) {
      const [a, b] = this.swapPair;
      const ta = totals.get(a) || 0;
      const tb = totals.get(b) || 0;
      totals.set(a, tb);
      totals.set(b, ta);
      this.swapPair = null;
    }

    /* Meilleur score (égalité → personne ne sort). */
    let best = null;
    let bestCount = 0;
    let tie = false;
    for (const uid of this.order) {
      const c = totals.get(uid) || 0;
      if (!this.players.get(uid).alive || c === 0) continue;
      if (c > bestCount) {
        best = uid;
        bestCount = c;
        tie = false;
      } else if (c === bestCount) {
        tie = true;
      }
    }

    const tally = this.order
      .filter((u) => (totals.get(u) || 0) > 0 && this.players.get(u).alive)
      .map((u) => `${this.players.get(u).name} ${totals.get(u)}`)
      .join(' · ');

    const cast = this._voteCast.slice();
    this.votes.clear();
    this._voteCast = [];

    if (!best || tie) {
      await this.send(
        fmt.frame(`🗳️ VOTE — TOUR ${this.round}`, [
          '⚖️ ' + fmt.bold('Égalité — personne n\u2019est éliminé !'),
          tally ? `🧾 ${tally}` : '🧾 Aucun vote.',
        ])
      );
      return this._waitGo(() => this._startTurn(), 'Prêt pour le prochain tour ?');
    }

    const firstVoter = cast.find((v) => v.target === best);
    const voterName = firstVoter ? this.players.get(firstVoter.voter).name : '';
    await this._eliminate(best, '', { voterName });
  }

  /* ════════════════ ÉLIMINATION ════════════════ */

  async _eliminate(uid, context, extraData = {}) {
    const pl = this.players.get(uid);
    if (!pl || !pl.alive) return this._startTurn();

    /* ⚰️ Second souffle : survit, rôle non révélé. */
    if (pl.secondSouffle) {
      pl.secondSouffle = false;
      await this.send(
        fmt.frame('🎭 XUNDERCOVER', [
          `⚰️ ${fmt.bold(pl.name)} était éliminé… mais a survécu grâce à sa carte !`,
          context || '',
        ])
      );
      return this._startTurn();
    }

    pl.alive = false;

    /* 🎁 Immunité consommée ? (jamais éliminé tant qu'active — géré au décompte) */
    let reveal = ROLE_LABEL[pl.role];
    let extra = [];
    if (pl.masque) {
      reveal = '🎭 rôle masqué';
    } else if (pl.role === 'uc') {
      extra.push(`💬 Son mot : ${fmt.bold(pl.word)}`);
    } else if (pl.role === 'mw') {
      extra.push('🤫 Il va tenter de deviner le mot des civils…');
    }
    for (const v of this._voteCast || []) {
      if (v.voter === uid) continue;
      const voter = this.players.get(v.voter);
      const isGoodVote = pl.role !== 'civil'; // voter infiltré = malin
      if (isGoodVote) {
        voter.score += 3;
        const uu = this.bot.db.ensureUser(v.voter);
        uu.uc.votesOK = (uu.uc.votesOK || 0) + 1;
      }
    }
    this._voteCast = [];
    this.bot.db.users.save();

    /* 💀 Phrase d'accroche DRÔLE (210 variantes, noms insérés). */
    const phrase = pickDeathPhrase(pl.role, {
      name: pl.name,
      voter: extraData.voterName || '',
      word: pl.word,
      civ: this.pair ? this.pair.civil : '',
    });
    /* 💀 Message ÉPURÉ : la phrase drôle + qui + son rôle — c'est tout. */
    const lines = [
      '❌ ' + fmt.bold('FIN DES VOTES'),
      '',
      ...phrase,
      '',
      `🎭 ${fmt.bold(pl.name)} était : ${fmt.bold(reveal)}`,
      ...extra,
    ];
    void context;
    void extraData;
    await this.send(fmt.frame('💀 XUNDERCOVER — ÉLIMINATION', lines));

    /* ⚪ Mr. White démasqué → tentative de devinette (75 s). */
    if (pl.role === 'mw' && !pl.masque) return this._startGuess(pl);

    return this._afterElimination();
  }

  /* ⚪ Devinette de Mr. White — À VOIX HAUTE dans le groupe (règle du jeu
   * réel). Tout message du MW pendant 75 s = sa tentative. */
  async _startGuess(mw) {
    this.guessUid = String(mw.uid);
    this.guessDeadline = Date.now() + GUESS_MS;
    this.state = 'GUESS';
    await this.send(
      fmt.frame('⚪ MR. WHITE — DERNIÈRE CHANCE', [
        `🎯 ${fmt.bold(mw.name)} (Mr. White) doit deviner le mot des civils !`,
        `💬 ${fmt.bold('Écris ta réponse ICI dans le groupe')} — ${fmt.bold('75 s')}.`,
        '💥 Bonne réponse → tu VOLES la victoire ! Raté → la partie continue.',
      ])
    );
    this._timer(async () => {
      if (this.finished || this.state !== 'GUESS') return;
      await this._endGuess(null);
    }, GUESS_MS);
    return true;
  }

  /* Réception de la tentative de Mr. White dans le groupe. */
  async _handleGuessInThread(ctx, raw, uid) {
    if (this.finished || this.state !== 'GUESS') return false;
    if (String(uid) !== String(this.guessUid)) return true; // seuls les mots du MW comptent
    await this._endGuess(String(raw).trim());
    return true;
  }

  async _endGuess(raw) {
    if (this.finished || this.state !== 'GUESS') return;
    this.state = 'RESOLVE';
    const mw = this.players.get(this.guessUid);
    this.guessUid = null;

    if (raw && normWord(raw) === normWord(this.pair.civil)) {
      mw.score += 10;
      const uu = this.bot.db.ensureUser(mw.uid);
      uu.uc.wins = (uu.uc.wins || 0) + 1;
      uu.xcoins += 400;
      this.bot.db.users.save();
      return this._finish(
        '⚪ MR. WHITE VOLE LA VICTOIRE !',
        [
          `🎯 ${fmt.bold(mw.name)} a deviné : ${fmt.bold(this.pair.civil)} 💥`,
          `💰 ${fmt.bold('+400 XCoins')} pour le roi du bluff !`,
          '',
          `🤫 ${fmt.bold('Le mot UC')} : ${this.pair.under} — 🏛️ ${fmt.bold('mot civil')} : ${this.pair.civil}`,
        ],
        [mw.uid]
      );
    }
    await this.send(
      fmt.frame('🎭 XUNDERCOVER', [
        raw ? `❌ ${fmt.bold('Raté !')} ${fmt.bold(mw.name)} quitte la partie.` : `⏱️ ${fmt.bold(mw.name)} n\u2019a pas deviné à temps.`,
        '🎭 La partie continue !',
      ])
    );
    return this._afterElimination();
  }

  /* ════════════════ FIN DE TOUR / VICTOIRE ════════════════ */

  async _afterElimination() {
    if (this.finished) return;
    const infiltrates = this.infiltratesAlive().length;
    const civils = this.alivePlayers().length - infiltrates;

    /* 🏛️ Tous les infiltrés démasqués → victoire des civils. */
    if (infiltrates === 0) {
      const winners = this.alivePlayers().filter((p) => p.role === 'civil').map((p) => p.uid);
      for (const p of this.players.values()) if (p.role === 'civil' && !p.alive) winners.push(p.uid);
      return this._finishCivils(winners);
    }
    /* 🕵️ Trop peu de civils → victoire des infiltrés. */
    if (civils <= 1 && infiltrates >= 1) {
      const winners = this.alivePlayers().filter((p) => p.role !== 'civil').map((p) => p.uid);
      return this._finishInfiltrés(winners);
    }
    return this._waitGo(() => this._startTurn(), `Tour ${this.round} terminé — prêt pour le prochain ?`);
  }

  async _finishCivils(winners) {
    for (const uid of winners) {
      const uu = this.bot.db.ensureUser(uid);
      uu.uc.wins = (uu.uc.wins || 0) + 1;
    }
    this.bot.db.users.save();
    return this._finish(
      '🏛️ LES CIVILS GAGNENT !',
      [
        '🎉 ' + fmt.bold('Tous les infiltrés ont été démasqués !'),
        `🤫 ${fmt.bold('Mot civil')} : ${this.pair.civil} — ${fmt.bold('mot UC')} : ${this.pair.under}`,
      ],
      winners
    );
  }

  async _finishInfiltrés(winners) {
    for (const uid of winners) {
      const uu = this.bot.db.ensureUser(uid);
      uu.uc.wins = (uu.uc.wins || 0) + 1;
    }
    this.bot.db.users.save();
    return this._finish(
      '🕵️ LES INFILTRÉS GAGNENT !',
      [
        '🎭 ' + fmt.bold('Le bluff a triomphé !'),
        `🤫 ${fmt.bold('Mot civil')} : ${this.pair.civil} — ${fmt.bold('mot UC')} : ${this.pair.under}`,
      ],
      winners
    );
  }

  async _finish(title, extraLines, winnerUids) {
    /* 🧠 Le PLUS MALIN (MVP). */
    let mvp = null;
    for (const uid of this.order) {
      const pl = this.players.get(uid);
      if (!mvp || pl.score > mvp.score) mvp = pl;
    }

    /* 💰 Prix + stats. */
    const lines = [...extraLines, '', `🏆 ${fmt.bold('GAGNANTS')} :`];
    if (!winnerUids.length) lines.push('— personne —');
    for (const uid of this.order) {
      const uu = this.bot.db.ensureUser(uid);
      uu.uc.games = (uu.uc.games || 0) + 1;
    }
    for (const uid of winnerUids) {
      const uu = this.bot.db.ensureUser(uid);
      uu.xcoins += 150;
      lines.push(`🥇 ${fmt.bold(uu.name || this.players.get(uid).name)} — ${fmt.bold('+150 XCoins')}`);
    }
    if (mvp && mvp.score > 0) {
      const uu = this.bot.db.ensureUser(mvp.uid);
      uu.uc.mvp = (uu.uc.mvp || 0) + 1;
      uu.xcoins += 100;
      lines.push(
        '',
        `🧠 ${fmt.bold('LE PLUS MALIN')} : ${fmt.bold(mvp.name)} (${mvp.score} pts) — ${fmt.bold('+100 XCoins')}`
      );
    }

    /* Révélation complète des rôles. */
    lines.push('', '🎭 ' + fmt.bold('RÔLES :'));
    for (const uid of this.order) {
      const pl = this.players.get(uid);
      lines.push(`${ROLE_LABEL[pl.role]} — ${fmt.bold(pl.name)}${pl.alive ? '' : ' 🪦'}`);
    }
    this.bot.db.users.save();
    this.dispose();
    await this.send(fmt.frame(title, lines));
  }

  /* ════════════════ CARTES SPÉCIALES ════════════════ */

  async _useCard(ctx, cardNo, uid) {
    const pl = this.players.get(uid);
    if (!pl || !pl.alive) return true;
    const card = cardById(cardNo);
    if (!card) {
      await this.send(fmt.frame('🃏 CARTES', `⚠️ ${fmt.bold('Carte inconnue.')} Tape Xucards pour la liste.`));
      return true;
    }
    if (pl.cardRound === this.round) {
      await this.send(fmt.frame('🃏 CARTES', `🚫 ${fmt.bold('1 seule carte par tour !')}`));
      return true;
    }
    const user = this.bot.db.ensureUser(uid);
    const owned = (user.cards && user.cards[card.id]) || 0;
    if (owned <= 0) {
      await this.send(
        fmt.frame('🃏 CARTES', `❌ ${fmt.bold('Tu n\u2019as pas cette carte.')} Achète-la : ${fmt.bold(`Xucards buy ${card.id}`)} (${card.price.toLocaleString('fr-FR')} XCoins)`)
      );
      return true;
    }

    const mentions = Object.keys(ctx.event.mentions || {}).map(String);
    const target = mentions.map((m) => this.players.get(m)).find((t) => t && t.alive && t.uid !== uid) || null;
    const needTarget = [6, 8, 9, 10, 16, 17, 19].includes(card.id);
    if (needTarget && !target) {
      await this.send(fmt.frame('🃏 CARTES', `⚠️ ${fmt.bold(card.name)} : mentionne un joueur vivant — carte ${card.id} @pseudo`));
      return true;
    }
    if (card.id === 11 && this.state !== 'VOTE') {
      await this.send(fmt.frame('🃏 CARTES', `⚠️ ${fmt.bold(card.name)} se joue pendant le VOTE.`));
      return true;
    }

    user.cards[card.id] = owned - 1;
    this.bot.db.users.save();
    pl.cardRound = this.round;
    /* 📨 Les effets SECRETS partent dans le QG (distributionTID) — les PV
     * ne sont pas fiables ; le lanceur transmet au joueur. */
    const QG = this.distributionTID || uid;
    const DM = (lines) => this.bot.send(fmt.frame(`🃏 ${card.emoji} ${card.name.toUpperCase()} — pour ${pl.name}`, lines), QG);

    switch (card.id) {
      case 1: {
        pl.extraTime = true;
        await DM(['⏱️ Ton prochain indice durera ' + fmt.bold('25 s') + '.']);
        break;
      }
      case 2:
        await DM([`🏷️ Catégorie du mot civil : ${fmt.bold(this.pair.categorie)}`]);
        break;
      case 3:
        pl.shield = true;
        await DM(['🛡️ Le premier vote contre toi ce tour sera annulé.']);
        break;
      case 4:
        pl.doubleVote = true;
        await DM(['🗳️ Ton vote comptera DOUBLE.']);
        break;
      case 5:
        await DM([`🔤 Le mot civil commence par ${fmt.bold('« ' + this.pair.civil[0].toUpperCase() + ' »')}`]);
        break;
      case 6:
        target.frozen = true;
        await this.send(fmt.frame('🃏 CARTES', `🧊 ${fmt.bold(target.name)} ne pourra pas voter ce tour !`));
        break;
      case 7:
        pl.masque = true;
        await DM(['🎭 Ton rôle ne sera pas révélé si tu es éliminé.']);
        break;
      case 8: {
        const allied = target.role === pl.role;
        await DM([`🕯️ ${fmt.bold(target.name)} est ${fmt.bold(allied ? 'ALLIÉ' : 'ENNEMI')} (de ton camp).`]);
        break;
      }
      case 9:
        this.swapPair = [uid, target.uid];
        await DM([`🔁 Tes votes seront échangés avec ceux de ${fmt.bold(target.name)}.`]);
        break;
      case 10:
        target.gaggedRound = this.round + 1;
        await this.send(fmt.frame('🃏 CARTES', `🔒 ${fmt.bold(target.name)} sera BÂILLONNÉ au prochain tour !`));
        break;
      case 11: {
        this.voteReopened = true;
        this._timer(async () => {
          if (this.finished || this.state !== 'VOTE') return;
          this.voteReopened = false;
          await this._resolveVote();
        }, 20 * 1000);
        await this.send(
          fmt.frame('🃏 CARTES', `📢 ${fmt.bold(pl.name)} ROUVRE le vote ! ${fmt.bold('20 s de plus')} — changez de vote !`)
        );
        break;
      }
      case 12: {
        const letters = this.pair.civil.replace(/[^a-zA-Zà-ÿ]/g, '');
        const i = Math.floor(Math.random() * letters.length);
        let j = Math.floor(Math.random() * letters.length);
        if (j === i) j = (i + 1) % letters.length;
        await DM([`🔮 Deux lettres du mot civil : ${fmt.bold(letters[i].toUpperCase())} et ${fmt.bold(letters[j].toUpperCase())}`]);
        break;
      }
      case 13:
        pl.secondSouffle = true;
        await DM(['⚰️ Tu survivras à ta première élimination (rôle caché).']);
        break;
      case 14:
        await DM([`🕵️ Infiltrés encore vivants : ${fmt.bold(String(this.infiltratesAlive().length))}`]);
        break;
      case 15:
        pl.immunity = 2;
        await DM(['🎁 Tu es INTOUCHABLE pendant 2 votes.']);
        break;
      case 16:
        await DM([`🧠 ${fmt.bold(target.name)} est ${fmt.bold(ROLE_LABEL[target.role])}`]);
        break;
      case 17: {
        const tmpRole = pl.role;
        const tmpWord = pl.word;
        pl.role = target.role;
        pl.word = target.word;
        target.role = tmpRole;
        target.word = tmpWord;
        await DM([`🃏 Ton NOUVEAU rôle : ${fmt.bold(ROLE_LABEL[pl.role])}${pl.word ? ` — mot : ${fmt.bold(pl.word)}` : ''}`]);
        this.bot
          .send(
            fmt.frame('🃏 IDENTITÉ VOLÉE', [
              `Ton NOUVEAU rôle : ${fmt.bold(ROLE_LABEL[target.role])}${target.word ? ` — mot : ${fmt.bold(target.word)}` : ''}`,
            ]),
            target.uid
          )
          .catch(() => {});
        break;
      }
      case 18: {
        const infil = this.infiltratesAlive();
        if (!infil.length) {
          await DM(['☠️ Aucun infiltré vivant — carte gaspillée…']);
          break;
        }
        const chosen = infil[Math.floor(Math.random() * infil.length)];
        await this.send(
          fmt.frame('☠️ DÉNONCIATION PUBLIQUE', [
            `📣 ${fmt.bold(chosen.name)} est… ${fmt.bold(ROLE_LABEL[chosen.role])} !`,
            chosen.role === 'mw' ? '🤫 Il a le droit à sa devinette…' : '',
          ])
        );
        return this._eliminate(chosen.uid, '☠️ Dénoncé par une carte', { voterName: pl.name });
      }
      case 19:
        await this.send(fmt.frame('🃏 CARTES', `⚡ ${fmt.bold(target.name)} est éliminé SANS vote par une carte de ${fmt.bold(pl.name)} !`));
        return this._eliminate(target.uid, '⚡ Élimination directe (carte)', { voterName: pl.name });
      case 20: {
        const list = this.alivePlayers().map((p) => `${ROLE_LABEL[p.role]} — ${fmt.bold(p.name)}`);
        await DM(['👑 Rôles des vivants :', ...list]);
        break;
      }
      default:
        break;
    }
    await this.send(fmt.frame('🃏 CARTES', `✨ ${fmt.bold(pl.name)} joue ${fmt.bold(card.emoji + ' ' + card.name)} !`));
    return true;
  }

  /* ════════════════ DÉCLARATION DE CARTE PAR LE LANCEUR ════════════════
   * Le joueur dit sa carte au lanceur, qui tape : Xucard <n°> @joueur [@cible].
   * @returns {Promise<boolean>} true si la carte a été jouée. */
  async declareCard(cardNo, playerUid, targetUid, declaredBy) {
    if (this.finished || !['TURNS', 'VOTE', 'GUESS'].includes(this.state)) return false;
    if (String(declaredBy) !== String(this.ownerID) && !this.bot._isAdminAny(declaredBy)) return false;
    const pl = this.players.get(String(playerUid));
    if (!pl || !pl.alive) return false;
    const fakeCtx = {
      senderID: String(playerUid),
      event: targetUid ? { mentions: { [String(targetUid)]: { tag: '@joueur' } } } : { mentions: {} },
      text: `carte ${cardNo}`,
      args: [String(cardNo)],
    };
    return this._useCard(fakeCtx, Number(cardNo), String(playerUid));
  }

  /* Boutique (utilisée par la commande Xucards). */
  static shopLines(owned) {
    return CARDS.map((c) => {
      const have = owned && owned[c.id] ? ` (×${owned[c.id]})` : '';
      return `${shopLine(c)}${have}\n    ↳ ${c.desc}`;
    });
  }
}

module.exports = { UCSession, CARDS, cardById, REGISTRATION_MS, CLUE_MS, VOTE_MS, GUESS_MS, MIN_PLAYERS, MAX_PLAYERS };
