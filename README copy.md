# HABISIN Frontend

Next.js, React, Tailwind CSS, Leaflet, and Lucide icons.

```bash
npm ci
npm run dev
```

Open http://localhost:3000. Run Django on port 8000 and seed the demo catalog first.
See the [root README](../README.md#menjalankan-demo-lokal) for setup, supported flows,
authentication design, and demo limitations.

```bash
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests require both servers running and an unexpired demo catalog.
