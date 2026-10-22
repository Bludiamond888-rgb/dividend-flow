import type { portfolioIncome } from '../lib/income';
import type { Holding, Index, TickerData } from '../lib/types';
import type { Universe } from '../lib/data';
export type Ctx = {
  pf: ReturnType<typeof portfolioIncome>; data: Record<string, TickerData>; index: Index | null; universe: Universe | null; today: string;
  holdings: Holding[]; portfolio: Holding[]; sample: boolean; setSample: (b: boolean) => void; setHoldings: (h: Holding[]) => void;
  bundled: Set<string>; go: (t: 'flow' | 'calendar' | 'safety' | 'snowball' | 'yield' | 'holdings') => void; refresh: () => void; openSettings: () => void;
};
