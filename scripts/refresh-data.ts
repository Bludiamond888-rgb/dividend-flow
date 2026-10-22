// Refresh bundled static data. Usage: npx tsx scripts/refresh-data.ts [TICKER ...]
// Sources (all keyless): Yahoo Finance chart API (last price + ex-dividend history),
// Nasdaq.com dividend API (declared/record/payment dates; Nasdaq-listed symbols only),
// SEC EDGAR companyfacts (payout safety, stocks only), BLS public API v2 (CPI-U, CUUR0000SA0).
import fs from 'node:fs';
import { secMetrics } from '../src/lib/sec.ts';
const SEC_UA = process.env.SEC_USER_AGENT || 'DividendFlow/1.0 Jackie Lin jackie@localhost';
const WEB_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
export const STARTER = ['KO','PEP','JNJ','PG','O','MO','VZ','T','ABBV','XOM','CVX','JPM','MAIN','HD','MCD','PFE','IBM','CSCO','TXN','LMT','UPS','NEE','ARCC',
  'SCHD','VYM','JEPI','JEPQ','QYLD','SPYD','DIVO','DGRO','VIG','HDV'];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function get(url: string, headers: Record<string, string>, tries = 4, init?: RequestInit): Promise<any> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(25000), ...init, headers: { ...headers, ...(init?.headers as any) } });
      if (r.ok) return r.json();
      console.warn(url, r.status);
    } catch (e) { console.warn(url, String(e)); }
    await sleep(1500 * (i + 1));
  }
  return null;
}
const ymd = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);
const mdy = (s: string) => { const m = /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(s || ''); return m ? `${m[3]}-${m[1]}-${m[2]}` : null; };
const out = 'public/data';
fs.mkdirSync(out, { recursive: true });
const args = process.argv.slice(2);
const list = args.length ? args : STARTER;
const prevIndex = fs.existsSync(`${out}/index.json`) ? JSON.parse(fs.readFileSync(`${out}/index.json`, 'utf8')) : null;
const secTickers = await get('https://www.sec.gov/files/company_tickers.json', { 'User-Agent': SEC_UA, 'Accept-Encoding': 'gzip, deflate' });
const cikOf = (t: string) => secTickers && (Object.values(secTickers) as any[]).find(x => x.ticker === t)?.cik_str as number | undefined;
// Holding-company reorganizations: the new registrant has no 10-K yet, so annual facts still live under the predecessor CIK.
const PREDECESSOR_CIK: Record<string, number> = { XOM: 34088 /* Exxon Mobil Corp, predecessor of ExxonMobil Holdings Corp (2026) */ };
const summaries: any[] = [];
let failures = 0;
for (const t of list) {
  const file = `${out}/${t}.json`;
  const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const y = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?range=20y&interval=1d&events=div`, { 'User-Agent': WEB_UA });
  const res = y?.chart?.result?.[0];
  if (!res) { console.warn('Yahoo failed for', t, old ? '(keeping previous file)' : ''); failures++; if (old) summaries.push(summary(old)); continue; }
  const m = res.meta;
  const type = m.instrumentType === 'ETF' || m.instrumentType === 'MUTUALFUND' ? 'fund' : 'stock';
  const divs: any[] = Object.values(res.events?.dividends ?? {}).map((d: any) => ({ ex: ymd(d.date), amt: +d.amount.toFixed(6) }))
    .sort((a, b) => a.ex.localeCompare(b.ex));
  // Nasdaq: exact payment dates (only for Nasdaq-listed symbols)
  await sleep(400);
  const n = await get(`https://api.nasdaq.com/api/quote/${t}/dividends?assetclass=${type === 'fund' ? 'etf' : 'stocks'}`, { 'User-Agent': WEB_UA, Accept: 'application/json' }, 2);
  let paySource: string | null = null;
  for (const r of n?.data?.dividends?.rows ?? []) {
    const ex = mdy(r.exOrEffDate), pay = mdy(r.paymentDate), dec = mdy(r.declarationDate);
    const amt = parseFloat(String(r.amount).replace(/[$,]/g, ''));
    if (!ex) continue;
    const d = divs.find(x => Math.abs(Date.parse(x.ex) - Date.parse(ex)) <= 3 * 864e5);
    if (d) { if (pay) d.pay = pay; if (dec) d.declared = dec; paySource = 'nasdaq'; }
    else if (Date.parse(ex) > Date.parse(divs.at(-1)?.ex ?? '1900-01-01') && isFinite(amt)) { divs.push({ ex, amt, ...(pay ? { pay } : {}), ...(dec ? { declared: dec } : {}), src: 'nasdaq' }); paySource = 'nasdaq'; }
  }
  divs.sort((a, b) => a.ex.localeCompare(b.ex));
  let sec = null;
  const cik = cikOf(t);
  if (type === 'stock' && cik) {
    await sleep(300);
    const raw = await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`, { 'User-Agent': SEC_UA, 'Accept-Encoding': 'gzip, deflate' });
    if (raw) sec = secMetrics(raw);
    if ((!sec || !sec.fy) && PREDECESSOR_CIK[t]) {
      await sleep(300);
      const r2 = await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(PREDECESSOR_CIK[t]).padStart(10, '0')}.json`, { 'User-Agent': SEC_UA, 'Accept-Encoding': 'gzip, deflate' });
      if (r2) sec = { ...secMetrics(r2), cik: PREDECESSOR_CIK[t], note: 'Annual figures from the predecessor registrant ' + r2.entityName } as any;
    }
    if ((!sec || !sec.fy) && old?.sec?.fy) sec = old.sec;
  }
  const rec = {
    ticker: t, name: m.longName || m.shortName || t, type, currency: m.currency, exchange: m.fullExchangeName,
    price: m.regularMarketPrice, priceDate: ymd(m.regularMarketTime), cik: cik ?? null,
    divs: divs.slice(-120), paySource, sec, fetched: new Date().toISOString(),
    sources: { price: 'Yahoo Finance chart API', dividends: 'Yahoo Finance chart API (ex-dates, amounts)' + (paySource ? '; Nasdaq.com (payment dates)' : ''), safety: sec ? 'SEC EDGAR companyfacts' : null },
  };
  fs.writeFileSync(file, JSON.stringify(rec));
  summaries.push(summary(rec));
  console.log(t, type, rec.price, rec.priceDate, divs.length, 'divs', paySource ?? '', sec ? `sec FY${sec.fy}` : '');
}
function summary(r: any) { return { ticker: r.ticker, name: r.name, type: r.type, price: r.price, priceDate: r.priceDate }; }
// CPI-U YoY from BLS (no key: v2 endpoint allows limited daily queries)
const yr = new Date().getFullYear();
let cpi = prevIndex?.cpi ?? null;
const b = await get('https://api.bls.gov/publicAPI/v2/timeseries/data/', { 'Content-Type': 'application/json' }, 3,
  { method: 'POST', body: JSON.stringify({ seriesid: ['CUUR0000SA0'], startyear: String(yr - 2), endyear: String(yr) }) });
const rows: any[] = b?.Results?.series?.[0]?.data ?? [];
const val = (y: number, p: string) => rows.find(r => +r.year === y && r.period === p)?.value;
const latest = rows.find(r => /^M\d\d$/.test(r.period) && r.period !== 'M13');
if (latest && val(+latest.year - 1, latest.period)) {
  const now = +latest.value, ago = +val(+latest.year - 1, latest.period);
  cpi = { yoy: +(now / ago - 1).toFixed(5), index: now, indexYearAgo: ago, period: `${latest.periodName} ${latest.year}`, series: 'CUUR0000SA0 (CPI-U, all items, U.S. city average, NSA)', source: 'U.S. Bureau of Labor Statistics public API', fetched: new Date().toISOString() };
  console.log('CPI', cpi.period, (cpi.yoy * 100).toFixed(2) + '%');
} else console.warn('BLS CPI fetch failed; keeping previous', cpi?.period);
const order = (t: string) => STARTER.indexOf(t) < 0 ? 999 : STARTER.indexOf(t);
const keep = (prevIndex?.tickers ?? []).filter((s: any) => !summaries.some(x => x.ticker === s.ticker));
const all = [...keep, ...summaries].sort((a, b) => order(a.ticker) - order(b.ticker));
// Default ex-to-pay lag (days) for symbols without published pay dates: median of the known lags in this bundle (from Nasdaq data).
const lags: Record<string, number[]> = { stock: [], fund: [] }; const lagFrom: string[] = [];
for (const s of all) {
  const r = JSON.parse(fs.readFileSync(`${out}/${s.ticker}.json`, 'utf8'));
  const l = r.divs.filter((d: any) => d.pay).slice(-8).map((d: any) => (Date.parse(d.pay) - Date.parse(d.ex)) / 864e5).filter((x: number) => x >= 0 && x < 120);
  if (l.length) { lags[r.type].push(...l); lagFrom.push(r.ticker); }
}
const med = (a: number[]) => { if (!a.length) return null; const z = [...a].sort((x, y) => x - y); return z[z.length >> 1]; };
const lag = { stock: med(lags.stock), fund: med(lags.fund), n: lags.stock.length + lags.fund.length, from: lagFrom };
console.log('default pay lag', lag);
fs.writeFileSync(`${out}/index.json`, JSON.stringify({ updated: new Date().toISOString(), tickers: all, cpi, lag }));
if (failures === list.length) { console.error('All market-data fetches failed'); process.exit(1); }
