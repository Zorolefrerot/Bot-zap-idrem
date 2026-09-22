"use strict";

/**
 * utils/health-server.js
 * ---------------------------------------------------------------------------
 * Minuscule serveur HTTP de statut, sans aucune dépendance externe.
 *
 * La librairie @dongdev/fca-unofficial n'a pas besoin de serveur HTTP, mais un
 * « Web Service » Render doit exposer un port (variable PORT) pour rester
 * considéré comme vivant. Ce serveur répond donc à :
 *
 *   GET /         → état du bot (HTML si navigateur, JSON sinon)
 *   GET /health   → {"status":"ok"} (200) ou 503 si le bot est en erreur
 *   GET /healthz  → alias de /health
 *
 * Désactivez-le avec HEALTH_SERVER=false si vous déployez en « Background
 * Worker » (aucun port requis).
 * ---------------------------------------------------------------------------
 */

const http = require("node:http");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(status) {
  const color = status.state === "online" ? "#22c55e" : status.state === "error" ? "#ef4444" : "#f59e0b";
  const rows = Object.entries(status.details || {})
    .map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(value)}</td></tr>`)
    .join("");

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(status.botName)} — statut</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#0b1020;color:#e6e9f2;
       display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
  .card{background:#141a2e;border:1px solid #263050;border-radius:14px;padding:28px 32px;max-width:560px;width:100%}
  h1{font-size:20px;margin:0 0 4px}
  .state{display:inline-flex;align-items:center;gap:8px;font-weight:600;margin:10px 0 18px}
  .dot{width:10px;height:10px;border-radius:50%;background:${color};box-shadow:0 0 12px ${color}}
  table{width:100%;border-collapse:collapse;font-size:14px}
  td{padding:6px 0;border-top:1px solid #232c4a;vertical-align:top}
  td:first-child{color:#98a2c0;width:44%}
  code{background:#0b1020;padding:2px 6px;border-radius:6px}
  footer{margin-top:18px;font-size:12px;color:#7d87a6}
</style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(status.botName)}</h1>
    <div>Bot Facebook Messenger</div>
    <div class="state"><span class="dot"></span>${escapeHtml(status.stateLabel)}</div>
    <table>${rows}</table>
    <footer>Propulsé par <code>@dongdev/fca-unofficial</code> — endpoint JSON : <code>/health</code></footer>
  </div>
</body>
</html>`;
}

/**
 * Démarre le serveur de statut.
 *
 * @param {object} options
 * @param {object} options.config
 * @param {object} options.logger
 * @param {() => object} options.getStatus retourne { state, stateLabel, botName, details }
 * @returns {Promise<{ port: number|null, close: () => Promise<void> }>}
 */
async function startHealthServer(options = {}) {
  const config = options.config || {};
  const logger = options.logger;
  const getStatus = typeof options.getStatus === "function" ? options.getStatus : () => ({ state: "unknown" });

  const settings = config.healthServer || {};
  if (settings.enabled === false) {
    if (logger) logger.info("Serveur de statut désactivé (HEALTH_SERVER=false).", "http");
    return { port: null, close: async () => {} };
  }

  const host = settings.host || "0.0.0.0";

  // Résolution du port : valeur explicite (0 = port libre choisi par le système),
  // sinon la variable PORT injectée par Render, sinon 3000.
  function resolvePort() {
    const raw = settings.port;
    if (raw === 0 || raw === "0") return 0;
    const numeric = Number(raw);
    if (raw !== null && raw !== undefined && Number.isFinite(numeric) && numeric > 0) return numeric;
    const fromEnv = Number(process.env.PORT);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
    return 3000;
  }
  const port = resolvePort();

  const server = http.createServer((req, res) => {
    const url = String(req.url || "/").split("?")[0];
    let status;
    try {
      status = getStatus() || {};
    } catch {
      status = { state: "error", stateLabel: "Erreur interne", botName: config.botName || "Bot", details: {} };
    }

    const isHealthy = status.state === "online" || status.state === "starting";
    const acceptsHtml = String(req.headers.accept || "").includes("text/html");

    if (url === "/health" || url === "/healthz") {
      res.writeHead(isHealthy ? 200 : 503, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          status: isHealthy ? "ok" : "error",
          state: status.state,
          bot: status.botName || config.botName || "bot",
          uptimeSeconds: Math.floor(process.uptime()),
          timestamp: new Date().toISOString()
        })
      );
      return;
    }

    if (url === "/") {
      if (req.method === "HEAD") {
        res.writeHead(isHealthy ? 200 : 503);
        res.end();
        return;
      }
      if (acceptsHtml) {
        const html = renderHtml(status);
        res.writeHead(isHealthy ? 200 : 503, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
      res.writeHead(isHealthy ? 200 : 503, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(status, null, 2));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "route inconnue", routes: ["/", "/health"] }));
  });

  server.on("error", (err) => {
    // Le serveur de statut ne doit JAMAIS faire tomber le bot.
    if (logger) {
      logger.error(
        `Serveur de statut indisponible (${err && err.code ? err.code : ""} ${err && err.message ? err.message : err}). ` +
          `Le bot continue de fonctionner.`,
        "http"
      );
    }
  });

  const actualPort = await new Promise((resolve) => {
    let resolved = false;
    const done = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    server.once("listening", () => done(server.address() && server.address().port));
    server.once("error", () => done(null));
    try {
      server.listen(port, host);
    } catch (err) {
      if (logger) logger.error(`Échec du démarrage du serveur de statut : ${err.message}`, "http");
      done(null);
    }
    // Filet de sécurité : ne jamais bloquer le démarrage du bot.
    setTimeout(() => done(null), 10000).unref();
  });

  if (actualPort && logger) {
    logger.success(`Serveur de statut en écoute sur http://${host}:${actualPort} (GET / et /health).`, "http");
  }

  return {
    port: actualPort,
    server,
    close: () =>
      new Promise((resolve) => {
        try {
          server.close(() => resolve());
          setTimeout(resolve, 1500).unref();
        } catch {
          resolve();
        }
      })
  };
}

module.exports = { startHealthServer };
