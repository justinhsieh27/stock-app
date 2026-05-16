#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed. Please install Node.js 20 or newer, then run ./install.sh again."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed. Please install npm, then run ./install.sh again."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node.js 20 or newer is required. Current version: $(node -v)"
  exit 1
fi

echo "Installing dependencies..."
npm install

chmod +x "$ROOT_DIR/run.sh"

echo
echo "Install complete."
echo "Start the web app with: ./run.sh"
