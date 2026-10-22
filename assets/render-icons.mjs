import { webkit } from 'playwright';
import fs from 'node:fs';
const svg = fs.readFileSync(new URL('./icon.svg', import.meta.url), 'utf8');
const b = await webkit.launch();
for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<html><body style="margin:0">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  await p.screenshot({ path: `public/${name}` }); await p.close();
}
await b.close();
