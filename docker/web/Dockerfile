# syntax=docker/dockerfile:1

# Binder's browser build (pnpm build:web), served at /binder by Caddy.
# CI pushes this image to ghcr.io; the services' Compose stack runs it behind
# its own Caddy, on the account app's origin. Build from the repository root:
#   docker build -f apps/binder/docker/web/Dockerfile .

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Every workspace package Binder depends on, dev tools included, needs its manifest here.
COPY packages/tsconfig packages/tsconfig
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/editor/package.json packages/editor/
COPY packages/i18n/package.json packages/i18n/
COPY packages/updates/package.json packages/updates/
COPY apps/binder/package.json apps/binder/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @scholarkit/binder...
COPY packages/editor packages/editor
COPY packages/i18n packages/i18n
COPY packages/updates packages/updates
COPY apps/binder apps/binder
RUN pnpm --filter @scholarkit/binder build:web

FROM caddy:2-alpine
COPY apps/binder/docker/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/binder/dist-web /srv/binder
EXPOSE 80
