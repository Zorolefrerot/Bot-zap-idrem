'use strict';
/*
 * 🧬 MeR~NeL — core/bot.js
 * Cerveau du bot : routage des messages, sessions, XP, anti-spam,
 * exécution des commandes, accueil des nouveaux membres.
 */

const path = require('path');
const config = require('./config');
const { loadCommands } = require('./commandLoader');
const { Cooldowns, humanDelay } = require('../utils/cooldown');
const { Economy } = require('../systems/economy');
const { XpSystem, thresholdForLevel } = require('../systems/xp');
const { AntiSpam } = require('../systems/antiSpam');
const { SessionManager } = require('../systems/sessions');
const { IdleMonitor } = require('../systems/idle');
const fmt = require('../utils/formatter');

const WELCOME_INTROS = [
  '👋 Salut, moi c’est 𝗠𝗲𝗥~𝗡𝗘𝗟.',
  '👋 𝗠𝗲𝗥~𝗡𝗘𝗟 𝗲𝗻 𝗹𝗶𝗴𝗻𝗲. Enchanté.',
  '👋 Moi c’est 𝗠𝗲𝗥~𝗡𝗘𝗟 — ton IA de bord.',
];

class Bot {
  /**
   * @param {object} p { config, logger, db, adapter, services }
   */
  constructor(p) {
    this.config = p.config || config;
    this.logger = p.logger;
    this.db = p.db;
    this.adapter = p.adapter;
    this.api = p.adapter.api;
    this.capabilities = p.adapter.capabilities;
    this.services = p.services;

    this.commands = loadCommands(path.join(this.config.root, 'commands'), this.logger);
    this.cooldowns = new Cooldowns();
    this.economy = new Economy(this.db, this.config, this.logger);
    this.xp = new XpSystem(this.db, this.config);
    this.antiSpam = new AntiSpam(this.db, this.config, this.logger);
    this.sessions = new SessionManager(this.config, this.logger);

    /* 🌙 Mode veille automatique (après IDLE_STANDBY_MINUTES d'inactivité) */
    this.idle = new IdleMonitor(this.config, this.logger, {
      onSleepStart: async (threadID) => {
        if (this.config.idle.announce) {
          await this.send(
            fmt.frame('🌙 MODE VEILLE', [
              '🌙 ' + fmt.bold(`Aucune activité depuis ${humanDelay(this.config.idle.standbyMs)}.`),
              fmt.pick([
                '💤 ' + fmt.bold('Le système se met en veille pour économiser ses ressources.'),
                '🌌 ' + fmt.bold('MeR~NeL passe en orbite basse — il veille quand même.'),
                '🔋 ' + fmt.bold('Économie d’énergie activée.'),
              ]),
              '⚡ ' + fmt.bold('Écris X (ou une commande) pour me réveiller.'),
            ]),
            threadID
          );
        }
        try {
          this.services.chat.clear(threadID); // hygiène mémoire
        } catch (_) { /* */ }
        this.db.bumpStat('standbyCycles');
      },
      onAllSleeping: () => {
        try {
          this.services.chat.resetAll();
        } catch (_) { /* */ }
      },
    });

    /* Journal des messages DU BOT par conversation (pour Xclear). */
    this.sentLog = new Map(); // threadID → [messageID…]
    const rawSend = p.adapter.send.bind(p.adapter);
    this.send = async (payload, threadID) => {
      const info = await rawSend(payload, threadID);
      try {
        if (info && info.messageID) {
          const key = String(threadID);
          const list = this.sentLog.get(key) || [];
          list.push(String(info.messageID));
          while (list.length > 50) list.shift();
          this.sentLog.set(key, list);
        }
      } catch (_) { /* jamais bloquer l'envoi */ }
      return info;
    };
  }

  /* ── Noms d'utilisateurs (via cache adaptateur) ── */
  async getUserName(uid) {
    try {
      return await this.adapter.userCache.getName(uid);
    } catch (_) {
      return 'Membre';
    }
  }

  async getUserInfo(uid) {
    try {
      return await this.adapter.userCache.get(uid);
    } catch (_) {
      return { name: 'Membre', thumbSrc: null };
    }
  }

  /* ══════════════════  MESSAGES  ══════════════════ */

  async handleMessage(event) {
    try {
      if (!event || (event.type !== 'message' && event.type !== 'message_reply')) return;
      const senderID = String(event.senderID || '');
      const threadID = String(event.threadID || '');
      if (!senderID || !threadID || senderID === this.adapter.botID) return;

      const isGroup = threadID !== senderID;
      const body = fmt.clean(event.body || '', 2000);
      const senderName = await this.getUserName(senderID);

      this.db.ensureUser(senderID, senderName);

      /* Membre neutralisé par un admin ? → le bot l'ignore totalement. */
      const senderRec = this.db.getUser(senderID);
      if (senderRec && senderRec.banned) return;

      if (isGroup) this.db.ensureGroup(threadID);
      if (body) this.db.bumpStat('messages');

      /* ── Mute actif ? (anti-spam) ── */
      if (this.antiSpam.isMuted(senderID)) {
        const gate = this.cooldowns.check(`mute-notice:${senderID}`, 60_000);
        if (gate.ok) {
          await this.send(
            fmt.frame('🔇 MODE SILENCE', [
              '⏳ ' + fmt.bold('Tu es encore en mode silence.'),
              `⏱️ ${fmt.bold('Fin')} : ${fmt.bold(humanDelay(this.antiSpam && this._remainingMute(senderID)))}`,
            ]),
            threadID
          );
        }
        return;
      }

      /* ── Anti-spam (groupes, non-admins) ── */
      if (isGroup && body && !this.config.isAdmin(senderID)) {
        const violation = this.antiSpam.observe(threadID, senderID, body);
        if (violation) return this._handleSpamViolation(threadID, senderID, violation);
      }

      /* ── Parsing de commande (#37 — casse indifférente, préfixe inclus) ── */
      const lower = body.toLowerCase();
      const prefixLower = this.config.prefix.toLowerCase();
      const isCommand = lower.startsWith(prefixLower);
      let commandName = null;
      let rawToken = null;
      let args = [];
      if (isCommand) {
        const rest = body.slice(this.config.prefix.length).trim();
        if (rest) {
          const parts = rest.split(/\s+/);
          rawToken = parts[0].toLowerCase();
          // Les commandes MeR~NeL s'écrivent avec le X intégré (« Xdaily »).
          // On accepte donc « Xdaily » (token « xdaily ») comme « X + daily ».
          const direct = this.commands.get(rawToken);
          const withX = rawToken.startsWith('x') ? rawToken : `x${rawToken}`;
          commandName = direct ? rawToken : withX;
          args = parts.slice(1);
        }
      }

      const ctx = {
        bot: this,
        api: this.api,
        adapter: this.adapter,
        capabilities: this.capabilities,
        config: this.config,
        db: this.db,
        logger: this.logger,
        fmt,
        economy: this.economy,
        xp: this.xp,
        antiSpam: this.antiSpam,
        sessions: this.sessions,
        cooldowns: this.cooldowns,
        services: this.services,
        commands: this.commands,
        isAdmin: (uid) => this.config.isAdmin(uid),
        event,
        threadID,
        senderID,
        senderName,
        isGroup,
        text: body,
        args,
        commandName,
        send: (payload) => this.send(payload, threadID),
        getUserName: (uid) => this.getUserName(uid),
        getUserInfo: (uid) => this.getUserInfo(uid),
      };

      /* ── 🌙 0) Mode veille : après 30 min d'inactivité, le bot dort ── */
      if (this.idle.isSleeping(threadID)) {
        const botID = String(this.adapter.botID || '');
        const botMentioned = Object.keys(event.mentions || {}).some((id) => String(id) === botID);
        const replyToBot = Boolean(event.messageReply && event.messageReply.messageID && String(event.messageReply.senderID) === botID);
        const firstWord = fmt.normalizeAnswer(body.split(/\s+/)[0] || '');
        const wakePhrase = ['reveil', 'reveille', 'eveille', 'wake', 'wakeup', 'debout'].includes(firstWord);
        const sessionAccepts = this.sessions.hasSessionFor(threadID, senderID);
        const wakeWorthy = isCommand || commandName || this.config.isAdmin(senderID) || botMentioned || replyToBot || wakePhrase || sessionAccepts;
        if (!wakeWorthy) return; // 💤 messages ordinaires ignorés pendant la veille
        const silentWake = Boolean(isCommand || sessionAccepts || replyToBot || botMentioned);
        const woke = this.idle.wake(threadID);
        if (woke && !silentWake && this.idle.canAnnounceWake(threadID)) {
          await this.send(
            fmt.frame('⚡ RÉVEIL', [
              fmt.pick([
                '⚡ ' + fmt.bold('Système réveillé.') + ' ' + fmt.bold('MeR~NeL est de nouveau en ligne.'),
                '🔋 ' + fmt.bold('Veille terminée') + ' — ' + fmt.bold('tous les systèmes sont opérationnels.'),
                '🌞 ' + fmt.bold('Me revoilà.') + ' ' + fmt.bold('Que faut-il faire ?'),
              ]),
            ]),
            threadID
          );
        }
      } else {
        this.idle.touch(threadID);
      }

      /* ── 1) Session en cours → priorité (#28 & #37) ── */
      if (this.sessions.count() > 0 && body) {
        const consumed = await this.sessions.route(threadID, senderID, ctx);
        if (consumed) return;
      }

      /* ── 2) « X » seul → accueil (#36) ── */
      if (isCommand && !commandName) {
        return this._sendWelcome(threadID);
      }

      /* ── 3) Commande ── */
      if (commandName) {
        const cmd = this.commands.get(commandName);
        if (!cmd) {
          // Peut-être une commande en 2 mots (ex : « xtag all » vs « xtagall »)
          const joined = commandName + (args[0] ? args[0] : '');
          const joinedCmd = this.commands.get(joined);
          if (joinedCmd) {
            return this._runCommand(joinedCmd, { ...ctx, args: args.slice(1), commandName: joined });
          }
          // Mode chat ON → tout message (même avec X) part vers l'IA.
          const grp = this.db.getGroup(threadID);
          if (isGroup && grp && grp.chatMode) {
            return this._chatFlow(threadID, senderID, senderName, body);
          }
          return this._sendUnknown(threadID, rawToken || commandName);
        }
        return this._runCommand(cmd, ctx);
      }

      /* ── 3.5) Auto-réponse : reply à un message DU BOT ou tag @MeR~NeL → IA directe ── */
      if (body && !commandName) {
        const botID = String(this.adapter.botID || '');
        const reply = event.messageReply;
        const replyToBot = Boolean(reply && reply.messageID && String(reply.senderID) === botID && senderID !== botID);
        const mentionEntry = botID ? event.mentions && event.mentions[botID] : null;
        const botTagged = Boolean(mentionEntry) || (body && new RegExp(`@${this.config.botName}`, 'i').test(body));
        if (replyToBot || botTagged) {
          // On retire le tag du texte pour ne pas polluer la question.
          let text = body;
          if (mentionEntry && mentionEntry.tag) text = text.split(mentionEntry.tag).join(' ');
          text = text.replace(new RegExp(`@${this.config.botName}`, 'gi'), ' ').trim();
          if (text) return this._chatFlow(threadID, senderID, senderName, text);
        }
      }

      /* ── 4) Chat automatique (#6) : mode ON → répondre SANS préfixe ── */
      if (isGroup && body && body.length >= 2) {
        const group = this.db.getGroup(threadID);
        if (group && group.chatMode) {
          await this._chatFlow(threadID, senderID, senderName, body);
          return;
        }
      }

      /* ── 5) XP des messages simples ── */
      this._grantMessageXp(threadID, senderID);
    } catch (err) {
      this.logger.error('[bot] handleMessage:', err);
    }
  }

  _remainingMute(senderID) {
    const user = this.db.getUser(senderID);
    return user && user.mutedUntil ? Math.max(0, user.mutedUntil - Date.now()) : 0;
  }

  async _handleSpamViolation(threadID, senderID, violation) {
    const name = await this.getUserName(senderID);
    const safeName = (name || 'Membre').split(/\s+/)[0];

    if (violation.action === 'ban') {
      // 💀 Ban automatique après warnLimit avertissements.
      const user = this.db.ensureUser(senderID);
      user.banned = true;
      user.bannedReason = 'spam';
      user.bannedAt = Date.now();
      this.db.users.save();

      let kickedNote = '🔇 ' + fmt.bold('Sanction appliquée côté bot : ses messages seront ignorés.');
      if (this.capabilities.removeUser) {
        try {
          await this.adapter.removeUser(senderID, threadID);
          kickedNote = '🚫 ' + fmt.bold('Le membre a été retiré du groupe par l’API.');
        } catch (_) {
          /* l'API refuse → on l'annonce honnêtement */
        }
      }
      const mentionTag = `@${safeName}`;
      const body =
        fmt.frame('💀 SPAM — EXCLUSION', [
          `💀 ${fmt.bold(`Ton spam t'a conduit à ta perte, ${mentionTag}. Bye bye.`)}`,
          '☠️ ' + fmt.bold(`Avertissements : ${fmt.boldNum(this.config.spam.warnLimit)}/${fmt.boldNum(this.config.spam.warnLimit)}`),
          kickedNote,
        ]) || '';
      const payload = { body };
      const tagIndex = payload.body.indexOf(mentionTag);
      if (tagIndex >= 0) payload.mentions = { [senderID]: { tag: mentionTag, from: tagIndex } };
      await this.send(payload, threadID);
      this.db.bumpStat('spamAutoBans');
      return;
    }

    // ⚠️ Simple avertissement (avec mention du fautif).
    const mentionTag = `@${safeName}`;
    const payload = {
      body: fmt.frame('⚠️ ANTI-SPAM', [
        `⚠️ ${mentionTag}, ${fmt.bold('stop le spam.')}`,
        `🚨 ${fmt.bold('Avertissement')} ${fmt.boldNum(violation.warnings)}/${fmt.boldNum(violation.warnLimit)}`,
        '💀 ' + fmt.bold(`À ${fmt.boldNum(violation.warnLimit)} : exclusion automatique.`),
      ]),
    };
    const tagIndex = payload.body.indexOf(mentionTag);
    if (tagIndex >= 0) payload.mentions = { [senderID]: { tag: mentionTag, from: tagIndex } };
    await this.send(payload, threadID);
  }

  async _runCommand(cmd, ctx) {
    const { threadID, senderID } = ctx;
    try {
      /* Permissions */
      if (cmd.adminOnly && !this.config.isAdmin(senderID)) {
        return this.send(
          fmt.frame('⛔ ACCÈS REFUSÉ', [
            '🛡️ ' + fmt.bold('Commande réservée aux administrateurs.'),
            '🤖 ' + fmt.pick(['Le système te regarde passer…', 'Nice try. Presque impressionnant.', 'Cette porte est verrouillée. 🔒']),
          ]),
          threadID
        );
      }

      /* Cooldown par utilisateur (les admins passent) */
      const cdMs = cmd.cooldownMs != null ? cmd.cooldownMs : 3000;
      if (cdMs > 0 && !this.config.isAdmin(senderID)) {
        const gate = this.cooldowns.check(`${cmd.name}:${senderID}`, cdMs);
        if (!gate.ok) {
          return this.send(fmt.frame('⏳ PATIENCE', `⏱️ ${fmt.bold('Cooldown')} : ${fmt.bold(humanDelay(gate.remainingMs))}`), threadID);
        }
      }

      /* Stats & XP */
      const user = this.db.ensureUser(senderID);
      user.stats.commands += 1;
      this.db.users.save();
      this.db.bumpStat('commands');
      const xpRes = this.xp.addXp(senderID, this.config.xp.perCommand);
      if (xpRes.leveledUp) await this._announceLevelUp(threadID, ctx.senderName, xpRes.level);

      await cmd.run(ctx);
    } catch (err) {
      this.logger.error(`[bot] commande ${cmd.name}:`, err);
      const code = err && err.code ? String(err.code).toUpperCase() : 'INTERNAL_ERROR';
      await this.send(
        fmt.frame('⚠️ SYSTÈME EN PAUSE', [
          '🛰️ ' + fmt.bold('Une anomalie empêche cette fonction de répondre.'),
          `🧾 ${fmt.bold('CODE')} : ${fmt.bold(code)}`,
          '',
          fmt.bold('Réessaie dans un instant.'),
        ]),
        threadID
      );
    }
  }

  _grantMessageXp(threadID, senderID) {
    const gate = this.cooldowns.check(`xpmsg:${senderID}`, this.config.xp.messageCooldownMs);
    if (!gate.ok) return;
    const res = this.xp.addXp(senderID, this.config.xp.perMessage);
    if (res.leveledUp) {
      this._announceLevelUp(threadID, null, res.level).catch(() => {});
    }
  }

  async _announceLevelUp(threadID, name, level) {
    await this.send(
      fmt.frame('🎉 NIVEAU SUPÉRIEUR', [
        `${name ? name + ' — ' : ''}⚡ ${fmt.bold('NIVEAU')} ${fmt.boldNum(level)} ${fmt.bold('atteint')} !`,
        `${fmt.bold('Prochain palier')} : ${fmt.boldNum(thresholdForLevel(level + 1))} XP`,
      ]),
      threadID
    );
  }

  async _sendWelcome(threadID) {
    await this.send(
      fmt.frame('🧬 𝗠𝗲𝗥~𝗡𝗘𝗟 ⚡', [
        fmt.pick(WELCOME_INTROS),
        '',
        '🤖 ' + fmt.bold('Je suis une IA personnelle conçue pour discuter, répondre à vos questions, vous divertir et vous assister dans le groupe.'),
        '⚡ ' + fmt.bold('Vous demandez, j’analyse… et j’agis.'),
        '',
        '📋 ' + fmt.bold('Tape Xmenu pour découvrir mes commandes.'),
      ])
    );
  }

  async _sendUnknown(threadID, name) {
    await this.send(
      fmt.frame('❓ COMMANDE INCONNUE', [
        `🛰️ ${fmt.bold(`« ${this.config.prefix}${name} »`)} ${fmt.bold('n’existe pas (encore).')}`,
        '📋 ' + fmt.bold('Tape Xmenu pour la liste complète.'),
      ]),
      threadID
    );
  }

  /* ── Chat automatique : quand le mode est ON, TOUT est traité ── */
  async _chatFlow(threadID, senderID, senderName, body) {
    const trimmed = String(body || '').trim();
    if (trimmed.length < 1) return;

    // Anti-tempête : un seul appel IA à la fois par conversation.
    const gate = this.cooldowns.check(`chat:${threadID}`, this.config.chat.minIntervalMs);
    if (!gate.ok) return this._grantMessageXp(threadID, senderID);

    try {
      const answer = await this.services.chat.reply({ threadID, userID: senderID, userName: senderName, text: trimmed });
      if (answer) {
        await this.send(
          fmt.pick([
            `${fmt.bold(this.config.botName)} ⚡ ${answer}`,
            `🛰️ ${answer}`,
            `${answer} ${fmt.pick(['⚡', '🧬', '🛰️'])}`,
          ]),
          threadID
        );
      }
    } catch (err) {
      this.logger.warn('[bot] chat:', err.code || err.message);
      // Erreur annoncée avec parcimonie (1 fois/2 min max par conversation).
      const notice = this.cooldowns.check(`chat-err:${threadID}`, 120_000);
      if (notice.ok) {
        await this.send(
          fmt.frame('🛰️ CERVEAU EN PAUSE', [
            '⚠️ ' + fmt.bold('Mon cerveau a bugué — réessaie dans 5 secondes.'),
            `🧾 ${fmt.bold('CODE')} : ${fmt.bold(String(err.code || 'AI_ALL_PROVIDERS_DOWN').toUpperCase())}`,
          ]),
          threadID
        );
      }
    }
    this._grantMessageXp(threadID, senderID);
  }

  /* ══════════════════  ÉVÉNEMENTS GROUPE  ══════════════════ */

  /* ══════════════════  ROUTAGE GÉNÉRAL (fix « bot sourd »)  ══════════════════ */
  /*
   * Point d'entrée unique de TOUT ce qui arrive du listener Messenger :
   *  - type « message » / « message_reply » → handleMessage (commandes, chat…)
   *  - type « event » (log:subscribe, log:unsubscribe…) → handleEvent (accueil…)
   * Sans ce routage, les messages arrivent mais ne sont jamais traités.
   */
  async handleRawEvent(event) {
    if (!event) return;
    if (event.type === 'message' || event.type === 'message_reply') {
      await this.handleMessage(event);
      return;
    }
    await this.handleEvent(event);
  }

  async handleEvent(event) {
    try {
      if (!event || event.type !== 'event' || !event.logMessageType) return;

      if (event.logMessageType === 'log:subscribe') {
        this.idle.wake(String(event.threadID || '')); // 👋 un arrivant réveille le bot
        const data = event.logMessageData || {};
        const added = (data.addedParticipants || []).map((u) => ({
          uid: String(u.userFbId || u.fullUser || ''),
          name: u.fullName || 'Membre',
        }));
        for (const u of added) {
          if (u.uid === this.adapter.botID) return this._selfIntro(event.threadID);
        }
        return this._welcomeNewMembers(String(event.threadID), added);
      }

      if (event.logMessageType === 'log:unsubscribe') {
        this.idle.wake(String(event.threadID || ''));
        const data = event.logMessageData || {};
        const left = String(data.leftParticipantFbId || '');
        if (left && left !== this.adapter.botID) {
          await this.send(
            fmt.frame('🛰️ SIGNAL PERDU', [
              `👋 ${fmt.bold('Un membre a quitté le groupe.')}`,
              '⚡ ' + fmt.pick(['Le système continue de veiller.', 'Sa trace reste dans les logs…', 'Que le multivers le garde. 🌌']),
            ]),
            String(event.threadID)
          );
        }
      }
    } catch (err) {
      this.logger.error('[bot] handleEvent:', err);
    }
  }

  async _selfIntro(threadID) {
    const group = this.db.ensureGroup(String(threadID));
    await this.send({
      body: fmt.frame('🧬 𝗠𝗲𝗥~𝗡𝗘𝗟 ⚡', [
        '🤖 ' + fmt.bold('Système déployé dans ce groupe.'),
        '',
        '🧠 ' + fmt.bold('IA & chat automatique'),
        '💰 ' + fmt.bold('Économie & XP'),
        '🎮 ' + fmt.bold('Quiz, duels & jeux'),
        '🖼️ ' + fmt.bold('Génération d’images, audio, vidéo'),
        '🛡️ ' + fmt.bold('Administration & anti-spam'),
        '',
        '📋 ' + fmt.bold('Tape Xmenu pour tout découvrir.'),
        `🖋️ ${fmt.bold('Signé')} : ${fmt.bold(this.config.signature)}`,
      ]),
    });
    void group;
  }

  async _welcomeNewMembers(threadID, added) {
    const group = this.db.ensureGroup(threadID);
    if (group.welcome === false) return;
    for (const member of added) {
      if (!member.uid) continue;
      this.db.ensureUser(member.uid, member.name);
      const safeName = (member.name || 'Membre').split(/\s+/)[0] || 'Membre';
      const payload = {
        body: fmt.frame('🧬 𝗠𝗲𝗥~𝗡𝗘𝗟 ⚡', [
          '👋 ' + fmt.bold('NOUVEAU MEMBRE DÉTECTÉ.'),
          '',
          `✨ @${safeName}`,
          fmt.bold('Bienvenue dans le groupe. ⚡'),
          '',
          '🤖 ' + fmt.bold('Système actif.'),
          '🧠 ' + fmt.bold('Intelligence en ligne.'),
        ]),
      };
      const tagIndex = payload.body.indexOf(`@${safeName}`);
      if (tagIndex >= 0) {
        payload.mentions = { [member.uid]: { tag: `@${safeName}`, from: tagIndex } };
      }
      await this.send(payload);
    }
  }

  /* ── Extinction propre ── */
  async shutdown() {
    this.idle.destroy();
    this.sessions.destroyAll();
    this.db.saveAll();
    try {
      await this.adapter.shutdown();
    } catch (_) { /* */ }
  }
}

module.exports = { Bot };
