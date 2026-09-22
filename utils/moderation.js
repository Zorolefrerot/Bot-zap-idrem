"use strict";

/**
 * utils/moderation.js
 * ---------------------------------------------------------------------------
 * Outils partagés par les commandes de modération et d'administration
 * (/ban, /mute, /kick, /warn, /broadcast, /setstatus, /eval…).
 * Centralisés ici pour éviter toute duplication entre catégories.
 * ---------------------------------------------------------------------------
 */

const { normalizeUID } = require("./helpers");

/** Motifs interdits dans /eval (données de session, cookies, identifiants). */
const FORBIDDEN_EVAL = /(account\.txt|appState|c_user|\bdatr\b|\bxs\b|sb=|fr=|cookies?|password|mot de passe|FB_APPSTATE|API_KEY|TOKEN)/i;

/**
 * Extrait la cible d'une commande de modération.
 * Accepte : un UID brut, une mention @[uid:0:Nom], ou rien (auteur).
 *
 * @param {object} ctx
 * @returns {{ id: string, name: string, explicit: boolean, rest: string }}
 */
function target(ctx) {
  const first = String(ctx.args[0] || "").trim();
  const resolved = ctx.resolveTarget(first);
  const rest = ctx.args.slice(1).join(" ").trim();
  return { ...resolved, rest };
}

/**
 * Convertit une durée lisible en minutes (« 30m », « 2h », « 1j », « 45 »).
 * @returns {{ minutes: number, label: string } | null}
 */
function parseMinutes(raw, fallbackMinutes = 10) {
  const text = String(raw ?? "").trim().toLowerCase();
  if (!text) return { minutes: fallbackMinutes, label: `${fallbackMinutes} min` };

  const match = text.match(/^(\d{1,4})\s*(s|sec|m|min|h|hr|d|j|day|jour)?$/);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2] || "m";
  let minutes = value;
  let label = `${value} min`;

  if (unit === "s" || unit === "sec") {
    minutes = Math.max(1, Math.round(value / 60));
    label = `${value} s`;
  } else if (unit === "h" || unit === "hr") {
    minutes = value * 60;
    label = `${value} h`;
  } else if (unit === "d" || unit === "j" || unit === "day" || unit === "jour") {
    minutes = value * 1440;
    label = `${value} j`;
  }

  minutes = Math.min(1440, Math.max(1, minutes));
  return { minutes, label };
}

/** Journalise une action de modération (services + stats). */
function record(bag, ctx, action, detail) {
  try {
    bag.logs.info("moderation", `${action} — ${detail}`, {
      userID: ctx.senderID,
      threadID: ctx.threadID,
      command: ctx.command ? ctx.command.name : action
    });
    bag.stats.recordModeration();
  } catch {
    /* la journalisation ne doit jamais faire échouer une action */
  }
}

/** UID normalisé ou chaîne vide. */
function uid(value) {
  return normalizeUID(value);
}

module.exports = { FORBIDDEN_EVAL, target, parseMinutes, record, uid };
