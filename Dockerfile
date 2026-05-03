# ══════════════════════════════════════════════════════════════════════════════
# Bot di Zona — Dockerfile multi-stage (substitui Nixpacks)
#
# Stage 1: instala dependências (cached se package*.json não mudar)
# Stage 2: copia código e corre — imagem final ~180 MB
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:18-slim AS deps

WORKDIR /app

# Instalar apenas dependências de produção (sem devDependencies)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:18-slim

# Metadata
LABEL maintainer="Firma RedWood"
LABEL description="Bot di Zona — Discord bot de gestão operacional"

# Segurança: não correr como root
RUN groupadd -r botgroup && useradd -r -g botgroup botuser

WORKDIR /app

# Copiar deps do stage anterior (cached)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json

# Copiar código da aplicação
COPY src/ ./src/
COPY config/ ./config/
COPY migrations/ ./migrations/

# Criar directórios que o bot precisa de escrever (logs, state)
# ANTES de mudar para non-root user
RUN mkdir -p /app/logs /app/debug-logs && chown -R botuser:botgroup /app/logs /app/debug-logs

# Usar non-root user
USER botuser

# Variáveis de ambiente padrão (overridden por Railway/env)
ENV NODE_ENV=production
ENV PORT=3000

# Healthcheck interno — start-period=45s dá tempo ao bot para:
# 1. Adquirir advisory lock (até 40s se container anterior não libertou)
# 2. Conectar ao Discord
# 3. Correr migrações DB
# 4. Bootstrap painéis
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))"

EXPOSE ${PORT}

CMD ["node", "src/index.js"]
