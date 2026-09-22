"use strict";

/**
 * ============================================================================
 *  IDREM TERESHKOVA — Bot Facebook Messenger modulaire
 * ============================================================================
 *  Librairie : @dongdev/fca-unofficial
 *  Compte    : account.txt (jamais commité — voir .gitignore)
 *  Config    : config.json + variables d'environnement
 *  Données   : data/*.json (disque local) + snapshot distant optionnel
 *
 *  Lancement :
 *    npm start              → démarre le bot
 *    npm run selftest       → teste TOUTES les commandes sans connexion Facebook
 *    node index.js --check  → vérifie la configuration et les commandes
 *    node index.js --version
 * ============================================================================
 */

const path = require("node:path");
const { ROOT_DIR } = require("./utils/config");

// La librairie cherche fca-config.json dans le dossier courant : on s'assure
// d'être à la racine du projet, quel que soit le répertoire de lancement.
if (process.cwd() !== ROOT_DIR) {
  try {
    process.chdir(ROOT_DIR);
  } catch {
    /* non bloquant */
  }
}

const USAGE = `
IDREM TERESHKOVA — bot Facebook Messenger modulaire

Usage :
  npm start                 Démarre le bot (connexion Facebook requise)
  npm run selftest          Teste toutes les commandes sans connexion
  node index.js --check     Vérifie configuration, commandes et services
  node index.js --version   Affiche la version
  node index.js --help      Affiche cette aide

Configuration :
  config.json               Identité, préfixe, économie, limites…
  .env / variables Render   OWNER_UID, PREFIX, DATA_DIR, clés IA…
  account.txt               Session Facebook (JAMAIS commité)
`.trim();

function parseArgs(argv) {
  const args = new Set((argv || []).slice(2).map((a) => String(a).toLowerCase()));
  return {
    selftest: args.has("--selftest") || args.has("--test"),
    check: args.has("--check") || args.has("--diagnostic"),
    version: args.has("--version") || args.has("-v"),
    help: args.has("--help") || args.has("-h")
  };
}

async function main() {
  const flags = parseArgs(process.argv);

  if (flags.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  const { createBotApp } = require("./core/bot");
  const app = createBotApp({ env: process.env });

  if (flags.version) {
    process.stdout.write(`${app.config.identity.name} v${app.config.identity.version}\n`);
    return 0;
  }

  if (flags.check) {
    const { runCheck } = require("./utils/selftest");
    return runCheck(app);
  }

  if (flags.selftest) {
    const { runSelfTest } = require("./utils/selftest");
    return runSelfTest(app);
  }

  // --- Démarrage normal ---------------------------------------------------
  const lifecycle = require("./core/lifecycle");
  const result = await lifecycle.start(app);

  if (!result.ok) {
    app.logger.error("Le bot n'a pas pu démarrer. Voir le diagnostic ci-dessus.", "boot");
    // On laisse le temps aux logs/snapshots de partir, puis on sort en erreur
    // pour que l'hébergeur relance le service.
    setTimeout(() => process.exit(1), 500).unref?.();
    return 1;
  }

  app.logger.banner([
    "",
    `  🔵 ${app.config.identity.name} v${app.config.identity.version}`,
    `  ⚡ ${app.registry.count()} commandes • ${app.services.users.count()} utilisateurs • ${app.services.groups.count()} conversations`,
    `  💾 ${path.relative(ROOT_DIR, app.config._meta.dataDir) || app.config._meta.dataDir}`,
    `  📌 Préfixe : ${app.config.prefix}   Propriétaire : ${app.config.owner.uid || "non défini"}`,
    ""
  ]);

  return 0;
}

if (require.main === module) {
  main()
    .then((code) => {
      if (code) process.exitCode = code;
    })
    .catch((err) => {
      // Erreur de démarrage : message propre, aucune donnée sensible.
      process.stderr.write(`\n⛔ Démarrage impossible : ${err && err.message ? err.message : err}\n`);
      if (process.env.LOG_LEVEL === "debug" && err && err.stack) process.stderr.write(`${err.stack}\n`);
      process.exit(1);
    });
}

module.exports = { main, parseArgs, USAGE };
