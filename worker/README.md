# Dividend Flow data proxy (optional)
The app works without this: 33 popular dividend stocks/ETFs are bundled and refreshed weekly. Browsers can't call Yahoo's
chart API or SEC EDGAR directly (CORS, User-Agent rules), so this Worker fetches them server-side for **any other ticker**,
caches the result at the edge for 6 hours, and allows CORS for https://bludiamond888-rgb.github.io and localhost.

Deploy (free Cloudflare account):
    npx wrangler login
    cd worker && npx wrangler deploy
Then open Dividend Flow → Settings → Data proxy URL and paste `https://dividend-flow-proxy.<subdomain>.workers.dev`.
In Holdings → Add holding, type a ticker outside the bundled list and tap "Load via proxy".
