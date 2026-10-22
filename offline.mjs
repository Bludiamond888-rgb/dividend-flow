// Offline/PWA check: load once online (SW installs + precaches), then go offline and reload.
import { webkit, chromium } from 'playwright';
const B = process.env.URL || 'http://localhost:4180/';
for (const [name, bt] of [['chromium', chromium], ['webkit', webkit]]) {
  const b = await bt.launch(); const c = await b.newContext();
  await c.addInitScript(() => localStorage.setItem('df.sample', '1'));
  const p = await c.newPage();
  await p.goto(B); await p.waitForSelector('.chartwrap svg .node');
  const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; }).catch(e => 'err ' + e.message);
  await p.waitForTimeout(1500);
  const cached = await p.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return { keys: ks, n: (await c.keys()).length }; }).catch(e => 'err ' + e.message);
  await c.setOffline(true);
  await p.reload(); let ok = false;
  try { await p.waitForSelector('.chartwrap svg .node', { timeout: 8000 }); ok = true; } catch { /* */ }
  await p.click('.tab:has-text("Safety")').catch(() => {}); const safety = await p.locator('.card.safety').count();
  const manifest = await (await fetch(B + 'manifest.webmanifest')).json();
  console.log(name, { swActive: sw, cached, offlineFlowRenders: ok, offlineSafetyCards: safety, manifest: manifest.name, display: manifest.display });
  await b.close();
}
