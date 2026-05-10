# Bot di Zona — Dockerfile hardened (multi-stage ready, rootless)
FROM node:22-alpine

WORKDIR /app

# Criar user não-privilegiado
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY src/ ./src/
COPY config/ ./config/
COPY migrations/ ./migrations/

RUN chown -R nodejs:nodejs /app
USER nodejs

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT}/health', (r) => r.statusCode===200?process.exit(0):process.exit(1)).on('error', ()=>process.exit(1))"

CMD ["node", "src/index.js"]
