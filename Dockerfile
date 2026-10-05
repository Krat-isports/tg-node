# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json yarn.lock* package-lock.json* ./
RUN if [ -f yarn.lock ]; then yarn install --frozen-lockfile --production; \
    else npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev; fi

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json yarn.lock* package-lock.json* ./
RUN if [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    else npm ci --no-audit --no-fund || npm install; fi
COPY tsconfig.json ./
COPY src ./src
RUN if [ -f yarn.lock ]; then yarn build; else npm run build; fi

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production HEALTH_HOST=0.0.0.0 HEALTH_PORT=3000
RUN apk add --no-cache curl && addgroup -S bot && adduser -S bot -G bot
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist         ./dist
COPY package.json ./
USER bot
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${HEALTH_PORT}/health" || exit 1
CMD ["node", "--enable-source-maps", "dist/index.js"]
