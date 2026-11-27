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
COPY packages/contracts/package.json packages/contracts/
COPY packages/editor/package.json packages/editor/
COPY packages/i18n/package.json packages/i18n/
COPY packages/updates/package.json packages/updates/
COPY packages/account-menu/package.json packages/account-menu/
COPY packages/monitoring/package.json packages/monitoring/
COPY packages/collab/package.json packages/collab/
COPY packages/assistant/package.json packages/assistant/
COPY apps/binder/package.json apps/binder/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @scholarkit/binder...
COPY packages/contracts packages/contracts
COPY packages/editor packages/editor
COPY packages/i18n packages/i18n
COPY packages/updates packages/updates
COPY packages/account-menu packages/account-menu
COPY packages/monitoring packages/monitoring
COPY packages/collab packages/collab
COPY packages/assistant packages/assistant
COPY apps/binder apps/binder
# Error reports (src/lib/monitoring.ts); without it the build sends none.
ARG VITE_SENTRY_DSN=""
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
# Source maps go to Sentry when the build gets the sentry_auth_token secret, and stay out of
# the image either way.
ARG SENTRY_ORG=""
ARG SENTRY_PROJECT=""
# The web clipper's payload schema comes from contracts, which builds to dist/ first.
RUN pnpm --filter @scholarkit/contracts build
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    pnpm --filter @scholarkit/binder build:web

# Tesseract's language files, for recognizing the text of scanned PDFs (src/lib/ocr.ts): the
# "fast" models, from a fixed commit, checked against tessdata.sha256. The desktop app fetches
# them from here too.
FROM alpine:3.22 AS tessdata
ARG TESSDATA_COMMIT=87416418657359cb625c412a48b6e1d6d41c29bd
WORKDIR /tessdata
COPY apps/binder/docker/web/tessdata.sha256 ./
RUN apk add --no-cache curl \
 && for file in $(awk '{ print $2 }' tessdata.sha256); do \
      curl -fsSL -o "$file" "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/$TESSDATA_COMMIT/$file"; \
    done \
 && sha256sum -c tessdata.sha256 \
 && rm tessdata.sha256

FROM caddy:2-alpine
COPY apps/binder/docker/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/binder/dist-web /srv/binder
COPY --from=tessdata /tessdata /srv/binder/tessdata
EXPOSE 80
