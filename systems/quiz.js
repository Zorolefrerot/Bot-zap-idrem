'use strict';
/*
 * 🧬 MeR~NeL — systems/quiz.js  (v4 — moteur Xid, réponses LIBRES)
 * Xquiz de groupe : plus de QCM. Le bot donne un INDICE (personnage,
 * anime, culture générale, capitale ou drapeau) et tout le groupe
 * répond DIRECTEMENT — prénom OU nom OU nom complet.
 *
 *  - configuration réservée au lanceur : catégorie → nombre (5/10/15) ;
 *  - « 🎮 QUIZ LANCÉ — Thème/Questions/Tout le monde peut jouer ! » ;
 *  - première bonne réponse = +10 points AU senderID de celui qui répond
 *    (jamais au lanceur) ; tolérance orthographique + variantes (moteur Xid) ;
 *  - mauvaise réponse = silencieuse, on peut retenter immédiatement ;
 *  - timer 15 s → « Temps écoulé + réponse » → suivante ;
 *  - fin : 🏁 CLASSEMENT GÉNÉRAL (tableau final seul) + gains.
 */

const { CATEGORIES, loadBank, resolveCategory, shuffle } = require('./questions');
const { matchAnswer } = require('./mangaQuiz');
const fmt = require('../utils/formatter');
const { safeInt } = require('../utils/sanitize');

const CANCEL_WORDS = new Set(['cancel', 'annuler', 'stop', 'quit', 'quitter', 'exit', '!stop']);

class GroupQuizSession {
  /**
   * @param {object} bot contexte global
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

    /** Map<uid, {name, score}> — points (+10 par bonne réponse). */
    this.scores = new Map();
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
        '🪪 ' + fmt.bold('ID') + ' — ' + fmt.bold('Indices de personnages'),
        '🌌 ' + fmt.bold('MULTIVERS') + ' — ' + fmt.bold('Anime & mangas'),
        '🧠 ' + fmt.bold('CG') + ' — ' + fmt.bold('Culture générale'),
        '🌍 ' + fmt.bold('CAPITALE') + ' — ' + fmt.bold('Trouve la capitale du pays'),
        '🚩 ' + fmt.bold('DRAPEAU') + ' — ' + fmt.bold('Trouve le pays du drapeau'),
        '',
        '⚠️ ' + fmt.bold('Réponses LIBRES : tape directement la réponse.'),
        '🛑 ' + fmt.bold('Tape « cancel » pour annuler.'),
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
      await this.send(fmt.frame('🎮 XQUIZ', '⚠️ ' + fmt.bold('Catégorie inconnue.') + '\nRéponds : 𝗜𝗗 / 𝗠𝗨𝗟𝗧𝗜𝗩𝗘𝗥𝗦 / 𝗖𝗚 / 𝗖𝗔𝗣𝗜𝗧𝗔𝗟𝗘 / 𝗗𝗥𝗔𝗣𝗘𝗔𝗨'));
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
        '⚡ ' + fmt.bold(`Réponds directement — prénom OU nom OU nom complet (+10 pts, ${Math.round(this.bot.config.games.quizTimeoutMs / 1000)}s par question).`),
      ])
    );
    await this._askQuestion();
    return true;
  }

  /* ── Pose la question courante (indice texte / drapeau) ── */
  async _askQuestion() {
    if (this.finished) return;
    this._clearTimers();
    const q = this.questions[this.index];
    if (!q) return this._finish();

    this.firstCorrectPending = true;

    const style = CATEGORIES[this.category].style;
    const header = `🎮 QUESTION ${this.index + 1}/${this.count}`;
    const lines = [];

    if (style === 'drapeau') {
      lines.push(q.q, '', '❓ ' + fmt.bold('Quel pays ?'));
    } else if (style === 'capitale') {
      lines.push('🌍 ' + fmt.bold('Pays') + ' : ' + fmt.bold(q.q), '', '❓ ' + fmt.bold('Quelle est SA capitale ?'));
    } else {
      lines.push('🧩 ' + fmt.bold(q.q), '', '❓ ' + fmt.bold('Qui ou quoi ?'));
    }
    lines.push(
      '👉 ' + fmt.bold('Réponds directement') + ' — ' + fmt.bold('prénom OU nom OU nom complet'),
      '⏱️ ' + fmt.bold(`${Math.round(this.bot.config.games.quizTimeoutMs / 1000)}s`) + ' — ' + fmt.bold('première bonne réponse = +10 pts')
    );

    const payload = { body: fmt.frame(header, lines) };

    // La question devient « live » AVANT l'envoi (pas de course avec le client).
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
    const q = this.questions[this.index];
    await this.send(
      fmt.frame('⏱️ TEMPS ÉCOULÉ', [
        '❌ ' + fmt.bold('Personne n’a trouvé.'),
        '✅ ' + fmt.bold('Réponse') + ' : ' + fmt.bold(q.a),
      ])
    );
    await this._next();
  }

  /*
   * ⚡ CŒUR (moteur Xid) : première bonne réponse = +10 points au senderID
   * de celui qui répond, jamais au lanceur. Tolérance orthographique et
   * variantes. Mauvaise réponse = silencieuse, retente quand tu veux.
   */
  async _onAnswer(ctx, raw) {
    if (!this.awaitingAnswer) return false; // pause entre questions → ignoré
    const q = this.questions[this.index];
    if (!q) return true;
    const uid = String(ctx.senderID); // ← l'auteur RÉEL de la réponse
    const name = ctx.senderName || (await this.bot.getUserName(uid));

    // Question déjà remportée → réponses tardives ignorées (silencieux).
    if (!this.firstCorrectPending) return true;

    // Tolérance : réponse exacte, prénom/nom seul, variantes (alts), petites fautes.
    const candidates = [q.a, ...(q.alts || [])];
    const correct = candidates.some((c) => matchAnswer(raw, c));
    if (!correct) return true; // silencieux — réessaie !

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
      `✅ ${fmt.bold('Réponse')} : ${fmt.bold(q.a)}`,
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
    if (this.index >= this.count) return this._finish();
    this.awaitingAnswer = false;
    // Pause entre questions — tracée pour être annulée par dispose().
    this.interTimer = setTimeout(() => {
      this.interTimer = null;
      if (this.finished) return;
      this._askQuestion().catch(() => {});
    }, this.bot.config.games.interDelayMs);
  }

  /* ── 🏁 CLASSEMENT GÉNÉRAL (tableau final, seul) ── */
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
        lines.push(`${icon} ${fmt.bold(rec.name)} — ${fmt.boldNum(rec.score)} ${fmt.bold(rec.score > 10 ? 'pts' : 'pt')}  (+${fmt.boldNum(coins)} XCoins)`);
      });
    }
    lines.push('', '🧠 ' + fmt.bold('Catégorie') + ' : ' + fmt.bold(this.category ? CATEGORIES[this.category].short : '—'));

    // Gains, XP et stats — par participant, selon SON score.
    for (const [uid, rec] of this.scores) {
      const coins = Math.round((rec.score / 10) * 2);
      if (coins > 0) this.bot.economy.addCoins(uid, coins);
      const xpGain = Math.round(rec.score / 10) * 2 + 5;
      const xpRes = this.bot.xp.addXp(uid, xpGain);
      const user = this.bot.db.ensureUser(uid);
      user.stats.quizPlayed += 1;
      user.stats.quizCorrect += Math.round(rec.score / 10);
      user.stats.quizBestScore = Math.max(user.stats.quizBestScore || 0, Math.round(rec.score / 10));
      if (xpRes && xpRes.leveledUp) lines.push(`🎉 ${fmt.bold(rec.name)} ${fmt.bold('passe niveau')} ${fmt.boldNum(xpRes.level)} !`);
    }
    this.bot.db.users.save();
    this.bot.db.bumpStat('quizzesPlayed');

    await this.send(fmt.frame('🏁 CLASSEMENT GÉNÉRAL', lines));
    this.dispose();
  }
}

module.exports = { GroupQuizSession };
