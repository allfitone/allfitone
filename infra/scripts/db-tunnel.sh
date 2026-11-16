#!/usr/bin/env bash
#
# Opens a tunnel from this computer to the production database on localhost:15432.
#
#   bash infra/scripts/db-tunnel.sh          # in the foreground; Ctrl+C closes it
#   bash infra/scripts/db-tunnel.sh start    # in the background, returns once it is ready
#   bash infra/scripts/db-tunnel.sh stop     # closes the background tunnel
#
# RDS is private and nothing listens on the internet. Session Manager reaches the
# ECS machine, which forwards to RDS, so the only key is your AWS SSO session.
# The machine is looked up on every run because spot replaces it.
#
# `start` and `stop` are for a database client: DBeaver runs them before connecting
# and after disconnecting, and `start` only returns when the port accepts
# connections, because a client that connects too early gets "connection refused".
#
# Needs the AWS CLI and the Session Manager plugin
# (`brew install --cask session-manager-plugin`). LOCAL_PORT changes the port.

set -euo pipefail

# Apps opened from the Dock do not inherit the shell PATH, where Homebrew installs both tools.
export PATH="${PATH}:/opt/homebrew/bin:/usr/local/bin"
export AWS_PROFILE="${AWS_PROFILE:-allfitone}"
local_port="${LOCAL_PORT:-15432}"
state="${TMPDIR:-/tmp}/allfitone-db-tunnel-${local_port}"
# Global: the exit trap runs after run() has returned and its locals are gone.
session=""

run() {
  aws sts get-caller-identity >/dev/null 2>&1 || aws sso login

  local instance database
  instance=$(aws ec2 describe-instances \
    --filters Name=tag:aws:autoscaling:groupName,Values=allfitone-production-ecs \
              Name=instance-state-name,Values=running \
    --query 'Reservations[0].Instances[0].InstanceId' --output text)
  if [ -z "$instance" ] || [ "$instance" = None ]; then
    echo "No ECS machine is running; the tunnel needs one." >&2
    exit 1
  fi

  database=$(aws rds describe-db-instances --db-instance-identifier allfitone-production \
    --query 'DBInstances[0].Endpoint.Address' --output text)

  # The output is kept because it names the session, which stop has to close in AWS.
  aws ssm start-session --target "$instance" \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters "host=${database},portNumber=5432,localPortNumber=${local_port}" \
    > >(tee "${state}.out") 2>&1 &
  session=$!

  # Stopping the CLI orphans its plugin, which keeps the port. Stop the plugin; the CLI follows.
  # A stopped plugin does not tell AWS, which keeps the session open until it idles out.
  stop_session() {
    trap - EXIT INT TERM HUP
    stop_plugin
    wait "$session" 2>/dev/null || true
    local id
    id=$(sed -nE 's/.*SessionId: ([A-Za-z0-9_-]+).*/\1/p' "${state}.out" 2>/dev/null | head -n 1)
    if [ -n "$id" ]; then aws ssm terminate-session --session-id "$id" >/dev/null 2>&1 || true; fi
    rm -f "${state}.out"
  }
  trap stop_session EXIT INT TERM HUP
  wait "$session"
}

# Git Bash has no pkill. Its own children are in its process table, and the native plugin
# under the native CLI is in Windows' tree; children go first, or they would be orphaned.
stop_plugin() {
  if [ -r "/proc/${session}/winpid" ]; then
    local process parent
    for process in /proc/[0-9]*; do
      # A builtin read: Git Bash starts every subprocess slowly, and this runs per process.
      { read -r parent <"${process}/ppid"; } 2>/dev/null || continue
      if [ "$parent" = "$session" ]; then kill -TERM "${process#/proc/}" 2>/dev/null || true; fi
    done
    taskkill //F //T //PID "$(cat "/proc/${session}/winpid")" >/dev/null 2>&1 || true
  else
    pkill -TERM -P "$session" 2>/dev/null || kill -TERM "$session" 2>/dev/null || true
  fi
}

running() {
  [ -f "${state}.pid" ] && kill -0 "$(cat "${state}.pid")" 2>/dev/null
}

start() {
  if running; then return 0; fi
  nohup bash "$0" >"${state}.log" 2>&1 &
  echo $! >"${state}.pid"

  # Sixty seconds leaves room for an expired SSO session to be renewed in the browser.
  for _ in $(seq 1 120); do
    grep -q 'Waiting for connections' "${state}.log" && return 0
    if ! running; then
      cat "${state}.log" >&2
      exit 1
    fi
    sleep 0.5
  done
  echo "The tunnel did not open within 60 s; see ${state}.log" >&2
  stop
  exit 1
}

stop() {
  if running; then kill -TERM "$(cat "${state}.pid")"; fi
  rm -f "${state}.pid"
}

case "${1:-run}" in
  run) run ;;
  start) start ;;
  stop) stop ;;
  *)
    echo "usage: db-tunnel.sh [start|stop]" >&2
    exit 64
    ;;
esac
