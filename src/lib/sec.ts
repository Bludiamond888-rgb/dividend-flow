// Extract annual (10-K, full fiscal year) values from SEC companyfacts for payout-safety math.
type Fact = { start?: string; end: string; val: number; fy?: number; fp?: string; form: string; filed: string; frame?: string };
export type Annual = { end: string; v: number };
export type SecMetrics = {
  fy: number; end: string; // latest fiscal year in the data
  dps: Annual[];            // dividends per share (declared, else cash paid)
  dpsTag: string | null;
  divPaid: Annual[]; netIncome: Annual[]; ocf: Annual[]; capex: Annual[];
  niTag: string | null; capexTag: string | null; bdc: boolean; bank: boolean;
};
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5;
export function annual(raw: any, tags: string[], unitPref: string[] = ['USD', 'USD/shares']): { tag: string | null; rows: Annual[] } {
  const g = raw?.facts?.['us-gaap'] ?? {};
  let best: { tag: string | null; rows: Annual[] } = { tag: null, rows: [] };
  for (const tag of tags) {
    const units = g[tag]?.units; if (!units) continue;
    const u = unitPref.find(k => units[k]); if (!u) continue;
    const byEnd = new Map<string, Fact>();
    for (const f of units[u] as Fact[]) {
      if (!/^10-K/.test(f.form) || !f.start) continue;
      const d = days(f.start, f.end); if (d < 350 || d > 380) continue;
      const cur = byEnd.get(f.end);
      if (!cur || f.filed > cur.filed) byEnd.set(f.end, f);
    }
    const rows = [...byEnd.values()].sort((a, b) => a.end.localeCompare(b.end)).map(f => ({ end: f.end, v: f.val }));
    // prefer the tag with the most recent data, then the longest history
    const last = rows.at(-1)?.end ?? '', bl = best.rows.at(-1)?.end ?? '';
    if (last > bl || (last === bl && rows.length > best.rows.length)) best = { tag, rows };
  }
  return best;
}
export function secMetrics(raw: any): SecMetrics {
  const dps = annual(raw, ['CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid'], ['USD/shares']);
  const divPaid = annual(raw, ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends', 'PaymentsOfOrdinaryDividends']).rows;
  const ni = annual(raw, ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss', 'NetIncreaseDecreaseInNetAssetsResultingFromOperations' /* BDCs */]);
  const netIncome = ni.rows;
  const ocf = annual(raw, ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByOperatingActivities']).rows;
  const cx = annual(raw, ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets']);
  const capex = cx.rows;
  const ends = [netIncome.at(-1)?.end, divPaid.at(-1)?.end, dps.rows.at(-1)?.end].filter(Boolean) as string[];
  const end = ends.sort().at(-1) ?? '';
  const trim = (r: Annual[]) => r.slice(-25);
  return { fy: end ? +end.slice(0, 4) : 0, end, dps: trim(dps.rows), dpsTag: dps.tag, divPaid: trim(divPaid), netIncome: trim(netIncome), ocf: trim(ocf), capex: trim(capex), niTag: ni.tag, capexTag: cx.tag, bdc: ni.tag === 'NetIncreaseDecreaseInNetAssetsResultingFromOperations' || !!raw?.facts?.['us-gaap']?.InvestmentOwnedAtFairValue,
    bank: !!(raw?.facts?.['us-gaap']?.InterestExpenseDeposits || raw?.facts?.['us-gaap']?.Deposits) };
}
