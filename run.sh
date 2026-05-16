#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-3000}"

collect_port_pids() {
  local port="$1"
  local pids=""

  if command -v lsof >/dev/null 2>&1; then
    pids="$(
      {
        lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
        lsof -nP -ti "tcp:$port" 2>/dev/null || true
      } | sort -u
    )"
  fi

  if [ -z "$pids" ] && command -v fuser >/dev/null 2>&1; then
    pids="$(
      fuser -n tcp "$port" 2>/dev/null \
        | tr ' ' '\n' \
        | sed -n '/^[0-9][0-9]*$/p' \
        | sort -u || true
    )"
  fi

  if [ -z "$pids" ] && command -v ss >/dev/null 2>&1; then
    pids="$(
      ss -H -ltnp "sport = :$port" 2>/dev/null \
        | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' \
        | sort -u || true
    )"
  fi

  echo "$pids" | sed -n '/^[0-9][0-9]*$/p' | sort -u
}

stop_port_processes() {
  local port="$1"
  local pids
  pids="$(collect_port_pids "$port")"

  if [ -z "$pids" ]; then
    return 0
  fi

  echo "Port ${port} is in use. Stopping existing process(es): ${pids//$'\n'/ }"
  kill $pids || true
  sleep 1

  pids="$(collect_port_pids "$port")"
  if [ -n "$pids" ]; then
    echo "Process(es) still using port ${port}; forcing stop: ${pids//$'\n'/ }"
    kill -9 $pids || true
    sleep 1
  fi

  pids="$(collect_port_pids "$port")"
  if [ -n "$pids" ]; then
    echo "Error: port ${port} is still in use by process(es): ${pids//$'\n'/ }"
    echo "Please stop them manually, then run ./run.sh again."
    exit 1
  fi
}

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed. Please run ./install.sh first."
  exit 1
fi

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "Dependencies are missing. Running install first..."
  "$ROOT_DIR/install.sh"
fi

if ! command -v lsof >/dev/null 2>&1 && ! command -v fuser >/dev/null 2>&1 && ! command -v ss >/dev/null 2>&1; then
  echo "Warning: lsof, fuser, and ss are not available; cannot check whether port ${PORT} is already in use."
fi

stop_port_processes "$PORT"

echo "Starting Stock App on http://localhost:${PORT}"
npm run dev -- --port "$PORT"
