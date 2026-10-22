// Snowball projector: monthly simulation on user assumptions. Deterministic, no randomness.
export type SnowIn = { startValue: number; startIncome: number; monthly: number; years: number; divGrowth: number; priceGrowth: number; drip: boolean };
export type SnowYear = { year: number; income: number; value: number; contributed: number; cashCollected: number; yieldOnValue: number };
export function snowball(i: SnowIn): SnowYear[] {
  // Model in "units": price starts at 1, so shares = dollars. Yield = income / value.
  let price = 1, shares = i.startValue, cash = 0, contributed = i.startValue;
  const y0 = i.startValue > 0 ? i.startIncome / i.startValue : 0;
  let dps = y0; // annual dividend per unit
  const pg = Math.pow(1 + i.priceGrowth, 1 / 12), dg = Math.pow(1 + i.divGrowth, 1 / 12);
  const out: SnowYear[] = [{ year: 0, income: i.startIncome, value: i.startValue, contributed, cashCollected: 0, yieldOnValue: y0 }];
  for (let yr = 1; yr <= i.years; yr++) {
    let inc = 0;
    for (let m = 0; m < 12; m++) {
      price *= pg; dps *= dg;
      const d = shares * dps / 12; inc += d;
      if (i.drip) shares += d / price; else cash += d;
      shares += i.monthly / price; contributed += i.monthly;
    }
    const value = shares * price;
    out.push({ year: yr, income: inc, value, contributed, cashCollected: cash, yieldOnValue: value ? (shares * dps) / value : 0 });
  }
  return out;
}
/** Forward annual income run-rate at the end of a year (useful headline). */
export const runRate = (y: SnowYear) => y.value * y.yieldOnValue;
