# Stock App

A Next.js web app for tracking a stock portfolio from `STOCK.csv`.

## Requirements

- Node.js 20 or newer
- npm

## Install

After downloading or cloning this project from GitHub, run one command from the project folder:

```bash
./install.sh
```

The installer checks the local Node.js/npm setup, installs dependencies with `npm install`, and makes `run.sh` executable.

## Run

Start the web app with one command:

```bash
./run.sh
```

The app opens on [http://localhost:3000](http://localhost:3000). Before starting, `run.sh` checks whether another process is using port 3000 and stops it first.

`run.sh` starts the app in the background, writes the process id to `stock-app.pid`, and writes logs to `logs/stock-app.log`.

To watch the running app log:

```bash
tail -f logs/stock-app.log
```

To stop the app:

```bash
kill "$(cat stock-app.pid)"
```

To use a different port:

```bash
PORT=3001 ./run.sh
```

## Data

Portfolio holdings are read from `STOCK.csv`. Keep the existing column order:

```text
擁有者,交易商,股票代碼,股票名稱,股數,幣別,取得價格
```

Supported currencies are `TWD`, `USD`, `SGD`, and `JPY`.
