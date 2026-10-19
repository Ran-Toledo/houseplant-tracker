# Architecture

A three-tier modular monolith, sized for one person on a home network.

| Tier | Component | Responsibility |
|---|---|---|
| Presentation | `apps/web` (React + Vite) | Screens, localization (en/he, LTR/RTL), form validation, calls `/api` |
| Application | `apps/api` (Hono on Node) | REST API, Zod validation, plant/activity/photo logic, catalog lookup |
| Persistence | SQLite file, photo files, catalog JSON | User data (read-write) and species reference data (read-only) |

`packages/shared` holds the Zod schemas and TypeScript types both apps use: the species file format,
plant/activity input, and response DTOs. It's consumed as TypeScript source (no build step of its own);
it's bundled into the release builds of both apps, and compiled on the fly by Vite and `tsx` in development.

## Key decisions

**Two containers, embedded database.** `web` serves the frontend, published on all interfaces; `api`
runs Hono on the Compose network and is published on `127.0.0.1` only. Host ports are set in `.env`
(`WEB_PORT`, `API_PORT`; see `.env.example`). SQLite runs inside the API process; there's no database
container.

**Release builds by default, dev servers on request.** Each Dockerfile has a `release` and a `dev` target.
`compose.yaml` uses `release`:
- `web` is the production build served by nginx (`apps/web/nginx.conf`): hashed assets cached as
  immutable, `index.html` revalidated, SPA fallback, gzip.
- `api` is bundled by esbuild (`apps/api/build.mjs`) and runs on plain Node with production
  dependencies only. Only the native `better-sqlite3` and `sharp` stay external. The build writes
  `dist/package.json` with the same `backup` / `restore` / `validate:catalog` script names, so the
  documented `npm run` commands work in both setups.

`compose.dev.yaml` switches both services to `dev` (Vite dev server, `tsx watch`) and mounts the source.
The release setup uses much less memory (about 45 MB for the API and 8 MB for nginx, versus about
120 MB and 140 MB in development). It also uses no CPU at idle, because nothing polls for file changes.

**Same-origin API through a proxy.** The browser only ever calls `/api/...` on the page's own origin;
nginx (or Vite, in development) proxies to the `api` service by its Compose service name. No CORS, and
phones never need to resolve Docker hostnames. Both only answer for `localhost`, IP addresses and
`*.local` names, which protects the API against DNS-rebinding attacks.

**Data on host bind mounts.** `./storage` (database, photos, backups) and `./species-catalog`
(read-only) are host folders, so `docker compose down`, rebuilds and image upgrades never touch data.

**Species catalog is JSON, not SQLite.** Species data is reference content maintained by editing and
committing files. The API loads all files at startup, validates every one with the shared Zod schema,
rejects duplicates and id/filename mismatches, and keeps an in-memory index. `plants.species_id` holds a
catalog id; it isn't a foreign key, and the service layer checks it against the catalog on write. A plant
whose species later disappears from the catalog still loads, and the UI says the guide is missing.

**Bilingual responses, client-side language choice.** `GET /api/species/:id` returns both `en` and `he`
content and the client renders the active language. Switching language never refetches, and the API stays
free of locale logic. The species list is small enough to return both languages' names too.

**Derived, not duplicated, care dates.** "Last watered" and "last repotted" are computed from the
`activities` table with a correlated `max(performed_at)` in the list query, so they can't drift out of
sync with the history.

**Photos.** Uploads (multipart, size-limited by `MAX_UPLOAD_MB`) are decoded and re-encoded by `sharp`:
EXIF rotation applied, longest edge ≤ 2048 px, JPEG quality 82, metadata stripped. Files are stored as
`photos/<plantId>/<photoId>.jpg` using server-generated UUIDs. The storage layer re-validates every key
against that pattern before touching the filesystem. HEIC is detected and rejected with a clear message.
Each photo also gets a thumbnail, `<photoId>.thumb.jpg` (longest edge ≤ 512 px). Cards and gallery tiles
use it, so the phone decodes about 0.8 MB per tile instead of about 12 MB for the full photo. The
plant-page hero and the photo viewer still use the full photo. Thumbnails are derived files: they have no
database column, backups skip them, and a missing one is regenerated on its first request (this covers
photos uploaded before thumbnails existed and restored backups).
Ordering for consistency:
- Upload writes the files first (atomically, via temp file + rename), then inserts the row. If the insert
  fails, the files are removed.
- Photo delete removes the row first, then the files. A leftover file is harmless and is logged.
- Plant delete relies on `ON DELETE CASCADE` for activities and photo rows, then removes the plant's
  photo folder.

**Backups use SQLite's online backup API** (`better-sqlite3`'s `db.backup()`), so snapshots are
consistent while the app is writing. Restore requires the API to be stopped, and first saves the current
data as a `pre-restore-*` backup.

**Hot reload in Docker on Windows** (dev override only). Windows-host file changes don't produce inotify
events in Linux containers, so both `tsx watch` (`CHOKIDAR_USEPOLLING`) and Vite
(`server.watch.usePolling`) poll, together about a quarter of a CPU core even when idle. Only
source folders are bind-mounted, so the container's Linux `node_modules` (with native SQLite and sharp
binaries) are never shadowed by the host's Windows ones.

## Backend layout (`apps/api/src`)

| Folder | Contents |
|---|---|
| `routes/` | Hono routers: `species`, `plants` (+ activities), `photos`, `care` (schedules, snooze, due list), `settings` (+ `/api/config`). Parse input, call services, shape responses. |
| `services/` | `plants` (species checks, create with initial history, cascade delete), `photos` (upload/cover/delete), `images` (sharp pipeline), `settings` (defaults over stored values), `care` (schedules and due dates, added to plants as `wateringDue`). |
| `repositories/` | Drizzle queries per table; plant list query derives last watering/repotting and joins the cover photo. |
| `ai/` | AI provider interface, the OpenAI implementation and a fake for tests; `service` (owner switch, monthly limit, answer validation, request log); `images` (1024 px JPEG for the model). |
| `care/` | `watering`: pure reminder maths (season, adaptive interval, due status). |
| `lib/` | `zoned-time`: calendar maths in the owner's time zone (the container clock is UTC). |
| `db/` | Drizzle schema and `openDatabase()` (pragmas + migrations). |
| `catalog/` | Catalog loader and in-memory index. |
| `storage/` | Photo file store (safe paths, atomic writes) and backup/restore. |
| `middleware/` | `ApiError`, Zod validation helper, JSON error handler. |
| `scripts/` | `validate-catalog`, `backup`, `restore`, `ai-check` CLIs. |

`createApp(deps)` builds the whole app from injected dependencies (catalog, db, photos dir, AI provider),
which is what the integration tests use with an in-memory database and the fake AI provider.

### AI requests

All model calls go through `ai/service.ts`:
1. It checks the key is configured, AI is switched on in Settings, and the monthly limit isn't reached.
2. It sends the request through the provider. OpenAI's Responses API is used with structured output
   from a Zod schema, and `store: false`.
3. It validates the answer against the same Zod schema.
4. It logs the call in `ai_requests`, whatever the outcome.

Only the api container receives `OPENAI_API_KEY`, and the browser never sees it.
`docker compose exec api npm run ai:check` sends one tiny request to confirm the key and model work.
Feature modules (identification, health checks, the assistant) build their prompts on top of this; see
[NEXT_STAGE_DESIGN.md](NEXT_STAGE_DESIGN.md).

### Error format

Every error response is JSON:

```json
{ "error": { "code": "validation_error", "message": "Invalid request: nickname: is required", "details": [{ "path": "nickname", "message": "is required" }] } }
```

Codes: `validation_error`, `invalid_json`, `invalid_form`, `unknown_species`, `not_found`,
`unsupported_image_format` (415), `payload_too_large` (413), `internal_error` (500).

AI codes:
- `ai_not_configured`, `ai_disabled` (503);
- `ai_limit_reached` (429);
- `ai_refused` (422);
- `ai_timeout` (504);
- `ai_error`, `ai_invalid_output` (502).

### REST endpoints

| Method & path | Purpose |
|---|---|
| `GET /api/health` | Liveness and catalog size |
| `GET /api/species` | Catalog summaries (both languages' names) |
| `GET /api/species/:id` | Full bilingual species entry |
| `GET /api/plants?q=&location=&condition=` | List (newest first); `q` searches nickname, custom species, location, notes and catalog species names in both languages |
| `GET /api/plants/locations` | Distinct locations for the filter |
| `POST /api/plants` | Create; optional `initialActivities` for known past care |
| `GET/PATCH/DELETE /api/plants/:id` | Read / partial update (null clears a field) / delete with cascade |
| `GET/POST /api/plants/:id/activities` | Care history (newest first) / add (Watered Today = `watering` now) |
| `DELETE /api/plants/:id/activities/:activityId` | Remove a history entry |
| `GET/POST /api/plants/:id/photos` | List / upload (`multipart/form-data`, field `photo`, optional `isCover`) |
| `PATCH /api/photos/:id` | `{ "isCover": true }` makes it the cover |
| `DELETE /api/photos/:id` | Delete record and files |
| `GET /api/photos/:id/file` | The JPEG (immutable cache headers) |
| `GET /api/photos/:id/thumb` | 512 px thumbnail, generated if missing (immutable cache headers) |
| `GET /api/plants/:id/schedules` | The plant's care schedules, each with its current due info |
| `PUT /api/plants/:id/schedules/watering` | `{ enabled, mode: "adaptive" or "fixed", intervalDays? }`: create or change the watering reminder |
| `POST /api/schedules/:id/snooze` | `{ days }` (1–14): postpone the current reminder; logging watering clears it |
| `GET /api/due?days=` | Plants whose next check is overdue or within `days` (default 0), most urgent first |
| `GET/PATCH /api/settings` | App-wide settings (time zone, hemisphere, AI switch and monthly limit, reminder time); PATCH takes any subset |
| `GET /api/config` | What the client may show: AI status and monthly usage, push availability, time zone |

## Frontend layout (`apps/web/src`)

| Folder | Contents |
|---|---|
| `pages/` | Collection (Screen A), Plant details (Screen B), Add/Edit form, Species list/detail, Settings, 404 |
| `components/` | App shell + bottom nav (with the due-now badge), "Needs care" strip, watering reminder control, language switch, plant card, care guide, timeline, photo gallery, species picker, dialogs, toast |
| `api/` | Typed `fetch` wrapper and endpoint functions |
| `hooks/` | `useAsync` (load/reload with race protection), `useSpeciesCatalog` (cached, localized names) |
| `i18n/` | i18next setup, `en.json`, `he.json` |
| `lib/` | Date/number formatting (Intl), error-message mapping, due-status text and a "care changed" event |

State is plain React state plus URL search params (collection filters), so Back restores them. No global
store.

**RTL.** The `<html>` `dir`/`lang` attributes follow the language. Layout uses logical utilities
(`ps-`, `start-`, `text-end`, …) so one set of styles serves both directions. Directional icons flip
with `rtl:` variants. User-entered and Latin text is isolated with `<bdi>` or `dir="auto"` so mixed
Hebrew/English renders correctly.

## Next stage

The design for AI identification and health checks, the read-only assistant and reminders is in
[NEXT_STAGE_DESIGN.md](NEXT_STAGE_DESIGN.md). Its shared groundwork is built: settings, `GET /api/config`,
the AI module and the species `careProfile`. Authentication would later be a Hono middleware in front of
`/api`.
