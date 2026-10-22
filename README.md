# Dividend Flow

An installable dividend-income tracker (React + TypeScript + Vite PWA). Live: https://bludiamond888-rgb.github.io/dividend-flow/

- **Flow**: Sankey of each holding → total annual dividend income → Reinvested (DRIP) / Cash. Tap any bar for yield, dividend per share, annual $ and share of income.
- **Calendar**: month-by-month bars of expected payments, a list by month, next-payday countdown and the monthly average.
- **Safety**: payout ratio vs earnings and vs free cash flow (OCF − capex), consecutive years of dividend growth, and a green/amber/red badge with a plain-English reason. ETFs show “n/a (fund)”.
- **Snowball**: projected annual income and portfolio value from your monthly contribution, horizon, dividend growth, price growth and DRIP setting (clearly labeled as a projection).
- **Yield**: each holding’s yield vs the latest CPI-U inflation (BLS) and your Schwab margin rate (you type it in; no free API exists, never defaulted). Holdings below inflation are flagged.
- **Holdings**: manual entry (ticker, shares, total cost basis, DRIP), CSV import, JSON backup/restore and CSV export; stored in localStorage. A clearly labeled sample-portfolio toggle (off by default).

## Data sources
| What | Source | Key? |
|---|---|---|
| Last price, dividend amounts + ex-dates (20 yrs) | Yahoo Finance chart API (`/v8/finance/chart?events=div`), fetched at build time | none |
| Payment / declaration dates | Nasdaq.com dividend API (only Nasdaq-listed symbols: PEP, CSCO, TXN, ARCC, JEPQ, QYLD in the bundle) | none |
| Estimated pay dates for everything else | ex-date + median published lag (18 days stocks / 3 days funds from the Nasdaq data above), labeled **est.** | – |
| Payout safety | SEC EDGAR XBRL companyfacts (10-K annual: PaymentsOfDividends, NetIncomeLoss, NetCashProvidedByUsedInOperatingActivities, PaymentsToAcquirePropertyPlantAndEquipment, CommonStockDividendsPerShareDeclared/CashPaid) | none (User-Agent) |
| Inflation | BLS public API v2, CPI-U CUUR0000SA0, 12-month change | none |
| Live prices (optional) | Finnhub `/quote` (free) | free key in Settings |
| Last-12-month dividend for unlisted tickers (optional) | Finnhub `/stock/metric` (free). `/stock/dividend` is premium, so not used | free key |
| Any ticker live (optional) | Cloudflare Worker in `worker/` proxying Yahoo + SEC | your Worker |
| Schwab margin rate | you enter it (Settings or Yield tab) | – |

Bundled tickers (33): KO PEP JNJ PG O MO VZ T ABBV XOM CVX JPM MAIN HD MCD PFE IBM CSCO TXN LMT UPS NEE ARCC + ETFs SCHD VYM JEPI JEPQ QYLD SPYD DIVO DGRO VIG HDV.
Other tickers: enter a manual schedule (amount per payment, payments/year, pay months) or use the proxy.

`npm run refresh-data` rebuilds `public/data`; `.github/workflows/refresh-data.yml` runs it every Monday and redeploys.

## Method notes
- Annual income = the next 12 months of expected payments for the shares you hold. Stocks use the latest regular dividend × frequency; funds repeat the last 12 months of distributions. Special/supplemental dividends are excluded from forecasts. Announced payments (Nasdaq) keep their real dates.
- Payout ratios use 3-year sums (smooths one-offs); REITs are judged on cash flow, banks on earnings, BDCs on net increase in net assets. Growth streaks come from SEC annual DPS (≈2008 onward, so long streaks show as “≥N yr”); pre-split SEC values are rescaled when the split-adjusted payment history shows no cut.
- XOM: after its 2026 holding-company reorganization the new registrant has no 10-K yet, so annual facts come from the predecessor Exxon Mobil Corp (CIK 34088).

## Dev
    npm ci && npm test && npm run build
    npx vite preview --port 4180 & node shots.mjs   # WebKit iPhone screenshots → screens/
    node offline.mjs                                # service-worker offline check

Not investment advice.
