/**
 * IDREM TERESHKOVA BOT — configuration PM2 (déploiement VPS).
 *
 *   npm install -g pm2
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup        # démarrage automatique au boot du serveur
 *
 * Un seul processus : le bot maintient UNE connexion WebSocket WhatsApp,
 * le mode cluster ouvrirait des sessions concurrentes invalides.
 */
module.exports = {
  apps: [
    {
      name: 'idrem-tereshkova-bot',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 5000,
      kill_timeout: 8000,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 3000,
      },
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
