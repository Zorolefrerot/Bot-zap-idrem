'use strict';
/*
 * 🧬 MeR~NeL — systems/teamQuiz.js
 * Xteam — quiz INTER-ÉQUIPES (admins du bot uniquement).
 *
 * Déroulé :
 *   1) L'admin tape Xteam → le bot demande le NOMBRE DE GROUPES (1..4) ;
 *   2) puis le nombre de MEMBRES PAR GROUPE (1..15) ;
 *   3) RECRUTEMENT groupe par groupe : le bot affiche « GROUPE i — répondez
 *      à CE message pour rejoindre » ; les joueurs RÉPONDENT au message du
 *      bot pour rejoindre (l'admin peut répondre aussi). Groupe plein →
 *      groupe suivant automatiquement. L'admin peut taper « go » pour
 *      lancer avec les membres déjà présents (≥1 par groupe) ;
 *   4) QUIZ : 10 questions PAR RUBRIQUE (ID, MULTIVERS, CG, CAPITALE,
 *      DRAPEAU) — le premier bon répondeur marque +10 pour lui ET son équipe ;
 *   5) FIN : tableau final des équipes — l'équipe gagnante voit tous ses
 *      membres gagner +200 XCoins et le meilleur buteur +600 XCoins.
 */

const { safeInt } = require('../utils/sanitize');
const { makeChecker } = require('./mangaQuiz');
const { CATEGORIES, loadBank, shuffle } = require('./questions');
const fmt = require('../utils/formatter');

const { isCancelIntent, parseCount } = require('./natural');
const { getQuizImage } = require('./wikiImage');
const MAX_GROUPS = 4;
const MAX_MEMBERS = 15;
const QUESTIONS_PER_CATEGORY = 5;
const CATEGORY_ORDER = ['id', 'multivers', 'cg', 'capitale', 'drapeau', 'emoji', 'zik', 'memorial', 'logo'];
const REWARD_MEMBER = 200;
const REWARD_MVP = 600;

class TeamQuizSession {
  /**
   * @param {object} bot contexte global
   * @param {object} p { threadID, ownerID, ownerName, send }
   */
  constructor(bot, p) {
    this.bot = bot;
    this.threadID = String(p.threadID);
    this.ownerID = String(p.ownerID);
    this.ownerName = p.ownerName || 'Admin';
    this.send = p.send;
    this.scope = 'xteam'; // UN Xteam par groupe
    this.triggerCommand = 'xteam';
    this.inactivityMs = bot.config.games.stepTimeoutMs;

    this.state = 'WAITING_GROUPS';
    this.groupCount = 0;
    this.memberTarget = 0;
    this.groupIdx = 0; // groupe en recrutement
    this.teams = []; // [{ name, members: Map<uid, {name, score}> }]
    this.questions = []; // { q, a, alts, cat, tag }
    this.qIndex = 0;
    this.total = 0;
    this.tries = 0;

    this.questionTimer = null;
    this.awaitingAnswer = false;
    this.finished = false;
  }

  /* Configuration = lanceur/admins. Recrutement & jeu = tout le monde. */
  accepts() {
    return true;
  }

  _isAdmin(uid) {
    return this.bot.config.isAdmin(uid);
  }

  _clearTimers() {
    if (this.questionTimer) {
      clearTimeout(this.questionTimer);
      this.questionTimer = null;
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
    this.send(fmt.frame('👥 XTEAM', '⌛ ' + fmt.bold('Configuration annulée — trop longtemps sans réponse.'))).catch(() => {});
  }

  async start() {
    await this.send(
      fmt.frame('👥 XTEAM — QUIZ INTER-ÉQUIPES', [
        '「' + fmt.bold('COMBIEN DE GROUPES ?') + '」',
        '',
        `${fmt.bold(1)} … ${fmt.bold(MAX_GROUPS)}   ${fmt.bold('(max')} ${fmt.bold(MAX_GROUPS)}${fmt.bold(')')}`,
        '',
        '🛑 ' + fmt.bold('Tape « stop » pour annuler.'),
      ])
    );
  }

  /* ── Route un message. Retourne true si consommé. ── */
  async handle(ctx) {
    const raw = String(ctx.text || '').trim();
    if (!raw) return false;
    if (ctx.commandName && ctx.commandName !== this.triggerCommand) return false;
    if (ctx.commandName === this.triggerCommand) {
      await this.send(fmt.frame('👥 XTEAM', '⚠️ ' + fmt.bold('Un Xteam est déjà en cours.')));
      return true;
    }

    if (isCancelIntent(raw)) {
      if (String(ctx.senderID) !== this.ownerID && !this._isAdmin(ctx.senderID)) {
        await this.send(fmt.frame('👥 XTEAM', '⛔ ' + fmt.bold(`Seul l'admin lanceur peut arrêter.`)));
        return true;
      }
      this.dispose();
      await this.send(fmt.frame('👥 XTEAM', '🛑 ' + fmt.bold('Xteam annulé.')));
      return true;
    }

    switch (this.state) {
      case 'WAITING_GROUPS':
        return this._onGroups(ctx, raw);
      case 'WAITING_SIZE':
        return this._onSize(ctx, raw);
      case 'RECRUIT':
        return this._onRecruit(ctx, raw);
      case 'RUNNING':
        return this._onAnswer(ctx, raw);
      default:
        return false;
    }
  }

  async _onGroups(ctx, raw) {
    const uidCfg = String(ctx.senderID);
    if (uidCfg !== this.ownerID && !this._isAdmin(uidCfg)) return true;
    const n = parseCount(raw, { min: 1, max: MAX_GROUPS });
    if (!n) {
      this.tries++;
      if (this.tries >= 3) {
        this.dispose();
        await this.send(fmt.frame('👥 XTEAM', '🛑 ' + fmt.bold(`Trop d'erreurs — annulé.`)));
        return true;
      }
      await this.send(fmt.frame('👥 XTEAM', '⚠️ ' + fmt.bold('Choisis le nombre de groupes :') + ` ${fmt.bold(1)} … ${fmt.bold(MAX_GROUPS)}`));
      return true;
    }
    this.groupCount = n;
    this.state = 'WAITING_SIZE';
    await this.send(
      fmt.frame('👥 XTEAM', [
        '「' + fmt.bold('COMBIEN DE MEMBRES PAR GROUPE ?') + '」',
        '',
        `${fmt.bold(1)} … ${fmt.bold(MAX_MEMBERS)}`,
      ])
    );
    return true;
  }

  async _onSize(ctx, raw) {
    const uidSz = String(ctx.senderID);
    if (uidSz !== this.ownerID && !this._isAdmin(uidSz)) return true;
    const m = parseCount(raw, { min: 1, max: MAX_MEMBERS });
    if (!m) {
      this.tries++;
      if (this.tries >= 3) {
        this.dispose();
        await this.send(fmt.frame('👥 XTEAM', '🛑 ' + fmt.bold(`Trop d'erreurs — annulé.`)));
        return true;
      }
      await this.send(fmt.frame('👥 XTEAM', '⚠️ ' + fmt.bold('Choisis :') + ` ${fmt.bold(1)} … ${fmt.bold(MAX_MEMBERS)} membres par groupe`));
      return true;
    }
    this.memberTarget = m;
    this.teams = Array.from({ length: this.groupCount }, (_, i) => ({
      name: `Groupe ${i + 1}`,
      members: new Map(),
    }));
    this.groupIdx = 0;
    this.state = 'RECRUIT';
    await this._postRecruit();
    return true;
  }

  async _postRecruit() {
    await this.send(
      fmt.frame(`👥 RECRUTEMENT — ${this.teams[this.groupIdx].name.toUpperCase()} (${this.groupIdx + 1}/${this.groupCount})`, [
        `👉 ${fmt.bold('Répondez à CE message pour rejoindre')} !`,
        `🧮 ${fmt.bold('Places')} : ${fmt.boldNum(this.teams[this.groupIdx].members.size)}/${fmt.boldNum(this.memberTarget)}`,
        '',
        '📢 ' + fmt.bold('Le lanceur peut répondre aussi pour participer.'),
        '⚡ ' + fmt.bold(`Tape « go » (l'admin) pour lancer avec les membres présents.`),
      ])
    );
  }

  async _onRecruit(ctx, raw) {
    const uid = String(ctx.senderID);
    const name = ctx.senderName || (await this.bot.getUserName(uid));

    // Admin : « go » → lancer avec les membres présents.
    if (['go', 'c parti', 'cparti', 'lancer', 'start'].includes(fmt.normalizeAnswer(raw))) {
      if (uid !== this.ownerID && !this._isAdmin(uid)) return true;
      if (this.teams.some((t) => t.members.size === 0)) {
        await this.send(fmt.frame('👥 XTEAM', '⚠️ ' + fmt.bold('Chaque groupe doit avoir au moins 1 membre.')));
        return true;
      }
      return this._beginQuiz();
    }

    // Rejoindre = RÉPONDRE au message du bot.
    const reply = ctx.event && ctx.event.messageReply;
    const botID = String((this.bot.adapter && this.bot.adapter.botID) || '');
    const isReplyToBot = Boolean(reply && reply.messageID && String(reply.senderID) === botID);
    if (!isReplyToBot) return true;

    // Déjà dans une équipe ?
    for (const t of this.teams) {
      if (t.members.has(uid)) return true;
    }
    const team = this.teams[this.groupIdx];
    if (team.members.size >= this.memberTarget) return true; // complet
    team.members.set(uid, { name, score: 0 });

    const tag = `@${String(name).split(/\s+/)[0]}`;
    const lines = [
      `✅ ${tag} ${fmt.bold('rejoint')} ${fmt.bold(team.name)} ${fmt.bold('(' + team.members.size + '/' + this.memberTarget + ')')}`,
    ];
    if (team.members.size >= this.memberTarget) {
      this.groupIdx++;
      if (this.groupIdx >= this.groupCount) {
        await this.send({ body: fmt.frame('👥 XTEAM', lines) });
        return this._beginQuiz();
      }
      await this.send({ body: fmt.frame('👥 XTEAM', [...lines, '', '➡️ ' + fmt.bold('Groupe suivant !')]) });
      await this._postRecruit();
      return true;
    }
    const bodyText = fmt.frame('👥 XTEAM', lines);
    const from = bodyText.indexOf(tag);
    const payload = { body: bodyText };
    if (from >= 0) payload.mentions = { [uid]: { tag, from } };
    await this.send(payload);
    return true;
  }

  /* Constitution du quiz : 10 questions PAR RUBRIQUE. */
  async _beginQuiz() {
    const questions = [];
    for (const cat of CATEGORY_ORDER) {
      const bank = loadBank(cat);
      if (!bank.length) continue;
      const picked = shuffle(bank).slice(0, Math.min(QUESTIONS_PER_CATEGORY, bank.length));
      for (const q of picked) {
        questions.push({ q: q.q, a: q.a, alts: q.alts || [], cat, tag: q.tag || '', wiki: q.wiki || '' });
      }
    }
    if (questions.length === 0) {
      this.dispose();
      await this.send(fmt.frame('👥 XTEAM', '❌ ' + fmt.bold('Aucune question disponible.')));
      return true;
    }
    this.questions = questions;
    this.total = questions.length;
    this.qIndex = 0;
    this.state = 'RUNNING';

    const lines = [
      `🏟️ ${fmt.bold('ÉQUIPES')} : ${this.teams.map((t) => fmt.bold(t.name + ' (' + t.members.size + ')')).join(' · ')}`,
      '',
      `📚 ${fmt.bold('Rubriques')} : ${fmt.bold('10 questions par rubrique')} — ${fmt.bold('ID · MULTIVERS · CG · CAPITALE · DRAPEAU')}`,
      '⚡ ' + fmt.bold('Première bonne réponse = +10 pour le joueur ET son équipe.'),
      `🏆 ${fmt.bold('Équipe gagnante')} : +${fmt.boldNum(REWARD_MEMBER)} XCoins par membre — ${fmt.bold('meilleur buteur')} : +${fmt.boldNum(REWARD_MVP)} XCoins`,
    ];
    await this.send(fmt.frame('🏁 XTEAM LANCÉ', lines));
    await this._askQuestion();
    return true;
  }

  async _askQuestion() {
    if (this.finished) return;
    this._clearTimers();
    const q = this.questions[this.qIndex];
    if (!q) return this._finish();

    const style = CATEGORIES[q.cat] ? CATEGORIES[q.cat].style : '';
    const catLabel = CATEGORIES[q.cat] ? CATEGORIES[q.cat].short || q.cat.toUpperCase() : q.cat.toUpperCase();
    const lines = [];
    if (q.cat === 'drapeau') {
      lines.push(q.q, '', '❓ ' + fmt.bold('Quel pays ?'));
    } else if (q.cat === 'capitale') {
      lines.push('🌍 ' + fmt.bold('Pays') + ' : ' + fmt.bold(q.q), '', '❓ ' + fmt.bold('Capitale ?'));
    } else if (style === 'emoji') {
      lines.push(q.q, '', '❓ ' + fmt.bold('Qu\u2019est-ce que c\u2019est ?'));
    } else if (style === 'zik') {
      lines.push('🎵 ' + fmt.bold(q.q), '', '❓ ' + fmt.bold('Qui ou quel titre ?'));
    } else if (style === 'image') {
      lines.push(q.cat === 'memorial' ? '❓ ' + fmt.bold('Quel est ce lieu célèbre ?') : '❓ ' + fmt.bold('Quel est ce logo ?'));
    } else {
      lines.push('🧩 ' + fmt.bold(q.q), '', '❓ ' + fmt.bold(q.cat === 'id' ? 'Qui est-ce ?' : 'Qui ou quoi ?'));
    }
    if (q.tag && q.cat !== 'memorial') {
      if (q.cat === 'multivers') lines.push(`📚 ${fmt.bold('Manga')} : ${fmt.bold(q.tag)}`);
      else lines.push(`🏷️ ${fmt.bold('Thème')} : ${fmt.bold(q.tag)}`);
    }
    lines.push('', '⏱️ ' + fmt.bold(`${Math.round(this.bot.config.games.quizTimeoutMs / 1000)}s`));

    // ⚖️ Vérificateur STRICT (toutes les autres réponses de la rubrique).
    const bank = loadBank(q.cat);
    this._checker = makeChecker([q.a, ...(q.alts || [])], bank.filter((x) => x.a !== q.a).flatMap((x) => [x.a, ...(x.alts || [])]));

    const payload = { body: fmt.frame(`👥 XTEAM — ${catLabel} ${this.qIndex + 1}/${this.total}`, lines) };
    // 🖼️ Rubriques images (MÉMORIAL / LOGO) : item SAUTÉ si image indisponible.
    if (style === 'image') {
      this._imgSkips = this._imgSkips || 0;
      const imgPath = await getQuizImage(q, this.bot.config.tmpDir);
      if (!imgPath) {
        this._imgSkips++;
        if (this._imgSkips >= this.questions.length) {
          await this.send(fmt.frame('🖼️ IMAGES INDISPONIBLES', ['⚠️ ' + fmt.bold('Aucune image accessible pour cette rubrique — quiz arrêté.'), '🔁 ' + fmt.bold('Réessaie plus tard ou choisis une autre catégorie.')]));
          return this._finish();
        }
        this.qIndex++;
        return this._askQuestion();
      }
      payload.attachment = imgPath;
    }

    this.awaitingAnswer = true;
    await this.send(payload);

    this.questionTimer = setTimeout(() => {
      this.questionTimer = null;
      this._onTimeout().catch(() => {});
    }, this.bot.config.games.quizTimeoutMs);
  }

  async _onTimeout() {
    if (this.finished) return;
    this.awaitingAnswer = false;
    const q = this.questions[this.qIndex];
    await this.send(fmt.frame('⏱️ TEMPS ÉCOULÉ', ['💡 ' + fmt.bold('La réponse était') + ' : ' + fmt.bold(q ? q.a : '—')]));
    await this._next();
  }

  _teamOf(uid) {
    return this.teams.find((t) => t.members.has(uid)) || null;
  }

  async _onAnswer(ctx, raw) {
    if (!this.awaitingAnswer) return false;
    const q = this.questions[this.qIndex];
    if (!q) return true;
    const uid = String(ctx.senderID);
    const name = ctx.senderName || (await this.bot.getUserName(uid));
    const team = this._teamOf(uid);
    if (!team) return true; // spectateur

    if (!this._checker || !this._checker(raw)) return true; // silencieux

    this.awaitingAnswer = false;
    this._clearTimers();

    const player = team.members.get(uid);
    player.score += 10;
    const teamScore = [...team.members.values()].reduce((s, m) => s + m.score, 0);

    const tag = `@${String(name).split(/\s+/)[0]}`;
    const bodyText = fmt.frame('⚡ BONNE RÉPONSE', [
      `✅ ${tag} ${fmt.bold('trouve')} ! (+10 pour ${fmt.bold(team.name)})`,
      `💡 ${fmt.bold('Réponse')} : ${fmt.bold(q.a)}`,
      `🏟️ ${fmt.bold(team.name)} : ${fmt.boldNum(teamScore)} pts — ${fmt.bold('perso')} : ${fmt.boldNum(player.score)}`,
    ]);
    const payload = { body: bodyText };
    const from = bodyText.indexOf(tag);
    if (from >= 0) payload.mentions = { [uid]: { tag, from } };
    await this.send(payload);

    await this._next();
    return true;
  }

  async _next() {
    this.qIndex++;
    if (this.qIndex >= this.total) return this._finish();
    this.awaitingAnswer = false;
    this.questionTimer = setTimeout(() => {
      this.questionTimer = null;
      if (this.finished) return;
      this._askQuestion().catch(() => {});
    }, this.bot.config.games.interDelayMs);
  }

  /* ── 🏁 Tableau final + récompenses ── */
  async _finish(notice) {
    if (this.finished) return;
    this.finished = true;
    this.awaitingAnswer = false;
    this._clearTimers();

    const ranked = this.teams
      .map((t) => ({ team: t, total: [...t.members.values()].reduce((s, m) => s + m.score, 0) }))
      .sort((a, b) => b.total - a.total);

    const lines = [];
    if (notice) lines.push(notice, '');
    const medals = ['🏆', '🥈', '🥉', '4️⃣'];
    ranked.forEach((r, i) => {
      lines.push(`${medals[i] || '▸'} ${fmt.bold(r.team.name)} — ${fmt.boldNum(r.total)} pts`);
      for (const m of [...r.team.members.values()].sort((a, b) => b.score - a.score)) {
        lines.push(`     ▸ ${fmt.bold(m.name)} : ${fmt.boldNum(m.score)}`);
      }
    });

    // Récompenses : équipe gagnante → +200/membre ; meilleur buteur → +600.
    const winner = ranked[0];
    if (winner && winner.total > 0) {
      let mvp = null;
      for (const [uid, m] of winner.team.members) {
        if (!mvp || m.score > mvp.score) mvp = { uid, ...m };
      }
      for (const [uid] of winner.team.members) {
        this.bot.economy.addCoins(uid, REWARD_MEMBER);
      }
      if (mvp) {
        this.bot.economy.addCoins(mvp.uid, REWARD_MVP);
        lines.push(
          '',
          `🎉 ${fmt.bold(winner.team.name)} ${fmt.bold('gagne')} ! Membres : +${fmt.boldNum(REWARD_MEMBER)} XCoins chacun`,
          `🥇 ${fmt.bold('Meilleur buteur')} : ${fmt.bold(mvp.name)} — +${fmt.boldNum(REWARD_MVP)} XCoins 🏅`
        );
      }
      this.bot.db.users.save();
      this.bot.db.bumpStat('quizzesPlayed');
    } else {
      lines.push('', '📭 ' + fmt.bold(`Personne n'a marqué — pas de récompense.`));
    }

    await this.send(fmt.frame('🏁 XTEAM — CLASSEMENT FINAL', lines));
    this.dispose();
  }
}

module.exports = { TeamQuizSession, REWARD_MEMBER, REWARD_MVP, MAX_GROUPS, MAX_MEMBERS };
