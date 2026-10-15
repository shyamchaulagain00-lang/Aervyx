# Aervyx — Download Site

The public download landing page for **Aervyx**, your powerful desktop experience for Windows.

Built with **Vite + React 19 + TypeScript** and deployed on **Vercel**.

## Requirements

- Node.js 20.19+ (see `engines` in `package.json`)
- npm 10+

## Install and run locally

```powershell
npm install
npm run dev
```

## Production build

```powershell
npm run lint      # oxlint
npm run build     # tsc -b && vite build  -> dist/
npm run preview   # serve the production build locally
```

## The Aervyx Windows application

Every Download button points at one root-relative URL defined in `src/App.tsx`:

```ts
const DOWNLOAD_URL = '/downloads/Aervyx.exe';
```

The direct Windows executable is served from `public/downloads/Aervyx.exe`. The same
root-relative URL works on Vercel preview deployments and the production domain. Keep this file
available in the deployment output whenever building or deploying the site.

## Deploying to Vercel

This project must be deployed with its **root directory set to this folder**
(`aervyx-download-site`) — the parent directory is an Electron desktop app and will
not build on Vercel.

### Vercel CLI

```powershell
cd aervyx-download-site
npm install
npx vercel login
npx vercel link                       # new project, root directory = ./
npx vercel build
npx vercel deploy --prebuilt --prod
```

`vercel build` + `--prebuilt` deploys the locally built static output, including
`public/downloads/Aervyx.exe`.

Redeploys afterwards are just:

```powershell
npx vercel build
npx vercel deploy --prebuilt --prod
```

Vercel auto-detects the rest:

| Setting | Value |
| --- | --- |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

### Custom domain

1. Vercel dashboard → project → **Settings → Domains → Add Domain** → `aervyx.com`.
2. Add the `www` variant and pick which one is primary (the other redirects to it).
3. At your registrar, add the DNS records shown in the Vercel panel:
   - apex `aervyx.com` → **A** → `76.76.21.21`
   - `www` → **CNAME** → `cname.vercel-dns.com`
   - Remove any conflicting default/parking records first.
4. HTTPS is provisioned automatically by Vercel once DNS verifies.

## Project structure

```
public/
  aervyx-logo.png                    branding asset
  favicon.png                        favicon
  downloads/
    Aervyx.exe                       the Windows application served to visitors
src/
  App.tsx                            single-page landing site
  App.css                            all site styling + fonts
  index.css                          global resets
  main.tsx                           React entry point
index.html                           document head (SEO, Open Graph, fonts)
vercel.json                          cache-control + download headers
```
