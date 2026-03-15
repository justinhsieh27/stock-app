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
    const tickerArray = Array.from(uniqueTickers);
    const quotes = await yahooFinance.quote(tickerArray);
    
    // Create a map for quick lookup
    const priceMap = new Map<string, number>();
    (quotes as any[]).forEach((quote: any) => {
      if (quote.symbol && quote.regularMarketPrice) {
         // Some TW stocks might need special handling if symbol doesn't match perfectly, 
         // but yahoo-finance2 generally returns the requested symbol
        priceMap.set(quote.symbol, quote.regularMarketPrice);
      }
    });

    // 4. Calculate performance metrics
    let summaryTotalCostTWD = 0;
    let summaryCurrentValueTWD = 0;

    const enrichedPortfolio = portfolio.map(item => {
      const livePrice = priceMap.get(item.Ticker) || item.CostPrice; // Fallback to cost if not found
      
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
