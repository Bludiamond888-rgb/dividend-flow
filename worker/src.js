// Dividend Flow data proxy (Cloudflare Worker) — optional.
// GET /ticker/:SYMBOL -> { ticker, name, type, price, priceDate, divs[], sec } in the same shape as the bundled public/data files.
// Sources: Yahoo Finance chart API (price + dividend history), SEC EDGAR companyfacts (stocks). Cached at the edge for 6h.
const SEC_UA = 'DividendFlow/1.0 Jackie Lin jackie@localhost';
const WEB_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
const ALLOWED = [/^https:\/\/bludiamond888-rgb\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
const cors = o => ({ 'Access-Control-Allow-Origin': o && ALLOWED.some(r => r.test(o)) ? o : 'https://bludiamond888-rgb.github.io', 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' });
const ymd = s => new Date(s * 1000).toISOString().slice(0, 10);
function annual(raw, tags, units = ['USD']) {
  const g = raw?.facts?.['us-gaap'] ?? {}; let best = { tag: null, rows: [] };
  for (const tag of tags) {
    const u = units.find(k => g[tag]?.units?.[k]); if (!u) continue;
    const by = new Map();
    for (const f of g[tag].units[u]) {
      if (!/^10-K/.test(f.form) || !f.start) continue;
      const d = (Date.parse(f.end) - Date.parse(f.start)) / 864e5; if (d < 350 || d > 380) continue;
      const c = by.get(f.end); if (!c || f.filed > c.filed) by.set(f.end, f);
    }
    const rows = [...by.values()].sort((a, b) => a.end.localeCompare(b.end)).map(f => ({ end: f.end, v: f.val }));
    const l = rows.at(-1)?.end ?? '', bl = best.rows.at(-1)?.end ?? '';
    if (l > bl || (l === bl && rows.length > best.rows.length)) best = { tag, rows };
  }
  return best;
}
function secMetrics(raw) {
  const g = raw?.facts?.['us-gaap'] ?? {};
  const dps = annual(raw, ['CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid'], ['USD/shares']);
  const divPaid = annual(raw, ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends', 'PaymentsOfOrdinaryDividends']).rows;
  const ni = annual(raw, ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss', 'NetIncreaseDecreaseInNetAssetsResultingFromOperations']);
  const ocf = annual(raw, ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByOperatingActivities']).rows;
  const cx = annual(raw, ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets']);
  const end = [ni.rows.at(-1)?.end, divPaid.at(-1)?.end, dps.rows.at(-1)?.end].filter(Boolean).sort().at(-1) ?? '';
  const t = r => r.slice(-25);
  return { fy: end ? +end.slice(0, 4) : 0, end, dps: t(dps.rows), dpsTag: dps.tag, divPaid: t(divPaid), netIncome: t(ni.rows), ocf: t(ocf), capex: t(cx.rows), niTag: ni.tag, capexTag: cx.tag,
    bdc: ni.tag === 'NetIncreaseDecreaseInNetAssetsResultingFromOperations' || !!g.InvestmentOwnedAtFairValue, bank: !!(g.InterestExpenseDeposits || g.Deposits) };
}
async function build(sym) {
  const y = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=20y&interval=1d&events=div`, { headers: { 'User-Agent': WEB_UA } });
  if (!y.ok) throw new Error('Yahoo ' + y.status);
  const res = (await y.json())?.chart?.result?.[0]; if (!res) throw new Error('Unknown symbol');
  const m = res.meta; const type = m.instrumentType === 'ETF' || m.instrumentType === 'MUTUALFUND' ? 'fund' : 'stock';
  const divs = Object.values(res.events?.dividends ?? {}).map(d => ({ ex: ymd(d.date), amt: +d.amount.toFixed(6) })).sort((a, b) => a.ex.localeCompare(b.ex)).slice(-120);
  let sec = null, cik = null;
  if (type === 'stock') {
    const tk = await (await fetch('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': SEC_UA, 'Accept-Encoding': 'gzip, deflate' }, cf: { cacheTtl: 86400 } })).json();
    cik = Object.values(tk).find(x => x.ticker === sym)?.cik_str ?? null;
    if (cik) { const r = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`, { headers: { 'User-Agent': SEC_UA, 'Accept-Encoding': 'gzip, deflate' } }); if (r.ok) sec = secMetrics(await r.json()); }
  }
  return { ticker: sym, name: m.longName || m.shortName || sym, type, currency: m.currency, exchange: m.fullExchangeName, price: m.regularMarketPrice, priceDate: ymd(m.regularMarketTime), cik, divs, paySource: null, sec,
    fetched: new Date().toISOString(), sources: { price: 'Yahoo Finance chart API (via proxy)', dividends: 'Yahoo Finance chart API (via proxy; ex-dates, amounts)', safety: sec ? 'SEC EDGAR companyfacts (via proxy)' : null } };
}
export default {
  async fetch(req, env, ctx) {
    const h = cors(req.headers.get('Origin'));
    if (req.method === 'OPTIONS') return new Response(null, { headers: h });
    const u = new URL(req.url); const mt = /^\/ticker\/([A-Za-z0-9.\-]{1,10})$/.exec(u.pathname);
    if (req.method !== 'GET' || !mt) return new Response('Not found', { status: 404, headers: h });
    const sym = mt[1].toUpperCase().replace('.', '-');
    const key = new Request(`https://cache.local/ticker/${sym}`); const cache = caches.default;
    let res = await cache.match(key);
    if (!res) {
      try { res = new Response(JSON.stringify(await build(sym)), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=21600' } }); }
      catch (e) { return new Response(String(e.message || e), { status: 502, headers: h }); }
      ctx.waitUntil(cache.put(key, res.clone()));
    }
    const out = new Response(res.body, res); for (const [k, v] of Object.entries(h)) out.headers.set(k, v);
    return out;
  },
};
