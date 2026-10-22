import { describe, expect, it } from 'vitest';
import { snowball } from '../src/lib/snowball';

describe('snowball', () => {
  it('no growth, no contributions, no DRIP: flat income and value', () => {
    const r = snowball({ startValue: 10000, startIncome: 400, monthly: 0, years: 5, divGrowth: 0, priceGrowth: 0, drip: false });
    expect(r).toHaveLength(6);
    r.slice(1).forEach(y => { expect(y.income).toBeCloseTo(400, 6); expect(y.value).toBeCloseTo(10000, 6); });
    expect(r[5].cashCollected).toBeCloseTo(2000, 6);
  });
  it('DRIP compounds monthly: value after 1 year = 10000 * (1 + 0.04/12)^12', () => {
    const r = snowball({ startValue: 10000, startIncome: 400, monthly: 0, years: 1, divGrowth: 0, priceGrowth: 0, drip: true });
    expect(r[1].value).toBeCloseTo(10000 * Math.pow(1 + 0.04 / 12, 12), 6);
    expect(r[1].cashCollected).toBe(0);
  });
  it('contributions add up; dividend growth raises yield on value when prices are flat', () => {
    const r = snowball({ startValue: 0.000001, startIncome: 0.00000004, monthly: 500, years: 10, divGrowth: 0.05, priceGrowth: 0, drip: false });
    expect(r[10].contributed).toBeCloseTo(60000, 3);
    expect(r[10].value).toBeCloseTo(60000, 3);
    expect(r[10].yieldOnValue).toBeCloseTo(0.04 * Math.pow(1.05, 10), 6);
  });
  it('price growth grows value but not income per dollar invested at start', () => {
    const r = snowball({ startValue: 10000, startIncome: 300, monthly: 0, years: 2, divGrowth: 0, priceGrowth: 0.1, drip: false });
    expect(r[2].value).toBeCloseTo(12100, 4);
    expect(r[2].income).toBeCloseTo(300, 6);
  });
});
