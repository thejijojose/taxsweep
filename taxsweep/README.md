## TaxSweep (Vite + React)

Offline-first transaction categorisation (Irish merchant list + MCC enrichment + rules) running fully in the browser.

## Local development

```bash
npm install
npm run dev
```

## Deploy to Vercel

This repo is a static Vite SPA. Vercel will:
- build with `npm run build`
- serve `dist/`
- rewrite all routes to `index.html` via `vercel.json`

### Option A: Vercel dashboard (recommended)
- Import the GitHub repo into Vercel
- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`

### Option B: Vercel CLI
```bash
npm i -g vercel
vercel
vercel --prod
```

## Privacy / safety
- Do **not** commit bank statements, receipts, `.env` files, or any PII to git.
