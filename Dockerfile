# syntax=docker/dockerfile:1

# ---- build: compile TypeScript, the web UI and the better-sqlite3 native module ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY web ./web
RUN npm run build && npm prune --omit=dev

# ---- runtime: no compilers, runs as the unprivileged "node" user ----
FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    DB_PATH=/data/coinslot.db \
    WEB_HOST=0.0.0.0 \
    WEB_PORT=8080
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
CMD ["node", "dist/index.js"]
