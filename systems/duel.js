'use strict';
/*
 * 🧬 MeR~NeL — systems/duel.js
 * Machine d'état du duel à deux joueurs :
 * WAITING_P1 → WAITING_P2 → WAITING_CATEGORY → WAITING_COUNT → WAITING_BET
 *   → RUNNING → FINISHED
 * La mise est déduite AVANT le duel, distribuée à la fin. Jamais de
 * double récompense : une seule source de vérité (database).
 */

const { CATEGORIES, loadBank, resolveCategory, shuffle } = require('./questions');
const fmt = require('../utils/formatter');
const { safeInt } = require('../utils/sanitize');

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const CANCEL_WORDS = new Set(['cancel', 'annuler', 'stop', 'quit', 'quitter', 'exit']);

class DuelSession {
  /**
   * @param {object} bot contexte global
   * @param {object} p   { threadID, initiatorID, send }
   */
  constructor(bot, p) {
    this.bot = bot;
    this.threadID = String(p.threadID);
    this.initiatorID = String(p.initiatorID);
    this.send = p.send;
    this.scope = 'duel';
    this.triggerCommand = 'xduel';
    this.inactivityMs = bot.config.games.stepTimeoutMs;

    this.state = 'WAITING_P1';
    this.duelist1 = null; // { uid, name }
    this.duelist2 = null;
    this.category = null;
    this.questionCount = 0;
    this.bet = 0;
    this.betLocked = false;
    this.questions = [];
    this.index = 0;
    this.turn = 0; // index du joueur à qui la main
    this.scores = {}; // uid → score
    this.stolen = false;
    this.awaitingAnswer = false; // true uniquement quand une question est posée
    this.questionTimer = null;
    this.interTimer = null; // pause entre deux questions (à nettoyer au dispose)
    this.tries = 0;
    this.questionTimer = null;
    this.finished = false;
  }

  static keyFor(threadID) {
    return { threadID: String(threadID), scope: 'duel' };
  }

  players() {
    return [this.duelist1, this.duelist2].filter(Boolean);
  }

  accepts(userID) {
    const uid = String(userID);
    if (this.state === 'RUNNING') return this.players().some((pl) => pl.uid === uid);
    return uid === this.initiatorID;
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
    if (this.finished) return;
    if (this.state === 'RUNNING' && this.betLocked) {
      return this._abort('⏱️ Duel abandonné — mises remboursées.');
    }
    this.dispose();
    this.send(fmt.frame('⚔️ XDUEL', '⌛ Duel annulé — trop longtemps sans réponse.')).catch(() => {});
  }

  async start() {
    await this.send(
      fmt.frame('⚔️ XDUEL', [
        '「' + fmt.bold('PREPARATION DU DUEL') + '」',
        '',
        '👤 ' + fmt.bold('NOM DU PREMIER DUELLISTE'),
        '',
        fmt.bold('Tape « moi » pour toi,') + ' ou ' + fmt.bold('taggue un membre') + ',',
        fmt.bold('ou réponds à un de ses messages.'),
        '',
        '⚠️ ' + fmt.bold('Tape « cancel » pour annuler.'),
      ])
    );
  }

  async handle(ctx) {
    const raw = String(ctx.text || '').trim();
    if (!raw) return false;
    if (ctx.commandName && ctx.commandName !== this.triggerCommand) return false;
    if (ctx.commandName === this.triggerCommand) {
      await this.send(fmt.frame('⚔️ XDUEL', '⚠️ ' + fmt.bold('Un duel est déjà en préparation dans ce groupe.')));
      return true;
    }
    if (CANCEL_WORDS.has(fmt.normalizeAnswer(raw))) {
      if (this.betLocked) return this._abort('🛑 Duel annulé — mises remboursées.');
      this.dispose();
      await this.send(fmt.frame('⚔️ XDUEL', '🛑 ' + fmt.bold('Duel annulé.')));
      return true;
    }

    switch (this.state) {
      case 'WAITING_P1':
        return this._onPlayer1(ctx, raw);
      case 'WAITING_P2':
        return this._onPlayer2(ctx, raw);
      case 'WAITING_CATEGORY':
        return this._onCategory(raw);
      case 'WAITING_COUNT':
        return this._onCount(raw);
      case 'WAITING_BET':
        return this._onBet(raw);
      case 'RUNNING':
        return this._onAnswer(raw);
      default:
        return false;
    }
  }

  /* ── Résolution des duellistes ── */
  async _resolveTarget(ctx, raw) {
    const event = ctx.event || {};
    // 1) Mention dans le message
    const mentions = event.mentions || {};
    const mentionIds = Object.keys(mentions);
    if (mentionIds.length > 0) {
      const uid = String(mentionIds[0]);
      return { uid, name: (await this.bot.getUserName(uid)) || mentions[mentionIds[0]] || 'Membre' };
    }
    // 2) Réponse à un message
    const repliedSender = event.messageReply && event.messageReply.senderID;
    if (repliedSender) {
      const uid = String(repliedSender);
      return { uid, name: (await this.bot.getUserName(uid)) || 'Membre' };
    }
    // 3) « moi »
    if (/^(moi|me)$/i.test(raw.trim())) {
      return { uid: this.initiatorID, name: (await this.bot.getUserName(this.initiatorID)) || 'Joueur' };
    }
    return null;
  }

  async _onPlayer1(ctx, raw) {
    const target = await this._resolveTarget(ctx, raw);
    if (!target) {
      this.tries++;
      if (this.tries >= 3) {
        this.dispose();
        await this.send(fmt.frame('⚔️ XDUEL', '🛑 ' + fmt.bold('Trop d’erreurs — duel annulé.')));
        return true;
      }
      await this.send(fmt.frame('⚔️ XDUEL', '⚠️ ' + fmt.bold('Tape « moi » ou taggue le premier duelliste.')));
      return true;
    }
    this.duelist1 = target;
    this.scores[target.uid] = 0;
    this.tries = 0;
    this.state = 'WAITING_P2';
    await this.send(
      fmt.frame('⚔️ XDUEL', [
        '👤 ' + fmt.bold('Duelliste 1') + ' : ' + target.name,
        '',
        '⚔️ ' + fmt.bold('NOM DU DEUXIEME DUELLISTE'),
        '(' + fmt.bold('« moi » ou tag') + ')',
      ])
    );
    return true;
  }

  async _onPlayer2(ctx, raw) {
    const target = await this._resolveTarget(ctx, raw);
    if (!target) {
      this.tries++;
      if (this.tries >= 3) {
        this.dispose();
        await this.send(fmt.frame('⚔️ XDUEL', '🛑 ' + fmt.bold('Trop d’erreurs — duel annulé.')));
        return true;
      }
      await this.send(fmt.frame('⚔️ XDUEL', '⚠️ ' + fmt.bold('Tape « moi » ou taggue le deuxième duelliste.')));
      return true;
    }
    if (this.duelist1 && target.uid === this.duelist1.uid) {
      await this.send(fmt.frame('⚔️ XDUEL', '⚠️ ' + fmt.bold('Un duel contre soi-même ?') + ' Choisis un adversaire différent.'));
      return true;
    }
    this.duelist2 = target;
    this.scores[target.uid] = 0;
    this.tries = 0;
    this.state = 'WAITING_CATEGORY';
    await this.send(
      fmt.frame('⚔️ XDUEL', [
        '👤 ' + fmt.bold('Duelliste 1') + ' : ' + this.duelist1.name,
        '⚔️ ' + fmt.bold('Duelliste 2') + ' : ' + this.duelist2.name,
        '',
        '『' + fmt.bold('CHOOSE YOUR CATEGORY') + '』',
        '',
        '🧠 ' + fmt.bold('CG'),
        '🪪 ' + fmt.bold('ID'),
        '🌌 ' + fmt.bold('MULTIVERS'),
      ])
    );
    return true;
  }

  async _onCategory(raw) {
    const cat = resolveCategory(raw);
    if (!cat) {
      this.tries++;
      if (this.tries >= 3) {
        this.dispose();
        await this.send(fmt.frame('⚔️ XDUEL', '🛑 ' + fmt.bold('Trop d’erreurs — duel annulé.')));
        return true;
      }
      await this.send(fmt.frame('⚔️ XDUEL', '⚠️ ' + fmt.bold('Choisis :') + ` ${fmt.bold('CG')} / ${fmt.bold('ID')} / ${fmt.bold('MULTIVERS')}`));
      return true;
    }
    const bank = loadBank(cat);
    if (bank.length < 10) {
      this.dispose();
      await this.send(fmt.frame('⚔️ XDUEL', '⚠️ ' + fmt.bold('Banque de questions indisponible.')));
      return true;
    }
    this.category = cat;
    this.tries = 0;
    this.state = 'WAITING_COUNT';
    await this.send(
      fmt.frame('⚔️ XDUEL', [
        '『' + fmt.bold('NOMBRE DE QUESTIONS') + '』',
        '',
        this.bot.config.games.duelAllowedCounts.map((n) => fmt.bold(n)).join('  /  '),
      ])
    );
    return true;
  }

  async _onCount(raw) {
    const n = safeInt(raw, { min: 1, max: 50 });
    const allowed = this.bot.config.games.duelAllowedCounts;
    if (!n || !allowed.includes(n)) {
      this.tries++;
      if (this.tries >= 3) {
        this.dispose();
        await this.send(fmt.frame('⚔️ XDUEL', '🛑 ' + fmt.bold('Trop d’erreurs — duel annulé.')));
        return true;
      }
      await this.send(fmt.frame('⚔️ XDUEL', '⚠️ ' + fmt.bold('Choisis :') + ` ${allowed.map((a) => fmt.bold(a)).join(' / ')}`));
      return true;
    }
    const bank = loadBank(this.category);
    this.questionCount = Math.min(n, bank.length);
    this.tries = 0;
    this.state = 'WAITING_BET';
    const b1 = this.bot.economy.getBalance(this.duelist1.uid);
    const b2 = this.bot.economy.getBalance(this.duelist2.uid);
    await this.send(
      fmt.frame('⚔️ XDUEL', [
        '💰 ' + fmt.bold('MISE'),
        '',
        `${fmt.bold('Solde')} ${this.duelist1.name} : ${fmt.boldNum(b1)}`,
        `${fmt.bold('Solde')} ${this.duelist2.name} : ${fmt.boldNum(b2)}`,
        '',
        `${fmt.bold('Mise max')} : ${fmt.boldNum(Math.min(b1, b2))} ${fmt.bold('XCoins')}`,
        '',
        fmt.bold('Exemple :') + ` ${fmt.boldNum(350)}`,
      ])
    );
    return true;
  }

  async _onBet(raw) {
    const bet = safeInt(raw, { min: 1, max: 1000000 });
    if (!bet) {
      this.tries++;
      if (this.tries >= 3) {
        this.dispose();
        await this.send(fmt.frame('⚔️ XDUEL', '🛑 ' + fmt.bold('Trop d’erreurs — duel annulé.')));
        return true;
      }
      await this.send(fmt.frame('⚔️ XDUEL', '⚠️ ' + fmt.bold('Entre une mise valide.') + ` Ex : ${fmt.boldNum(350)}`));
      return true;
    }
    const b1 = this.bot.economy.getBalance(this.duelist1.uid);
    const b2 = this.bot.economy.getBalance(this.duelist2.uid);
    if (bet > b1 || bet > b2) {
      const poor = bet > b1 ? this.duelist1.name : this.duelist2.name;
      await this.send(
        fmt.frame('💰 MISE REFUSÉE', [
          `⚠️ ${fmt.bold(poor)} ${fmt.bold('ne peut pas miser')} ${fmt.boldNum(bet)}.`,
          `💰 ${fmt.bold('Mise max')} : ${fmt.boldNum(Math.min(b1, b2))}`,
        ])
      );
      return true;
    }

    // Débit immédiat des deux joueurs (atomique via economy.spend).
    const s1 = this.bot.economy.spend(this.duelist1.uid, bet);
    const s2 = this.bot.economy.spend(this.duelist2.uid, bet);
    if (!s1.ok || !s2.ok) {
      // Course/race improbable : on remet tout le monde au propre.
      if (s1.ok) this.bot.economy.addCoins(this.duelist1.uid, bet);
      if (s2.ok) this.bot.economy.addCoins(this.duelist2.uid, bet);
      this.dispose();
      await this.send(fmt.frame('⚔️ XDUEL', '⚠️ ' + fmt.bold('Solde insuffisant — duel annulé, rien n’a été débité.')));
      return true;
    }
    this.bet = bet;
    this.betLocked = true;

    const bank = loadBank(this.category);
    this.questions = shuffle(bank).slice(0, this.questionCount);
    this.index = 0;
    this.turn = Math.floor(Math.random() * 2); // départ aléatoire
    this.stolen = false;
    this.state = 'RUNNING';

    await this.send(
      fmt.frame('⚔️ DUEL LANCÉ', [
        `🥊 ${this.duelist1.name}  ${fmt.bold('VS')}  ${this.duelist2.name}`,
        '',
        '🧠 ' + fmt.bold('Catégorie') + ' : ' + fmt.bold(CATEGORIES[this.category].short),
        '❓ ' + fmt.bold('Questions') + ' : ' + fmt.boldNum(this.questionCount),
        '💰 ' + fmt.bold('Mise') + ' : ' + fmt.boldNum(this.bet) + ` ${fmt.bold('XCoins')} ${fmt.bold('chacun')}`,
        '',
        '⚡ ' + fmt.bold('Le vainqueur remporte la cagne.'),
      ])
    );
    await this._askQuestion();
    return true;
  }

  current() {
    return this.players()[this.turn];
  }

  async _askQuestion() {
    if (this.finished) return; // session disposée → jamais de question fantôme
    this._clearTimers();
    const q = this.questions[this.index];
    if (!q) return this._finish();
    const player = this.current();
    this._currentOptions = q.type === 'mcq' ? shuffle(q.options) : null;
    if (this._currentOptions) {
      const correctIdx = this._currentOptions.indexOf(q.answer);
      this._correctLetter = LETTERS[correctIdx];
    }
    // NB : `stolen` n'est PAS réinitialisé ici — il doit survivre à la
    // re-question d'un vol, sinon le « double échec » deviendrait impossible.
    // `awaitingAnswer` non plus : la re-question d'un vol reste une question vivante.

    const lines = [`🎯 ${fmt.bold('Au tour de')} ${player.name}`];
    if (q.type === 'mcq') {
      lines.push(
        '',
        '🧠 ' + fmt.bold(q.q),
        '',
        ...this._currentOptions.map((opt, i) => `▸ ${fmt.bold(LETTERS[i])}) ${fmt.bold(opt)}`)
      );
    } else {
      lines.push('', '🪪 ' + fmt.bold('IDENTIFIE CE PERSONNAGE'));
      const { idImagePath } = require('./questions');
      const imgPath = idImagePath(q.image);
      if (!imgPath && q.hint) lines.push('🧩 ' + fmt.bold('Indice') + ' : ' + q.hint);
    }
    lines.push('', '⏱️ ' + fmt.bold(`${Math.round(this.bot.config.games.duelTimeoutMs / 1000)}s`));

    const payload = { body: fmt.frame(`⚔️ Q ${this.index + 1}/${this.questionCount}`, lines) };
    if (q.type !== 'mcq') {
      const { idImagePath } = require('./questions');
      const imgPath = idImagePath(q.image);
      if (imgPath) payload.attachment = imgPath;
    }
    // La question devient « live » AVANT l'envoi (pas de course avec le client).
    this.awaitingAnswer = true;
    await this.send(payload);

    const timeoutMs = this.bot.config.games.duelTimeoutMs;
    this.questionTimer = setTimeout(() => {
      this.questionTimer = null;
      this._onTimeout().catch(() => {});
    }, timeoutMs);
  }

  async _onTimeout() {
    if (this.finished) return; // session disposée pendant le timer → ignorer
    this.awaitingAnswer = false;
    const q = this.questions[this.index];
    const player = this.current();
    if (!this.stolen) {
      this.stolen = true;
      this.turn = this.turn === 0 ? 1 : 0;
      const other = this.current();
      await this.send(
        fmt.frame('⏱️ TEMPS ÉCOULÉ', [
          `⌛ ${player.name} ${fmt.bold('n’a pas répondu.')}`,
          `🎯 ${fmt.bold('La main passe à')} ${other.name} !`,
        ])
      );
      const t = this.questionTimer;
      await this._askQuestion();
      return;
    }
    await this.send(
      fmt.frame('⏱️ TEMPS ÉCOULÉ', [
        '✅ ' + fmt.bold('Réponse') + ' : ' + fmt.bold(q.answer),
        '⚖️ ' + fmt.bold('Personne ne marque.'),
      ])
    );
    this._nextTurn();
    await this._next();
  }

  async _onAnswer(raw) {
    // Aucune question en attente (pause entre questions) → message ignoré.
    if (!this.awaitingAnswer) return false;
    const q = this.questions[this.index];
    if (!q) return true;
    const player = this.current();
    const norm = fmt.normalizeAnswer(raw);
    let correct = false;
    if (q.type === 'mcq') {
      // 1) Texte d'option prioritaire — égalité EXACTE (normalisée) uniquement :
      //    la tolérance aux fautes créerait des collisions entre options
      //    quasi identiques (« 30 000 km/s » vs « 300 000 km/s »).
      const normRaw = norm;
      const textHit = this._currentOptions
        ? this._currentOptions.findIndex((opt) => fmt.normalizeAnswer(opt) === normRaw)
        : -1;
      if (textHit >= 0) {
        correct = textHit === this._currentOptions.indexOf(q.answer);
      } else {
        // 2) Lettre (A-D) ou numéro (1-4)
        const m = norm.match(/^([abcd])(\)|\s|$)/) || norm.match(/^([1-4])$/);
        if (m) {
          const letter = /[1-4]/.test(m[1]) ? LETTERS[Number(m[1]) - 1] : m[1].toUpperCase();
          correct = letter === this._correctLetter;
        }
      }
    } else {
      correct = fmt.answerMatches(raw, q.answer) || fmt.normalizeAnswer(raw).includes(fmt.normalizeAnswer(q.answer));
    }

    // Message sans aucune lettre pendant une question ID → simple rappel.
    if (!correct && q.type !== 'mcq' && !/[a-z]/.test(norm)) {
      this._stray = (this._stray || 0) + 1;
      if (this._stray <= 3) {
        await this.send(fmt.frame('⚔️ XDUEL', `⚠️ ${player.name} — ${fmt.bold('réponds avec le nom du personnage.')}`));
        return true;
      }
    }

    if (!correct && q.type === 'mcq' && !/^([abcd])/.test(norm) && !/^([1-4])$/.test(norm)) {
      this._stray = (this._stray || 0) + 1;
      if (this._stray <= 3) {
        await this.send(fmt.frame('⚔️ XDUEL', `⚠️ ${player.name} — ${fmt.bold('réponds par A, B, C ou D.')}`));
        return true;
      }
    }

    this._clearTimers();
    this.awaitingAnswer = false;
    if (correct) {
      this.scores[player.uid] = (this.scores[player.uid] || 0) + 1;
      await this.send(
        fmt.pick([
          `✅ ${fmt.bold('Point pour')} ${player.name} !`,
          `✅ ${player.name} ${fmt.bold('marque.') + ' ⚡'}`,
          `✅ ${fmt.bold('Correct !')} ${player.name} ${fmt.bold('prend l’avantage du tir.')}`,
        ])
      );
      this._nextTurn();
      await this._next();
      return true;
    }

    if (!this.stolen) {
      this.stolen = true;
      this.turn = this.turn === 0 ? 1 : 0;
      const other = this.current();
      await this.send(
        fmt.frame('❌ RATÉ', [
          `🎯 ${fmt.bold('La main passe à')} ${other.name} — ${fmt.bold('vole la question !')}`,
        ])
      );
      await this._askQuestion();
      return true;
    }

    await this.send(
      fmt.frame('❌ DOUBLE ÉCHEC', [
        '✅ ' + fmt.bold('Réponse') + ' : ' + fmt.bold(q.answer),
        '⚖️ ' + fmt.bold('Personne ne marque.'),
      ])
    );
    this._nextTurn();
    await this._next();
    return true;
  }

  _nextTurn() {
    this.turn = this.turn === 0 ? 1 : 0;
  }

  async _next() {
    this.index++;
    this.stolen = false; // nouvelle question → nouvelle chance de vol
    if (this.index >= this.questionCount) return this._finish();
    // Pause entre questions — tracée pour être annulée par dispose().
    this.interTimer = setTimeout(() => {
      this.interTimer = null;
      if (this.finished) return;
      this._askQuestion().catch(() => {});
    }, this.bot.config.games.interDelayMs);
  }

  async _abort(reason) {
    if (this.finished) return;
    if (this.betLocked) {
      this.bot.economy.addCoins(this.duelist1.uid, this.bet);
      this.bot.economy.addCoins(this.duelist2.uid, this.bet);
    }
    await this.send(fmt.frame('⚔️ XDUEL', reason)).catch(() => {});
    this.dispose();
  }

  async _finish() {
    if (this.finished) return;
    this.awaitingAnswer = false;
    const s1 = this.scores[this.duelist1.uid] || 0;
    const s2 = this.scores[this.duelist2.uid] || 0;

    const u1 = this.bot.db.ensureUser(this.duelist1.uid);
    const u2 = this.bot.db.ensureUser(this.duelist2.uid);
    u1.stats.duelsPlayed += 1;
    u2.stats.duelsPlayed += 1;
    this.bot.db.bumpStat('duelsPlayed');

    let lines = [];
    if (s1 === s2) {
      // Égalité → remboursement intégral des deux joueurs.
      this.bot.economy.addCoins(this.duelist1.uid, this.bet);
      this.bot.economy.addCoins(this.duelist2.uid, this.bet);
      u1.stats.duelDraws += 1;
      u2.stats.duelDraws += 1;
      this.bot.xp.addXp(this.duelist1.uid, 25);
      this.bot.xp.addXp(this.duelist2.uid, 25);
      lines = [
        `⚖️ ${fmt.bold('ÉGALITÉ')} — ${fmt.boldNum(s1)} / ${fmt.boldNum(s2)}`,
        '',
        `💰 ${fmt.bold('Mises remboursées')} : ${fmt.boldNum(this.bet)} ${fmt.bold('XCoins')}`,
        `⚡ ${fmt.bold('XP')} : +${fmt.boldNum(25)} ${fmt.bold('chacun')}`,
      ];
    } else {
      const winner = s1 > s2 ? this.duelist1 : this.duelist2;
      const loser = s1 > s2 ? this.duelist2 : this.duelist1;
      const wUser = winner === this.duelist1 ? u1 : u2;
      const lUser = winner === this.duelist1 ? u2 : u1;
      const pot = this.bet * 2;
      const balance = this.bot.economy.addCoins(winner.uid, pot);
      wUser.stats.duelWins += 1;
      lUser.stats.duelLosses += 1;
      const xpW = this.bot.xp.addXp(winner.uid, this.bot.config.xp.duelWin);
      this.bot.xp.addXp(loser.uid, this.bot.config.xp.duelLose);

      lines = [
        `📊 ${fmt.bold('Score final')} : ${fmt.boldNum(s1)} — ${fmt.boldNum(s2)}`,
        '',
        `🏆 ${fmt.bold('VAINQUEUR')} : ${winner.name}`,
        `💰 ${fmt.bold('Cagne')} : +${fmt.boldNum(pot)} ${fmt.bold('XCoins')}`,
        `💰 ${fmt.bold('Solde')} : ${fmt.boldNum(balance)}`,
        `⚡ ${fmt.bold('XP gagnant')} : +${fmt.boldNum(this.bot.config.xp.duelWin)}`,
        `📉 ${fmt.bold('XP perdant')} : +${fmt.boldNum(this.bot.config.xp.duelLose)}`,
      ];
      if (xpW.leveledUp) lines.push('', `🎉 ${winner.name} ${fmt.bold('passe niveau')} ${fmt.boldNum(xpW.level)} !`);
    }
    this.bot.db.users.save();
    await this.send(fmt.frame('🏁 DUEL TERMINÉ', lines));
    this.dispose();
  }
}

module.exports = { DuelSession };
