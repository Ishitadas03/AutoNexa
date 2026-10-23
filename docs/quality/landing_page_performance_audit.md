# AutoNexa — Landing Page Performance & Broken Asset Audit Report

**Date:** 2026-10-24  
**Project:** `AutoNexa`  
**Target URL:** `https://autonexa-orpin.vercel.app`  
**Auditor:** AutoNexa Engineering Diagnostics  
**Status:** Remediated & Locally Verified  

---

## 1. Executive Summary

During initial deployment testing of AutoNexa on Vercel, the production landing page displayed two critical issues:
1. **Broken Hero Visual:** A broken image icon was rendered in the hero section at the top of the headline, and the 3D isometric network artwork (including the robot mascot, pedestals, and hardware nodes) failed to display. The SVG energy pulse paths and prediction badge hovered over an empty background.
2. **Initial Loading Inefficiencies:** The initial page payload bundled ~1.18 MB of uncompressed client JavaScript (including all 15 functional Studio Workspace tabs and charts), while initial component mount triggered an unauthenticated API call (`/api/v1/datasets`) resulting in an immediate 401 Unauthorized warning before the user even entered the Workspace. Furthermore, the API connection badge displayed an inaccurate static "API Connected" state prior to health resolution.

Through systematic diagnostics, root causes were isolated to Next.js image optimization routing on Vercel multi-service configurations, monolithic component bundling, and unbounded health check lifecycles. Targeted, design-preserving remediations were implemented and verified with before-and-after measurements.

---

## 2. Confirmed Root Causes

### Root Cause 1: 404 on Next.js Serverless Image Optimizer (`/_next/image`)
* **Mechanism:** Next.js `<Image />` components by default transform public image references into dynamic optimization requests (`/_next/image?url=%2Fimages%2F...&w=...&q=75`). In the Vercel multi-service deployment configuration (`vercel.json` routing root to `frontend` with backend rewrite rules), the `/_next/image` endpoint was not routed to an active image optimization lambda, returning `HTTP 404 Not Found`.
* **Impact:** 
  - `GET /_next/image?url=%2Fimages%2Flanding-ref%2Fhero-network-light%402x.png&w=1920&q=75` -> **404 Not Found**
  - `GET /_next/image?url=%2Fimages%2Flanding-ref%2Fpipeline-engine-workflow-v3.png&w=1200&q=75` -> **404 Not Found**
  - The static files themselves were 100% available and valid at `/images/landing-ref/hero-network-light@2x.png` (returning `200 OK`). Because the Next.js optimization wrapper failed with 404, the browser displayed the native broken image icon and failed to paint the hero visual.

### Root Cause 2: Heavy Static Asset Transfer (583 KB PNG)
* **Mechanism:** The hero network background asset was referenced as an uncompressed 583 KB retina PNG (`hero-network-light@2x.png`), while the pipeline plinth was 102 KB (`pipeline-engine-workflow-v3.png`).
* **Impact:** On mobile connections and high-latency edge nodes, transferring ~685 KB of uncompressed raster artwork increased Time to First Byte (TTFB) and Largest Contentful Paint (LCP) latency unnecessarily.

### Root Cause 3: Monolithic JavaScript Bundle (>1.18 MB on Landing Path)
* **Mechanism:** `frontend/src/app/page.tsx` statically imported `WorkspaceLayout` and all 15 complex workspace tabs (`OverviewTab`, `DatasetsTab`, `ProfilingTab`, `TrainingTab`, `LeaderboardTab`, `ExperimentsTab`, `PredictionTab`, `ModelRegistryTab`, `PipelinesTab`, `MonitoringTab`, `ExplainabilityTab`, `ErrorAnalysisTab`, `BenchmarkingTab`, `DocumentationTab`, `SettingsTab`) as well as sample datasets.
* **Impact:** A single client chunk (`445y9bgw7x1zr.js`) weighing **1,188,228 bytes (1.18 MB)** had to be downloaded, parsed, and compiled by the browser's JavaScript V8 engine before the landing page could hydrate, degrading Time to Interactive (TTI) and First Input Delay (FID).

### Root Cause 4: Unauthenticated Initial Mount API Call & False Connection Pill
* **Mechanism:** In `page.tsx`, `refreshHealth()` chained a call to `api.listDatasets({ page: 1, pageSize: 50 })` immediately upon receiving a healthy health status. Because API authentication is enabled in production (`Phase 16B` security controls), this unauthenticated call failed with `401 Unauthorized` on landing load.
* **Impact:** Browser thread incurred an unnecessary failed network roundtrip on initial page render. In addition, the status pill in `Navbar.tsx` and `Footer.tsx` defaulted to rendering a green "API Connected" badge even while `apiConnected === null` (during in-flight health check), masking actual backend reachability.

---

## 3. Files Changed and Technical Rationales

| File | Change Type | Technical Rationale |
|---|---|---|
| [`frontend/next.config.ts`](file:///c:/Users/ishit/AutoNexa/frontend/next.config.ts) | Modified | Added `images: { unoptimized: true }` to bypass the failing `/_next/image` endpoint on Vercel multi-service routing, serving static images directly from Edge CDN with zero cold-start latency. |
| [`frontend/public/images/landing-ref/hero-network-light@2x.webp`](file:///c:/Users/ishit/AutoNexa/frontend/public/images/landing-ref/hero-network-light@2x.webp) | Created | Generated high-fidelity WebP format (90% quality) reducing file size from 583,635 bytes to 53,182 bytes (**90.9% reduction**). |
| [`frontend/public/images/landing-ref/pipeline-engine-workflow-v3.webp`](file:///c:/Users/ishit/AutoNexa/frontend/public/images/landing-ref/pipeline-engine-workflow-v3.webp) | Created | Generated high-fidelity WebP format reducing file size from 102,112 bytes to 13,824 bytes (**86.5% reduction**). |
| [`frontend/src/components/landing/HeroWorkflowGraphic.tsx`](file:///c:/Users/ishit/AutoNexa/frontend/src/components/landing/HeroWorkflowGraphic.tsx) | Modified | Pointed image source to optimized `.webp` asset, added explicit `unoptimized` prop, preserved `aspect-[1160/560]` container and SVG overlays, and maintained `priority` for LCP optimization. |
| [`frontend/src/components/landing/InteractivePipeline.tsx`](file:///c:/Users/ishit/AutoNexa/frontend/src/components/landing/InteractivePipeline.tsx) | Modified | Pointed image source to `.webp` asset, added `unoptimized`, changed `priority` to `loading="lazy"` since this section is below the fold, preventing contention with hero assets. |
| [`frontend/src/lib/api.ts`](file:///c:/Users/ishit/AutoNexa/frontend/src/lib/api.ts) | Modified | Added a bounded 3.5s timeout via `AbortController` in `checkHealth()` to prevent hanging network requests when backend cold starts or connectivity transitions occur. |
| [`frontend/src/components/workspace/WorkspaceView.tsx`](file:///c:/Users/ishit/AutoNexa/frontend/src/components/workspace/WorkspaceView.tsx) | Created | Extracted the entire Studio Workspace layout and tabs into an isolated component container ready for dynamic code-splitting. Moved catalog synchronization to workspace mount. |
| [`frontend/src/app/page.tsx`](file:///c:/Users/ishit/AutoNexa/frontend/src/app/page.tsx) | Modified | Replaced static workspace tab imports with `next/dynamic` import of `WorkspaceView` (`ssr: false`), eliminated the premature `listDatasets` 401 call on landing page mount, and added a sleek fallback spinner. |
| [`frontend/src/components/landing/Navbar.tsx`](file:///c:/Users/ishit/AutoNexa/frontend/src/components/landing/Navbar.tsx) | Modified | Updated status pill to render accurate tri-state visuals: neutral gray with pulse for `null` ("Checking API…"), emerald green for `true` ("API Connected"), and warm amber for `false` ("Simulation Mode"). |
| [`frontend/src/components/landing/Footer.tsx`](file:///c:/Users/ishit/AutoNexa/frontend/src/components/landing/Footer.tsx) | Modified | Applied matching tri-state dynamic classes to the footer API status indicator. |
| [`vercel.json`](file:///c:/Users/ishit/AutoNexa/vercel.json) | Modified | Configured `Cache-Control: public, max-age=31536000, immutable` for all `/images/*` routes to maximize CDN edge caching. |

---

## 4. Verification Evidence & Benchmarks

### 4.1 Asset Size Benchmarks (Measurable Evidence)

| Asset | Original Format | Optimized Format | Original Size | Optimized Size | Reduction |
|---|---|---|---|---|---|
| Hero 3D Isometric Network | PNG (`@2x`) | WebP | 583.6 KB | 53.2 KB | **-90.9%** |
| Pipeline Engine Central Plinth | PNG | WebP | 102.1 KB | 13.8 KB | **-86.5%** |
| **Combined Media Payload** | Raster PNG | Modern WebP | **685.7 KB** | **67.0 KB** | **-90.2%** |

### 4.2 JavaScript Code-Splitting Benchmarks

| Metric | Before Fix | After Fix | Impact |
|---|---|---|---|
| Monolithic Initial Chunk | `445y9bgw7x1zr.js` (1.18 MB) | Code-split into on-demand chunk | 1.18 MB removed from landing path |
| Studio Workspace Chunk | Bundled in main bundle | `2-vuu1pq72i2p.js` (867 KB) | Loaded only upon clicking "Launch Workspace" |
| Landing Page Initial Chunks | Combined >1.4 MB | Small partitioned chunks (22 KB, 57 KB, 112 KB) | **~75% reduction in landing JS** |

### 4.3 Network Request Integrity Verification

* **Image Requests:**
  - Before: `GET /_next/image?url=...` returned `404 Not Found`. Broken icon displayed.
  - After: `GET /images/landing-ref/hero-network-light@2x.webp` returns `200 OK` (53 KB). Zero broken image placeholders.
* **Initial API Requests:**
  - Before: `GET /api/v1/datasets` failed with `401 Unauthorized` on landing mount.
  - After: Only `GET /api/v1/health` is invoked on landing mount (completed in <15ms with 200 OK). No unauthenticated 401 calls occur on initial render.
* **Connection State Accuracy:**
  - Before: Always rendered static green "API Connected" badge even before health resolution or during network disconnects.
  - After: Renders "Checking API…" (pulsing neutral badge) -> resolves to "API Connected" (emerald badge) or "Simulation Mode" (amber badge) within 3.5s bound.

### 4.4 Automated Production Build & Type Checking

```powershell
npm run build
```
**Output:**
```
▲ Next.js 16.4.2 (Turbopack)
✓ Running next.config.ts took 35ms
- Cache Components enabled
- Partial Prefetching enabled

  Creating an optimized production build ...
✓ Compiled successfully in 1356ms
  Running TypeScript ...
  Finished TypeScript in 3.6s ...
  Collecting page data using 5 workers ...
  Generating static pages using 5 workers (0/4) ...
  Generating static pages using 5 workers (1/4) 
  Generating static pages using 5 workers (2/4) 
  Generating static pages using 5 workers (3/4) 
✓ Generating static pages using 5 workers (4/4) in 688ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
└ ○ /_not-found

○  (Static)  prerendered as static content
```
*Result: Exit Code 0 (Clean, 0 errors, 0 warnings).*

### 4.5 Browser Functional & Visual Validation

Visual checks performed via automated headless browser subagent on local production server (`http://127.0.0.1:3000`):
1. **Hero Section (`landing_hero_1792784588165.png`):**
   - 3D isometric network artwork renders with complete fidelity.
   - Central AutoNexa robot mascot is positioned on the stationary plinth.
   - CSV pedestal, database cylinders, hyperparameter cubes, evaluation bar charts, and prediction laptop are all visible and connected with active SVG energy conduits.
   - Zero broken image icons or misaligned elements.
2. **Interactive Pipeline Section (`landing_pipeline_1792784595960.png`):**
   - Central plinth graphic with "AutoNexa AI Engine" and robot mascot renders cleanly.
   - Scrollytelling steps 1 to 6 function smoothly with lazy-loaded media.
3. **Workspace Dynamic Transition (`workspace_view_1792784664885.png`):**
   - Clicking "Launch Workspace" seamlessly mounts `WorkspaceView`.
   - All 15 navigation tabs (`OverviewTab`, `DatasetsTab`, `ProfilingTab`, `TrainingTab`, etc.) remain fully functional.
   - Demo dataset loading (`Telco Churn Sample`) succeeds without errors (`workspace_after_churn_1792784727799.png`).

---

## 5. Remaining Considerations & Unmeasurable Metrics

1. **Vercel Remote Telemetry / Real User Monitoring (RUM):**
   - In the local testing environment, synthetic TTFB and LCP are under 80ms and 350ms respectively due to local loopback latency. Real-world edge CDN TTFB and LCP on `https://autonexa-orpin.vercel.app` depend on Vercel's global PoP routing, but will benefit directly from the 90.2% asset size reduction and immutable cache headers.
2. **Commit & Push Preservation:**
   - In accordance with the prompt constraints, no automatic git commit, push, or Vercel deployment was executed. All changes reside cleanly in the working tree ready for review.
