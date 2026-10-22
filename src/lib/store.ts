import type { Holding } from './types';
import { newId } from './csv';
const KEY = 'df.holdings';
export function loadHoldings(): Holding[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(validHolding) : []; } catch { return []; }
}
export function saveHoldings(h: Holding[]) { localStorage.setItem(KEY, JSON.stringify(h)); }
export function validHolding(h: any): h is Holding {
  return h && typeof h.ticker === 'string' && /^[A-Z0-9.\-]{1,10}$/.test(h.ticker) && typeof h.shares === 'number' && h.shares > 0 && typeof h.cost === 'number';
}
export type Backup = { app: 'dividend-flow'; version: 1; exported: string; holdings: Holding[]; settings: { margin?: string; marginNote?: string } };
export function makeBackup(h: Holding[], s: { margin?: string; marginNote?: string }): Backup {
  return { app: 'dividend-flow', version: 1, exported: new Date().toISOString(), holdings: h, settings: s };
}
export function readBackup(text: string): Backup {
  const j = JSON.parse(text);
  const hs = Array.isArray(j) ? j : j?.holdings;
  if (!Array.isArray(hs)) throw new Error('Not a Dividend Flow backup (no holdings array).');
  const holdings = hs.map((h: any) => ({ id: h.id || newId(), ticker: String(h.ticker || '').toUpperCase(), shares: +h.shares, cost: +h.cost || 0, drip: !!h.drip, manual: h.manual ?? null })).filter(validHolding);
  return { app: 'dividend-flow', version: 1, exported: j.exported ?? '', holdings, settings: j.settings ?? {} };
}
/** Clearly-labeled demo portfolio (not real holdings). Shown only when the sample toggle is on. */
export const SAMPLE: Holding[] = [
  ['KO', 120, 7100, true], ['JNJ', 40, 6300, false], ['O', 150, 8400, true], ['VZ', 200, 8100, false], ['ABBV', 30, 5200, true],
  ['MAIN', 120, 5600, true], ['SCHD', 400, 11200, true], ['JEPI', 100, 5500, false], ['PEP', 30, 4600, false], ['HD', 12, 3900, true],
].map(([t, s, c, d], i) => ({ id: 'sample' + i, ticker: t as string, shares: s as number, cost: c as number, drip: d as boolean, manual: null }));
