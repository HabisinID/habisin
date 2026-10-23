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

Component styling uses Tailwind v4 utilities. `src/app/globals.css` contains the
shared theme, base element defaults, and inclusive `compact` (1050px), `tablet`
(760px), and `mobile` (480px) variants. Keep narrower overrides after wider ones.
Leaflet's vendor CSS supplies the map controls and tile positioning; custom map
markers use Tailwind classes in `src/components/food-map.tsx`.

Run `npx playwright test tests/styling.spec.ts` with the frontend server running
to check responsive layouts and interaction styles without a backend. These tests
mock API responses and cover dialog sizing, checkbox layout, and reduced motion.

Store onboarding is available at `/partner/store`, with public profiles at
`/stores/{id}`. Run Django migrations before using it. See the
[Module 2 guide](../docs/module-2.md) for setup, geocoding policy, and API details.
`npx playwright test tests/stores.spec.ts` checks the store UI with mock API
responses, so it can run without Django or Nominatim.
