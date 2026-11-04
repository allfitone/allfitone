# syntax=docker/dockerfile:1
#
# One-off task that brings the RDS schema up to date. The database is private,
# so migrations run from inside the VPC, as an ECS task, instead of from a CI
# runner on the internet.
#
#   docker build -f infra/docker/migrator.Dockerfile -t allfitone-migrator .
#
# It carries the same Supabase CLI the repository pins, so `db push` keeps the
# history table and the ordering rules the team already relies on, plus psql
# and pg_prove for the role password and the pgTAP suite. The admin connection
# is assembled inside the task from the environment secret and never leaves AWS.

ARG NODE_VERSION=22-bookworm-slim

FROM node:${NODE_VERSION}
ARG SUPABASE_VERSION=2.110.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates postgresql-client libtap-parser-sourcehandler-pgtap-perl \
 && rm -rf /var/lib/apt/lists/* \
 && npm install --global "supabase@${SUPABASE_VERSION}" \
 && npm cache clean --force
WORKDIR /db
COPY --chown=node:node packages/db/supabase ./supabase
COPY --chmod=755 infra/docker/migrator.sh /usr/local/bin/migrate
USER node
ENTRYPOINT ["migrate"]
CMD ["plan"]
