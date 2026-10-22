import { describe, expect, it } from 'vitest';
import { importCsv, parseCsvRows, toCsv } from '../src/lib/csv';
import { readBackup } from '../src/lib/store';

describe('CSV import', () => {
  it('simple Ticker,Shares,Cost Basis,DRIP', () => {
    const r = importCsv('Ticker,Shares,Cost Basis,DRIP\nKO,100,5900,Y\nschd,250.5,"$6,800.25",no\n');
    expect(r.holdings).toHaveLength(2);
    expect(r.holdings[0]).toMatchObject({ ticker: 'KO', shares: 100, cost: 5900, drip: true });
    expect(r.holdings[1]).toMatchObject({ ticker: 'SCHD', shares: 250.5, cost: 6800.25, drip: false });
  });
  it('broker export with preamble, quotes, avg cost, totals row, and duplicates merged', () => {
    const csv = '"Positions for account ...XXXX as of 10/21/2026"\n\n"Symbol","Description","Quantity","Price","Avg Cost"\n"JNJ","JOHNSON & JOHNSON","40","$257.78","$150.00"\n"JNJ","JOHNSON & JOHNSON","10","$257.78","$160.00"\n"Cash & Cash Investments","--","--","--","--"\n"Account Total","","","",""\n';
    const r = importCsv(csv);
    expect(r.holdings).toHaveLength(1);
    expect(r.holdings[0]).toMatchObject({ ticker: 'JNJ', shares: 50, cost: 7600 });
    expect(r.skipped.length).toBe(2);
  });
  it('reports a missing header and bad share counts', () => {
    expect(importCsv('foo,bar\n1,2').holdings).toHaveLength(0);
    const r = importCsv('Symbol,Shares\nKO,abc\nPEP,10');
    expect(r.holdings.map(h => h.ticker)).toEqual(['PEP']);
    expect(r.skipped[0].why).toMatch(/share/);
  });
  it('handles BRK.B style tickers, semicolons/tabs, CRLF and BOM', () => {
    expect(parseCsvRows('\uFEFFa;b\r\n"x,""y"""\t2\r\n')).toEqual([['a', 'b'], ['x,"y"', '2']]);
    expect(importCsv('Symbol,Qty\r\nBRK.B,3\r\n').holdings[0].ticker).toBe('BRK-B');
  });
  it('round-trips through export', () => {
    const r = importCsv(toCsv([{ id: '1', ticker: 'O', shares: 12, cost: 700, drip: true }]));
    expect(r.holdings[0]).toMatchObject({ ticker: 'O', shares: 12, cost: 700, drip: true });
  });
  it('JSON backup restore validates holdings', () => {
    const b = readBackup(JSON.stringify({ app: 'dividend-flow', holdings: [{ ticker: 'ko', shares: 5, cost: 1, drip: 1 }, { ticker: '', shares: 1 }, { ticker: 'PEP', shares: -2 }] }));
    expect(b.holdings).toHaveLength(1);
    expect(b.holdings[0]).toMatchObject({ ticker: 'KO', shares: 5, drip: true });
    expect(() => readBackup('{"x":1}')).toThrow();
  });
});
