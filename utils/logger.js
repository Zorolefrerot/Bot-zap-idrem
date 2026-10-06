'use strict';
/*
 * 🧬 MeR~NeL — utils/logger.js
 * Journalisation propre avec masquage automatique des secrets.
 */

const fs = require('fs');
const path = require('path');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

class Logger {
  constructor(options = {}) {
    this.level = LEVELS[options.level] || LEVELS.info;
    this.logDir = options.logDir || path.join(process.cwd(), 'logs');
    this.logFile = options.logFile !== false ? path.join(this.logDir, 'bot.log') : null;
    this.secrets = [];
    this.maxFileSize = 2 * 1024 * 1024; // 2 Mo → rotation simple
    if (this.logFile) {
      try {
        fs.mkdirSync(this.logDir, { recursive: true });
      } catch (_) { /* ignoré */ }
    }
  }

  registerSecret(secret) {
    if (secret && String(secret).length > 3) this.secrets.push(String(secret));
  }

  redact(text) {
    let out = String(text == null ? '' : text);
    for (const secret of this.secrets) {
      try {
        out = out.split(secret).join('***REDACTED***');
      } catch (_) { /* ignore */ }
    }
    return out;
  }

  _write(level, args) {
    if (LEVELS[level] < this.level) return;
    const ts = new Date().toISOString();
    const msg = args
      .map((a) => {
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === 'object') {
          try { return this.redact(JSON.stringify(a)); } catch (_) { return '[object]'; }
        }
        return this.redact(a);
      })
      .join(' ');
    const line = `[${ts}] [${level.toUpperCase()}] ${msg}`;
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level](line);
    if (this.logFile) {
      try {
        this._rotateIfNeeded();
        fs.appendFileSync(this.logFile, line + '\n');
      } catch (_) { /* jamais faire planter le bot pour un log */ }
    }
  }

  _rotateIfNeeded() {
    try {
      const st = fs.statSync(this.logFile);
      if (st.size > this.maxFileSize) {
        fs.renameSync(this.logFile, this.logFile + '.1');
      }
    } catch (_) { /* fichier absent : rien à faire */ }
  }

  debug(...a) { this._write('debug', a); }
  info(...a) { this._write('info', a); }
  warn(...a) { this._write('warn', a); }
  error(...a) { this._write('error', a); }
}

module.exports = { Logger };
