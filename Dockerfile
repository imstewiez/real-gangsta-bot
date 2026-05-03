# ══════════════════════════════════════════════════════════════════════════════
# Bot di Zona — Dockerfile multi-stage (node:18-alpine)
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM public.ecr.aws/docker/library/node:18-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM public.ecr.aws/docker/library/node:18-alpine

LABEL maintainer="Firma RedWood"
LABEL description="Bot di Zona — Discord bot de gestão operacional"

# Segurança: não correr como root (alpine syntax)
RUN addgroup -S botgroup && adduser -S botuser -G botgroup

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json

COPY src/ ./src/
COPY config/ ./config/
COPY migrations/ ./migrations/

RUN mkdir -p /app/logs /app/debug-logs && chown -R botuser:botgroup /app/logs /app/debug-logs

USER botuser

ENV NODE_ENV=production
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))"

EXPOSE ${PORT}

CMD ["node", "src/index.js"]
