import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import _yahooFinance from 'yahoo-finance2';

const yahooFinance = new _yahooFinance();

// Prevent Next.js from aggressively caching this API route
export const dynamic = 'force-dynamic';
export const revalidate = 60; // optionally revalidate every 60 seconds

const CSV_HEADER = '擁有者,交易商,股票代碼,股票名稱,股數,幣別,取得價格,,,,';
const SUPPORTED_CURRENCIES = new Set(['USD', 'TWD', 'SGD', 'JPY']);
const QUOTE_TIMEOUT_MS = 12000;
const csvFilePath = path.join(process.cwd(), 'STOCK.csv');

type YahooQuote = {
  symbol?: string;
  regularMarketPrice?: number;
};

type PortfolioAction = 'add' | 'edit' | 'delete';

type PortfolioRequestBody = {
  action?: PortfolioAction;
  payload?: {
    Owner?: unknown;
    Broker?: unknown;
    Ticker?: unknown;
    Name?: unknown;
    Shares?: unknown;
    Currency?: unknown;
    CostPrice?: unknown;
  };
};

export interface PortfolioItem {
  Owner: string;
  Broker: string;
  Ticker: string;
  Name: string;
  Shares: number;
  Currency: string;
  CostPrice: number;
  TotalCost: number;       // Native currency
  CurrentPrice: number;    // Native currency
  CurrentValue: number;    // Native currency
  UnrealizedPL: number;    // Native currency
  ReturnPercent: number;   // %
  // TWD Equivalents for consolidated summary
  TotalCostTWD?: number;
  CurrentValueTWD?: number;
  UnrealizedPLTWD?: number;
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeCurrency(value: unknown) {
  const currency = String(value || 'USD').trim().toUpperCase();
  return SUPPORTED_CURRENCIES.has(currency) ? currency : 'USD';
}

function normalizeTicker(value: unknown) {
  return String(value || '').trim();
}

function getCell(row: unknown[], index: number) {
  return String(row[index] || '').trim();
}

function readPortfolioRecords() {
  const fileContent = fs.readFileSync(csvFilePath, 'utf-8');
  return parse(fileContent, {
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
    from_line: 2
  }) as string[][];
}

function parsePortfolio(records: string[][]) {
  const portfolio: PortfolioItem[] = [];
  const uniqueTickers = new Set<string>();

  records.forEach((row) => {
    if (row.length >= 7 && row[2]) {
      const shares = toFiniteNumber(row[4], NaN);
      const costPrice = toFiniteNumber(row[6], NaN);
      const ticker = normalizeTicker(row[2]);

      if (ticker && Number.isFinite(shares) && Number.isFinite(costPrice)) {
        portfolio.push({
          Owner: getCell(row, 0),
          Broker: getCell(row, 1),
          Ticker: ticker,
          Name: getCell(row, 3),
          Shares: shares,
          Currency: normalizeCurrency(row[5]),
          CostPrice: costPrice,
          TotalCost: shares * costPrice,
          CurrentPrice: 0,
          CurrentValue: 0,
          UnrealizedPL: 0,
          ReturnPercent: 0
        });
        uniqueTickers.add(ticker);
      }
    }
  });

  return { portfolio, uniqueTickers };
}

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writePortfolioRecords(records: string[][]) {
  const csvLines = [CSV_HEADER];

  for (const record of records) {
    const paddedRecord = [...record];
    while (paddedRecord.length < 11) {
      paddedRecord.push('');
    }
    csvLines.push(paddedRecord.map(csvEscape).join(','));
  }

  fs.writeFileSync(csvFilePath, csvLines.join('\n') + '\n', 'utf-8');
}

async function quoteWithTimeout(symbols: string | string[]) {
  return Promise.race([
    yahooFinance.quote(symbols),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Yahoo Finance quote request timed out')), QUOTE_TIMEOUT_MS);
    })
  ]);
}

function quoteArray(result: unknown) {
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

function isYahooQuote(value: unknown): value is YahooQuote {
  return typeof value === 'object' && value !== null;
}

function hasMarketPrice(value: unknown): value is YahooQuote & { regularMarketPrice: number } {
  return isYahooQuote(value) && typeof value.regularMarketPrice === 'number' && Number.isFinite(value.regularMarketPrice);
}

function isPortfolioAction(value: unknown): value is PortfolioAction {
  return value === 'add' || value === 'edit' || value === 'delete';
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected portfolio error';
}

export async function GET() {
  try {
    // 1. Read and parse the CSV
    const records = readPortfolioRecords();
    const { portfolio, uniqueTickers } = parsePortfolio(records);

    // 2. Fetch Exchange Rates
    let usdToTwdRate = 30; // fallback
    let usdToSgdRate = 1.35; // fallback
    let usdToJpyRate = 150; // fallback

    try {
      const fxResults = await quoteWithTimeout(['TWD=X', 'SGD=X', 'JPY=X']);
      const fxArray = quoteArray(fxResults);
      
      fxArray.forEach((fx) => {
        if (hasMarketPrice(fx) && fx.symbol) {
          if (fx.symbol === 'TWD=X') usdToTwdRate = fx.regularMarketPrice;
          else if (fx.symbol === 'SGD=X') usdToSgdRate = fx.regularMarketPrice;
          else if (fx.symbol === 'JPY=X') usdToJpyRate = fx.regularMarketPrice;
        }
      });

      // If TWD=X fallback failed, try USDTWD=X
      if (usdToTwdRate === 30) {
         const altFxResult = await quoteWithTimeout('USDTWD=X');
         if (hasMarketPrice(altFxResult)) {
            usdToTwdRate = altFxResult.regularMarketPrice;
         }
      }
    } catch (fxError) {
      console.error('Error fetching exchange rates:', fxError);
      // Fallback for TWD if batch failed
      try {
         const altFxResult = await quoteWithTimeout('USDTWD=X');
         if (hasMarketPrice(altFxResult)) {
            usdToTwdRate = altFxResult.regularMarketPrice;
         }
      } catch {}
    }

    // 3. Fetch live stock prices
    const tickerArray = Array.from(uniqueTickers).filter(t => t.toLowerCase() !== 'cash');
    const priceMap = new Map<string, number>();
    
    if (tickerArray.length > 0) {
      try {
        const quotes = await quoteWithTimeout(tickerArray);
        // yahoo-finance2 returns a single object if only one ticker is requested, or an array for multiple
        const quotesArray = quoteArray(quotes);

        quotesArray.forEach((quote) => {
          if (hasMarketPrice(quote) && quote.symbol) {
            priceMap.set(quote.symbol, quote.regularMarketPrice);
          }
        });
      } catch (priceError) {
        console.error('Error fetching stock prices:', priceError);
      }
    }

    // 4. Calculate performance metrics
    let summaryTotalCostTWD = 0;
    let summaryCurrentValueTWD = 0;

    const enrichedPortfolio = portfolio.map(item => {
      let livePrice = item.CostPrice;
      if (item.Ticker.toLowerCase() !== 'cash') {
        livePrice = priceMap.get(item.Ticker) || item.CostPrice; // Fallback to cost if not found
      }
      
      item.CurrentPrice = livePrice;
      item.CurrentValue = item.Shares * livePrice;
      item.UnrealizedPL = item.CurrentValue - item.TotalCost;
      item.ReturnPercent = item.TotalCost > 0 ? (item.UnrealizedPL / item.TotalCost) * 100 : 0;

      // Calculate TWD localized values for summary
      let fxRate = 1;
      if (item.Currency === 'USD') {
        fxRate = usdToTwdRate;
      } else if (item.Currency === 'SGD') {
        fxRate = usdToTwdRate / usdToSgdRate;
      } else if (item.Currency === 'JPY') {
        fxRate = usdToTwdRate / usdToJpyRate;
      }
      
      item.TotalCostTWD = item.TotalCost * fxRate;
      item.CurrentValueTWD = item.CurrentValue * fxRate;
      item.UnrealizedPLTWD = item.UnrealizedPL * fxRate;

      summaryTotalCostTWD += item.TotalCostTWD;
      summaryCurrentValueTWD += item.CurrentValueTWD;

      return item;
    });

    const summaryUnrealizedPLTWD = summaryCurrentValueTWD - summaryTotalCostTWD;
    const summaryReturnPercent = summaryTotalCostTWD > 0 ? (summaryUnrealizedPLTWD / summaryTotalCostTWD) * 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        portfolio: enrichedPortfolio,
        summary: {
          totalCostTWD: summaryTotalCostTWD,
          currentValueTWD: summaryCurrentValueTWD,
          unrealizedPLTWD: summaryUnrealizedPLTWD,
          returnPercent: summaryReturnPercent,
          exchangeRateUSDToTWD: usdToTwdRate,
          exchangeRateUSDTOSGD: usdToSgdRate,
          exchangeRateUSDTOJPY: usdToJpyRate
        }
      }
    });

  } catch (error: unknown) {
    console.error('Error processing portfolio:', error);
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as PortfolioRequestBody;
    const { action, payload } = body;
    const normalizedPayload = {
      Owner: String(payload?.Owner || '').trim(),
      Broker: String(payload?.Broker || '').trim(),
      Ticker: normalizeTicker(payload?.Ticker),
      Name: String(payload?.Name || '').trim(),
      Shares: toFiniteNumber(payload?.Shares, NaN),
      Currency: normalizeCurrency(payload?.Currency),
      CostPrice: toFiniteNumber(payload?.CostPrice, NaN)
    };

    if (!isPortfolioAction(action)) {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    if (!normalizedPayload.Ticker || (action !== 'add' && !normalizedPayload.Broker)) {
      return NextResponse.json({ success: false, error: 'Ticker and broker are required' }, { status: 400 });
    }

    if (action !== 'delete' && (!Number.isFinite(normalizedPayload.Shares) || !Number.isFinite(normalizedPayload.CostPrice))) {
      return NextResponse.json({ success: false, error: 'Shares and cost price must be valid numbers' }, { status: 400 });
    }

    // 1. Read existing CSV
    const records = readPortfolioRecords();

    const updatedRecords = [...records];
    
    if (action === 'add') {
      updatedRecords.push([
        normalizedPayload.Owner,
        normalizedPayload.Broker,
        normalizedPayload.Ticker,
        normalizedPayload.Name,
        normalizedPayload.Shares.toString(),
        normalizedPayload.Currency,
        normalizedPayload.CostPrice.toString()
      ]);
    } else if (action === 'edit') {
      const index = updatedRecords.findIndex(r => normalizeTicker(r[2]) === normalizedPayload.Ticker && getCell(r, 1) === normalizedPayload.Broker);
      if (index !== -1) {
        updatedRecords[index] = [
          normalizedPayload.Owner || updatedRecords[index][0],
          normalizedPayload.Broker || updatedRecords[index][1],
          normalizedPayload.Ticker || updatedRecords[index][2],
          normalizedPayload.Name || updatedRecords[index][3],
          normalizedPayload.Shares.toString(),
          normalizedPayload.Currency,
          normalizedPayload.CostPrice.toString()
        ];
      } else {
        return NextResponse.json({ success: false, error: 'Record not found to edit' }, { status: 404 });
      }
    } else if (action === 'delete') {
      const index = updatedRecords.findIndex(r => normalizeTicker(r[2]) === normalizedPayload.Ticker && getCell(r, 1) === normalizedPayload.Broker);
      if (index !== -1) {
        updatedRecords.splice(index, 1);
      } else {
        return NextResponse.json({ success: false, error: 'Record not found to delete' }, { status: 404 });
      }
    }

    // 2. Write back to CSV
    // Format: 擁有者,交易商,股票代碼,股票名稱,股數,幣別,取得價格,,,,
    writePortfolioRecords(updatedRecords);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error modifying portfolio:', error);
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
