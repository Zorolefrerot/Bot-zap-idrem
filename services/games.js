"use strict";

/**
 * services/games.js
 * ---------------------------------------------------------------------------
 * Moteurs de jeux.
 *
 * Deux familles :
 *   • INSTANTANÉS  — /rps /dice /coin : aucun état, résultat immédiat.
 *   • À SESSION    — /quiz /qcm /guess /word /mathgame /duel : une partie est
 *                    ouverte dans la conversation, puis les joueurs envoient
 *                    leurs réponses jusqu'à la fin ou l'expiration.
 *
 * Les sessions vivent en mémoire (elles n'ont aucune valeur après un
 * redémarrage) et expirent après `games.sessionTimeoutMs`. Une seule partie
 * d'un même type est active par conversation, pour rester lisible.
 * ---------------------------------------------------------------------------
 */

const { pick, randInt, shortId, shuffle } = require("../utils/random");
const { calculate } = require("../utils/math");
const corpus = require("./corpus");

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };
const HANGMAN_MAX_ERRORS = 7;

const HANGMAN_STAGES = [
  "  ┌───┐\n  │\n  │\n  │\n──┴──",
  "  ┌───┐\n  │   │\n  │\n  │\n──┴──",
  "  ┌───┐\n  │   │\n  │   O\n  │\n──┴──",
  "  ┌───┐\n  │   │\n  │   O\n  │   │\n──┴──",
  "  ┌───┐\n  │   │\n  │   O\n  │  /│\n──┴──",
  "  ┌───┐\n  │   │\n  │   O\n  │  /│\\\n──┴──",
  "  ┌───┐\n  │   │\n  │   O\n  │  /│\\\n  │  /\n──┴──",
  "  ┌───┐\n  │   │\n  │   O\n  │  /│\\\n  │  / \\\n──┴──"
];

/**
 * @param {object} deps
 * @param {object} deps.config
 * @param {object} [deps.logger]
 * @param {object} [deps.users]
 * @param {object} [deps.xp]
 * @param {object} [deps.economy]
 */
function createGames(deps = {}) {
  const { config } = deps;
  const logger = deps.logger || noopLogger;
  const users = deps.users || null;
  const xp = deps.xp || null;
  const economy = deps.economy || null;

  /** @type {Map<string, object>} clé = `${threadID}:${type}` */
  const sessions = new Map();

  function timeoutMs() {
    return Math.max(10000, Number(config.games.sessionTimeoutMs) || 90000);
  }

  function key(threadID, type) {
    return `${String(threadID)}:${String(type)}`;
  }

  function sweep() {
    const now = Date.now();
    for (const [k, session] of sessions) {
      if (session.expiresAt <= now) {
        sessions.delete(k);
        logger.debug(`Session de jeu expirée : ${k}.`, "games");
      }
    }
  }

  /** Partie active d'un type dans une conversation. */
  function active(threadID, type) {
    sweep();
    return sessions.get(key(threadID, type)) || null;
  }

  /** Toutes les parties actives d'une conversation. */
  function activeIn(threadID) {
    sweep();
    return [...sessions.values()].filter((s) => String(s.threadID) === String(threadID));
  }

  function create(type, threadID, ownerID, payload) {
    const session = {
      id: shortId(6),
      type,
      threadID: String(threadID),
      ownerID: String(ownerID),
      participants: [String(ownerID)],
      createdAt: Date.now(),
      expiresAt: Date.now() + timeoutMs(),
      payload
    };
    sessions.set(key(threadID, type), session);
    return session;
  }

  function close(threadID, type) {
    return sessions.delete(key(threadID, type));
  }

  function cancel(threadID, type) {
    const existed = close(threadID, type);
    return existed;
  }

  function count() {
    sweep();
    return sessions.size;
  }

  function reset() {
    sessions.clear();
  }

  /** Récompenses de fin de partie. */
  function reward(userID, result) {
    if (xp && typeof xp.applyGameReward === "function") return xp.applyGameReward(userID, result, economy);
    if (users) users.addGame(userID, result === "win");
    return { xp: 0, coins: 0, coinsGiven: 0, leveledUp: false };
  }

  // --- Jeux instantanés ----------------------------------------------------

  /** Pierre / feuille / ciseaux contre le bot. */
  function rps(choice) {
    const moves = ["pierre", "feuille", "ciseaux"];
    const aliases = {
      pierre: "pierre",
      rock: "pierre",
      caillou: "pierre",
      feuille: "feuille",
      paper: "feuille",
      papier: "feuille",
      ciseaux: "ciseaux",
      ciseau: "ciseaux",
      scissors: "ciseaux"
    };
    const normalized = aliases[String(choice || "").trim().toLowerCase()];
    if (!normalized) return { ok: false, error: "Choisis : pierre, feuille ou ciseaux." };

    const bot = pick(moves);
    const beats = { pierre: "ciseaux", feuille: "pierre", ciseaux: "feuille" };
    let result = "draw";
    if (beats[normalized] === bot) result = "win";
    else if (beats[bot] === normalized) result = "lose";

    const icons = { pierre: "✊", feuille: "✋", ciseaux: "✌️" };
    return {
      ok: true,
      result,
      playerMove: normalized,
      botMove: bot,
      icons: { player: icons[normalized], bot: icons[bot] },
      moves
    };
  }

  /** Lancer de dés. */
  function dice(input) {
    const match = String(input || "").trim().match(/^(\d*)\s*[dD]?\s*(\d*)$/);
    let count = 2;
    let faces = 6;
    if (match) {
      if (match[1] && match[2]) {
        count = Number(match[1]);
        faces = Number(match[2]);
      } else if (match[1]) {
        faces = Number(match[1]);
        count = 1;
      }
    }
    count = Math.min(10, Math.max(1, Math.floor(count) || 1));
    faces = Math.min(100, Math.max(2, Math.floor(faces) || 6));
    const rolls = Array.from({ length: count }, () => randInt(1, faces));
    const total = rolls.reduce((a, b) => a + b, 0);
    return { ok: true, count, faces, rolls, total };
  }

  /** Pile ou face. */
  function coinFlip(side) {
    const faces = ["pile", "face"];
    const wanted = faces.includes(String(side || "").trim().toLowerCase())
      ? String(side).trim().toLowerCase()
      : null;
    const result = pick(faces);
    return {
      ok: true,
      result,
      chosen: wanted,
      win: wanted ? wanted === result : null,
      icon: result === "pile" ? "🪙" : "🔵"
    };
  }

  // --- Quiz / QCM ----------------------------------------------------------

  /** Catégories de questions disponibles. */
  function quizCategories() {
    return [...new Set(corpus.QUIZ.map((q) => q.cat))];
  }

  /** Sélectionne un pool de questions selon une catégorie (optionnelle). */
  function questionPool(category) {
    const wanted = String(category || "").trim().toLowerCase();
    if (!wanted) return { ok: true, pool: corpus.QUIZ };
    const filtered = corpus.QUIZ.filter((q) => String(q.cat).toLowerCase().includes(wanted));
    if (!filtered.length) {
      return { ok: false, error: `Catégorie « ${category} » introuvable.`, categories: quizCategories() };
    }
    return { ok: true, pool: filtered };
  }

  /**
   * Prépare une question : réponses mélangées (on n'apprend pas les positions).
   * @returns {{ question: string, category: string, answers: string[], correctIndex: number }}
   */
  function buildQuestion(pool) {
    const question = pick(pool);
    const shuffled = shuffle(question.a.map((text, index) => ({ text, correct: index === question.c })));
    return {
      question: question.q,
      category: question.cat,
      answers: shuffled.map((entry) => entry.text),
      correctIndex: shuffled.findIndex((entry) => entry.correct)
    };
  }

  /**
   * Démarre un quiz (une question).
   * @param {string} threadID
   * @param {string} userID
   * @param {{ category?: string }} [options]
   */
  function startQuiz(threadID, userID, options = {}) {
    if (active(threadID, "quiz")) {
      return { ok: false, error: "Un quiz est déjà en cours dans cette conversation." };
    }
    const selected = questionPool(options.category);
    if (!selected.ok) return selected;

    const prepared = buildQuestion(selected.pool);
    const session = create("quiz", threadID, userID, {
      ...prepared,
      attempts: 0,
      maxAttempts: 3
    });

    return { ok: true, session, categories: quizCategories(), ...prepared };
  }

  // --- Série de questions (/qcm) ------------------------------------------

  /**
   * Démarre une série de questions (score cumulé).
   * @param {number} [options.count] nombre de questions (1 à 5)
   */
  function startSerie(threadID, userID, options = {}) {
    if (active(threadID, "serie")) {
      return { ok: false, error: "Une série QCM est déjà en cours ici." };
    }
    const selected = questionPool(options.category);
    if (!selected.ok) return selected;

    const total = Math.min(5, Math.max(1, Number(options.count) || 3));
    const used = new Set();
    const questions = [];
    for (let i = 0; i < total; i += 1) {
      let prepared = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        prepared = buildQuestion(selected.pool);
        if (!used.has(prepared.question)) break;
      }
      used.add(prepared.question);
      questions.push(prepared);
    }

    const session = create("serie", threadID, userID, { total, index: 0, score: 0, questions, answers: [] });
    return { ok: true, session, total, first: questions[0], categories: quizCategories() };
  }

  /** Question courante d'une série. */
  function currentSerieQuestion(threadID) {
    const session = active(threadID, "serie");
    if (!session) return null;
    const { index, questions } = session.payload;
    return index < questions.length ? { ...questions[index], index, total: questions.length } : null;
  }

  /**
   * Répond à la question courante d'une série ; enchaîne sur la suivante.
   * @returns {{ok, correct?, goodAnswer?, index?, total?, score?, finished?, gains?, question?}}
   */
  function answerSerie(threadID, userID, answer) {
    const session = active(threadID, "serie");
    if (!session) return { ok: false, error: "Aucune série QCM en cours." };

    const { questions, index, total } = session.payload;
    const current = questions[index];
    if (!current) return { ok: false, error: "Série terminée." };

    const raw = String(answer || "").trim().toUpperCase();
    const letters = ["A", "B", "C", "D"];
    let chosen = -1;
    if (letters.includes(raw)) chosen = letters.indexOf(raw);
    else if (/^\d+$/.test(raw)) chosen = Number(raw) - 1;
    else chosen = current.answers.findIndex((a) => a.toLowerCase() === raw.toLowerCase());

    if (chosen < 0 || chosen >= current.answers.length) {
      return { ok: false, error: "Réponse invalide : utilise A, B, C ou D." };
    }

    const correct = chosen === current.correctIndex;
    if (correct) session.payload.score += 1;
    session.payload.answers.push({ question: current.question, correct, chosen });
    session.payload.index += 1;

    const finished = session.payload.index >= total;
    const score = session.payload.score;

    if (finished) {
      close(threadID, "serie");
      const outcome = score === total ? "win" : score >= Math.ceil(total / 2) ? "draw" : "lose";
      const gains = reward(userID, outcome);
      return { ok: true, correct, goodAnswer: current.answers[current.correctIndex], index: total, total, score, finished: true, outcome, gains };
    }

    return {
      ok: true,
      correct,
      goodAnswer: current.answers[current.correctIndex],
      index: session.payload.index,
      total,
      score,
      finished: false,
      question: questions[session.payload.index]
    };
  }

  /** Abandonne la série en cours. */
  function cancelSerie(threadID) {
    const session = active(threadID, "serie");
    if (!session) return { ok: false, error: "Aucune série en cours." };
    const { score, index } = session.payload;
    close(threadID, "serie");
    return { ok: true, score, answered: index };
  }

  /**
   * Répond au quiz en cours.
   * @param {string} answer lettre (A-D) ou numéro (1-4)
   */
  function answerQuiz(threadID, userID, answer) {
    const session = active(threadID, "quiz");
    if (!session) return { ok: false, error: "Aucun quiz en cours. Lance-le d'abord." };

    const raw = String(answer || "").trim().toUpperCase();
    const letters = ["A", "B", "C", "D"];
    let index = -1;
    if (letters.includes(raw)) index = letters.indexOf(raw);
    else if (/^\d+$/.test(raw)) index = Number(raw) - 1;
    else {
      const found = session.payload.answers.findIndex((a) => a.toLowerCase() === raw.toLowerCase());
      index = found;
    }

    if (index < 0 || index >= session.payload.answers.length) {
      return { ok: false, error: "Réponse invalide : utilise A, B, C ou D." };
    }

    session.payload.attempts += 1;
    const correct = index === session.payload.correctIndex;
    const goodAnswer = session.payload.answers[session.payload.correctIndex];
    close(threadID, "quiz");

    if (!correct) {
      const gains = reward(userID, "lose");
      return { ok: true, correct: false, goodAnswer, gains };
    }
    const gains = reward(userID, "win");
    return { ok: true, correct: true, goodAnswer, attempts: session.payload.attempts, gains };
  }

  /** Abandonne le quiz en cours (affiche la bonne réponse). */
  function revealQuiz(threadID) {
    const session = active(threadID, "quiz");
    if (!session) return { ok: false, error: "Aucun quiz en cours." };
    const goodAnswer = session.payload.answers[session.payload.correctIndex];
    close(threadID, "quiz");
    return { ok: true, goodAnswer, question: session.payload.question };
  }

  // --- Devine le nombre ----------------------------------------------------

  function startGuess(threadID, userID, options = {}) {
    if (active(threadID, "guess")) return { ok: false, error: "Une partie de devinette est déjà en cours." };
    const max = Math.min(1000, Math.max(10, Number(options.max) || 100));
    const session = create("guess", threadID, userID, {
      target: randInt(1, max),
      max,
      attempts: 0,
      maxAttempts: 8,
      history: []
    });
    return { ok: true, session, max };
  }

  function playGuess(threadID, userID, value) {
    const session = active(threadID, "guess");
    if (!session) return { ok: false, error: "Aucune partie en cours." };

    const n = Number(String(value).replace(",", ".").trim());
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return { ok: false, error: "Donne un nombre entier." };
    }
    if (n < 1 || n > session.payload.max) {
      return { ok: false, error: `Le nombre est entre 1 et ${session.payload.max}.` };
    }

    session.payload.attempts += 1;
    session.payload.history.push(n);
    const { target, maxAttempts, attempts } = session.payload;

    if (n === target) {
      close(threadID, "guess");
      const gains = reward(userID, "win");
      return { ok: true, result: "win", attempts, target, gains };
    }
    if (attempts >= maxAttempts) {
      close(threadID, "guess");
      const gains = reward(userID, "lose");
      return { ok: true, result: "lose", attempts, target, gains };
    }
    return { ok: true, result: n < target ? "higher" : "lower", attempts, remaining: maxAttempts - attempts };
  }

  /** Devinettes textuelles (corpus). */
  function riddle(threadID, userID) {
    const existing = active(threadID, "riddle");
    if (existing) {
      close(threadID, "riddle");
      return { ok: true, ended: true, answer: existing.payload.answers[0], question: existing.payload.question };
    }
    const item = pick(corpus.RIDDLES);
    create("riddle", threadID, userID, { question: item.r, answers: item.a });
    return { ok: true, question: item.r };
  }

  function answerRiddle(threadID, userID, answer) {
    const session = active(threadID, "riddle");
    if (!session) return { ok: false, error: "Aucune devinette en cours." };
    const clean = String(answer || "").trim().toLowerCase().replace(/[.!?,]/g, "");
    const accepted = session.payload.answers.map((a) => String(a).toLowerCase());
    const correct = accepted.some((a) => a === clean || a.includes(clean) || clean.includes(a));
    close(threadID, "riddle");
    if (!correct) {
      const gains = reward(userID, "lose");
      return { ok: true, correct: false, answer: session.payload.answers[0], gains };
    }
    const gains = reward(userID, "win");
    return { ok: true, correct: true, answer: session.payload.answers[0], gains };
  }

  // --- Pendu (/word) -------------------------------------------------------

  function startWord(threadID, userID) {
    if (active(threadID, "word")) return { ok: false, error: "Un pendu est déjà en cours." };
    const word = pick(corpus.WORDS).toLowerCase();
    const session = create("word", threadID, userID, {
      word,
      guessed: [],
      errors: 0,
      maxErrors: HANGMAN_MAX_ERRORS
    });
    return { ok: true, session, mask: maskWord(word, []), length: word.length };
  }

  function maskWord(word, guessed) {
    return word
      .split("")
      .map((letter) => (guessed.includes(letter) ? letter : "_"))
      .join(" ");
  }

  function playWord(threadID, userID, letter) {
    const session = active(threadID, "word");
    if (!session) return { ok: false, error: "Aucun pendu en cours." };

    const input = String(letter || "").trim().toLowerCase();
    if (!/^[a-z]$/.test(input)) return { ok: false, error: "Donne une seule lettre (a-z)." };
    if (session.payload.guessed.includes(input)) return { ok: false, error: `La lettre « ${input.toUpperCase()} » a déjà été jouée.` };

    session.payload.guessed.push(input);
    const { word, guessed, maxErrors } = session.payload;
    const found = word.includes(input);
    if (!found) session.payload.errors += 1;

    const mask = maskWord(word, guessed);
    const won = !mask.includes("_");
    const lost = session.payload.errors >= maxErrors;

    if (won || lost) {
      close(threadID, "word");
      const gains = reward(userID, won ? "win" : "lose");
      return {
        ok: true,
        result: won ? "win" : "lose",
        word,
        mask,
        errors: session.payload.errors,
        maxErrors,
        stage: HANGMAN_STAGES[Math.min(session.payload.errors, HANGMAN_STAGES.length - 1)],
        gains
      };
    }
    return {
      ok: true,
      result: found ? "hit" : "miss",
      letter: input,
      word,
      mask,
      errors: session.payload.errors,
      maxErrors,
      guessed: [...guessed].sort(),
      stage: HANGMAN_STAGES[Math.min(session.payload.errors, HANGMAN_STAGES.length - 1)]
    };
  }

  // --- Calcul mental (/mathgame) ------------------------------------------

  function startMath(threadID, userID, options = {}) {
    if (active(threadID, "math")) return { ok: false, error: "Un défi de calcul est déjà en cours." };
    const level = ["easy", "normal", "hard"].includes(String(options.level).toLowerCase())
      ? String(options.level).toLowerCase()
      : "normal";

    const ranges = {
      easy: { min: 1, max: 12, ops: ["+", "-"] },
      normal: { min: 2, max: 25, ops: ["+", "-", "*"] },
      hard: { min: 5, max: 60, ops: ["+", "-", "*", "/"] }
    };
    const range = ranges[level];
    let expression = "";
    let answer = null;

    for (let attempt = 0; attempt < 40 && answer === null; attempt += 1) {
      const a = randInt(range.min, range.max);
      const b = randInt(range.min, range.max);
      const op = pick(range.ops);
      const candidate = `${a}${op}${b}`;
      const computed = calculate(candidate);
      if (computed.ok && Number.isInteger(computed.value) && computed.value >= 0) {
        expression = candidate;
        answer = computed.value;
      }
    }
    if (answer === null) {
      expression = "6*7";
      answer = 42;
    }

    const session = create("math", threadID, userID, { expression, answer, level, attempts: 0, maxAttempts: 3 });
    return { ok: true, session, expression, level };
  }

  function answerMath(threadID, userID, value) {
    const session = active(threadID, "math");
    if (!session) return { ok: false, error: "Aucun défi de calcul en cours." };

    const n = Number(String(value).replace(",", ".").replace(/\s+/g, "").trim());
    if (!Number.isFinite(n)) return { ok: false, error: "Réponse invalide : donne un nombre." };

    session.payload.attempts += 1;
    const correct = Math.abs(n - session.payload.answer) < 1e-9;
    const { expression, answer, attempts, maxAttempts } = session.payload;
    const exhausted = attempts >= maxAttempts;

    if (correct || exhausted) close(threadID, "math");
    if (correct) {
      const gains = reward(userID, "win");
      return { ok: true, correct: true, expression, answer, attempts, gains };
    }
    if (exhausted) {
      const gains = reward(userID, "lose");
      return { ok: true, correct: false, exhausted: true, expression, answer, attempts, gains };
    }
    return { ok: true, correct: false, expression, attempts, remaining: maxAttempts - attempts, hint: n < answer ? "plus grand" : "plus petit" };
  }

  // --- Duel ----------------------------------------------------------------

  function startDuel(threadID, challengerID, opponentID, opponentName) {
    if (active(threadID, "duel")) return { ok: false, error: "Un duel est déjà en cours ici." };
    const challenger = String(challengerID || "");
    const opponent = String(opponentID || "");
    if (!challenger) return { ok: false, error: "Duel impossible sans challenger." };

    const session = create("duel", threadID, challenger, {
      challenger: { id: challenger, hp: 100, name: "" },
      opponent: { id: opponent, hp: 100, name: opponentName || "" },
      turn: challenger,
      rounds: 0,
      maxRounds: 12,
      log: []
    });
    session.participants = opponent ? [challenger, opponent] : [challenger];
    return { ok: true, session };
  }

  /** Un tour de duel. `userID` doit être celui dont c'est le tour. */
  function duelTurn(threadID, userID) {
    const session = active(threadID, "duel");
    if (!session) return { ok: false, error: "Aucun duel en cours." };

    const uid = String(userID || "");
    const p = session.payload;
    const botOpponent = !p.opponent.id;

    if (!botOpponent && uid !== p.turn) {
      return { ok: false, error: "Ce n'est pas ton tour.", turn: p.turn };
    }
    if (botOpponent && uid !== p.challenger.id) {
      return { ok: false, error: "Tu n'es pas dans ce duel.", turn: p.turn };
    }

    p.rounds += 1;
    const attacker = uid === p.challenger.id ? p.challenger : p.opponent;
    const defender = uid === p.challenger.id ? p.opponent : p.challenger;

    const roll = Math.random();
    let damage = 0;
    let kind = "hit";
    if (roll < 0.18) {
      damage = randInt(18, 28);
      kind = "crit";
    } else if (roll < 0.38) {
      damage = 0;
      kind = "miss";
    } else {
      damage = randInt(7, 16);
      kind = "hit";
    }

    defender.hp = Math.max(0, defender.hp - damage);
    p.log.push({ round: p.rounds, attacker: attacker.id || "bot", defender: defender.id || "bot", damage, kind });

    const finished = defender.hp <= 0 || p.rounds >= p.maxRounds;
    let outcome = null;

    if (finished) {
      let winner = null;
      let loser = null;
      if (defender.hp <= 0) {
        winner = attacker;
        loser = defender;
      } else {
        // Égalité aux rounds : le plus haut PV l'emporte, sinon match nul.
        if (p.challenger.hp > p.opponent.hp) {
          winner = p.challenger;
          loser = p.opponent;
        } else if (p.opponent.hp > p.challenger.hp) {
          winner = p.opponent;
          loser = p.challenger;
        }
      }
      outcome = winner ? { type: "win", winnerId: winner.id || "bot", loserId: loser.id || "bot" } : { type: "draw" };
      close(threadID, "duel");
      const challengerResult = outcome.type === "draw" ? "draw" : outcome.winnerId === p.challenger.id ? "win" : "lose";
      const gains = reward(p.challenger.id, challengerResult);
      let opponentGains = null;
      if (!botOpponent) {
        const oppResult = outcome.type === "draw" ? "draw" : outcome.winnerId === p.opponent.id ? "win" : "lose";
        opponentGains = reward(p.opponent.id, oppResult);
      }
      return {
        ok: true,
        finished: true,
        outcome,
        damage,
        kind,
        hp: { challenger: p.challenger.hp, opponent: p.opponent.hp },
        rounds: p.rounds,
        gains,
        opponentGains
      };
    }

    p.turn = botOpponent ? p.challenger.id : defender.id;
    if (botOpponent) {
      // Le bot riposte immédiatement.
      const botRoll = Math.random();
      let botDamage = 0;
      let botKind = "hit";
      if (botRoll < 0.15) {
        botDamage = randInt(16, 26);
        botKind = "crit";
      } else if (botRoll < 0.4) {
        botDamage = 0;
        botKind = "miss";
      } else {
        botDamage = randInt(6, 15);
      }
      p.challenger.hp = Math.max(0, p.challenger.hp - botDamage);
      p.log.push({ round: p.rounds, attacker: "bot", defender: p.challenger.id, damage: botDamage, kind: botKind });

      if (p.challenger.hp <= 0) {
        close(threadID, "duel");
        const gains = reward(p.challenger.id, "lose");
        return {
          ok: true,
          finished: true,
          outcome: { type: "win", winnerId: "bot", loserId: p.challenger.id },
          damage,
          kind,
          botDamage,
          botKind,
          hp: { challenger: p.challenger.hp, opponent: p.opponent.hp },
          rounds: p.rounds,
          gains
        };
      }
      return {
        ok: true,
        finished: false,
        damage,
        kind,
        botDamage,
        botKind,
        hp: { challenger: p.challenger.hp, opponent: p.opponent.hp },
        turn: p.challenger.id,
        rounds: p.rounds
      };
    }

    return {
      ok: true,
      finished: false,
      damage,
      kind,
      hp: { challenger: p.challenger.hp, opponent: p.opponent.hp },
      turn: p.turn,
      rounds: p.rounds,
      maxRounds: p.maxRounds
    };
  }

  /** Affiche le duel en cours (état). */
  function duelState(threadID) {
    const session = active(threadID, "duel");
    if (!session) return null;
    return {
      challenger: { ...session.payload.challenger },
      opponent: { ...session.payload.opponent },
      turn: session.payload.turn,
      rounds: session.payload.rounds,
      maxRounds: session.payload.maxRounds
    };
  }

  // --- Vérité / défi -------------------------------------------------------

  function truth() {
    return { ok: true, text: pick(corpus.TRUTHS) };
  }

  function dare() {
    return { ok: true, text: pick(corpus.DARES) };
  }

  return {
    HANGMAN_STAGES,
    // sessions
    active,
    activeIn,
    cancel,
    close,
    count,
    reset,
    sweep,
    reward,
    // instantanés
    rps,
    dice,
    coinFlip,
    truth,
    dare,
    // quiz
    startQuiz,
    answerQuiz,
    revealQuiz,
    quizCategories,
    // série QCM
    startSerie,
    answerSerie,
    currentSerieQuestion,
    cancelSerie,
    // devinette
    startGuess,
    playGuess,
    riddle,
    answerRiddle,
    // pendu
    startWord,
    playWord,
    maskWord,
    // calcul
    startMath,
    answerMath,
    // duel
    startDuel,
    duelTurn,
    duelState,
    sessions
  };
}

module.exports = { createGames };
