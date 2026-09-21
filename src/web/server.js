import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import env from '../config/env.js';
import { ApiError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { createApiRouter } from './routes/index.js';

const logger = createLogger('web');

const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

function buildCors() {
  const allowed = new Set([...env.allowedOrigins, ...DEV_ORIGINS]);

  return cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // same-origin, curl, mobile apps
      if (allowed.has(origin)) return callback(null, true);
      if (!env.allowedOrigins.length && !env.isProduction) return callback(null, true);
      return callback(ApiError.forbidden('Origine non autorisée pour cette API.'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
    maxAge: 600,
  });
}

function contentSecurityPolicy() {
  const connectSrc = ["'self'", ...env.allowedOrigins, ...DEV_ORIGINS];
  const directives = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'],
    connectSrc,
    fontSrc: ["'self'", 'data:'],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
  };

  // Directive sans valeur : ne l'ajouter qu'en production (helmet exige `null`).
  if (env.isProduction) directives.upgradeInsecureRequests = null;

  // L'embedding (iframe) reste possible par défaut pour les previews ;
  // ALLOW_EMBED=false durcit l'en-tête en production.
  if (!env.allowEmbed) directives.frameAncestors = ["'self'"];

  return { directives };
}

function frontendNotBuiltPage() {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${env.projectName}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#05070d; color:#e6edf7;
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .card { max-width:640px; padding:32px; border-radius:16px; background:#0b1020cc; border:1px solid #1e2a44; }
  h1 { margin:0 0 8px; font-size:22px; letter-spacing:.5px; }
  code { background:#111a2e; padding:2px 8px; border-radius:6px; color:#7dd3fc; }
  a { color:#22d3ee; }
</style>
</head>
<body>
  <div class="card">
    <h1>${env.projectName}</h1>
    <p>L'API fonctionne, mais l'interface web n'est pas encore compilée.</p>
    <p>Construisez le frontend puis rechargez cette page :</p>
    <p><code>npm run build</code></p>
    <p>API : <a href="/api/health">/api/health</a> • <a href="/api/commands">/api/commands</a></p>
  </div>
</body>
</html>`;
}

/**
 * Serveur HTTP : API REST + frontend statique.
 * Le frontend est servi par le même processus en production (déploiement
 * simple sur Render/Railway/VPS) mais peut aussi être hébergé séparément.
 */
export function createServer(manager) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: contentSecurityPolicy(),
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      frameguard: env.allowEmbed ? false : { action: 'sameorigin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: env.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  app.use(buildCors());
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.use('/api', apiLimiter);
  app.use('/api', createApiRouter(manager));
  app.use('/api', notFoundHandler);

  // Frontend compilé (Vite) si présent.
  const distDir = env.paths.frontendDist;
  const indexFile = path.join(distDir, 'index.html');

  if (fs.existsSync(indexFile)) {
    app.use(
      express.static(distDir, {
        index: false,
        maxAge: env.isProduction ? '7d' : 0,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );

    // SPA : toute route inconnue renvoie index.html.
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(indexFile));
    logger.info('frontend servi', { dir: path.relative(env.root, distDir) });
  } else {
    app.get(/^\/(?!api\/).*/, (_req, res) => res.status(200).type('html').send(frontendNotBuiltPage()));
    logger.warn('frontend non compilé : page d’instruction servie (lancez `npm run build`)');
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = http.createServer(app);
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;

  return { app, server };
}

export default createServer;
