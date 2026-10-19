# Implementation Plan & Progress

Status legend: `[x]` done and verified · `[~]` done, with a noted limitation · `[ ]` not done.

Verification summary (2026-10-11): `npm run check` passes — typecheck of all workspaces, catalog validation
(12 files), 40 API/database tests, 10 web tests. The running Docker stack was checked by hand in the
browser at phone size, in English and Hebrew.

## Stage 1 — Foundation and Docker environment

- [x] npm workspaces: `packages/shared`, `apps/api`, `apps/web`
- [x] React + TypeScript + Vite frontend, Tailwind CSS v4
- [x] Node.js + TypeScript + Hono backend, `GET /api/health`
- [x] Shared strict TypeScript config (`tsconfig.base.json`)
- [x] Dockerfiles (repo-root build context, cached `npm ci`, non-root `node` user)
- [x] `compose.yaml`: `web` (all interfaces) and `api` (localhost only); host ports configurable in `.env`
- [x] Bind mounts: `./storage` (rw), `./species-catalog` (ro), source dirs for hot reload
- [x] Vite proxies `/api` to the `api` service over the Compose network
- [x] Hot reload for API (`tsx watch`) and web (Vite HMR), using polling because Windows host file events don't reach Linux containers
- [x] `.env.example`, `.gitignore`, `.dockerignore`

Verified: `docker compose up --build` starts both services. `/api/health` answers directly and through the
proxy, and the app answers on the Wi-Fi address. Source edits reload without rebuilds. Data in
`./storage` survives `down`/`up` and `--build`.
[~] Access from a real iPhone must be confirmed on the device.

## Stage 2 — Species catalog schema and loader

- [x] Zod schema for bilingual species JSON (`packages/shared/src/species.ts`), strict objects
- [x] Loader collects every problem with file + field path, and rejects duplicate ids, id/filename mismatches and invalid JSON
- [x] In-memory index; `GET /api/species`, `GET /api/species/:id` (bilingual responses, read-only)
- [x] `npm run validate:catalog`
- [x] Tests: valid files, invalid JSON, schema errors, missing `he` localization, missing translated field, unknown fields, duplicates, filename, reviewed-without-sources, real catalog

## Stage 3 — SQLite schema and plant CRUD API

- [x] Drizzle schema + generated SQL migration, applied on startup; WAL, foreign keys, busy timeout
- [x] `plants`, `activities`, `photos` with cascades; one-cover-per-plant partial unique index
- [x] Plant CRUD with Zod validation, catalog species-id checks, non-catalog plants via `customSpeciesName`
- [x] Search (text + species names in both languages, LIKE wildcards escaped), location and condition filters
- [x] Activities endpoints; last watering/repotting derived from activities on read
- [x] Tests: CRUD, Hebrew text round-trip, validation errors, 404s, cascades, FK enforcement, derived dates
- [x] Verified a plant survives container `down`/`up`

## Stage 4 — Bilingual species catalog (12 species)

- [x] 12 species JSON files, English + Hebrew, all care categories
- [x] Sources: NC State Extension Plant Toolbox (11 species + Spathiphyllum genus page), ASPCA plant pages
- [x] Research status honestly `draft`; per-file `method` explains what was checked; `unknown` where sources were silent
- [x] Workflow documented in `docs/SPECIES_CATALOG.md`
- [x] Human review of the drafts: approved by the owner on 2026-10-19, all entries now `reviewed`

## Stage 5 — Core frontend and localization

- [x] i18next with `en`/`he` dictionaries (key parity tested), Hebrew plurals, persisted choice, browser-language detection
- [x] `dir`/`lang` on `<html>`; logical CSS utilities; mirrored directional icons; `<bdi>` for mixed-direction text
- [x] Plant Collection (Screen A) and Plant Details (Screen B) ported from `docs/design/` with API data
- [x] Add/Edit form: searchable bilingual species picker, "not in catalog" option, validation, known care dates, initial photo
- [x] Species list and species detail pages, Settings, 404
- [x] Loading, empty and error states; delete confirmation dialog; toasts
- [x] Verified in the browser at 375 px: add, edit, delete, language switch mid-page, RTL layout, search, filters

## Stage 6 — Photos and maintenance tracking

- [x] Upload (camera or library via `accept="image/*"`), sharp processing (rotate, ≤ 2048 px, JPEG, metadata stripped), HEIC rejected clearly
- [x] Cover photo (first photo automatically; can be changed), multiple photos, viewer, deletion
- [x] Watered Today, manual activity logging, timeline with deletion
- [x] Tests: upload, resize, cover rules, invalid/HEIC/oversized files, 404s, path traversal, plant-delete cleanup
- [x] Verified in the browser: cover photo shown on card and hero; Watered Today updates "last watered"

## Stage 7 — Polish, testing, local deployment

- [x] Web app manifest, PNG/SVG icons (`scripts/generate-icons.mjs`), iOS Home Screen meta tags
- [x] Backup (`npm run backup`, SQLite online backup + photos + integrity check) and restore (with pre-restore safety copy)
- [x] Backup/restore tested in unit tests and with the documented Docker commands on the running stack
- [x] Security review: localhost-only API port, host allow-list for the dev server, JSON and upload size limits, safe photo paths, parameterized SQL, no secrets
- [x] README, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/SPECIES_CATALOG.md`
- [~] iPhone Safari / Home Screen behavior needs confirming on a real device

## Changes after the MVP

- [x] App renamed to "Houseplant Tracker" (Hebrew UI: "מעקב עציצים"); language switch moved to Settings only; larger bottom-tab labels
- [x] Species photos from Wikimedia Commons (`species-catalog/images/`) with author/license attribution in the JSON and the UI; loader checks the files exist; plants without their own photo show their species photo
- [x] Photo thumbnails (512 px `.thumb.jpg`) for cards and gallery tiles; generated on upload, regenerated on demand if missing, skipped by backups
- [x] `compose.yaml` runs release builds (nginx serving the built frontend, esbuild-bundled API on plain Node); hot reload moved to the `compose.dev.yaml` override

## Known follow-ups

- `drizzle-kit` (dev-only) pulls a deprecated esbuild with a moderate advisory about its dev server, which
  drizzle-kit doesn't run. Upgrade when drizzle-kit drops it.
