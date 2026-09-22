'use strict';
/*
 * 🧬 MeR~NeL — core/keepAlive.js
 * Petit serveur HTTP keep-alive (Render vérifie la santé du service ici).
 */

const http = require('http');

function startKeepAlive(config, logger) {
  const startedAt = Date.now();
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz' || req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'online',
          bot: config.botName,
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        })
      );
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`╭━━〔 🧬 ${config.botName} ⚡ 〕━━╮\n   SYSTÈME EN LIGNE\n╰━━〔 🧬 ${config.botName} 〕━━╯\n`);
  });

  return new Promise((resolve) => {
    server.listen(config.port, '0.0.0.0', () => {
      logger.info(`[keepAlive] écoute sur 0.0.0.0:${config.port} (/healthz)`);
      resolve(server);
    });
  });
}

module.exports = { startKeepAlive };
