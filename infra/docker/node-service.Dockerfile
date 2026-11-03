# syntax=docker/dockerfile:1
#
# Image for a Node service of the monorepo: the API or the worker.
#
#   docker build -f infra/docker/node-service.Dockerfile \
#     --build-arg APP=api --build-arg ENTRY=server.js -t allfitone-api .
#
# `turbo prune` first cuts the monorepo down to the app and the workspace
# packages it imports, with a matching lockfile, so nothing from the Expo app or
# the web apps reaches the image. Bun installs and builds, because that is the
# repository's toolchain; Node runs, because Node is what the services are
# built for. The final stage keeps production dependencies and compiled output.

ARG BUN_VERSION=1.2.16
ARG NODE_VERSION=22-bookworm-slim
ARG TURBO_VERSION=2.10.8

FROM oven/bun:${BUN_VERSION} AS prune
ARG APP
ARG TURBO_VERSION
WORKDIR /repo
COPY . .
RUN bunx "turbo@${TURBO_VERSION}" prune "@allfitone/${APP}" --docker --out-dir /pruned

FROM oven/bun:${BUN_VERSION} AS build
ARG APP
ARG TURBO_VERSION
WORKDIR /repo
# Manifests first: this layer is reused until a dependency changes.
COPY --from=prune /pruned/json/ ./
RUN bun install --frozen-lockfile
COPY --from=prune /pruned/full/ ./
# Prune keeps workspaces, not root config the packages extend.
COPY --from=prune /repo/tsconfig.base.json /repo/tsconfig.node.json ./
RUN bunx "turbo@${TURBO_VERSION}" run build --filter="@allfitone/${APP}"
# Reinstall without dev dependencies; the compiled output stays on disk. No
# scripts: the root one installs git hooks, which an image has no use for.
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
 && bun install --frozen-lockfile --production --ignore-scripts
# Node loads only `dist` (every export points there), so that and the manifest
# are all a workspace package contributes; curation data and tests stay behind.
RUN mkdir -p /runtime \
 && cp package.json /runtime/ && cp -R node_modules /runtime/ \
 && for dir in packages/* "apps/${APP}"; do \
      mkdir -p "/runtime/${dir}" && cp "${dir}/package.json" "/runtime/${dir}/" \
      && cp -R "${dir}/dist" "/runtime/${dir}/" \
      && if [ -d "${dir}/node_modules" ]; then cp -R "${dir}/node_modules" "/runtime/${dir}/"; fi; \
    done

FROM node:${NODE_VERSION} AS runtime
ARG APP
ARG ENTRY
ENV NODE_ENV=production \
    APP=${APP} \
    ENTRY=${ENTRY}
WORKDIR /repo
COPY --from=build /runtime/ ./
USER node
# exec makes Node PID 1, so it receives SIGTERM from ECS directly.
CMD ["sh", "-c", "exec node apps/${APP}/dist/${ENTRY}"]
