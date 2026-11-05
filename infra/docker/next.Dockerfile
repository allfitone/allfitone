# syntax=docker/dockerfile:1
#
# Image for a Next.js app of the monorepo: studio-web, backoffice-web or
# space-web.
#
#   docker build -f infra/docker/next.Dockerfile \
#     --build-arg APP=studio-web --build-arg NEXT_PUBLIC_API_URL=... .
#
# Next inlines NEXT_PUBLIC_* at build time, so they are build arguments, not
# runtime settings: with a single environment there is one image per app.
# NEXT_OUTPUT=standalone makes Next emit a self-contained server with only the
# files it traced; local builds do not set it.

ARG BUN_VERSION=1.2.16
ARG NODE_VERSION=22-bookworm-slim
ARG TURBO_VERSION=2.10.8

FROM oven/bun:${BUN_VERSION} AS prune
ARG APP
ARG TURBO_VERSION
WORKDIR /repo
COPY . .
RUN bunx "turbo@${TURBO_VERSION}" prune "@allfitone/${APP}" --docker --out-dir /pruned

FROM oven/bun:${BUN_VERSION} AS bun

# Node, not Bun, runs `next build`: Bun's image aliases `node` to itself and Next's
# compiled server fails to load under it. Bun is copied in only to install.
FROM node:${NODE_VERSION} AS build
ARG APP
ARG TURBO_VERSION
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_STAFF_INVITATIONS_ENABLED
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_ANALYTICS_ENVIRONMENT
ARG NEXT_PUBLIC_APP_RELEASE
ARG NEXT_PUBLIC_APP_STORE_URL
ARG NEXT_PUBLIC_PLAY_STORE_URL
ENV NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_STAFF_INVITATIONS_ENABLED=${NEXT_PUBLIC_STAFF_INVITATIONS_ENABLED} \
    NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY} \
    NEXT_PUBLIC_POSTHOG_HOST=${NEXT_PUBLIC_POSTHOG_HOST} \
    NEXT_PUBLIC_ANALYTICS_ENVIRONMENT=${NEXT_PUBLIC_ANALYTICS_ENVIRONMENT} \
    NEXT_PUBLIC_APP_RELEASE=${NEXT_PUBLIC_APP_RELEASE} \
    NEXT_PUBLIC_APP_STORE_URL=${NEXT_PUBLIC_APP_STORE_URL} \
    NEXT_PUBLIC_PLAY_STORE_URL=${NEXT_PUBLIC_PLAY_STORE_URL}
WORKDIR /repo
# Manifests first: this layer is reused until a dependency changes.
COPY --from=prune /pruned/json/ ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY --from=prune /pruned/full/ ./
# Prune keeps workspaces, not root config the packages extend.
COPY --from=prune /repo/tsconfig.base.json /repo/tsconfig.node.json ./
RUN bunx "turbo@${TURBO_VERSION}" run build --filter="@allfitone/${APP}"

FROM node:${NODE_VERSION} AS runtime
ARG APP
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    APP=${APP} \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /repo
COPY --from=build /repo/apps/${APP}/.next/standalone ./
COPY --from=build /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build /repo/apps/${APP}/public ./apps/${APP}/public
USER node
EXPOSE 3000
CMD ["sh", "-c", "exec node apps/${APP}/server.js"]
