"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowDownRight, ArrowUpRight, Loader2, RefreshCw, TrendingUp, Plus, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { clsx } from "clsx";
import { PortfolioDialog } from "@/components/PortfolioDialog";

type PortfolioItem = {
  Owner?: string;
  Broker?: string;
  Ticker?: string;
  Name?: string;
  Shares?: number;
  Currency?: string;
  CostPrice?: number;
  CurrentPrice?: number;
  CurrentValue?: number;
  UnrealizedPL?: number;
  ReturnPercent?: number;
  CurrentValueTWD?: number;
};

type PortfolioData = {
  portfolio: PortfolioItem[];
  summary: {
    totalCostTWD?: number;
    currentValueTWD?: number;
    unrealizedPLTWD?: number;
    returnPercent?: number;
    exchangeRateUSDToTWD?: number;
    exchangeRateUSDTOSGD?: number;
    exchangeRateUSDTOJPY?: number;
  };
};

type LegendEntry = {
  payload?: {
    value?: number;
  };
};

const SUPPORTED_CURRENCIES = new Set(['USD', 'TWD', 'SGD', 'JPY']);

export default function Dashboard() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PortfolioItem | null>(null);
  const [showPieAmount, setShowPieAmount] = useState(false);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof PortfolioItem;
    direction: 'asc' | 'desc';
  } | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);

  const fetchPortfolio = useCallback(async () => {
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portfolio', {
        cache: 'no-store',
        signal: controller.signal,
      });
      const contentType = res.headers.get('content-type') || '';
      const json = contentType.includes('application/json')
        ? await res.json()
        : { success: false, error: await res.text() };

      if (controller.signal.aborted) return;

      if (res.ok && json.success) {
        setData({
          portfolio: Array.isArray(json.data?.portfolio) ? json.data.portfolio : [],
          summary: json.data?.summary || {},
        });
      } else {
        setError(json.error || 'Failed to load portfolio data');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load portfolio data');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  const handleDelete = async (item: PortfolioItem) => {
    if (!confirm(`Are you sure you want to delete ${item.Ticker} (${item.Broker})?`)) return;
    try {
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", payload: item }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        fetchPortfolio();
      } else {
        setError(json.error || 'Failed to delete holding');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete holding');
    }
  };

  useEffect(() => {
    fetchPortfolio();
    return () => {
      activeRequestRef.current?.abort();
    };
  }, [fetchPortfolio]);

  const requestSort = (key: keyof PortfolioItem) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig && sortConfig.key === key) {
      if (sortConfig.direction === 'asc') {
        direction = 'desc';
      } else {
        direction = null;
      }
    }
    if (direction) {
      setSortConfig({ key, direction });
    } else {
      setSortConfig(null);
    }
  };

  const sortedPortfolio = useMemo(() => {
    if (!data?.portfolio) return [];
    const items = [...data.portfolio];
    if (!sortConfig) return items;

    return items.sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      if (aVal === undefined && bVal === undefined) return 0;
      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc'
          ? aVal.localeCompare(bVal, 'zh-TW', { numeric: true })
          : bVal.localeCompare(aVal, 'zh-TW', { numeric: true });
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });
  }, [data?.portfolio, sortConfig]);

  const pieData = useMemo(() => {
    if (!data?.portfolio) return [];
    
    const allocation = data.portfolio.reduce<Record<string, number>>((acc, item) => {
      const currency = item.Currency || 'USD';
      const twdValue = Number.isFinite(item.CurrentValueTWD) ? item.CurrentValueTWD || 0 : 0;
      acc[currency] = (acc[currency] || 0) + twdValue;
      return acc;
    }, {});
    
    return Object.entries(allocation).map(([name, value]) => ({
      name,
      value: value as number,
    })).sort((a, b) => b.value - a.value);
  }, [data]);

  const CURRENCY_COLORS: Record<string, string> = {
    USD: '#6366f1', // indigo-500
    TWD: '#10b981', // emerald-500
    SGD: '#f59e0b', // amber-500
    JPY: '#ef4444', // red-500
  };
  const DEFAULT_COLORS = ['#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const formatCurrency = (value?: number, currency: string = 'TWD') => {
    const safeValue = Number.isFinite(value) ? value || 0 : 0;
    const safeCurrency = SUPPORTED_CURRENCIES.has(currency) ? currency : 'TWD';
    const fractionDigits = safeCurrency === 'JPY' ? 0 : 2;
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency: safeCurrency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(safeValue);
  };

  const formatPercent = (value?: number) => {
    const safeValue = Number.isFinite(value) ? value || 0 : 0;
    return new Intl.NumberFormat('zh-TW', {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeValue / 100);
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              <p className="text-muted-foreground">Real-time performance overview</p>
              {!loading && data?.summary?.exchangeRateUSDToTWD && (
                <div className="flex flex-wrap gap-2 mt-1">
                  <Badge variant="secondary" className="font-normal text-xs text-muted-foreground">
                    1 USD = {data.summary.exchangeRateUSDToTWD.toFixed(2)} TWD
                  </Badge>
                  {data?.summary?.exchangeRateUSDTOSGD && data?.summary?.exchangeRateUSDToTWD && (
                    <Badge variant="secondary" className="font-normal text-xs text-muted-foreground">
                      1 SGD = {(data.summary.exchangeRateUSDToTWD / data.summary.exchangeRateUSDTOSGD).toFixed(2)} TWD
                    </Badge>
                  )}
                  {data?.summary?.exchangeRateUSDTOJPY && data?.summary?.exchangeRateUSDToTWD && (
                    <Badge variant="secondary" className="font-normal text-xs text-muted-foreground">
                      1 JPY = {(data.summary.exchangeRateUSDToTWD / data.summary.exchangeRateUSDTOJPY).toFixed(4)} TWD
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
            <button
              onClick={() => {
                setEditingItem(null);
                setDialogOpen(true);
              }}
              className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-all"
            >
              <Plus className="h-4 w-4" /> Add Holding
            </button>
            <button
              onClick={fetchPortfolio}
              disabled={loading}
              className="flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-900 dark:ring-slate-800 dark:hover:bg-slate-800 transition-all"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
          </div>
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

        {/* Currency Allocation Chart */}
        {!loading && pieData.length > 0 && (
          <div className="flex">
            <Card className="w-full md:w-1/2 lg:w-1/3">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Asset Allocation</CardTitle>
                <button
                  onClick={() => setShowPieAmount(!showPieAmount)}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 px-2 py-1 rounded transition-colors"
                >
                  {showPieAmount ? 'Show %' : 'Show Amount'}
                </button>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        labelLine={false}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CURRENCY_COLORS[entry.name] || DEFAULT_COLORS[index % DEFAULT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: unknown) => formatCurrency(Number(value))}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Legend 
                        formatter={(value, entry: unknown) => {
                          const payload = (entry as LegendEntry)?.payload;
                          const payloadValue = Number.isFinite(payload?.value) ? payload?.value || 0 : 0;
                          const total = pieData.reduce((acc, curr) => acc + curr.value, 0);
                          const percent = total > 0 ? (payloadValue / total) * 100 : 0;
                          
                          if (showPieAmount) {
                            return <span className="text-sm font-medium ml-1 text-slate-700 dark:text-slate-300">{`${value} (${formatCurrency(payloadValue)})`}</span>;
                          }
                          return <span className="text-sm font-medium ml-1 text-slate-700 dark:text-slate-300">{`${value} (${percent.toFixed(1)}%)`}</span>;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Portfolio Table */}
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Holdings</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    onClick={() => requestSort('Ticker')} 
                    className="cursor-pointer select-none hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100 transition-colors group"
                  >
                    <div className="flex items-center gap-1">
                      <span>Asset</span>
                      {sortConfig?.key === 'Ticker' ? (
                        sortConfig.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> : <ArrowDown className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    onClick={() => requestSort('Shares')} 
                    className="text-right cursor-pointer select-none hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100 transition-colors group"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Shares</span>
                      {sortConfig?.key === 'Shares' ? (
                        sortConfig.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> : <ArrowDown className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    onClick={() => requestSort('CostPrice')} 
                    className="text-right cursor-pointer select-none hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100 transition-colors group"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Cost Price</span>
                      {sortConfig?.key === 'CostPrice' ? (
                        sortConfig.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> : <ArrowDown className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    onClick={() => requestSort('CurrentPrice')} 
                    className="text-right cursor-pointer select-none hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100 transition-colors group"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Live Price</span>
                      {sortConfig?.key === 'CurrentPrice' ? (
                        sortConfig.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> : <ArrowDown className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    onClick={() => requestSort('CurrentValue')} 
                    className="text-right cursor-pointer select-none hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100 transition-colors group"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Current Value</span>
                      {sortConfig?.key === 'CurrentValue' ? (
                        sortConfig.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> : <ArrowDown className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    onClick={() => requestSort('UnrealizedPL')} 
                    className="text-right cursor-pointer select-none hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100 transition-colors group"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Unrealized P/L</span>
                      {sortConfig?.key === 'UnrealizedPL' ? (
                        sortConfig.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> : <ArrowDown className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    onClick={() => requestSort('ReturnPercent')} 
                    className="text-right cursor-pointer select-none hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100 transition-colors group"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Return %</span>
                      {sortConfig?.key === 'ReturnPercent' ? (
                        sortConfig.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> : <ArrowDown className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : sortedPortfolio.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No holdings found.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedPortfolio.map((item: PortfolioItem, idx: number) => {
                    const unrealizedPL = item.UnrealizedPL ?? 0;
                    const returnPercent = item.ReturnPercent ?? 0;

                    return (
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
                        <TableCell className={clsx("text-right font-medium", unrealizedPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                          {formatCurrency(unrealizedPL, item.Currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={ returnPercent >= 0 ? "default" : "destructive" } className={clsx("ml-auto", 
                              returnPercent >= 0 ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400" : ""
                            )}>
                            {formatPercent(returnPercent)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => { setEditingItem(item); setDialogOpen(true); }} className="text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleDelete(item)} className="text-slate-500 hover:text-red-600 dark:hover:text-red-400">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
      <PortfolioDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialData={editingItem}
        onSuccess={fetchPortfolio}
      />
    </div>
  );
}
