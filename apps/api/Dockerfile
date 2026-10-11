# Development image for the Hono API. Build context is the repository root
# so the npm workspace lockfile and the shared package are available.
FROM node:22-bookworm-slim

ENV NODE_ENV=development \
    npm_config_update_notifier=false \
    npm_config_fund=false
WORKDIR /app

# Toolchain for native modules (better-sqlite3) when no prebuilt binary matches.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first so they're cached until a manifest changes.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace apps/api --workspace packages/shared --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

# Run as the unprivileged user that ships with the Node image.
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node

EXPOSE 3000
WORKDIR /app/apps/api
CMD ["npm", "run", "dev"]
