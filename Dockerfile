# syntax=docker/dockerfile:1
###############################################################################
# IDREM TERESHKOVA BOT — image Docker de production
#
#   Étape 1 : build du dashboard (Vite/React)
#   Étape 2 : runtime Node 22 + ffmpeg (stickers animés, /tovideo, /toaudio)
#
# Build  :  docker build -t idrem-tereshkova-bot .
# Run    :  docker run -d --name idrem-bot -p 3000:3000 \
#             -e DASHBOARD_PASSWORD="mot-de-passe-fort" \
#             -e SESSION_SECRET="$(openssl rand -base64 48)" \
#             -e ADMIN_NUMBER=243XXXXXXXXX \
#             -v idrem-data:/data \
#             idrem-tereshkova-bot
###############################################################################

# ---------------------------------------------------------------------------
# Étape 1 — build du frontend
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS frontend-build

WORKDIR /build

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Étape 2 — runtime backend
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

# ffmpeg : stickers animés (/sticker vidéo), /tovideo, /toaudio, /tomp3.
# ca-certificates : connexions TLS WhatsApp.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data/data \
    SESSION_DIR=/data/sessions \
    LOG_DIR=/data/logs \
    TMP_DIR=/data/tmp

# Dépendances de production uniquement (reproductible via lockfile).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Code applicatif
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY .env.example ./

# Dashboard compilé, servi par Express sur /
COPY --from=frontend-build /build/dist ./frontend/dist

# Volume de persistance : sessions WhatsApp, base JSON, logs.
# Sans volume monté sur /data, il faut regénérer un Pair Code à chaque
# redémarrage du conteneur.
VOLUME ["/data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["node", "src/index.js"]
