import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import _yahooFinance from 'yahoo-finance2';

const yahooFinance = new _yahooFinance();

// Prevent Next.js from aggressively caching this API route
export const dynamic = 'force-dynamic';
export const revalidate = 60; // optionally revalidate every 60 seconds

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

export async function GET() {
  try {
    // 1. Read and parse the CSV
    const csvFilePath = path.join(process.cwd(), 'STOCK.csv');
    const fileContent = fs.readFileSync(csvFilePath, 'utf-8');
    
    // Parse CSV (skip header, handle empty lines)
    const records = parse(fileContent, {
      columns: false,
      skip_empty_lines: true,
      relax_column_count: true, // Handle those trailing commas
      from_line: 2 // Skip header
    });

    const portfolio: PortfolioItem[] = [];
    const uniqueTickers = new Set<string>();

    records.forEach((row: any[]) => {
      // row format based on STOCK.csv:
      // [Owner, Broker, Ticker, Name, Shares, Currency, CostPrice, ...]
      if (row.length >= 7 && row[2]) {
        const shares = parseFloat(row[4]);
        const costPrice = parseFloat(row[6]);
        const ticker = row[2].trim();
        
        if (!isNaN(shares) && !isNaN(costPrice)) {
          portfolio.push({
            Owner: row[0].trim(),
            Broker: row[1].trim(),
            Ticker: ticker,
            Name: row[3].trim(),
            Shares: shares,
            Currency: row[5].trim(),
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

    // 2. Fetch Exchange Rate (USD to TWD)
    let usdToTwdRate = 30; // fallback
    try {
      const fxResult: any = await yahooFinance.quote('TWD=X'); // or USDTWD=X
      if (fxResult && fxResult.regularMarketPrice) {
        usdToTwdRate = fxResult.regularMarketPrice;
      } else {
         const altFxResult: any = await yahooFinance.quote('USDTWD=X');
         if (altFxResult && altFxResult.regularMarketPrice) {
            usdToTwdRate = altFxResult.regularMarketPrice;
         }
      }
    } catch (fxError) {
      console.error('Error fetching exchange rate:', fxError);
    }

    // 3. Fetch live stock prices
    const tickerArray = Array.from(uniqueTickers).filter(t => t.toLowerCase() !== 'cash');
    const priceMap = new Map<string, number>();
    
    if (tickerArray.length > 0) {
      const quotes: any = await yahooFinance.quote(tickerArray);
      // yahoo-finance2 returns a single object if only one ticker is requested, or an array for multiple
      const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
      
      quotesArray.forEach((quote: any) => {
        if (quote && quote.symbol && quote.regularMarketPrice) {
          priceMap.set(quote.symbol, quote.regularMarketPrice);
        }
      });
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
      const fxRate = item.Currency === 'USD' ? usdToTwdRate : 1;
      
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
          exchangeRateUSDToTWD: usdToTwdRate
        }
      }
    });

  } catch (error: any) {
    console.error('Error processing portfolio:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, payload } = body;

    // 1. Read existing CSV
    const csvFilePath = path.join(process.cwd(), 'STOCK.csv');
    const fileContent = fs.readFileSync(csvFilePath, 'utf-8');
    const records = parse(fileContent, {
      columns: false,
      skip_empty_lines: true,
      relax_column_count: true,
      from_line: 2 // Skip header
    });

    let updatedRecords = [...records];
    
    if (action === 'add') {
      updatedRecords.push([
        payload.Owner || '',
        payload.Broker || '',
        payload.Ticker || '',
        payload.Name || '',
        payload.Shares?.toString() || '0',
        payload.Currency || 'USD',
        payload.CostPrice?.toString() || '0'
      ]);
    } else if (action === 'edit') {
      const index = updatedRecords.findIndex(r => r[2] === payload.Ticker && r[1] === payload.Broker);
      if (index !== -1) {
        updatedRecords[index] = [
          payload.Owner || updatedRecords[index][0],
          payload.Broker || updatedRecords[index][1],
          payload.Ticker || updatedRecords[index][2],
          payload.Name || updatedRecords[index][3],
          payload.Shares?.toString() || updatedRecords[index][4],
          payload.Currency || updatedRecords[index][5],
          payload.CostPrice?.toString() || updatedRecords[index][6]
        ];
      } else {
        return NextResponse.json({ success: false, error: 'Record not found to edit' }, { status: 404 });
      }
    } else if (action === 'delete') {
      const index = updatedRecords.findIndex(r => r[2] === payload.Ticker && r[1] === payload.Broker);
      if (index !== -1) {
        updatedRecords.splice(index, 1);
      } else {
        return NextResponse.json({ success: false, error: 'Record not found to delete' }, { status: 404 });
      }
    } else {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    // 2. Write back to CSV
    // Format: 擁有者,交易商,股票代碼,股票名稱,股數,幣別,取得價格,,,,
    const header = '擁有者,交易商,股票代碼,股票名稱,股數,幣別,取得價格,,,,';
    const csvLines = [header];
    
    for (const record of updatedRecords) {
      // pad with empty columns if necessary to make 11 columns in total
      const paddedRecord = [...record];
      while (paddedRecord.length < 11) {
        paddedRecord.push('');
      }
      csvLines.push(paddedRecord.join(','));
    }
    
    fs.writeFileSync(csvFilePath, csvLines.join('\n') + '\n', 'utf-8');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error modifying portfolio:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
