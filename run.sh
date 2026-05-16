#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-3000}"

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed. Please run ./install.sh first."
  exit 1
fi

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "Dependencies are missing. Running install first..."
  "$ROOT_DIR/install.sh"
fi

if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -ti "tcp:${PORT}" || true)"
  if [ -n "$PIDS" ]; then
    echo "Port ${PORT} is in use. Stopping existing process(es): ${PIDS//$'\n'/ }"
    kill $PIDS || true
    sleep 1

    REMAINING_PIDS="$(lsof -ti "tcp:${PORT}" || true)"
    if [ -n "$REMAINING_PIDS" ]; then
      echo "Process(es) still using port ${PORT}; forcing stop: ${REMAINING_PIDS//$'\n'/ }"
      kill -9 $REMAINING_PIDS || true
      sleep 1
    fi
  fi
else
  echo "Warning: lsof is not available; cannot check whether port ${PORT} is already in use."
fi

echo "Starting Stock App on http://localhost:${PORT}"
npm run dev -- --port "$PORT"
