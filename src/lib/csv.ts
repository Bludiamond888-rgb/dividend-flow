// Holdings CSV import. Accepts broker-style exports: Symbol/Ticker, Quantity/Shares, Cost Basis (total) or Avg/Unit Cost, optional DRIP.
import type { Holding } from './types';
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === '\t' || c === ';') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(x => x.trim())).filter(r => r.some(x => x));
}
const num = (s: string | undefined) => { if (s == null) return NaN; const t = s.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'); return t === '' || t === '--' ? NaN : Number(t); };
const truthy = (s: string | undefined) => /^(y|yes|true|1|on|drip|reinvest)/i.test((s ?? '').trim());
export type ImportResult = { holdings: Holding[]; skipped: { line: number; text: string; why: string }[] };
let seq = 0; export const newId = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);
export function importCsv(text: string): ImportResult {
  const rows = parseCsvRows(text);
  const skipped: ImportResult['skipped'] = [];
  const hi = rows.findIndex(r => r.some(c => /^(symbol|ticker)$/i.test(c)));
  if (hi < 0) return { holdings: [], skipped: [{ line: 1, text: rows[0]?.join(',') ?? '', why: 'No "Symbol" or "Ticker" column header found' }] };
  const H = rows[hi].map(c => c.toLowerCase().replace(/[^a-z]/g, ''));
  const col = (...names: string[]) => H.findIndex(h => names.includes(h));
  const cT = col('symbol', 'ticker'), cS = col('shares', 'quantity', 'qty', 'units');
  const cTot = col('costbasis', 'totalcost', 'cost', 'costbasistotal', 'totalcostbasis');
  const cAvg = col('avgcost', 'averagecost', 'costpershare', 'unitcost', 'avgprice', 'averageprice', 'pricepaid');
  const cD = col('drip', 'reinvest', 'reinvestdividends', 'dividendreinvestment');
  const out = new Map<string, Holding>();
  rows.slice(hi + 1).forEach((r, i) => {
    const line = hi + i + 2;
    const t = (r[cT] ?? '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
    if (!t || /^(TOTAL|CASH|ACCOUNTTOTAL)/.test(t)) { skipped.push({ line, text: r.join(','), why: 'not a ticker row' }); return; }
    const sh = num(r[cS]);
    if (!(sh > 0)) { skipped.push({ line, text: r.join(','), why: 'missing or invalid share count' }); return; }
    let cost = cTot >= 0 ? num(r[cTot]) : NaN;
    if (!(cost >= 0) && cAvg >= 0) cost = num(r[cAvg]) * sh;
    const prev = out.get(t);
    const c = cost >= 0 ? cost : 0;
    if (prev) { prev.shares += sh; prev.cost += c; }
    else out.set(t, { id: newId(), ticker: t.replace('.', '-'), shares: sh, cost: c, drip: cD >= 0 ? truthy(r[cD]) : false, manual: null });
  });
  return { holdings: [...out.values()].map(h => ({ ...h, shares: +h.shares.toFixed(6), cost: +h.cost.toFixed(2) })), skipped };
}
export function toCsv(hs: Holding[]) { return 'Ticker,Shares,Cost Basis,DRIP\n' + hs.map(h => `${h.ticker},${h.shares},${h.cost},${h.drip ? 'Y' : 'N'}`).join('\n') + '\n'; }
