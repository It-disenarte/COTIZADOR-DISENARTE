# syntax=docker/dockerfile:1
# Debian (no Alpine): en la fase 5 se agregan Playwright/Chromium sobre esta misma base.

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Valores de relleno solo para compilar. Los reales llegan en runtime desde .env.
RUN BETTER_AUTH_SECRET=solo-para-compilar BETTER_AUTH_URL=http://localhost:3000 npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
# Se conservan las dependencias completas: migrate y seed corren con tsx al arrancar.
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data/pdfs && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && npm start"]
