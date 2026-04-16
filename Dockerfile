# ══════════════════════════════════════════════════════════════════════════════
# Bot di Zona — Dockerfile multi-stage (substitui Nixpacks)
#
# Stage 1: instala dependências (cached se package*.json não mudar)
# Stage 2: copia código e corre — imagem final ~180 MB
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Instalar apenas dependências de produção (sem devDependencies)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine

# Metadata
LABEL maintainer="Firma RedWood"
LABEL description="Bot di Zona — Discord bot de gestão operacional"

# Segurança: não correr como root
RUN addgroup -S botgroup && adduser -S botuser -G botgroup

WORKDIR /app

# Copiar deps do stage anterior (cached)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json

# Copiar código da aplicação
COPY src/ ./src/
COPY config/ ./config/

# Ficheiros opcionais que podem existir
COPY scripts/ ./scripts/ 2>/dev/null || true

# Usar non-root user
USER botuser

# Variáveis de ambiente padrão (overridden por Railway/env)
ENV NODE_ENV=production
ENV PORT=3000

# Healthcheck interno (Railway usa /health via HTTP)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1

EXPOSE ${PORT}

CMD ["node", "src/index.js"]
