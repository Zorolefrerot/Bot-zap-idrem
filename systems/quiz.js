'use strict';
/*
 * 🧬 MeR~NeL — systems/quiz.js  (v2 — quiz de GROUPE)
 * Machine d'état : WAITING_CATEGORY → WAITING_COUNT → RUNNING → FINISHED
 *
 * Logique demandée :
 *  - LANCEUR choisit catégorie (CG/MULTIVERS/ID) puis nombre (5/10/15) ;
 *  - « 🎮 QUIZ LANCÉ — Thème: CG — 10 Questions — Tout le monde peut jouer ! » ;
 *  - chaque question : 15 s, TOUT le groupe peut répondre, 1 réponse/personne ;
 *  - la PREMIÈRE bonne réponse marque +1 point — pour le senderID de celui
 *    qui a répondu (JAMAIS celui du lanceur — fix du vol de points) ;
 *  - une mauvaise réponse = exclu de CETTE question (pas de pénalité) ;
 *  - personne ne trouve → « Temps écoulé, réponse: X » → question suivante ;
 *  - fin : classement général avec gains.
 */

const { CATEGORIES, loadBank, resolveCategory, shuffle, idImagePath } = require('./questions');
const fmt = require('../utils/formatter');
const { safeInt } = require('../utils/sanitize');

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const CANCEL_WORDS = new Set(['cancel', 'annuler', 'stop', 'quit', 'quitter', 'exit']);

class GroupQuizSession {
  /**
   * @param {object} bot contexte global (api, config, db, economy, xp…)
   * @param {object} p   { threadID, ownerID, ownerName, send }
   */
  constructor(bot, p) {
    this.bot = bot;
    this.threadID = String(p.threadID);
    this.ownerID = String(p.ownerID);
    this.ownerName = p.ownerName || 'Joueur';
    this.send = p.send;
    this.scope = 'quiz'; // UN quiz par groupe — tout le monde y participe
    this.triggerCommand = 'xquiz';
    this.inactivityMs = bot.config.games.stepTimeoutMs;

    this.state = 'WAITING_CATEGORY';
    this.category = null;
    this.count = 0;
    this.questions = [];
    this.index = 0;

    /** Map<uid, {name, score}> — participants (ceux qui ont marqué). */
    this.scores = new Map();
    /** messageID de la QUESTION courante : seules les RÉPONSES à ce message comptent. */
    this.currentQuestionID = null;
    /** true tant que personne n'a trouvé la question courante. */
    this.firstCorrectPending = false;

    this.tries = 0;
    this.questionTimer = null;
    this.interTimer = null;
    this.awaitingAnswer = false;
    this.finished = false;
  }

  /* En phase de lancement, seul le lanceur navigue. En jeu, tout le monde. */
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
    this.currentQuestionID = null;
    if (this.bot && this.bot.sessions) {
      this.bot.sessions.remove(this.threadID, this.scope);
    }
  }

  expire() {
    if (this.finished) return;
    if (this.state === 'RUNNING') return this._finish('⏱️ Session expirée.');
    this.dispose();
    this.send(fmt.frame('🎮 XQUIZ', '⌛ ' + fmt.bold('Quiz annulé — trop longtemps sans réponse.'))).catch(() => {});
  }

  async start() {
    await this.send(
      fmt.frame('🎮 XQUIZ', [
        '「' + fmt.bold('PLEASE CHOOSE YOUR CATEGORY') + '」',
        '',
        `🪪 ${fmt.bold('ID')} — ${fmt.bold('Identification')}`,
        `🌌 ${fmt.bold('MULTIVERS')} — ${fmt.bold('Anime')}`,
        `🧠 ${fmt.bold('CG')} — ${fmt.bold('Culture générale')}`,
        '',
        fmt.bold('Réponds directement : ID / MULTIVERS / CG'),
        '⚠️ ' + fmt.bold('Tape « cancel » pour annuler.'),
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
      await this.send(fmt.frame('🎮 XQUIZ', '⚠️ ' + fmt.bold('Un quiz est déjà en cours dans ce groupe.') + '\n🛑 ' + fmt.bold('Le lanceur peut taper « cancel ».')));
      return true;
    }
    if (CANCEL_WORDS.has(fmt.normalizeAnswer(raw))) {
      const isAdmin = this.bot.config.isAdmin(ctx.senderID);
      if (this.state === 'RUNNING' && String(ctx.senderID) !== this.ownerID && !isAdmin) {
        await this.send(fmt.frame('🎮 XQUIZ', '⛔ ' + fmt.bold('Seul le lanceur (ou un admin) peut annuler un quiz en cours.')));
        return true;
      }
      this.dispose();
      await this.send(fmt.frame('🎮 XQUIZ', '🛑 ' + fmt.bold('Quiz annulé.') + ' À bientôt.'));
      return true;
    }

    switch (this.state) {
      case 'WAITING_CATEGORY':
        return this._onCategory(raw);
      case 'WAITING_COUNT':
        return this._onCount(raw);
      case 'RUNNING':
        return this._onAnswer(ctx, raw);
      default:
        return false;
    }
  }

  async _onCategory(raw) {
    const cat = resolveCategory(raw);
    if (!cat) {
      this.tries++;
      if (this.tries >= 3) {
        this.dispose();
        await this.send(fmt.frame('🎮 XQUIZ', '🛑 ' + fmt.bold('Trop d’erreurs — quiz annulé.')));
        return true;
      }
      await this.send(fmt.frame('🎮 XQUIZ', '⚠️ ' + fmt.bold('Catégorie inconnue.') + '\nRéponds : 𝗜𝗗 / 𝗠𝗨𝗟𝗧𝗜𝗩𝗘𝗥𝗦 / 𝗖𝗚'));
      return true;
    }
    const bank = loadBank(cat);
    if (bank.length < 5) {
      this.dispose();
      await this.send(fmt.frame('🎮 XQUIZ', '⚠️ ' + fmt.bold('Banque de questions indisponible pour cette catégorie.')));
      return true;
    }
    this.category = cat;
    this.tries = 0;
    this.state = 'WAITING_COUNT';
    await this.send(
      fmt.frame('🎮 XQUIZ', [
        '『' + fmt.bold('NOMBRE DE QUESTIONS') + '』',
        '',
        this.bot.config.games.quizAllowedCounts.map((n) => fmt.bold(n)).join('  /  '),
        '',
        fmt.bold('Réponds simplement par le nombre.'),
      ])
    );
    return true;
  }

  async _onCount(raw) {
    const n = safeInt(raw, { min: 1, max: 50 });
    const allowed = this.bot.config.games.quizAllowedCounts;
    if (!n || !allowed.includes(n)) {
      this.tries++;
      if (this.tries >= 3) {
        this.dispose();
        await this.send(fmt.frame('🎮 XQUIZ', '🛑 ' + fmt.bold('Trop d’erreurs — quiz annulé.')));
        return true;
      }
      await this.send(fmt.frame('🎮 XQUIZ', '⚠️ ' + fmt.bold('Choisis :') + ` ${allowed.map((a) => fmt.bold(a)).join(' / ')}`));
      return true;
    }
    const bank = loadBank(this.category);
    this.count = Math.min(n, bank.length);
    this.questions = shuffle(bank).slice(0, this.count);
    this.index = 0;
    this.state = 'RUNNING';

    const catLabel = CATEGORIES[this.category].short;
    await this.send(
      fmt.frame('🎮 QUIZ LANCÉ', [
        `🎯 ${fmt.bold('Thème')} : ${fmt.bold(catLabel)} — ${fmt.bold('Questions')} : ${fmt.boldNum(this.count)}`,
        '',
        '📢 ' + fmt.bold('Tout le monde peut jouer !'),
        '⚡ ' + fmt.bold(`Première bonne réponse = +1 point (${Math.round(this.bot.config.games.quizTimeoutMs / 1000)}s par question).`),
        '🚫 ' + fmt.bold('Réponse fausse = exclu de la question en cours.'),
      ])
    );
    await this._askQuestion();
    return true;
  }

  /* ── Pose la question courante au groupe (message TAGUÉ) ── */
  async _askQuestion() {
    if (this.finished) return;
    this._clearTimers();
    const q = this.questions[this.index];
    if (!q) return this._finish();

    this.firstCorrectPending = true;
    this._currentOptions = q.type === 'mcq' ? shuffle(q.options) : null;
    if (this._currentOptions) {
      const correctIdx = this._currentOptions.indexOf(q.answer);
      this._correctLetter = LETTERS[correctIdx];
    }

    const header = `🎮 QUESTION ${this.index + 1}/${this.count}`;
    const instructions = [
      '👉 ' + fmt.bold('Pour répondre : RÉPONDEZ à ce message') + ' — ' + fmt.bold('plusieurs essais autorisés !'),
      '⏱️ ' + fmt.bold(`${Math.round(this.bot.config.games.quizTimeoutMs / 1000)}s`) + ' — ' + fmt.bold('première bonne réponse = +1 point'),
    ];
    const payload = {};
    let lines;

    if (q.type === 'mcq') {
      lines = [
        '🧠 ' + fmt.bold(q.q),
        '',
        ...this._currentOptions.map((opt, i) => `▸ ${fmt.bold(LETTERS[i])}) ${fmt.bold(opt)}`),
        '',
        ...instructions,
      ];
    } else {
      lines = ['🪪 ' + fmt.bold('IDENTIFIE CE PERSONNAGE')];
      const imgPath = idImagePath(q.image);
      if (!imgPath && q.hint) lines.push('🧩 ' + fmt.bold('Indice') + ' : ' + q.hint);
      lines.push('', ...instructions);
      const attachment = imgPath;
      if (attachment) payload.attachment = attachment;
    }
    const base = fmt.frame(header, lines);
    payload.body = base;

    // 📢 Question TAGUÉE : les membres du groupe sont mentionnés (comme Xtag).
    try {
      const tInfo = await this.bot.adapter.getThreadInfo(this.threadID);
      const ids = ((tInfo && (tInfo.participantIDs || (tInfo.userInfo || []).map((u) => u.id))) || [])
        .map(String)
        .filter((uid) => uid && uid !== String(this.bot.adapter.botID))
        .slice(0, 25);
      if (ids.length) {
        const infos = await this.bot.adapter.userCache.fetch(ids).catch(() => ({}));
        const prefix = base + '\n\n';
        let tagLine = '';
        const mentions = {};
        for (const uid of ids) {
          const nm = (infos[uid] && infos[uid].name) || 'Membre';
          const tag = `@${String(nm).split(/\s+/)[0]}`;
          mentions[uid] = { tag, from: prefix.length + tagLine.length };
          tagLine += tag + ' ';
        }
        payload.body = prefix + tagLine.trim();
        payload.mentions = mentions;
      }
    } catch (_) { /* mentions indisponibles → question simple */ }

    // La question devient « live » AVANT l'envoi (pas de course avec le client).
    this.awaitingAnswer = true;
    const sentInfo = await this.send(payload);
    this.currentQuestionID = sentInfo && sentInfo.messageID ? String(sentInfo.messageID) : null;

    const timeoutMs = this.bot.config.games.quizTimeoutMs;
    this.questionTimer = setTimeout(() => {
      this.questionTimer = null;
      this._onTimeout().catch(() => {});
    }, timeoutMs);
  }

  async _onTimeout() {
    if (this.finished) return;
    this.awaitingAnswer = false;
    const q = this.questions[this.index];
    await this.send(
      fmt.frame('⏱️ TEMPS ÉCOULÉ', [
        '❌ ' + fmt.bold('Personne n’a trouvé.'),
        '✅ ' + fmt.bold('Réponse') + ' : ' + fmt.bold(q.answer),
      ])
    );
    await this._next();
  }

  /*
   * ⚡ CŒUR DU FIX : le point va au senderID de celui qui RÉPOND,
   * jamais au lanceur du quiz. Pour tenter sa chance, il FAUT répondre
   * (reply) au message de la question — plusieurs essais, sans blocage.
   */
  async _onAnswer(ctx, raw) {
    // 1) Seule une RÉPONSE au message de la question compte.
    const reply = ctx.event && ctx.event.messageReply;
    if (!reply || !reply.messageID) return false;
    if (!this.currentQuestionID || String(reply.messageID) !== this.currentQuestionID) return false;
    // 2) Pause entre questions / question déjà remportée → consommé, ignoré.
    if (!this.awaitingAnswer) return true;
    const q = this.questions[this.index];
    if (!q) return true;
    const uid = String(ctx.senderID); // ← l'auteur RÉEL de la réponse
    const name = ctx.senderName || (await this.bot.getUserName(uid));

    // Question déjà remportée → réponses tardives ignorées (silencieux).
    if (!this.firstCorrectPending) return true;

    const norm = fmt.normalizeAnswer(raw);
    let correct = false;
    if (q.type === 'mcq') {
      // 1) égalité EXACTE (normalisée) avec le texte d'une option ;
      const textHit = this._currentOptions.findIndex((opt) => fmt.normalizeAnswer(opt) === norm);
      if (textHit >= 0) {
        correct = textHit === this._currentOptions.indexOf(q.answer);
      } else {
        // 2) lettre (A-D) ou numéro d'option (1-4)
        const m = norm.match(/^([abcd])(\)|\s|$)/) || norm.match(/^([1-4])$/);
        if (m) {
          const letter = /[1-4]/.test(m[1]) ? LETTERS[Number(m[1]) - 1] : m[1].toUpperCase();
          correct = letter === this._correctLetter;
        }
      }
    } else {
      correct = fmt.answerMatches(raw, q.answer) || norm.includes(fmt.normalizeAnswer(q.answer));
    }

    if (correct) {
      // PREMIER bon answerer → +1 point POUR LUI.
      this.firstCorrectPending = false;
      this.awaitingAnswer = false;
      this._clearTimers();
      const rec = this.scores.get(uid) || { name, score: 0 };
      rec.name = name;
      rec.score += 1;
      this.scores.set(uid, rec);
      // 📢 Annonce TAGUÉE : le vainqueur est mentionné.
      const tag = `@${String(name).split(/\s+/)[0]}`;
      const bodyText = fmt.frame('⚡ BONNE RÉPONSE', [
        `✅ ${tag} ${fmt.bold('prend le point')} ! (+1)`,
        `🏁 ${fmt.bold('Score')} : ${fmt.boldNum(rec.score)}`,
      ]);
      const payload = { body: bodyText };
      const from = bodyText.indexOf(tag);
      if (from >= 0) payload.mentions = { [uid]: { tag, from } };
      await this.send(payload);
      await this._next();
      return true;
    }

    // Mauvaise réponse → AUCUNE pénalité, on peut réessayer tout de suite
    // (silencieux pour ne pas inonder le groupe).
    return true;
  }

  async _next() {
    this.index++;
    if (this.index >= this.count) return this._finish();
    this.awaitingAnswer = false;
    // Pause entre questions — tracée pour être annulée par dispose().
    this.interTimer = setTimeout(() => {
      this.interTimer = null;
      if (this.finished) return;
      this._askQuestion().catch(() => {});
    }, this.bot.config.games.interDelayMs);
  }

  /* ── Classement général ── */
  async _finish(notice) {
    if (this.finished) return;
    this.finished = true;
    this.awaitingAnswer = false;
    this._clearTimers();

    const ranking = [...this.scores.values()].sort((a, b) => b.score - a.score);
    const medals = ['🏆', '🥈', '🥉'];
    const perCorrect = this.bot.config.games.quizCoinsPerCorrect;
    const lines = [];

    if (notice) lines.push(notice, '');
    if (ranking.length === 0) {
      lines.push('📭 ' + fmt.bold('Personne n’a marqué pendant ce quiz.'));
    } else {
      ranking.forEach((rec, i) => {
        const icon = i < 3 ? medals[i] : '▸';
        const coins = rec.score * perCorrect;
        lines.push(`${icon} ${fmt.bold(rec.name)} — ${fmt.boldNum(rec.score)} ${fmt.bold(rec.score > 1 ? 'pts' : 'pt')}  (+${fmt.boldNum(coins)} XCoins)`);
      });
    }
    lines.push('', '🧠 ' + fmt.bold('Catégorie') + ' : ' + fmt.bold(this.category ? CATEGORIES[this.category].short : '—'));

    // Gains, XP et stats — par participant, selon SON score.
    for (const [uid, rec] of this.scores) {
      const coins = rec.score * perCorrect;
      if (coins > 0) this.bot.economy.addCoins(uid, coins);
      const xpGain = rec.score * 3 + 5;
      const xpRes = this.bot.xp.addXp(uid, xpGain);
      const user = this.bot.db.ensureUser(uid);
      user.stats.quizPlayed += 1;
      user.stats.quizCorrect += rec.score;
      user.stats.quizBestScore = Math.max(user.stats.quizBestScore || 0, rec.score);
      if (xpRes.leveledUp) lines.push(`🎉 ${fmt.bold(rec.name)} ${fmt.bold('passe niveau')} ${fmt.boldNum(xpRes.level)} !`);
    }
    this.bot.db.users.save();
    this.bot.db.bumpStat('quizzesPlayed');

    await this.send(fmt.frame('🏁 CLASSEMENT GÉNÉRAL', lines));
    this.dispose();
  }
}

module.exports = { GroupQuizSession };
