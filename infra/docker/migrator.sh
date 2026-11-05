#!/bin/sh
#
# Commands for the migrator task. Run one with:
#
#   aws ecs run-task --cluster allfitone-production \
#     --task-definition allfitone-production-migrator \
#     --overrides '{"containerOverrides":[{"name":"migrator","command":["push"]}]}'
#
#   plan   pending migrations and the order a push would apply them in
#   push   plan, apply, set the allfit_api password, show the history
#   test   the pgTAP suite against this database
#
# INCLUDE_ALL=true applies migrations older than the newest one applied. It is
# a decision, not a retry: read `plan` first, as in deploy-database-aws.yml.

set -eu

: "${DB_HOST:?}" "${DB_PORT:?}" "${DB_NAME:?}" "${DB_MASTER_USERNAME:?}" "${DB_MASTER_PASSWORD:?}"

# The master password is generated without punctuation, so it needs no URL encoding.
url="postgresql://${DB_MASTER_USERNAME}:${DB_MASTER_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require"
include_all=""
if [ "${INCLUDE_ALL:-false}" = "true" ]; then include_all="--include-all"; fi

plan() {
  supabase migration list --db-url "$url" --workdir /db
  supabase db push --db-url "$url" --workdir /db --dry-run $include_all
}

case "${1:-plan}" in
  plan)
    plan
    ;;
  push)
    : "${ALLFIT_API_DB_PASSWORD:?}"
    plan
    supabase db push --db-url "$url" --workdir /db --yes $include_all
    psql "$url" --set=ON_ERROR_STOP=1 --set=role_password="$ALLFIT_API_DB_PASSWORD" <<'SQL'
alter role allfit_api password :'role_password';
SQL
    supabase migration list --db-url "$url" --workdir /db
    ;;
  test)
    export PGHOST="$DB_HOST" PGPORT="$DB_PORT" PGDATABASE="$DB_NAME" \
      PGUSER="$DB_MASTER_USERNAME" PGPASSWORD="$DB_MASTER_PASSWORD" PGSSLMODE=require
    # Supabase puts extensions on the search path; RDS does not.
    export PGOPTIONS="-c search_path=public,extensions"
    psql --set=ON_ERROR_STOP=1 -c 'create extension if not exists pgtap with schema extensions'
    pg_prove --ext .sql -r /db/supabase/tests/database
    ;;
  *)
    echo "usage: migrate plan|push|test" >&2
    exit 64
    ;;
esac
