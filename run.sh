#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-3000}"
PID_FILE="$ROOT_DIR/stock-app.pid"
LOG_DIR="$ROOT_DIR/logs"
LOG_FILE="$LOG_DIR/stock-app.log"

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

is_process_running() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

start_app_in_background() {
  mkdir -p "$LOG_DIR"

  echo "Starting Stock App in the background on http://localhost:${PORT}"
  if command -v setsid >/dev/null 2>&1; then
    setsid npm run dev -- --port "$PORT" >"$LOG_FILE" 2>&1 < /dev/null &
  else
    nohup npm run dev -- --port "$PORT" >"$LOG_FILE" 2>&1 < /dev/null &
  fi

  APP_PID="$!"
  echo "$APP_PID" > "$PID_FILE"
}

wait_for_app_start() {
  local pids

  for _ in $(seq 1 30); do
    pids="$(collect_port_pids "$PORT")"
    if [ -n "$pids" ]; then
      echo "$pids" | head -n 1 > "$PID_FILE"
      return 0
    fi

    if ! is_process_running "$APP_PID"; then
      break
    fi

    sleep 1
  done

  return 1
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

start_app_in_background

if wait_for_app_start; then
  APP_PID="$(cat "$PID_FILE")"
  echo "Stock App started."
  echo "PID: $APP_PID"
  echo "Log: $LOG_FILE"
  echo "Stop it with: kill $APP_PID"
else
  echo "Error: Stock App failed to start. Recent log output:"
  tail -n 40 "$LOG_FILE" || true
  rm -f "$PID_FILE"
  exit 1
fi
