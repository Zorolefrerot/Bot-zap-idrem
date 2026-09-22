'use strict';
/*
 * 🧬 MeR~NeL — commands/group/xannonce.js
 * Assistant d'annonce : collecte guidée (événement, questions, date,
 * heure, informations) → annonce futuriste + affiche (si clé image)
 * + mention automatique de tout le groupe.
 */

const { safeInt } = require('../../utils/sanitize');
const fmt = require('../../utils/formatter');

const CANCEL_WORDS = new Set(['cancel', 'annuler', 'stop', 'quit']);

const STEPS = [
  { key: 'event', label: '🎌 𝗘́𝗩𝗘́𝗡𝗘𝗠𝗘𝗡𝗧', hint: 'ex : Jujutsu Kaisen' },
  { key: 'questions', label: '❓ 𝗡𝗢𝗠𝗕𝗥𝗘 𝗗𝗘 𝗤𝗨𝗘𝗦𝗧𝗜𝗢𝗡𝗦', hint: 'ex : 30' },
  { key: 'date', label: '📅 𝗗𝗔𝗧𝗘', hint: 'ex : Lundi' },
  { key: 'time', label: '⏰ 𝗛𝗘𝗨𝗥𝗘', hint: 'ex : 20h30 ou « à définir »' },
  { key: 'info', label: '📍 𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗧𝗜𝗢𝗡𝗦', hint: 'ex : Préparez-vous — ou « skip »' },
];

class AnnonceSession {
  constructor(bot, p) {
    this.bot = bot;
    this.threadID = String(p.threadID);
    this.ownerID = String(p.ownerID);
    this.send = p.send;
    this.scope = `annonce:${this.ownerID}`;
    this.triggerCommand = 'xannonce';
    this.inactivityMs = bot.config.games.stepTimeoutMs;
    this.stepIndex = 0;
    this.data = {};
    this.finished = false;
  }

  accepts(userID) {
    return String(userID) === this.ownerID;
  }

  _clearTimers() {}

  dispose() {
    this.finished = true;
    if (this.bot && this.bot.sessions) this.bot.sessions.remove(this.threadID, this.scope);
  }

  expire() {
    if (this.finished) return;
    this.dispose();
    this.send(fmt.frame('📢 XANNONCE', '⌛ ' + fmt.bold('Annonce abandonnée — trop longtemps sans réponse.'))).catch(() => {});
  }

  async start() {
    await this.send(this._prompt());
  }

  _prompt() {
    const step = STEPS[this.stepIndex];
    return fmt.frame('📢 𝗫𝗔𝗡𝗡𝗢𝗡𝗖𝗘', [
      `『${fmt.bold(`ÉTAPE ${this.stepIndex + 1}/${STEPS.length}`)}』`,
      '',
      step.label,
      `📌 ${fmt.bold(step.hint)}`,
      '',
      '⚠️ ' + fmt.bold('Tape « cancel » pour annuler.'),
    ]);
  }

  async handle(ctx) {
    const raw = String(ctx.text || '').trim();
    if (!raw) return false;
    if (ctx.commandName && ctx.commandName !== this.triggerCommand) return false;
    if (ctx.commandName === this.triggerCommand) {
      await this.send(fmt.frame('📢 XANNONCE', '⚠️ ' + fmt.bold('Une annonce est déjà en préparation.')));
      return true;
    }
    if (CANCEL_WORDS.has(fmt.normalizeAnswer(raw))) {
      this.dispose();
      await this.send(fmt.frame('📢 XANNONCE', '🛑 ' + fmt.bold('Annonce annulée.')));
      return true;
    }

    const step = STEPS[this.stepIndex];
    let value = fmt.clean(raw, 200);
    if (step.key === 'questions') {
      const n = safeInt(value, { min: 1, max: 200 });
      value = n ? `${n}` : value;
    }
    if (step.key === 'info' && /^(skip|passer|-)$/i.test(value)) value = '';

    this.data[step.key] = value;
    this.stepIndex++;

    if (this.stepIndex < STEPS.length) {
      await this.send(this._prompt());
      return true;
    }
    await this._finalize();
    return true;
  }

  async _finalize() {
    const b = fmt.bold;
    const d = this.data;
    const title = d.event || 'Événement';
    const lines = [
      '🎌 ' + b(title.toUpperCase()),
      d.questions ? `❓ ${fmt.boldNum(parseInt(d.questions, 10) || d.questions)} ${b('QUESTIONS')}` : '',
      d.date ? `📅 ${b(d.date)}` : '',
      d.time ? `⏰ ${b(d.time)}` : '',
      '',
      '⚡ ' + b(d.info || 'Préparez-vous.'),
    ].filter((l) => l !== '');
    const body = fmt.frame('📢 𝗔𝗡𝗡𝗢𝗡𝗖𝗘', lines);
    this.dispose();

    // Affiche visuelle (best effort — jamais de faux succès)
    let poster = null;
    if (this.bot.services.imageGen.available()) {
      poster = await this.bot.services.imageGen.generatePoster({
        title,
        subtitle: d.questions ? `${d.questions} questions` : '',
        lines: [d.date, d.time, d.info].filter(Boolean),
      }).catch(() => null);
    }
    if (poster) {
      await this.send({ body, attachment: poster });
    } else {
      await this.send(body);
      if (this.bot.services.imageGen.available() === false) {
        await this.send(fmt.frame('🖼️ AFFICHE', 'ℹ️ ' + fmt.bold('Génération d’affiche indisponible (clé image absente).')));
      }
    }

    // Mention automatique de tout le groupe (Xtag all)
    const xtagall = this.bot.commands.get('xtag');
    if (xtagall && typeof xtagall.buildMentionChunks === 'function') {
      try {
        const chunks = await xtagall.buildMentionChunks(this.bot, this.threadID, '📢 ' + b('ANNONCE OFFICIELLE — LISEZ MAINTENANT ⚡'), `— ${this.bot.config.botName}`);
        for (const chunk of chunks) {
          await this.send({ body: chunk.body, mentions: chunk.mentions });
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch (_) {
        await this.send(fmt.frame('📢 XTAG', '⚠️ ' + fmt.bold('Mention générale indisponible pour le moment.')));
      }
    }
    this.bot.db.bumpStat('annoncesSent');
  }
}

module.exports = {
  name: 'xannonce',
  description: 'Crée une annonce futuriste + tag all',
  usage: 'Xannonce',
  category: 'group',
  aliases: ['xann', 'xannounce'],
  adminOnly: false,
  cooldownMs: 10000,
  run: async (ctx) => {
    if (!ctx.isGroup) {
      return ctx.send(ctx.fmt.frame('📢 XANNONCE', '⚠️ ' + ctx.fmt.bold('Les annonces se font dans un groupe.')));
    }
    const existing = ctx.sessions.get(ctx.threadID, `annonce:${ctx.senderID}`);
    if (existing) {
      return ctx.send(ctx.fmt.frame('📢 XANNONCE', '⚠️ ' + ctx.fmt.bold('Une annonce est déjà en préparation.')));
    }
    const session = ctx.sessions.add(
      new AnnonceSession(ctx.bot, {
        threadID: ctx.threadID,
        ownerID: ctx.senderID,
        send: (payload) => ctx.send(payload),
      })
    );
    await session.start();
  },
};
