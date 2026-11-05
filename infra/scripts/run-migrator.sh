#!/usr/bin/env bash
#
# Runs one migrator command (plan | push | test) as an ECS task and waits for it:
#
#   CLUSTER=... FAMILY=... LOG_GROUP=... bash infra/scripts/run-migrator.sh plan
#
# RDS is private, so the migrator runs inside the VPC. This copies its log into
# the job and exits with the task's own exit code, so a failed migration fails
# the workflow instead of looking like a task that merely stopped.

set -euo pipefail

command="${1:?usage: run-migrator.sh plan|push|test}"
: "${CLUSTER:?}" "${FAMILY:?}" "${LOG_GROUP:?}"

overrides=$(printf '{"containerOverrides":[{"name":"migrator","command":["%s"],"environment":[{"name":"INCLUDE_ALL","value":"%s"}]}]}' \
  "$command" "${INCLUDE_ALL:-false}")

task=$(aws ecs run-task --cluster "$CLUSTER" --task-definition "$FAMILY" \
  --overrides "$overrides" --query 'tasks[0].taskArn' --output text)
if [ -z "$task" ] || [ "$task" = None ]; then
  echo "::error::ECS did not start the migrator" >&2
  exit 1
fi
echo "Task $task"

# One waiter gives up after ten minutes; a long push can take longer.
for attempt in 1 2 3; do
  aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$task" && break
  [ "$attempt" = 3 ] && { echo "::error::The migrator did not stop in 30 minutes" >&2; exit 1; }
done

stream="migrator/migrator/${task##*/}"
token=""
while :; do
  page=$(aws logs get-log-events --log-group-name "$LOG_GROUP" --log-stream-name "$stream" \
    --start-from-head ${token:+--next-token "$token"} --output json)
  jq -r '.events[].message' <<<"$page"
  next=$(jq -r '.nextForwardToken' <<<"$page")
  [ "$next" = "$token" ] && break
  token="$next"
done

code=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$task" \
  --query 'tasks[0].containers[0].exitCode' --output text)
reason=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$task" \
  --query 'tasks[0].stoppedReason' --output text)
echo "Exit code $code ($reason)"
[ "$code" = 0 ]
