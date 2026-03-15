"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowDownRight, ArrowUpRight, Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { clsx } from "clsx";

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPortfolio = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portfolio');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || 'Failed to load portfolio data');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolio();
  }, []);

  const formatCurrency = (value: number, currency: string = 'TWD') => {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return new Intl.NumberFormat('zh-TW', {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value / 100);
  };

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <Card className="max-w-md border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="pt-6 text-center text-red-600 dark:text-red-400">
            <p className="mb-4 font-semibold">Error Loading Portfolio</p>
            <p className="text-sm">{error}</p>
            <button 
              onClick={fetchPortfolio}
              className="mt-6 flex items-center gap-2 rounded-md bg-red-100 px-4 py-2 text-sm font-medium hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 transition-colors"
            >
              <RefreshCw className="h-4 w-4" /> Try Again
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Investment Dashboard</h1>
            <p className="text-muted-foreground">Real-time performance overview</p>
          </div>
          <button
            onClick={fetchPortfolio}
            disabled={loading}
            className="flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-900 dark:ring-slate-800 dark:hover:bg-slate-800 transition-all self-start sm:self-auto"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Portfolio Value</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-8 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              ) : (
                <div className="text-2xl font-bold">{formatCurrency(data?.summary?.currentValueTWD)}</div>
              )}
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-8 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              ) : (
                <div className="text-2xl font-bold">{formatCurrency(data?.summary?.totalCostTWD)}</div>
              )}
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Unrealized P/L</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-8 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              ) : (
                <div className={clsx("text-2xl font-bold flex items-center", 
                  (data?.summary?.unrealizedPLTWD ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                )}>
                  {(data?.summary?.unrealizedPLTWD ?? 0) >= 0 ? <ArrowUpRight className="mr-1 h-5 w-5" /> : <ArrowDownRight className="mr-1 h-5 w-5" />}
                  {formatCurrency(Math.abs(data?.summary?.unrealizedPLTWD ?? 0))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Return</CardTitle>
            </CardHeader>
            <CardContent>
               {loading ? (
                <div className="h-8 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              ) : (
                <Badge variant={ (data?.summary?.returnPercent ?? 0) >= 0 ? "default" : "destructive" } className={clsx("text-lg px-3 py-1", 
                    (data?.summary?.returnPercent ?? 0) >= 0 ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400" : ""
                  )}>
                  {formatPercent(data?.summary?.returnPercent ?? 0)}
                </Badge>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Portfolio Table */}
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Holdings</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right">Cost Price</TableHead>
                  <TableHead className="text-right">Live Price</TableHead>
                  <TableHead className="text-right">Current Value</TableHead>
                  <TableHead className="text-right">Unrealized P/L</TableHead>
                  <TableHead className="text-right">Return %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : data?.portfolio?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No holdings found.
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.portfolio?.map((item: any, idx: number) => (
                    <TableRow key={`${item.Ticker}-${idx}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{item.Ticker}</span>
                          <span className="text-xs text-muted-foreground">{item.Name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{item.Shares}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.CostPrice, item.Currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.CurrentPrice, item.Currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.CurrentValue, item.Currency)}</TableCell>
                      <TableCell className={clsx("text-right font-medium", item.UnrealizedPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                        {formatCurrency(item.UnrealizedPL, item.Currency)}
                      </TableCell>
                      <TableCell className="text-right">
                         <Badge variant={ item.ReturnPercent >= 0 ? "default" : "destructive" } className={clsx("ml-auto", 
                            item.ReturnPercent >= 0 ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400" : ""
                          )}>
                          {formatPercent(item.ReturnPercent)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}
