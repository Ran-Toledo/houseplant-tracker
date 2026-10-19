# Houseplant Tracker

A personal, mobile-first web app for keeping track of your houseplants: photos, where each plant lives,
its pot and soil, its health, and a history of watering, feeding, repotting and other care. Every plant can
be linked to a species from a bilingual (English/Hebrew) care-guide catalog.

It runs on your own Windows PC with Docker and is used from desktop browsers and from an iPhone on the same
Wi-Fi. It is built for one person; there are no accounts. It makes **no AI or other external service calls**.

- English and Hebrew UI, with full right-to-left layout in Hebrew
- Plant collection with search, condition and location filters
- Plant details: care guide for the species, your plant's conditions, care history, photos
- One-tap **Watered Today**, plus logging of fertilizing, repotting, pruning and treatments
- Photos from the iPhone camera or library, resized and stripped of location metadata
- 12 pre-researched species with photos, in version-controlled JSON (`species-catalog/`)

## Technology

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, react-i18next, React Router |
| Backend | Node.js 22, TypeScript, Hono, Zod |
| Data | SQLite (better-sqlite3 + Drizzle ORM, SQL migrations), photo files on disk |
| Species reference | Bilingual JSON files validated with Zod |
| Runtime | Docker Compose (two services: `web`, `api`) |
| Tests | Vitest (API integration tests; React Testing Library for the UI) |

## Architecture at a glance

```
 iPhone / PC browser
        │
        ▼
 ┌──────────── web (nginx) ───────────────────────────────┐
 │ built React app; proxies /api/* ────────┐              │
 └─────────────────────────────────────────┼──────────────┘
                                           ▼  (Compose network)
 ┌──────────── api (Hono) ────────────────────────────────┐
 │ routes → services → repositories → SQLite (embedded)   │
 │ catalog loader (in-memory, read-only)                  │
 └───────┬───────────────────────────┬────────────────────┘
         ▼                           ▼
 ./storage/  (read-write)     ./species-catalog/  (read-only)
   plants.sqlite                 <species-id>.json
   photos/<plant>/<photo>.jpg (+ .thumb.jpg)
   backups/<name>/
```

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DATA_MODEL.md](docs/DATA_MODEL.md) ·
[docs/SPECIES_CATALOG.md](docs/SPECIES_CATALOG.md) · [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).
UI mockups the screens are based on: [docs/design/](docs/design/).

## Repository layout

```
apps/
  api/        Hono backend (src/routes, services, repositories, db, catalog, storage, scripts)
              drizzle/ holds the SQL migrations; test/ holds API and database tests
  web/        React frontend (src/pages, components, api, hooks, i18n, lib, styles); public/ icons + manifest
packages/
  shared/     Zod schemas and TypeScript types shared by both apps (species format, plant input, DTOs)
species-catalog/   one bilingual JSON file per species (Git-tracked, mounted read-only)
storage/           your data: SQLite database, photos, backups (Git-ignored, created on first run)
scripts/           repo utilities (icon generation)
docs/              architecture, data model, catalog workflow, plan, design mockups
compose.yaml       the two Docker services (release builds)
compose.dev.yaml   override for development with hot reload
```

## Prerequisites (Windows 11)

- **Docker Desktop** using the WSL 2 backend and Linux containers (the default).
- **Git**.
- Optional, only to run tests or scripts outside Docker: **Node.js 22**. Node 22 ships with npm 10; if
  `npm -v` prints an older version, an old global npm in `%APPDATA%\npm` is shadowing it — remove it with
  `npm uninstall -g npm` or call `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"` directly.

## Start, stop, reset

From the repository folder:

```bash
docker compose up --build
```

Open `http://localhost:<WEB_PORT>` (the port is set in `.env`; see `.env.example`). Add `-d` to run in
the background, and view logs with
`docker compose logs -f`. The first build takes a few minutes, mostly compiling the SQLite driver.

```bash
docker compose down
```

stops and removes the containers. **Your data is not affected**: it lives in `./storage` on your PC, not
inside the containers. Rebuilding (`docker compose up --build`) is safe for the same reason.

This runs the **release** builds: a bundled API on plain Node and the production frontend served by
nginx. Code changes take effect after `docker compose up --build`.

**Developing with hot reload:** add the dev override, which runs `tsx watch` and the Vite dev server with
the source folders mounted:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

Edits under `apps/*/src`, `packages/shared/src`, `apps/web/public` and `apps/web/index.html` then reload
automatically. Changes to `package.json`, Dockerfiles, `vite.config.ts` or the compose files still need
`--build`. File watching polls (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)), which costs some CPU
even when idle, so switch back to the release setup when you're done.

**Resetting the environment without losing data:** `docker compose down`, then
`docker compose build --no-cache`, then `docker compose up`. This rebuilds images and dependencies from
scratch and never touches `./storage`. To start over with an empty collection, first make a backup (below),
stop the app, then move the `storage` folder somewhere else — do not delete it unless you are sure.

Configuration (optional): copy `.env.example` to `.env` to change the web port (`WEB_PORT`), the
localhost-only API port (`API_PORT`) or the upload limit (`MAX_UPLOAD_MB`). The only secret is the
optional OpenAI key (see [AI features](#ai-features)).

## How data is stored

- **Your plants, care history and photo records** are in `storage/plants.sqlite` (SQLite, WAL mode).
  Schema changes are applied automatically at startup from `apps/api/drizzle/` migrations.
- **Photos** are files in `storage/photos/<plant-id>/<photo-id>.jpg`. Uploads are re-encoded to JPEG,
  limited to 2048 px on the longest side, rotated upright, and have all metadata removed (including GPS).
- **Species information** comes only from `species-catalog/*.json`, which the API reads at startup and
  never writes. Nothing about species is stored in SQLite.
- `storage/` is Git-ignored. `species-catalog/` is Git-tracked.

## Languages

Use the **EN / עברית** switch on the *Settings* tab. The choice is saved in
the browser. On first visit the app follows the browser's language and falls back to English. Hebrew
switches the whole layout to right-to-left. Your own text (nicknames, notes, locations) is never
translated. Species guides come in both languages from the catalog files.

## AI features

AI features use the OpenAI API and are optional: without a key the app works as before. The groundwork
is in place (settings, usage tracking, the AI service); identification, health checks and the assistant
are being built on it (see [docs/NEXT_STAGE_DESIGN.md](docs/NEXT_STAGE_DESIGN.md)).

To turn AI features on:
1. Add your key to `.env` next to `compose.yaml` (`OPENAI_API_KEY=…`). Don't put it in `apps/api/`.
   Optionally set `OPENAI_MODEL`; the default is `gpt-5.4-mini`, and the model must accept images.
2. Run `docker compose up -d` to recreate the api container with the key.
3. Check that the key and model work. This sends one tiny request:

   ```bash
   docker compose exec api npm run ai:check
   ```

*Settings → AI features* shows the status and this month's usage, and has an on/off switch. Requests are
capped at 300 a month by default (`aiMonthlyRequestLimit`, changeable through `PATCH /api/settings`).
Only the api container gets the key; the web container and the browser never do. A request sends only
what that feature needs (for example the photo and the plant's details) and is made with `store: false`,
so it isn't saved in your OpenAI account.

## Species catalog

Add a species by adding one JSON file to `species-catalog/` named `<id>.json`. Validate it, then restart
the API so it's loaded:

```bash
npm run validate:catalog
```

```bash
docker compose restart api
```

The validator lists every problem with the file and field. You can also run it inside the container with
`docker compose exec api npm run validate:catalog`. If a file is invalid, the API refuses to start and
prints the same list — fix it and restart. The full workflow, field reference and research rules are in
[docs/SPECIES_CATALOG.md](docs/SPECIES_CATALOG.md).

All 14 included species were written with AI assistance, cross-checked against the cited sources (NC
State Extension, ASPCA), and reviewed by the owner. Each guide shows its status and sources.

## Backup and restore

Back up regularly and copy the backup folder off the PC (cloud drive or USB disk).

**Back up** (safe while the app is running — it uses SQLite's online backup API, so the snapshot is
consistent even if you're using the app at the same time):

```bash
docker compose exec api npm run backup
```

This creates `storage/backups/<timestamp>/` containing `plants.sqlite`, a copy of `photos/`, and
`backup.json` with record counts. Each backup is integrity-checked after it's written.

**Restore** (stop the API first so nothing writes during the restore):

```bash
docker compose stop api
```

```bash
docker compose run --rm --no-deps api npm run restore -- <backup-name>
```

```bash
docker compose start api
```

Running `restore` without a name lists the available backups. Before replacing anything, restore saves
the current data as a `pre-restore-<timestamp>` backup, so an accidental restore can be undone.

To restore from a copy kept elsewhere, put the backup folder back under `storage/backups/` first.

## Tests and checks

With Node.js 22 installed locally (after `npm install` in the repo root):

```bash
npm run check
```

This runs TypeScript checks, catalog validation and all tests. Individually: `npm run typecheck`,
`npm run validate:catalog`, `npm test`. API tests use an in-memory SQLite database and temporary photo
folders; they never touch `storage/`.

## Security notes

This is a single-user app for a trusted home network. There is **no authentication**: anyone on your
Wi-Fi who knows the address can view and change your plants.

- The API port is published on `127.0.0.1` only; other devices reach it only through the web app's
  `/api` proxy.
- All input is validated with Zod; SQL goes through Drizzle's parameterized queries.
- Uploads are size-limited, decoded and re-encoded server-side, and stored under server-generated names;
  photo paths are never derived from request input.
- Do not expose the web port to the internet (no port forwarding). Hosting it publicly would need
  authentication and HTTPS first.
- The only secret, the optional `OPENAI_API_KEY`, lives in `.env`, which Git and Docker both ignore. It
  is passed to the api container only.

## Known MVP limitations

- Runs only while the PC is on; no offline mode.
- No authentication, single user.
- Species catalog changes need an API restart; there's no in-app species editor (by design).
- HEIC uploads are rejected (iOS usually converts to JPEG automatically).
- No reminders or notifications.

## Roadmap

**In progress** (design in [docs/NEXT_STAGE_DESIGN.md](docs/NEXT_STAGE_DESIGN.md)):
- AI plant identification and health analysis from photos;
- a read-only, context-aware assistant, which also gives personalized care advice;
- watering reminders, with notifications to the iPhone over Tailscale HTTPS.

**Later:** propagation tracking, growth comparisons, supply inventory, and cloud hosting with
authentication.
