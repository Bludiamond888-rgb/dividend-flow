// Build the full US dividend universe. Usage: DATA_DIR=public/data npx tsx scripts/build-universe.ts [--limit N] [--only T1,T2]
// 1. Listings: Nasdaq Trader symbol directory (nasdaqlisted.txt + otherlisted.txt; Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe).
// 2. Yahoo Finance chart API per symbol (10y daily, events=div): price + dividend history. Keep symbols with a dividend in the last ~13 months.
// 3. Nasdaq.com dividend API for Nasdaq-listed payers: pay/declared dates (time-budgeted, incremental).
// 4. SEC EDGAR XBRL frames (one request per concept per calendar year, all companies): payout-safety inputs for stocks.
// Resilience: throttled concurrency, retries with backoff + global pause on 429, per-symbol keep-last-good, pay dates carried over.
import fs from 'node:fs';
import path from 'node:path';
import { isIrregular, projectHolding } from '../src/lib/income.ts';
import type { Annual, SecMetrics } from '../src/lib/sec.ts';
import { STARTER } from './starter.ts';

const DIR = process.env.DATA_DIR || 'public/data';
const SEC_UA = process.env.SEC_USER_AGENT || 'DividendFlow/1.0 Jackie Lin jackie@localhost';
const WEB_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const LIMIT = +(arg('--limit') ?? 0), ONLY = arg('--only')?.split(',');
const NASDAQ_BUDGET_MS = +(process.env.NASDAQ_BUDGET_MIN ?? 20) * 60e3;
const t0 = Date.now();
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);
const cutoff = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10); // ~13 months
const ymd = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);
const mdy = (s: string) => { const m = /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(s || ''); return m ? `${m[3]}-${m[1]}-${m[2]}` : null; };
fs.mkdirSync(DIR, { recursive: true });
const stats = { listed: 0, candidates: 0, yahooOk: 0, yahooFail: 0, kept: 0, payers: 0, stocks: 0, funds: 0, nasdaqTried: 0, nasdaqOk: 0, secStocks: 0, removed: 0, r429: 0 };

let pauseUntil = 0;
async function get(url: string, headers: Record<string, string>, tries = 4, kind: 'json' | 'text' = 'json'): Promise<any> {
  for (let i = 0; i < tries; i++) {
    const wait = pauseUntil - Date.now(); if (wait > 0) await sleep(wait);
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
      if (r.ok) return kind === 'json' ? await r.json() : await r.text();
      if (r.status === 404) return null;
      if (r.status === 429 || r.status >= 500) { stats.r429 += +(r.status === 429); pauseUntil = Date.now() + 5000 * (i + 1); }
    } catch { /* retry */ }
    await sleep(800 * 2 ** i);
  }
  return null;
}
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>, budgetMs = Infinity) {
  let i = 0; const start = Date.now();
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length && Date.now() - start < budgetMs) await fn(items[i++]); }));
  return i;
}

// ---------- 1. listings ----------
type L = { sym: string; name: string; etf: boolean; exch: string };
async function listings(): Promise<L[]> {
  const nl: string = await get('https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt', { 'User-Agent': WEB_UA }, 4, 'text');
  const ol: string = await get('https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt', { 'User-Agent': WEB_UA }, 4, 'text');
  if (!nl || !ol) throw new Error('listing files unavailable');
  const out: L[] = [];
  const bad = /\b(warrants?|rights?|units?|preferred|notes? due|debentures|depositary shares representing|% |subordinated|trust preferred)\b/i;
  for (const l of nl.split('\n').slice(1)) { const c = l.split('|'); if (c.length < 8 || c[3] !== 'N' || c[7] === 'Y' || bad.test(c[1])) continue; out.push({ sym: c[0], name: c[1], etf: c[6] === 'Y', exch: 'Nasdaq' }); }
  const EX: Record<string, string> = { N: 'NYSE', A: 'NYSE American', P: 'NYSE Arca', Z: 'Cboe', V: 'IEX' };
  for (const l of ol.split('\n').slice(1)) { const c = l.split('|'); if (c.length < 8 || c[6] !== 'N' || /\$/.test(c[0]) || bad.test(c[1])) continue; out.push({ sym: c[0].replace('.', '-'), name: c[1], etf: c[4] === 'Y', exch: EX[c[2]] ?? c[2] }); }
  return out.filter(x => /^[A-Z][A-Z0-9-]{0,7}$/.test(x.sym));
}
const cleanName = (n: string) => n.replace(/\s+(Common Stock|Common Shares|Ordinary Shares|Class [A-C] (Common|Ordinary) (Stock|Shares)|American Depositary Shares.*|- .*)$/i, '').replace(/\s+/g, ' ').trim();

// ---------- 2. Yahoo ----------
type Div = { ex: string; amt: number; pay?: string; declared?: string };
const readOld = (t: string) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, `${t}.json`), 'utf8')); } catch { return null; } };
async function yahoo(l: L) {
  const y = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${l.sym}?range=10y&interval=1d&events=div`, { 'User-Agent': WEB_UA }, 3);
  const res = y?.chart?.result?.[0];
  if (!res?.meta?.regularMarketPrice) return null;
  const m = res.meta;
  const divs: Div[] = Object.values(res.events?.dividends ?? {}).map((d: any) => ({ ex: ymd(d.date), amt: +(+d.amount).toFixed(6) })).sort((a, b) => a.ex.localeCompare(b.ex));
  return { m, divs };
}

// ---------- 4. SEC frames ----------
const CONCEPTS: [string, string][] = [
  ['NetIncomeLoss', 'USD'], ['NetIncomeLossAvailableToCommonStockholdersBasic', 'USD'], ['ProfitLoss', 'USD'], ['NetIncreaseDecreaseInNetAssetsResultingFromOperations', 'USD'],
  ['PaymentsOfDividendsCommonStock', 'USD'], ['PaymentsOfDividends', 'USD'], ['PaymentsOfOrdinaryDividends', 'USD'],
  ['NetCashProvidedByUsedInOperatingActivities', 'USD'], ['PaymentsToAcquirePropertyPlantAndEquipment', 'USD'], ['PaymentsToAcquireProductiveAssets', 'USD'],
  ['CommonStockDividendsPerShareDeclared', 'USD-per-shares'], ['CommonStockDividendsPerShareCashPaid', 'USD-per-shares'],
];
type Facts = Map<number, Map<string, Annual[]>>;
async function secFrames(): Promise<{ facts: Facts; bdc: Set<number>; bank: Set<number> }> {
  const facts: Facts = new Map(); const bdc = new Set<number>(), bank = new Set<number>();
  const y1 = new Date().getFullYear() - 1, years = Array.from({ length: 18 }, (_, i) => y1 - 16 + i);
  const jobs = CONCEPTS.flatMap(([c, u]) => years.map(y => ({ c, u, y })));
  await pool(jobs, 2, async ({ c, u, y }) => {
    await sleep(250);
    const d = await get(`https://data.sec.gov/api/xbrl/frames/us-gaap/${c}/${u}/CY${y}.json`, { 'User-Agent': SEC_UA, 'Accept-Encoding': 'gzip, deflate' }, 3);
    for (const f of d?.data ?? []) {
      let m = facts.get(f.cik); if (!m) facts.set(f.cik, (m = new Map()));
      let rows = m.get(c); if (!rows) m.set(c, (rows = []));
      rows.push({ end: f.end, v: f.val });
    }
  });
  for (const [c, set] of [['InvestmentOwnedAtFairValue', bdc], ['Deposits', bank]] as const) {
    for (const q of [`CY${y1}Q4I`, `CY${y1 - 1}Q4I`]) {
      const d = await get(`https://data.sec.gov/api/xbrl/frames/us-gaap/${c}/USD/${q}.json`, { 'User-Agent': SEC_UA, 'Accept-Encoding': 'gzip, deflate' }, 3);
      for (const f of d?.data ?? []) set.add(f.cik);
    }
  }
  return { facts, bdc, bank };
}
function pick(m: Map<string, Annual[]> | undefined, tags: string[]) {
  let best: { tag: string | null; rows: Annual[] } = { tag: null, rows: [] };
  for (const tag of tags) {
    const rows = (m?.get(tag) ?? []).slice().sort((a, b) => a.end.localeCompare(b.end)); if (!rows.length) continue;
    const last = rows.at(-1)!.end, bl = best.rows.at(-1)?.end ?? '';
    if (last > bl || (last === bl && rows.length > best.rows.length)) best = { tag, rows };
  }
  return best;
}
function secFromFrames(cik: number, F: Awaited<ReturnType<typeof secFrames>>): SecMetrics | null {
  const m = F.facts.get(cik); if (!m) return null;
  const dps = pick(m, ['CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid']);
  const divPaid = pick(m, ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends', 'PaymentsOfOrdinaryDividends']).rows;
  const ni = pick(m, ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss', 'NetIncreaseDecreaseInNetAssetsResultingFromOperations']);
  const ocf = pick(m, ['NetCashProvidedByUsedInOperatingActivities']).rows;
  const cx = pick(m, ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets']);
  const end = [ni.rows.at(-1)?.end, divPaid.at(-1)?.end, dps.rows.at(-1)?.end].filter(Boolean).sort().at(-1) as string | undefined;
  if (!end) return null;
  const t = (r: Annual[]) => r.slice(-18);
  return { fy: +end.slice(0, 4), end, dps: t(dps.rows), dpsTag: dps.tag, divPaid: t(divPaid), netIncome: t(ni.rows), ocf: t(ocf), capex: t(cx.rows), niTag: ni.tag, capexTag: cx.tag,
    bdc: ni.tag === 'NetIncreaseDecreaseInNetAssetsResultingFromOperations' || F.bdc.has(cik), bank: F.bank.has(cik) };
}

// ---------- main ----------
const lst = await listings();
stats.listed = lst.length;
const seen = new Set<string>();
let cands = lst.filter(l => !seen.has(l.sym) && seen.add(l.sym));
if (ONLY) cands = cands.filter(l => ONLY.includes(l.sym));
if (LIMIT) cands = cands.slice(0, LIMIT);
stats.candidates = cands.length;
console.log(`listings: ${stats.listed}, candidates: ${cands.length}`);

const secTickers = await get('https://www.sec.gov/files/company_tickers.json', { 'User-Agent': SEC_UA, 'Accept-Encoding': 'gzip, deflate' });
const cikOf = new Map<string, number>(); for (const x of Object.values(secTickers ?? {}) as any[]) if (!cikOf.has(x.ticker)) cikOf.set(String(x.ticker).replace('.', '-'), x.cik_str);

const recs = new Map<string, any>();
await pool(cands, 6, async l => {
  const old = readOld(l.sym);
  const y = await yahoo(l);
  if (!y) { stats.yahooFail++; if (old && (old.divs?.at(-1)?.ex ?? '') >= cutoff) { recs.set(l.sym, old); stats.kept++; } return; }
  stats.yahooOk++;
  if ((y.divs.at(-1)?.ex ?? '') < cutoff) return; // not a current dividend payer
  // carry over pay/declared dates from last week's file
  const oldBy = new Map<string, Div>((old?.divs ?? []).map((d: Div) => [d.ex, d]));
  for (const d of y.divs) { const o = oldBy.get(d.ex); if (o?.pay) d.pay = o.pay; if (o?.declared) d.declared = o.declared; }
  for (const o of old?.divs ?? []) if (o.ex > (y.divs.at(-1)?.ex ?? '') && o.pay) y.divs.push(o); // announced, not yet in Yahoo
  const type = y.m.instrumentType === 'ETF' || y.m.instrumentType === 'MUTUALFUND' || l.etf ? 'fund' : 'stock';
  recs.set(l.sym, {
    ticker: l.sym, name: y.m.longName || y.m.shortName || cleanName(l.name), type, currency: y.m.currency, exchange: l.exch,
    price: y.m.regularMarketPrice, priceDate: ymd(y.m.regularMarketTime), cik: type === 'stock' ? cikOf.get(l.sym) ?? null : null,
    divs: y.divs.slice(-120), paySource: old?.paySource ?? null, sec: old?.sec ?? null, fetched: new Date().toISOString(),
    sources: { price: 'Yahoo Finance chart API', dividends: 'Yahoo Finance chart API (ex-dates, amounts)' + (old?.paySource ? '; Nasdaq.com (payment dates)' : ''), safety: old?.sec ? 'SEC EDGAR XBRL' : null },
  });
});
console.log(`yahoo done in ${((Date.now() - t0) / 1000) | 0}s: ok ${stats.yahooOk}, fail ${stats.yahooFail}, payers ${recs.size}`);

// 3. Nasdaq pay dates (Nasdaq-listed payers; latest payment first lacking a pay date)
const nq = [...recs.values()].filter(r => r.exchange === 'Nasdaq').sort((a, b) => +!!a.divs.at(-1)?.pay - +!!b.divs.at(-1)?.pay);
const nqStart = Date.now();
await pool(nq, 3, async r => {
  stats.nasdaqTried++;
  const n = await get(`https://api.nasdaq.com/api/quote/${r.ticker}/dividends?assetclass=${r.type === 'fund' ? 'etf' : 'stocks'}`, { 'User-Agent': WEB_UA, Accept: 'application/json' }, 2);
  const rows = n?.data?.dividends?.rows; if (!rows?.length) return;
  stats.nasdaqOk++;
  for (const x of rows) {
    const ex = mdy(x.exOrEffDate), pay = mdy(x.paymentDate), dec = mdy(x.declarationDate); if (!ex) continue;
    const amt = parseFloat(String(x.amount).replace(/[$,]/g, ''));
    const d = r.divs.find((v: Div) => Math.abs(Date.parse(v.ex) - Date.parse(ex)) <= 3 * 864e5);
    if (d) { if (pay) d.pay = pay; if (dec) d.declared = dec; }
    else if (ex > (r.divs.at(-1)?.ex ?? '') && isFinite(amt) && amt > 0) r.divs.push({ ex, amt, ...(pay ? { pay } : {}), ...(dec ? { declared: dec } : {}) });
  }
  r.paySource = 'nasdaq'; r.sources.dividends = 'Yahoo Finance chart API (ex-dates, amounts); Nasdaq.com (payment dates)';
}, NASDAQ_BUDGET_MS);
console.log(`nasdaq: ${stats.nasdaqOk}/${stats.nasdaqTried} of ${nq.length} in ${((Date.now() - nqStart) / 1000) | 0}s`);

// 4. SEC frames for stocks (starter tickers keep their richer companyfacts-based data from refresh-data.ts)
const secT = Date.now();
const F = await secFrames();
for (const r of recs.values()) {
  if (r.type !== 'stock' || !r.cik || STARTER.includes(r.ticker)) continue;
  const s = secFromFrames(r.cik, F);
  if (s) { r.sec = s; r.sources.safety = 'SEC EDGAR XBRL frames (10-K/annual)'; stats.secStocks++; }
}
console.log(`sec frames: ${F.facts.size} companies in ${((Date.now() - secT) / 1000) | 0}s; ${stats.secStocks} payers matched`);

// write files + compact index
const rows: (string | number)[][] = [];
const lags: Record<string, number[]> = { stock: [], fund: [] }; const lagFrom: string[] = [];
for (const r of recs.values()) {
  r.divs.sort((a: Div, b: Div) => a.ex.localeCompare(b.ex));
  if (STARTER.includes(r.ticker)) { const o = readOld(r.ticker); if (o?.sec?.fy) { r.sec = o.sec; r.cik = o.cik; r.sources.safety = o.sources?.safety ?? r.sources.safety; } }
  fs.writeFileSync(path.join(DIR, `${r.ticker}.json`), JSON.stringify(r));
  const p = projectHolding({ id: 'x', ticker: r.ticker, shares: 1, cost: 0, drip: false }, r, today);
  const yld = r.price ? p.dpsAnnual / r.price : 0;
  const irr = isIrregular(r.divs, yld, today);
  rows.push(irr ? [r.ticker, r.name, r.type === 'fund' ? 'F' : 'S', +yld.toFixed(4), r.price, 1] : [r.ticker, r.name, r.type === 'fund' ? 'F' : 'S', +yld.toFixed(4), r.price]);
  const l = r.divs.filter((d: Div) => d.pay).slice(-8).map((d: Div) => (Date.parse(d.pay!) - Date.parse(d.ex)) / 864e5).filter((x: number) => x >= 0 && x < 120);
  if (l.length) { lags[r.type].push(...l); lagFrom.push(r.ticker); }
  r.type === 'fund' ? stats.funds++ : stats.stocks++;
}
stats.payers = rows.length;
rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
// remove files for symbols that stopped paying / delisted (never the starter set). Only when the run was healthy.
if (!ONLY && !LIMIT && stats.yahooOk > cands.length * 0.8) {
  const keep = new Set([...rows.map(r => String(r[0])), ...STARTER]);
  for (const f of fs.readdirSync(DIR)) { const t = f.replace(/\.json$/, ''); if (f.endsWith('.json') && /^[A-Z][A-Z0-9-]*$/.test(t) && !keep.has(t)) { fs.unlinkSync(path.join(DIR, f)); stats.removed++; } }
}
const prevU = (() => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'universe.json'), 'utf8')); } catch { return null; } })();
if (ONLY || LIMIT) { for (const r of prevU?.rows ?? []) if (!rows.some(x => x[0] === r[0])) rows.push(r); rows.sort((a, b) => String(a[0]).localeCompare(String(b[0]))); }
if (!ONLY && !LIMIT && prevU && rows.length < prevU.rows.length * 0.7) { console.error(`Refusing to shrink universe from ${prevU.rows.length} to ${rows.length}; keeping previous index`); }
else fs.writeFileSync(path.join(DIR, 'universe.json'), JSON.stringify({ updated: new Date().toISOString(), asOf: today, fields: ['ticker', 'name', 'type', 'yield', 'price'], rows }));
// default ex->pay lag for symbols without published pay dates, from every published pay date in the universe
const med = (a: number[]) => { if (!a.length) return null; const z = [...a].sort((x, y) => x - y); return z[z.length >> 1]; };
try {
  const ip = path.join(DIR, 'index.json'); const idx = JSON.parse(fs.readFileSync(ip, 'utf8'));
  if (lags.stock.length + lags.fund.length > 50) idx.lag = { stock: med(lags.stock), fund: med(lags.fund), n: lags.stock.length + lags.fund.length, from: lagFrom.length > 12 ? [`${lagFrom.length} Nasdaq-listed payers`] : lagFrom };
  idx.universe = { count: rows.length, asOf: today };
  fs.writeFileSync(ip, JSON.stringify(idx));
} catch (e) { console.warn('index.json not updated', e); }
console.log('STATS', JSON.stringify({ ...stats, seconds: ((Date.now() - t0) / 1000) | 0 }));
fs.writeFileSync(path.join(DIR, 'universe-stats.json'), JSON.stringify({ ...stats, seconds: ((Date.now() - t0) / 1000) | 0, finished: new Date().toISOString() }));
