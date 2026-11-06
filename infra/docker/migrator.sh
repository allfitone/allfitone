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
#   bootstrap  the first two Backoffice administrators, each granted by the other
#              (SUBJECT_A, SUBJECT_B: WorkOS user ids; DUTY_DAYS: 1-90;
#              CEREMONY_REFERENCE: the approving ticket, without personal data)
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
  bootstrap)
    : "${SUBJECT_A:?}" "${SUBJECT_B:?}" "${DUTY_DAYS:?}" "${CEREMONY_REFERENCE:?}"
    case "$DUTY_DAYS" in
      *[!0-9]*) echo "DUTY_DAYS must be a number of days" >&2; exit 64 ;;
    esac
    if [ "$DUTY_DAYS" -lt 1 ] || [ "$DUTY_DAYS" -gt 90 ]; then
      echo "DUTY_DAYS must be between 1 and 90 (ADR-028)" >&2
      exit 64
    fi
    # Each administrator signed in to Studio once, so the account already has a person.
    psql "$url" --set=ON_ERROR_STOP=1 \
      --set=subject_a="$SUBJECT_A" --set=subject_b="$SUBJECT_B" \
      --set=duty_days="$DUTY_DAYS" --set=ceremony="$CEREMONY_REFERENCE" <<'SQL'
begin;
select a.person_id as person_a, b.person_id as person_b, a.issuer
from identity.access_accounts as a
join identity.access_accounts as b on b.provider = a.provider and b.issuer = a.issuer
where a.provider = 'workos' and a.subject = :'subject_a' and b.subject = :'subject_b'
  and a.person_id is not null and b.person_id is not null
\gset
set local role allfit_migrator;
select support.bootstrap_backoffice_administrators(
  :'person_a'::uuid, :'subject_a', :'person_b'::uuid, :'subject_b', :'issuer',
  clock_timestamp() + make_interval(days => :'duty_days'::int), :'ceremony'
);
commit;
\echo allfit_admin granted to :person_a and :person_b
SQL
    ;;
  *)
    echo "usage: migrate plan|push|test|bootstrap" >&2
    exit 64
    ;;
esac
