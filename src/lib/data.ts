import type { Index, TickerData } from './types';
const LS = (k: string) => localStorage.getItem('df.' + k) || '';
export const settings = {
  get finnhub() { return LS('finnhub'); }, set finnhub(v: string) { localStorage.setItem('df.finnhub', v.trim()); },
  get workerUrl() { return LS('worker').replace(/\/+$/, ''); }, set workerUrl(v: string) { localStorage.setItem('df.worker', v.trim()); },
  /** Schwab margin rate, percent as typed by the user (e.g. "11.5"). Empty = not set. Never defaulted. */
  get margin() { return LS('margin'); }, set margin(v: string) { localStorage.setItem('df.margin', v.trim()); },
  get marginNote() { return LS('marginNote'); }, set marginNote(v: string) { localStorage.setItem('df.marginNote', v.trim()); },
};
const BASE = './data/';
export async function loadIndex(): Promise<Index> { return (await fetch(BASE + 'index.json')).json(); }
const cache = new Map<string, Promise<TickerData | null>>();
/** Bundled data first; live overrides (Finnhub quote / proxy) are layered on from localStorage. */
export function loadTicker(t: string, bundled: boolean): Promise<TickerData | null> {
  const key = t + (bundled ? ':b' : ':l');
  if (!cache.has(key)) cache.set(key, (async () => {
    let d: TickerData | null = null;
    if (bundled) { try { d = await (await fetch(`${BASE}${t}.json`)).json(); } catch { d = null; } }
    const live = readLive(t);
    if (live && (!d || (live.priceDate ?? '') >= (d.priceDate ?? ''))) d = d ? { ...d, price: live.price, priceDate: live.priceDate, live: live.src } : null;
    const proxied = readProxied(t);
    if (!d && proxied) d = proxied;
    return d;
  })());
  return cache.get(key)!;
}
export const clearTickerCache = () => cache.clear();
type Live = { price: number; priceDate: string; src: string };
export const readLive = (t: string): Live | null => { try { return JSON.parse(localStorage.getItem('df.live.' + t) || 'null'); } catch { return null; } };
const readProxied = (t: string): TickerData | null => { try { return JSON.parse(localStorage.getItem('df.proxy.' + t) || 'null'); } catch { return null; } };

// ---- Finnhub (free tier: /quote and /stock/metric; /stock/dividend is premium) ----
export async function finnhubQuote(t: string): Promise<Live> {
  const k = settings.finnhub; if (!k) throw new Error('No Finnhub key');
  const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(t)}&token=${encodeURIComponent(k)}`);
  if (!r.ok) throw new Error(`Finnhub ${r.status}${r.status === 401 ? ' (check key)' : r.status === 429 ? ' (rate limit)' : ''}`);
  const j = await r.json();
  if (!j.c) throw new Error(`Finnhub has no quote for ${t}`);
  const live = { price: j.c, priceDate: new Date(j.t * 1000).toISOString().slice(0, 10), src: 'Finnhub quote' };
  localStorage.setItem('df.live.' + t, JSON.stringify(live));
  return live;
}
/** Trailing-12-month dividend per share from Finnhub basic financials (free). No schedule/dates. */
export async function finnhubDps(t: string): Promise<number | null> {
  const k = settings.finnhub; if (!k) return null;
  const r = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(t)}&metric=all&token=${encodeURIComponent(k)}`);
  if (!r.ok) return null;
  const m = (await r.json())?.metric ?? {};
  const v = m.dividendPerShareTTM ?? m.dividendPerShareAnnual;
  return typeof v === 'number' && v > 0 ? v : null;
}

// ---- Optional Cloudflare Worker proxy: live dividend history (Yahoo chart) + SEC facts for any ticker ----
export async function proxyTicker(t: string): Promise<TickerData> {
  const w = settings.workerUrl; if (!w) throw new Error('No proxy URL');
  const r = await fetch(`${w}/ticker/${encodeURIComponent(t)}`);
  if (!r.ok) throw new Error(`Proxy ${r.status}`);
  const d: TickerData = await r.json();
  localStorage.setItem('df.proxy.' + t, JSON.stringify(d));
  cache.clear();
  return d;
}
