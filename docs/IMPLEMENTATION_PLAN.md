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
- [x] `compose.yaml`: `web` and `api` both published on localhost only (`web` was first on all interfaces; phones now use the Tailscale HTTPS address); host ports configurable in `.env`
- [x] Bind mounts: `./storage` (rw), `./species-catalog` (ro), source dirs for hot reload
- [x] Vite proxies `/api` to the `api` service over the Compose network
- [x] Hot reload for API (`tsx watch`) and web (Vite HMR), using polling because Windows host file events don't reach Linux containers
- [x] `.env.example`, `.gitignore`, `.dockerignore`

Verified: `docker compose up --build` starts both services. `/api/health` answers directly and through the
proxy, and the app answered on the Wi-Fi address (later restricted to localhost; phones now use the
Tailscale HTTPS address; see the README). Source edits reload without rebuilds. Data in
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

## Next stage (after v0.1.0)

Design: [NEXT_STAGE_DESIGN.md](NEXT_STAGE_DESIGN.md) (approved 2026-10-19).

### Phase 0 — Shared groundwork
- [x] `settings` table, `GET/PATCH /api/settings`, defaults (Asia/Jerusalem, north, 08:30, AI on, 300 requests/month)
- [x] `ai_requests` table; AI service with owner switch, monthly limit (in the local time zone), Zod-validated structured output and a log of every call
- [x] OpenAI provider (Responses API, `store: false`, default `gpt-5.4-mini`) and a fake provider for tests
- [x] `GET /api/config`; Settings → AI features (status, usage, on/off, privacy note)
- [x] `OPENAI_API_KEY` from the root `.env`, passed to the api container only; nginx `proxy_read_timeout 120s`
- [x] `npm run ai:check` live check (run once against the real API: OK)
- [x] Species `careProfile` block; all 14 entries filled in (pending owner review); validator warns when missing
- [x] Tests: settings and config API, AI service outcomes and limits, time-zone maths, careProfile validation

### Phase 1 — Watering reminders (in-app)
- [x] `care_schedules` table; `GET/PUT /api/plants/:id/schedules`, `POST /api/schedules/:id/snooze`, `GET /api/due`; plants carry `wateringDue`
- [x] Due dates derived from the activity log in the owner's time zone; adaptive interval (species range by season → median of the plant's own intervals after 3 waterings); snooze cleared by watering
- [x] Notifications bell (top of My plants, with the due count) opening a Notifications page with the "Needs care" list and one-tap Watered; "Check soil" card badge (Screen A mockup); reminder control and snooze in the plant page's watering card; "Remind me" toggle (on by default) for new plants
- [x] Tests: interval and due maths, schedules/snooze/due API (fixed clock, time-zone edge), reminder UI
- The care-signals module moved to phase 3: only the assistant reads it, so it's built with the assistant

### Phase 2 — AI identification and health analysis
- [x] Screen C mockup (`docs/design/screen-c-ai-identify-health.html`): identify panel, health result card, Health checks list, photo viewer button
- [x] Shared `ai.ts` schemas (identification, health assessment, DTOs); `health_checks` table (migration `0003`)
- [x] `POST /api/ai/identify` (upload, not stored, or a stored photo); answers mapped onto the catalog (unknown ids dropped, matches by scientific name, catalog names used)
- [x] Health checks: `GET/POST /api/plants/:id/health-checks`, `POST /api/health-checks/:id/apply`, `DELETE /api/health-checks/:id`; context is the plant's details, last 10 activities and species care notes
- [x] UI: "Identify from photo" in the plant form; Health checks section on the plant page (run on the cover photo or a new one, history, apply condition, log a finding as a treatment); "Check health" in the photo viewer; AI buttons hidden when AI isn't available
- [x] Tests: identify and health-check API with the fake provider (catalog mapping, context, limits, errors, cascades), schema conversion to OpenAI's strict format, UI flows
- [x] Live check against the real API (`gpt-5.4-mini`, throwaway database, 2026-10-19): 14 catalog photos at 512 px plus 5 independently verified photos from iNaturalist and Wikimedia Commons — 19/19 identified correctly (17 high confidence, 2 medium); about 1,000–2,000 input and 100–400 output tokens per call, 2–4.5 s each. Health checks found healthy plants healthy; one miss: dried leaves at the base of a Monstera weren't mentioned

### Phase 3 — Read-only assistant
- [x] Screen D mockup (`docs/design/screen-d-assistant.html`): Assistant tab, a plant conversation, "Ask about this plant"
- [x] Care-signals module (`care/signals.ts`) with table-driven tests: light mismatch, direct-sun risk, fast-drying pot, no drainage, dormant season, fertilizing overdue, repot check, watering pattern, recent health findings
- [x] Read-only model (`assistant/read-model.ts`) and 7 tools (`list_plants`, `get_plant`, `get_care_history`, `get_health_checks`, `get_care_signals`, `search_species`, `get_species_guide`); the tools only get the read-only model
- [x] `conversations`/`messages` tables (migration `0004`); conversation API; `POST /api/conversations/:id/messages` streams `message`/`status`/`delta`/`done`/`error` events over SSE (`X-Accel-Buffering: no` for nginx)
- [x] Chat loop: up to 6 model calls per answer (the last without tools), each logged in `ai_requests` and counted toward the monthly limit; last 20 messages sent, older ones folded into a rolling summary; only the new message's photo is sent
- [x] UI: Assistant tab (shown when AI is available or conversations exist), chat page with streaming, Markdown (no raw HTML, no links), starter questions, photo attach in plant chats; "Ask about this plant"; assistant pages load on demand
- [x] Tests: tools are read-only (row counts unchanged after every tool runs), tool errors, step limit, errors before and during the stream, photos, history window and summary; UI flows; tool schemas convert to OpenAI's strict format
- [x] Live check against the real API (`gpt-5.4-mini`, throwaway database, 2026-10-19): 6 questions in plant, general and Hebrew conversations, including an off-topic one and a request to change data. Answers used the right tools and data; off-topic and change requests were declined; no rows changed. 1–4 model calls per answer, about 1,200–6,500 input and 20–450 output tokens per answer, 1–9 s. The first run found three problems, now fixed and re-checked: a species guide fetched with a guessed id (the plant's species id is now in the instructions, and the tool also accepts species names), a contradictory toxicity answer for a plant without a catalog guide, and gendered Hebrew addressed to the owner
- Differences from the design: the title is the first question (no extra model call); photos can be attached only in plant conversations; the care signals don't change reminder intervals yet

### Phase 4 — Push notifications
- [x] Screen E mockup (`docs/design/screen-e-notifications.html`): Settings → Notifications over http, installed but off, and on
- [x] `push_subscriptions` and `notifications` tables (migration `0005`); `web-push` sender behind a `PushSender` interface (stubbed in tests)
- [x] Daily digest in the API process: a one-minute tick sends once the local notification time has passed, claims the day in `notifications` first (no duplicates across restarts), catches up later the same day, skips quiet days and the vacation pause, writes each device's language, and deletes subscriptions the push service reports gone (404/410)
- [x] `GET/POST /api/push/subscriptions`, `DELETE /api/push/subscriptions/:id`, `POST /api/push/test`, `GET /api/push/status`; `/api/config` reports push availability, the public key and `APP_URL`
- [x] `npm run push:keys` appends VAPID keys to `.env` (never overwrites, never prints the private key); compose passes `VAPID_*` and `APP_URL` to the api service
- [x] nginx and Vite accept `*.ts.net`; `sw.js` is served with `no-cache`
- [x] Service worker (notification, tap opens the plant or the Notifications page, app badge); Settings → Notifications (setup steps, enable, daily time, vacation pause, last digest, test, devices); Home Screen badge follows the due count
- [x] Tests: digest timing, DST, restart, catch-up, pause, quiet day, gone and failing devices, device API; settings UI states
- [ ] On the PC and iPhone: Tailscale HTTPS certificates, `tailscale serve`, push keys, Add to Home Screen, test notification

## Known follow-ups

- `drizzle-kit` (dev-only) pulls a deprecated esbuild with a moderate advisory about its dev server, which
  drizzle-kit doesn't run. Upgrade when drizzle-kit drops it.
