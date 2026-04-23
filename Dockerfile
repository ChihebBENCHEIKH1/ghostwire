# ── Ghostwire Backend ─────────────────────────────────────────────────────────
# Multi-stage: install → prune → production image
# ──────────────────────────────────────────────────────────────────────────────

# Stage 1 — Install all deps (including dev)
FROM node:20-alpine AS deps
RUN apk add --no-cache python3 make g++ libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Stage 2 — Production-only deps
FROM node:20-alpine AS prod-deps
RUN apk add --no-cache python3 make g++ libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Stage 3 — Final runtime image
FROM node:20-alpine AS runner
RUN apk add --no-cache dumb-init

# Non-root user for security
RUN addgroup --system --gid 1001 ghostwire \
 && adduser  --system --uid  1001 ghostwire

WORKDIR /app

# Copy production node_modules
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy application source
COPY server.js         ./server.js
COPY server/           ./server/
COPY package.json      ./package.json

# Create data directory for SQLite (mounted as volume in production)
RUN mkdir -p /data && chown ghostwire:ghostwire /data

# Ghostwire stack directory for docker-compose generation
RUN mkdir -p /app/.ghostwire-stack && chown ghostwire:ghostwire /app/.ghostwire-stack

USER ghostwire

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/data/pipeline.db

EXPOSE 3001

# dumb-init handles PID 1 / signal forwarding properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1
