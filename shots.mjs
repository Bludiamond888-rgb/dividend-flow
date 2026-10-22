// Playwright WebKit screenshots. Usage: npm run build && npx vite preview --port 4173 & node shots.mjs
import { webkit, devices } from 'playwright';
const B = process.env.URL || 'http://localhost:4180/';
const OUT = process.env.OUT || 'screens';
const b = await webkit.launch();
const shot = async (p, name, full = true) => { await p.waitForTimeout(500);
  // fixed tab bar would float mid-page in full-page captures; pin it to the page bottom for the capture only
  await p.addStyleTag({ content: full ? 'body{position:relative} .tabs{position:absolute !important}' : 'body{position:static} .tabs{position:fixed}' }); await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); console.log(name); };
async function ctx(dev, sample = true, extra = {}) {
  const c = await b.newContext({ ...dev, serviceWorkers: 'block' });
  await c.addInitScript(([s, x]) => { if (!sessionStorage.getItem('init')) { localStorage.clear(); localStorage.setItem('df.sample', s ? '1' : '0'); for (const [k, v] of Object.entries(x)) localStorage.setItem(k, v); sessionStorage.setItem('init', '1'); } }, [sample, extra]);
  return c;
}
const ip = devices['iPhone 15 Pro'];
// 1. iPhone portrait, sample portfolio
{
  const c = await ctx(ip, true, { 'df.margin': process.env.MARGIN || '' }); const p = await c.newPage();
  await p.goto(B + '#flow'); await p.waitForSelector('.chartwrap svg .node');
  await shot(p, '01-flow');
  await p.locator('.node').filter({ hasText: 'KO' }).first().dispatchEvent('click'); await shot(p, '02-flow-detail', false);
  await p.click('.close');
  for (const [i, t] of [['03', 'calendar'], ['04', 'safety'], ['05', 'snowball'], ['06', 'yield'], ['07', 'holdings']]) {
    await p.click(`.tab:has-text("${t[0].toUpperCase() + t.slice(1)}")`); await shot(p, `${i}-${t}`);
  }
  await p.click('.tab:has-text("Safety")'); await p.locator('.card.safety').first().click(); await shot(p, '08-safety-expanded');
  await c.close();
}
// 2. empty portfolio (sample off by default)
{
  const c = await ctx(ip, false); const p = await c.newPage();
  await p.goto(B); await p.waitForSelector('.empty'); await shot(p, '09-empty', false);
  await p.click('.tab:has-text("Holdings")'); await p.click('text=＋ Add holding'); await p.fill('.sheet input >> nth=0', 'SCHD'); await p.fill('.sheet input[inputmode=decimal] >> nth=0', '250');
  await shot(p, '10-add-holding', false);
  await p.click('.sheet .primary'); await p.click('.tab:has-text("Flow")'); await p.waitForSelector('.chartwrap svg .node'); await shot(p, '11-single-holding');
  // manual schedule for a non-bundled ticker
  await p.click('.tab:has-text("Holdings")'); await p.click('text=＋ Add holding'); await p.fill('.sheet input >> nth=0', 'ZZZT');
  await p.fill('.sheet input[inputmode=decimal] >> nth=0', '100'); await p.fill('.manual input', '0.25'); await shot(p, '12-manual-schedule', false);
  await c.close();
}
// 2b. universe search + add flow
{
  const c = await ctx(ip, false); const p = await c.newPage();
  await p.goto(B + '#holdings'); await p.click('text=＋ Add holding'); await p.waitForTimeout(400);
  await shot(p, '23-search-empty', false);
  await p.fill('.sheet .search input', 'coca'); await p.waitForSelector('.results li'); await shot(p, '24-search-coca', false);
  await p.click('.results li:has-text("CCEP")'); await p.fill('.sheet input[inputmode=decimal] >> nth=0', '50'); await shot(p, '25-search-picked', false);
  await p.click('.sheet .primary');
  await p.click('text=＋ Add holding'); await p.fill('.sheet .search input', 'realty'); await p.waitForSelector('.results li'); await shot(p, '26-search-realty', false);
  await p.click('.results li >> nth=0'); await p.fill('.sheet input[inputmode=decimal] >> nth=0', '20'); await p.click('.sheet .primary');
  await p.click('text=＋ Add holding'); await p.fill('.sheet .search input', 'yieldmax'); await p.waitForSelector('.results li'); await shot(p, '27-search-etf', false);
  await p.click('.sheet .close');
  await p.click('.tab:has-text("Flow")'); await p.waitForSelector('.chartwrap svg .node'); await shot(p, '28-universe-flow');
  await p.click('.tab:has-text("Safety")'); await shot(p, '29-universe-safety', false);
  await c.close();
}
// 3. many holdings via localStorage
{
  const all = ['KO','PEP','JNJ','PG','O','MO','VZ','T','ABBV','XOM','CVX','JPM','MAIN','HD','MCD','PFE','IBM','CSCO','TXN','LMT','UPS','NEE','ARCC','SCHD','VYM','JEPI','JEPQ','QYLD','SPYD','DIVO','DGRO','VIG','HDV'];
  const hs = all.map((t, i) => ({ id: 'm' + i, ticker: t, shares: 10 + i * 5, cost: 1000 + i * 300, drip: i % 2 === 0, manual: null }));
  const c = await ctx(ip, false, { 'df.holdings': JSON.stringify(hs) }); const p = await c.newPage();
  await p.goto(B); await p.waitForSelector('.chartwrap svg .node'); await shot(p, '13-many-flow');
  await p.click('.tab:has-text("Calendar")'); await shot(p, '14-many-calendar', false);
  await p.click('.tab:has-text("Yield")'); await shot(p, '15-many-yield');
  await c.close();
}
// 4. landscape + desktop
{
  const c = await ctx(devices['iPhone 15 Pro landscape'], true); const p = await c.newPage();
  await p.goto(B); await p.waitForSelector('.chartwrap svg .node'); await shot(p, '16-landscape', false);
  await p.click('.tab:has-text("Calendar")'); await shot(p, '17-landscape-calendar', false);
  await c.close();
  const d = await ctx({ viewport: { width: 1380, height: 900 } }, true); const pd = await d.newPage();
  await pd.goto(B); await pd.waitForSelector('.chartwrap svg .node'); await shot(pd, '18-desktop-flow');
  await pd.click('.tab:has-text("Safety")'); await shot(pd, '19-desktop-safety', false);
  await pd.click('.tab:has-text("Snowball")'); await shot(pd, '20-desktop-snowball', false);
  await d.close();
}
await b.close();
