# Performance: remaining ideas

Ideas that haven't been implemented yet, ordered by impact. Measured on 2026-10-16 (Docker Desktop on
Windows 11, 8 cores) with the release containers from `compose.yaml`.

## Where things stand

| | Release setup | Dev override (`compose.dev.yaml`) |
|---|---|---|
| API memory, idle after a fresh start | ~45 MB | ~120 MB |
| Web memory, idle | ~8 MB (nginx) | ~140 MB (Vite) |
| CPU at idle | ~0% | ~23% of a core (file polling) |
| First page load | 8 requests, ~212 KB transferred | 53 requests, ~8.3 MB of JS |

Already done: photo thumbnails for cards and tiles, release builds by default (nginx + bundled API on
plain Node).

## Ideas

### 1. Limit sharp's memory and CPU use during uploads

**Problem:** The API process stays at 200–460 MB after photo uploads and never shrinks back:
- after one 12 MP upload, ~207 MB RSS (release setup);
- after five 12 MP uploads, ~460 MB RSS (dev setup; not yet re-measured on release).

Decoding a 12 MP photo takes ~36 MB per image. By default, libvips uses every core (up to ~430% CPU
during four concurrent uploads) and keeps a 50 MB operation cache.

**Change:** In `apps/api/src/services/images.ts`:
- call `sharp.concurrency(2)` and `sharp.cache(false)`;
- allow only one or two images to be processed at a time (a small in-process queue around
  `processImage` and `makeThumbnail`).

**Gain:** Expected to keep the upload spike to roughly 150–200 MB and the CPU peak to about 2 cores.

**Effort:** small.

### 2. Return freed memory to the OS

**Problem:** glibc's allocator holds on to memory freed by libvips, so RSS doesn't fall after uploads.
sharp's documentation recommends jemalloc on glibc-based Linux.

**Change:** One of:
- in the API `release` stage, install `libjemalloc2` and set
  `LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2`;
- or move to an Alpine (musl) base image.

**Gain:** Memory should return to near the idle level after uploads.

**Effort:** small. Re-run the upload measurement afterwards.

### 3. Keep zod out of the frontend bundle

**Problem:** The web app imports only constants (`CONDITIONS`, `ACTIVITY_TYPES`, …) and `speciesImageUrl`
from `@houseplant/shared`. Because the Zod schemas are built when the module loads, the whole of zod is
bundled anyway. The release JS is 486 KB (148 KB gzipped) in a single chunk.

**Change:** Move the constants and `speciesImageUrl` into `packages/shared/src/constants.ts`, export them
as a subpath (`"./constants"` in `packages/shared/package.json`), and import them from
`@houseplant/shared/constants` in `apps/web`.

**Gain:** Likely tens of KB less gzipped JS.

**Effort:** small.

### 4. Small species images

**Problem:** Species photos are ~110–230 KB each, at up to 1200 px. The species picker shows them at
40 px and the Species tab list at card size.

**Change:** Generate thumbnails for the catalog images, the same way as for user photos. Either:
- pre-generate `species-catalog/images/<id>.thumb.jpg`;
- or serve a resized version from `GET /api/species/:id/image?size=thumb`, cached in memory, since the
  catalog is small.

**Gain:** Less download and decode work on the Species tab and in the picker.

**Effort:** small.

### 5. Stream image files instead of buffering them

**Problem:** `GET /api/photos/:id/file`, `/thumb` and `GET /api/species/:id/image` read the whole file into
a `Buffer` and then copy it again with `new Uint8Array(data)`.

**Change:** Stream the file (`fs.createReadStream` → `c.body(stream)`), or at least pass the buffer
without copying. Adding `ETag`/`Last-Modified` would also let the 1-day species-image cache revalidate
cheaply.

**Gain:** Two fewer in-memory copies per image request.

**Effort:** small.

### 6. Skip the duplicate plant-list request

**Problem:** `PlantListPage` calls `api.listPlants()` twice on every visit: once with the filters and once
unfiltered for the total count. With no filter active, the two calls are identical.

**Change:** Reuse the filtered result when `q`, `condition` and `location` are all empty.

**Gain:** One request fewer per page view.

**Effort:** trivial.

### 7. Split the frontend bundle by route

**Change:** Lazy-load `PlantFormPage`, `PlantDetailPage` and `SpeciesPages` with `React.lazy`, so the
plant list loads first.

**Gain:** A smaller first load, which matters most on a phone.

**Effort:** small.

### 8. Faster photo encoding

**Problem:** The full-size photo is encoded with `mozjpeg: true`, which gives smaller files but is slower.
A 12 MP upload takes ~1.3 s.

**Change:** Measure plain libjpeg at quality 82 against mozjpeg, comparing time and file size, and keep
mozjpeg only if it's clearly worth it.

**Effort:** trivial.

### 9. Smaller API image

**Problem:** The release API image is ~480 MB on disk (it was 1.18 GB with the dev image). Runtime memory
isn't affected.

**Change:** Copy only the native modules (`better-sqlite3`, `sharp` and `@img/*`) into the release stage
instead of the whole production `node_modules`, or move to an Alpine base (see idea 2).

**Effort:** small.

### 10. Development setup only

These affect only `compose.dev.yaml`.

**npm wrappers:** Each dev container runs a ~61 MB `npm run dev` process that only starts the real one.
Use `CMD ["npx", "tsx", "watch", ...]` / `["npx", "vite"]`, or call the binaries directly.

**File polling (~23% of a core at idle):** Either:
- raise the interval to 1000 ms or more (`CHOKIDAR_INTERVAL`, Vite's `server.watch.interval`);
- or move the repository into the WSL 2 filesystem, so inotify works and polling can be turned off.

## How to measure

- Container totals: `docker stats --no-stream`.
- Per-process memory: read `VmRSS` / `VmHWM` from `/proc/<pid>/status` inside the container.
- Idle CPU: compare `utime + stime` in `/proc/<pid>/stat` over 20 s.
- Upload behaviour: post a synthetic 12 MP JPEG (`sharp({ create: { width: 4032, height: 3024, ... } })`)
  to `/api/plants/:id/photos`, then check RSS again a minute later.
- Frontend: the browser's resource timing (`performance.getEntriesByType('resource')`) for request count
  and bytes, and `vite build` output for bundle size.
