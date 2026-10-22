// Universe index search: rank exact ticker > ticker prefix > name word prefix > name contains.
export type URow = [ticker: string, name: string, type: 'S' | 'F', yld: number, price: number, irr?: 0 | 1];
export function searchUniverse(rows: URow[], q: string, limit = 30): URow[] {
  const s = q.trim().toUpperCase().replace('.', '-'); if (!s) return [];
  const words = s.split(/\s+/);
  const scored: [number, URow][] = [];
  for (const r of rows) {
    const t = r[0], n = r[1].toUpperCase();
    let sc = -1;
    if (t === s) sc = 0;
    else if (t.startsWith(s)) sc = 1 + t.length / 100;
    else if (words.every(w => n.split(/[^A-Z0-9&]+/).some(x => x.startsWith(w)))) sc = 3;
    else if (s.length >= 3 && n.includes(s)) sc = 4;
    if (sc >= 0) scored.push([sc, r]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1][0].length - b[1][0].length || a[1][0].localeCompare(b[1][0])).slice(0, limit).map(x => x[1]);
}
