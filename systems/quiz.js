'use strict';
/*
 * 🧬 MeR~NeL — systems/quiz.js
 * Machine d'état du quiz :
 * WAITING_CATEGORY → WAITING_QUESTION_COUNT → RUNNING → FINISHED
 * Une session = un joueur. Les messages des autres membres sont ignorés.
 */

const { CATEGORIES, loadBank, resolveCategory, shuffle, idImagePath } = require('./questions');
const fmt = require('../utils/formatter');
const { safeInt } = require('../utils/sanitize');

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const CANCEL_WORDS = new Set(['cancel', 'annuler', 'stop', 'quit', 'quitter', 'exit']);

class QuizSession {
  /**
   * @param {object} bot  contexte global (api, config, db, economy, xp, logger…)
   * @param {object} p    { threadID, ownerID, ownerName, send }
   */
  constructor(bot, p) {
    this.bot = bot;
    this.threadID = String(p.threadID);
    this.ownerID = String(p.ownerID);
    this.ownerName = p.ownerName || 'Joueur';
    this.send = p.send; // (payload) => Promise
    this.scope = `quiz:${this.ownerID}`;
    this.triggerCommand = 'xquiz';
    this.inactivityMs = bot.config.games.stepTimeoutMs;

    this.state = 'WAITING_CATEGORY';
    this.category = null;
    this.count = 0;
    this.questions = [];
    this.index = 0;
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.tries = 0;
    this.awaitingAnswer = false; // true uniquement quand une question est posée
    this.questionTimer = null;
    this.interTimer = null; // pause entre deux questions (à nettoyer au dispose)
    this.questionTimer = null;
    this.awaitingSteal = false; // non utilisé en solo — symétrie avec duel
    this.finished = false;
  }

  accepts(userID) {
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
    if (this.bot && this.bot.sessions) {
      this.bot.sessions.remove(this.threadID, this.scope);
    }
  }

  expire() {
    if (this.state === 'RUNNING') this._finish('⏱️ Session expirée.');
    else if (!this.finished) {
      this.dispose();
      this.send(fmt.frame('🎮 QUIZ', '⌛ Session annulée — trop longtemps sans réponse.')).catch(() => {});
    }
  }

  /* ── Démarrage ── */
  async start() {
    const menu = [
      '「' + fmt.bold('PLEASE CHOOSE YOUR CATEGORY') + '」',
      '',
      `🪪 ${fmt.bold('ID')} — ${fmt.bold('Identification')}`,
      `🌌 ${fmt.bold('MULTIVERS')} — ${fmt.bold('Anime')}`,
      `🧠 ${fmt.bold('CG')} — ${fmt.bold('Culture générale')}`,
      '',
      fmt.bold('Réponds directement : ID / MULTIVERS / CG'),
      '⚠️ ' + fmt.bold('Tape « cancel » pour annuler.'),
    ];
    await this.send(fmt.frame('🎮 XQUIZ', menu));
  }

  /* ── Route un message. Retourne true si consommé. ── */
  async handle(ctx) {
    const raw = String(ctx.text || '').trim();
    if (!raw) return false;

    // Laisser passer les autres commandes du bot.
    if (ctx.commandName && ctx.commandName !== this.triggerCommand) return false;
    if (ctx.commandName === this.triggerCommand) {
      await this.send(fmt.frame('🎮 XQUIZ', '⚠️ ' + fmt.bold('Un quiz est déjà en cours.') + '\nTape « cancel » pour l’annuler.'));
      return true;
    }
    if (CANCEL_WORDS.has(fmt.normalizeAnswer(raw))) {
      this.dispose();
      await this.send(fmt.frame('🎮 XQUIZ', '🛑 ' + fmt.bold('Quiz annulé.') + ' À bientôt.'));
      return true;
    }

    switch (this.state) {
      case 'WAITING_CATEGORY':
        return this._onCategory(raw);
      case 'WAITING_QUESTION_COUNT':
        return this._onCount(raw);
      case 'RUNNING':
        return this._onAnswer(raw);
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
    if (bank.length < 10) {
      this.dispose();
      await this.send(fmt.frame('🎮 XQUIZ', '⚠️ ' + fmt.bold('Banque de questions indisponible pour cette catégorie.')));
      return true;
    }
    this.category = cat;
    this.tries = 0;
    this.state = 'WAITING_QUESTION_COUNT';
    const maxAvail = bank.length;
    await this.send(
      fmt.frame('🎮 XQUIZ', [
        '『' + fmt.bold('NOMBRE DE QUESTIONS') + '』',
        '',
        `${fmt.bold('10')} / ${fmt.bold('20')} / ${fmt.bold('30')} / ${fmt.bold('40')} / ${fmt.bold('50')}`,
        '',
        maxAvail < 50 ? `📌 ${fmt.bold('Max disponible')} : ${fmt.boldNum(maxAvail)}` : '',
        fmt.bold('Réponds simplement par le nombre.'),
      ].filter(Boolean))
    );
    return true;
  }

  async _onCount(raw) {
    const n = safeInt(raw, { min: 1, max: 50 });
    const allowed = [10, 20, 30, 40, 50];
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
    this.score = 0;
    this.state = 'RUNNING';
    const catLabel = CATEGORIES[this.category].label;
    await this.send(
      fmt.frame('🎮 XQUIZ LANCÉ', [
        fmt.bold('Joueur') + ' : ' + this.ownerName,
        fmt.bold('Catégorie') + ' : ' + catLabel,
        fmt.bold('Questions') + ' : ' + fmt.boldNum(this.count),
        '',
        '⚡ ' + fmt.bold('Bonne chance.'),
      ])
    );
    await this._askQuestion();
    return true;
  }

  async _askQuestion() {
    if (this.finished) return; // session disposée → jamais de question fantôme
    this._clearTimers();
    const q = this.questions[this.index];
    if (!q) return this._finish();

    let payload;
    if (q.type === 'mcq') {
      this._currentOptions = shuffle(q.options);
      const correctIdx = this._currentOptions.indexOf(q.answer);
      this._correctLetter = LETTERS[correctIdx];
      const optionLines = this._currentOptions.map((opt, i) => `▸ ${fmt.bold(LETTERS[i])}) ${fmt.bold(opt)}`);
      payload = {
        body: fmt.frame(`🎮 Q ${this.index + 1}/${this.count}`, [
          '🧠 ' + fmt.bold(q.q),
          '',
          ...optionLines,
          '',
          '⏱️ ' + fmt.bold(`${Math.round(this.bot.config.games.quizTimeoutMs / 1000)}s`),
        ]),
      };
    } else {
      // Catégorie ID : photo + question ouverte.
      this._currentOptions = null;
      const imgPath = idImagePath(q.image);
      const lines = ['🪪 ' + fmt.bold('IDENTIFIE CE PERSONNAGE')];
      if (!imgPath && q.hint) {
        lines.push('', '🧩 ' + fmt.bold('Indice') + ' : ' + q.hint);
      }
      payload = {
        body: fmt.frame(`🎮 Q ${this.index + 1}/${this.count}`, [...lines, '', '⏱️ ' + fmt.bold(`${Math.round(this.bot.config.games.quizTimeoutMs / 1000)}s`)]),
      };
      if (imgPath) payload.attachment = imgPath;
    }
    // La question devient « live » AVANT l'envoi : toute réponse qui arrive
    // pendant/juste après l'envoi est valide (pas de course avec le client).
    this.awaitingAnswer = true;
    await this.send(payload);

    const timeoutMs = this.bot.config.games.quizTimeoutMs;
    this.questionTimer = setTimeout(() => {
      this.questionTimer = null;
      this._onTimeout().catch(() => {});
    }, timeoutMs);
  }

  async _onTimeout() {
    if (this.finished) return; // session disposée pendant le timer → ignorer
    this.awaitingAnswer = false;
    const q = this.questions[this.index];
    await this.send(
      fmt.frame('⏱️ TEMPS ÉCOULÉ', [
        '❌ ' + fmt.bold('Temps dépassé.') + ' ⚡ ' + this.ownerName,
        '✅ ' + fmt.bold('Réponse') + ' : ' + fmt.bold(q.answer),
      ])
    );
    this.streak = 0;
    await this._next();
  }

  async _onAnswer(raw) {
    // Aucune question en attente (pause entre questions) → message ignoré.
    if (!this.awaitingAnswer) return false;
    const q = this.questions[this.index];
    if (!q) return true;
    const norm = fmt.normalizeAnswer(raw);
    let correct = false;
    let givenLetter = null;

    if (q.type === 'mcq') {
      // 1) Le texte d'une option est prioritaire — égalité EXACTE (normalisée)
      //    uniquement, pour éviter les collisions entre options quasi identiques
      //    et avec les réponses purement numériques comme « 3 ».
      const textHit = this._currentOptions.findIndex((opt) => fmt.normalizeAnswer(opt) === norm);
      if (textHit >= 0) {
        givenLetter = LETTERS[textHit];
        correct = textHit === this._currentOptions.indexOf(q.answer);
      } else {
        // 2) Sinon : lettre (A-D) ou numéro d'option (1-4)
        const letterMatch = norm.match(/^([abcd])(\)|\s|$)/) || norm.match(/^([1-4])$/);
        if (letterMatch) {
          const letter = /[1-4]/.test(letterMatch[1]) ? LETTERS[Number(letterMatch[1]) - 1] : letterMatch[1].toUpperCase();
          givenLetter = letter;
          correct = letter === this._correctLetter;
        }
      }
    } else {
      correct = fmt.answerMatches(raw, q.answer) || fmt.normalizeAnswer(raw).includes(fmt.normalizeAnswer(q.answer));
    }

    // Message sans aucune lettre (chiffres/emoji) pendant une question ID → simple rappel.
    if (!correct && q.type !== 'mcq' && !/[a-z]/.test(norm)) {
      this._stray = (this._stray || 0) + 1;
      if (this._stray <= 3) {
        await this.send(fmt.frame('🎮 XQUIZ', '⚠️ ' + fmt.bold('Réponds avec le nom du personnage.')));
        return true;
      }
    }

    if (!correct && q.type === 'mcq' && !givenLetter) {
      // Texte qui ne ressemble pas à une réponse → on laisse une chance, sans consommer
      // le timer plus de 3 fois pour éviter les messages hors-sujet.
      this._stray = (this._stray || 0) + 1;
      if (this._stray <= 3) {
        await this.send(fmt.frame('🎮 XQUIZ', '⚠️ ' + fmt.bold('Réponds par la lettre A, B, C ou D.')));
        return true;
      }
    }

    this._clearTimers();
    this.awaitingAnswer = false;
    if (correct) {
      this.score++;
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.bot.xp.addXp(this.ownerID, 3);
      await this.send(
        fmt.pick([
          `✅ ${fmt.bold('Correct !')} 🔥 ${fmt.bold('Série')} : ${fmt.boldNum(this.streak)}`,
          `✅ ${fmt.bold('Exact.') + ' ⚡ ' + fmt.bold('Série')} : ${fmt.boldNum(this.streak)}`,
          `✅ ${fmt.bold('Bien joué,')} ${this.ownerName}. 🔥 ×${fmt.boldNum(this.streak)}`,
        ])
      );
    } else {
      this.streak = 0;
      await this.send(
        fmt.frame('❌ MAUVAISE RÉPONSE', [
          '✅ ' + fmt.bold('Réponse') + ' : ' + fmt.bold(q.answer),
          '📊 ' + fmt.bold('Score') + ' : ' + fmt.bold(`${this.score}/${this.index + 1}`),
        ])
      );
    }
    await this._next();
    return true;
  }

  async _next() {
    this.index++;
    if (this.index >= this.count) return this._finish();
    // Pause entre questions — tracée pour être annulée par dispose().
    this.interTimer = setTimeout(() => {
      this.interTimer = null;
      if (this.finished) return;
      this._askQuestion().catch(() => {});
    }, this.bot.config.games.interDelayMs);
  }

  async _finish(notice) {
    if (this.finished) return;
    this.awaitingAnswer = false;
    const perCorrect = this.bot.config.games.quizCoinsPerCorrect;
    const coins = this.score * perCorrect;
    const xpGain = this.score * 3 + 10;
    const balance = this.bot.economy.addCoins(this.ownerID, coins);
    const xpRes = this.bot.xp.addXp(this.ownerID, xpGain);

    const user = this.bot.db.ensureUser(this.ownerID);
    user.stats.quizPlayed += 1;
    user.stats.quizCorrect += this.score;
    user.stats.quizBestScore = Math.max(user.stats.quizBestScore || 0, this.score);
    this.bot.db.users.save();
    this.bot.db.bumpStat('quizzesPlayed');

    const catLabel = this.category ? CATEGORIES[this.category].short : '—';
    const lines = [];
    if (notice) lines.push(notice, '');
    lines.push(
      '👤 ' + fmt.bold('Joueur') + ' : ' + this.ownerName,
      '🧠 ' + fmt.bold('Catégorie') + ' : ' + fmt.bold(catLabel),
      '📊 ' + fmt.bold('Score final') + ' : ' + fmt.bold(`${this.score}/${this.count}`),
      '🔥 ' + fmt.bold('Meilleure série') + ' : ' + fmt.boldNum(this.bestStreak),
      '',
      `💰 ${fmt.bold('Gain')} : +${fmt.boldNum(coins)} ${fmt.bold('XCoins')}`,
      `⚡ ${fmt.bold('XP')} : +${fmt.boldNum(xpGain)}`
    );
    if (xpRes.leveledUp) {
      lines.push('', `🎉 ${fmt.bold('NIVEAU SUPÉRIEUR')} : ${fmt.boldNum(xpRes.level)} !`);
    }
    lines.push('', `💰 ${fmt.bold('Solde')} : ${fmt.boldNum(balance)}`);
    await this.send(fmt.frame('🏁 QUIZ TERMINÉ', lines));
    this.dispose();
  }
}

module.exports = { QuizSession };
