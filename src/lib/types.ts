import type { SecMetrics } from './sec';
export type Div = { ex: string; amt: number; pay?: string; declared?: string; src?: string };
export type TickerData = {
  ticker: string; name: string; type: 'stock' | 'fund'; currency?: string; exchange?: string;
  price: number | null; priceDate: string | null; cik?: number | null;
  divs: Div[]; paySource?: string | null; sec: (SecMetrics & { note?: string; cik?: number }) | null; fetched?: string;
  sources?: { price?: string; dividends?: string; safety?: string | null };
  live?: string; // set when price was refreshed live (e.g. 'Finnhub quote 2026-10-21')
};
/** Manual dividend schedule for tickers without bundled history. */
export type ManualDiv = { amount: number; freq: 1 | 2 | 4 | 12; months: number[] /* 1-12 pay months */ };
export type Holding = { id: string; ticker: string; shares: number; cost: number /* total cost basis $ */; drip: boolean; manual?: ManualDiv | null };
export type Cpi = { yoy: number; index: number; indexYearAgo: number; period: string; series: string; source: string; fetched: string };
export type Lag = { stock: number | null; fund: number | null; n: number; from?: string[] };
export type Index = { updated: string; tickers: { ticker: string; name: string; type: 'stock' | 'fund'; price: number; priceDate: string }[]; cpi: Cpi | null; lag?: Lag; universe?: { count: number; asOf: string } };
