'use strict';
/*
 * 🧬 MeR~NeL — utils/permissions.js
 * Vérification centralisée des autorisations.
 */

const config = require('../core/config');

/**
 * isAdmin(userID) → true UNIQUEMENT si l'UID figure dans ADMIN_UIDS.
 */
function isAdmin(userID) {
  return config.isAdmin(userID);
}

function isOwner(userID) {
  return config.isOwner(userID);
}

/**
 * Vérifie si l'utilisateur est admin du groupe Facebook (selon threadInfo).
 * Retourne false si l'information est indisponible — jamais d'exception.
 */
async function isGroupAdmin(api, threadID, userID) {
  try {
    if (typeof api.getThreadInfo !== 'function') return false;
    const info = await new Promise((resolve) => {
      try {
        api.getThreadInfo(String(threadID), (err, res) => resolve(err ? null : res));
      } catch (_) {
        resolve(null);
      }
    });
    if (!info || !Array.isArray(info.adminIDs)) return false;
    return info.adminIDs.some((a) => String((a && a.id) || a) === String(userID));
  } catch (_) {
    return false;
  }
}

module.exports = { isAdmin, isOwner, isGroupAdmin };
