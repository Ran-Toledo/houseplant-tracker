# Development image for the Vite frontend. Build context is the repository root.
FROM node:22-bookworm-slim

ENV NODE_ENV=development \
    npm_config_update_notifier=false \
    npm_config_fund=false
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace apps/web --workspace packages/shared --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

# Vite writes a bundled config next to vite.config.ts and caches in node_modules/.vite.
RUN mkdir -p node_modules/.vite && chown -R node:node apps/web node_modules/.vite
USER node
EXPOSE 5173
WORKDIR /app/apps/web
CMD ["npm", "run", "dev"]
