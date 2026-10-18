# Images for the Hono API. Build context is the repository root so the npm
# workspace lockfile and the shared package are available.
#   target "release" (default in compose.yaml): bundled build on plain Node
#   target "dev"     (compose.dev.yaml): tsx watch with hot reload
FROM node:22-bookworm-slim AS base
ENV npm_config_update_notifier=false \
    npm_config_fund=false
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# Toolchain for native modules (better-sqlite3) when no prebuilt binary matches.
FROM base AS toolchain
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# All dependencies, cached until a manifest changes.
FROM toolchain AS deps
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace apps/api --workspace packages/shared --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

FROM deps AS dev
ENV NODE_ENV=development
# Run as the unprivileged user that ships with the Node image.
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
EXPOSE 3000
WORKDIR /app/apps/api
CMD ["npm", "run", "dev"]

FROM deps AS build
RUN npm run build --workspace apps/api

# Production dependencies only; everything except the native modules is bundled.
FROM toolchain AS prod-deps
RUN --mount=type=cache,target=/root/.npm \
    mkdir -p apps/api/node_modules \
    && npm ci --omit=dev --workspace apps/api --include-workspace-root

FROM node:22-bookworm-slim AS release
ENV NODE_ENV=production \
    npm_config_update_notifier=false \
    npm_config_fund=false \
    MIGRATIONS_DIR=/app/apps/api/drizzle
WORKDIR /app
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/apps/api/node_modules apps/api/node_modules
COPY apps/api/drizzle apps/api/drizzle
COPY --from=build /app/apps/api/dist apps/api/dist
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
EXPOSE 3000
WORKDIR /app/apps/api/dist
CMD ["node", "index.js"]
