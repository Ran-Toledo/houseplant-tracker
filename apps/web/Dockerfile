# Images for the frontend. Build context is the repository root.
#   target "release" (default in compose.yaml): production build served by nginx
#   target "dev"     (compose.dev.yaml): Vite dev server with hot reload
FROM node:22-bookworm-slim AS deps
ENV npm_config_update_notifier=false \
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

FROM deps AS dev
ENV NODE_ENV=development
# Vite writes a bundled config next to vite.config.ts and caches in node_modules/.vite.
RUN mkdir -p node_modules/.vite && chown -R node:node apps/web node_modules/.vite
USER node
EXPOSE 3000
WORKDIR /app/apps/web
CMD ["npm", "run", "dev"]

FROM deps AS build
RUN npm run build --workspace apps/web

FROM nginx:1.28-alpine AS release
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 3000
