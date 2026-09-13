# Aervyx — Download Site

The public download landing page for **Aervyx**, a fast, keyless Lua executor for Windows 10/11.

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

## The installer download

Every Download button points at one root-relative URL defined in `src/App.tsx`:

```ts
const DOWNLOAD_URL = '/downloads/Aervyx-Setup.exe';
```

That file is served from `public/downloads/Aervyx-Setup.exe`. Because the path is
root-relative, the same link works on the `*.vercel.app` preview URL and on the
production domain, and never needs to change when the domain changes.

To publish a new installer, rebuild it in the parent Electron project and copy the
artifact over the existing file:

```powershell
cd ..
npm run dist        # npm run build && electron-builder --win nsis -> release/Aervyx-Setup.exe
Copy-Item release\Aervyx-Setup.exe aervyx-download-site\public\downloads\Aervyx-Setup.exe
```

> **Vercel Hobby plan limits static files to 100 MB.** Keep `Aervyx-Setup.exe` under
> that size or the deployment will be rejected. If the installer grows past the cap,
> host it on GitHub Releases / Cloudflare R2 instead and point `DOWNLOAD_URL` at that
> absolute URL.

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

`vercel build` + `--prebuilt` deploys the locally built static output, which is the
safest way to guarantee `public/downloads/Aervyx-Setup.exe` ships with the deployment.

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
  aervyx-logo.png        branding asset
  favicon.svg            legacy favicon
  icons.svg              legacy sprite
  downloads/
    Aervyx-Setup.exe     the Windows installer served to visitors
src/
  App.tsx                single-page landing site
  App.css                all site styling + fonts
  index.css              global resets
  main.tsx               React entry point
index.html               document head (SEO, Open Graph, fonts)
vercel.json              cache-control headers
```
