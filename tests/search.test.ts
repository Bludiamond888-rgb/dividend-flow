import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { searchUniverse, type URow } from '../src/lib/search';
import { isIrregular } from '../src/lib/income';
const rows: URow[] = [['KO', 'The Coca-Cola Company', 'S', 0.022, 94], ['KOF', 'Coca-Cola FEMSA', 'S', 0.04, 90], ['COKE', 'Coca-Cola Consolidated', 'S', 0.01, 1300],
  ['SCHD', 'Schwab U.S. Dividend Equity ETF', 'F', 0.03, 35], ['BRK-B', 'Fake Row', 'S', 0, 1], ['O', 'Realty Income Corporation', 'S', 0.057, 56]];
describe('universe search', () => {
  it('exact ticker first, then prefix', () => { expect(searchUniverse(rows, 'ko').map(r => r[0])).toEqual(['KO', 'KOF']); });
  it('matches company-name words', () => { expect(searchUniverse(rows, 'coca cola').map(r => r[0])).toEqual(['KO', 'KOF', 'COKE']); expect(searchUniverse(rows, 'realty')[0][0]).toBe('O'); });
  it('accepts dotted class tickers', () => { expect(searchUniverse(rows, 'brk.b')[0][0]).toBe('BRK-B'); });
  it('empty query -> nothing', () => { expect(searchUniverse(rows, '  ')).toEqual([]); });
});
describe('irregular payer', () => {
  const q = ['2025-03-01', '2025-06-01', '2025-09-01', '2025-12-01', '2026-03-01', '2026-06-01', '2026-09-01'].map(ex => ({ ex, amt: 0.5 }));
  it('regular quarterly is fine', () => { expect(isIrregular(q, 0.03, '2026-10-22')).toBe(false); });
  it('one payment in two years, or >60% yield, is irregular', () => { expect(isIrregular([{ ex: '2026-01-05', amt: 3 }], 0.05, '2026-10-22')).toBe(true); expect(isIrregular(q, 0.9, '2026-10-22')).toBe(true); });
});
const U = 'public/data/universe.json';
describe.skipIf(!fs.existsSync(U))('built universe', () => {
  const u = fs.existsSync(U) ? JSON.parse(fs.readFileSync(U, 'utf8')) : { rows: [] };
  it('has thousands of payers incl. the 33 core tickers, each with a file', () => {
    expect(u.rows.length).toBeGreaterThan(3000);
    const set = new Set(u.rows.map((r: URow) => r[0]));
    for (const t of ['KO', 'PEP', 'SCHD', 'JEPI', 'O', 'MAIN', 'HDV']) expect(set.has(t)).toBe(true);
    for (const r of u.rows.slice(0, 200)) expect(fs.existsSync(`public/data/${r[0]}.json`)).toBe(true);
  });
  it('rows are well-formed', () => { for (const r of u.rows) { expect(r[0]).toMatch(/^[A-Z][A-Z0-9-]*$/); expect(['S', 'F']).toContain(r[2]); expect(r[4]).toBeGreaterThan(0); } });
});
