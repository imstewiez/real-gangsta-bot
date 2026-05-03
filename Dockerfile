# Bot di Zona — Dockerfile simples (single-stage)
FROM node:18

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY src/ ./src/
COPY config/ ./config/
COPY migrations/ ./migrations/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE ${PORT}

CMD ["node", "src/index.js"]
