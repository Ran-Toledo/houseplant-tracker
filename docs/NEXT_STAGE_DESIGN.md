# Next stage: design proposal

Status: **approved, revision 2** (2026-10-19), with the owner's feedback applied. Implementation starts
with the shared groundwork. It covers the features planned after the MVP (`v0.1.0`):

1. [AI plant identification and health analysis from photos](#1-ai-identification-and-health-analysis)
2. [Personalized care recommendations: folded into the assistant](#2-personalized-care-recommendations-folded-into-the-assistant)
3. [Context-aware assistant (read-only)](#3-context-aware-assistant-read-only)
4. [Watering reminders and notifications](#4-watering-reminders-and-notifications)

**Changes in revision 2:**
- Care recommendations are no longer a separate UI component. The assistant gives them.
- The assistant has **no actions**. It reads the catalog and the plant database and makes suggestions
  in text; it never changes data, and there are no confirm-to-apply chips.
- The open questions are answered (see [Decisions](#decisions)).

Later features (propagation tracking, growth comparisons, supply inventory, cloud hosting with
authentication) are out of scope, but the design avoids decisions that would block them. See
[Looking ahead](#looking-ahead).

## Summary

| Feature | Core idea | New tables | New dependencies | Main UI changes |
|---|---|---|---|---|
| AI identification & health | OpenAI vision call through a provider interface; results validated with Zod and stored per plant | `ai_requests`, `health_checks` | `openai` | "Identify from photo" in the plant form; "Check health" on photos; health history on the plant page |
| Care recommendations | Folded into the assistant: a small rules module computes care signals the assistant reads as a tool | — | — | None (shows up as assistant answers) |
| Assistant | Streaming chat grounded in the catalog and plant database through **read-only** tools; suggestions only, never changes | `conversations`, `messages` | `react-markdown` | New Assistant tab; "Ask about this plant" on the plant page |
| Reminders & notifications | Per-plant schedules; due dates derived from the activity log; in-app first, then Web Push | `care_schedules`, `push_subscriptions`, `notifications` | `web-push` | Due badges and a "Needs care" strip on My plants; schedule control on the plant page; notification settings |
| Shared | Settings store, AI configuration, structured catalog care data | `settings` | — | AI and notification sections in Settings |

**Suggested build order:** foundations → reminders (in-app) → identification & health → assistant →
push notifications. Reasons:
- In-app reminders give daily value with no new infrastructure.
- The assistant reads health checks and care signals, so it comes after them.
- Push needs HTTPS on the LAN, the largest infrastructure change.

The order can change; each phase ships on its own.

---

## 0. Shared foundations

### Settings store

There's no settings storage yet; the UI language lives in the browser. Add a small key/value table for
app-wide settings that the server needs:

| Key | Example | Used by |
|---|---|---|
| `timezone` | `"Asia/Jerusalem"` | Reminder due dates, notification time, seasons |
| `hemisphere` | `"north"` | Season-aware rules (growing vs. dormant months) |
| `aiEnabled` | `true` | Owner switch, on top of the API key being configured |
| `aiMonthlyRequestLimit` | `300` | Cost guard |
| `notificationTime` | `"08:30"` | Daily reminder time |
| `notificationsPausedUntil` | `"2026-11-02"` | Vacation pause |

The UI language stays client-side. The server receives `lang` on requests that produce text.

### AI provider module (`apps/api/src/ai/`)

- `AiProvider` interface that only transports requests: `generateStructured` now, plus a streaming chat
  method in the assistant phase. The prompts and context for identification, health checks and the
  assistant live in their feature services.
- `openai-provider.ts` implements it with the official `openai` SDK and the **Responses API**:
  - image input (base64 data URL);
  - **structured output** with a JSON Schema generated from the shared Zod schema
    (`z.toJSONSchema`, built into Zod 4);
  - `store: false`, so OpenAI doesn't keep conversation state for us.
- `fake-provider.ts` returns canned results, so tests never call the network.
- Config, from the repository-root `.env` and passed to the api container only, never to the
  browser (see [Decisions](#decisions)):
  - `OPENAI_API_KEY`: if unset, AI features are off and their endpoints return
    `503 ai_disabled`;
  - `OPENAI_MODEL`: a current vision-capable model, chosen when implementing;
  - `AI_TIMEOUT_MS` (default 60000).
- Every call is logged in `ai_requests`, with token counts, latency and outcome. That table drives
  usage stats in Settings and the monthly limit.
- Images are resized to a longest edge of 1024 px with sharp before sending. The 512 px thumbnail is
  too small to see pests; the 2048 px original costs more without helping. Stored photos already
  have no EXIF/GPS.
- Model output is always validated with Zod before it's stored or shown. If validation fails, the
  request is recorded as an error and the UI shows "couldn't analyse this photo".

### `GET /api/config`

Returns what the client needs to show or hide features:
`{ ai: { configured, enabled, available, model, usedThisMonth, monthlyLimit }, push: { available, vapidPublicKey }, timezone }`.

### Structured care data in the species catalog

The catalog is free text today. Rules and reminders need a few machine-readable values, so add an
optional `careProfile` block to the species schema. Optional fields keep `schemaVersion: 1` files
valid. The validator warns when it's missing, and all 14 files get one.

```jsonc
"careProfile": {
  "light": { "preferred": "bright-indirect", "tolerates": ["medium"] },  // LIGHT_EXPOSURES values
  "watering": {
    "dryBeforeWatering": "top-layer",        // "top-layer" | "half" | "mostly"
    "checkEveryDays": { "growing": [5, 9], "dormant": [10, 18] }  // starting estimate for reminders
  },
  "growingMonths": [3, 4, 5, 6, 7, 8, 9],    // northern hemisphere; shifted by 6 for "south"
  "fertilizeEveryDays": { "growing": 30 },
  "humidity": "medium"                        // "low" | "medium" | "high"
}
```

`checkEveryDays` is only a starting estimate for when to *check the soil*. It isn't watering advice,
so it follows the catalog rule against presenting intervals as schedules. Reminder wording follows the
same rule ("Time to check Monty's soil"). SPECIES_CATALOG.md would document the block and its
sources.

Also update one line in SPECIES_CATALOG.md, which says the app "never calls an AI model to read or
translate" the catalog. The new rule: AI features may receive catalog text as **context**, but
never write to the catalog. The catalog stays human-maintained and reviewed.

---

## 1. AI identification and health analysis

### Identification

**Flow**
1. In the plant form (new or edit), tap **Identify from photo** and pick or take a photo. It can be
   the photo you're about to attach, or an existing photo of this plant.
2. The API sends it to the model with the list of catalog species (ids, scientific and common names),
   so the model can map its answer onto the catalog.
3. The response shows up to 3 candidates. Each has a scientific name, a common name in the active
   language, a confidence label (high / medium / low), a one-line reason, and a catalog match if any.
4. Tapping a candidate fills `speciesId` (catalog match) or `customSpeciesName` (no match). Nothing
   is saved until the form is.

**Response schema** (`packages/shared/src/ai.ts`)

```ts
identificationSchema = z.object({
  candidates: z.array(z.object({
    scientificName: z.string(),
    commonName: z.object({ en: z.string(), he: z.string() }),
    catalogSpeciesId: speciesIdSchema.nullable(),   // validated against the catalog server-side
    confidence: z.enum(['high', 'medium', 'low']),
    reason: z.object({ en: z.string(), he: z.string() }),
  })).max(3),
  notAPlant: z.boolean(),
});
```

Text comes back in both languages, as with the catalog, so switching language never repeats the
request. The server drops any `catalogSpeciesId` that isn't in the catalog.

**API**
- `POST /api/ai/identify`: multipart `photo` (not stored) or JSON `{ photoId }`.
  Returns `{ identification, requestId }`.

### Health analysis

**Flow**
1. On a photo in the viewer, or from the plant page, tap **Check health**.
2. The API sends the photo plus context:
   - the plant's species care profile and its key care text;
   - pot, light and window details;
   - the last ~10 activities, with dates relative to today;
   - the plant's current condition and notes.
3. The result card shows:
   - an assessed condition, using the existing `healthy` / `needs-attention` / `unhealthy` values;
   - a short summary;
   - up to 5 findings, each with what was seen, a likely cause, how confident the model is, and
     what to do;
   - a visible "AI assessment, not a diagnosis" note.
4. **Apply condition** updates `plants.condition`, but only when tapped. Findings can be turned into
   a `treatment` activity with one tap.
5. Past checks appear in a **Health checks** list on the plant page, newest first, with their photo,
   so you can see a plant improve over time.

**Response schema**

```ts
healthAssessmentSchema = z.object({
  condition: z.enum(['healthy', 'needs-attention', 'unhealthy']),
  confidence: z.enum(['high', 'medium', 'low']),
  summary: z.object({ en: z.string(), he: z.string() }),
  findings: z.array(z.object({
    key: z.enum(['overwatering', 'underwatering', 'too-little-light', 'sun-scorch', 'pests',
                 'nutrient-deficiency', 'root-rot', 'disease', 'normal-ageing', 'other']),
    observation: z.object({ en: z.string(), he: z.string() }),
    likelihood: z.enum(['likely', 'possible']),
    actions: z.array(z.object({ en: z.string(), he: z.string() })).max(4),
  })).max(5),
  photoQualityIssue: z.enum(['none', 'blurry', 'too-dark', 'plant-not-visible']),
});
```

The fixed `key` values let the care-signals module and reminders react to findings (for example, an
`overwatering` finding stretches the next watering check), and let the UI show icons, without
parsing free text.

**API**
- `POST /api/plants/:id/health-checks` `{ photoId }` → `201 { healthCheck }`
- `GET /api/plants/:id/health-checks`
- `POST /api/health-checks/:id/apply` → sets `plants.condition`, records `applied_at`
- `DELETE /api/health-checks/:id`

### Database

```text
ai_requests                       -- one row per model call (all AI features)
  id              TEXT PK
  kind            TEXT NOT NULL   -- identify | health | care-notes | chat
  plant_id        TEXT NULL  FK plants.id ON DELETE SET NULL
  photo_id        TEXT NULL  FK photos.id ON DELETE SET NULL
  model           TEXT NOT NULL
  status          TEXT NOT NULL   -- ok | invalid-output | refused | error | timeout
  input_tokens    INTEGER NULL
  output_tokens   INTEGER NULL
  latency_ms      INTEGER NULL
  error_code      TEXT NULL
  result_json     TEXT NULL       -- validated output (identification results live only here)
  created_at      TEXT NOT NULL
  INDEX (created_at), INDEX (plant_id)

health_checks
  id              TEXT PK
  plant_id        TEXT NOT NULL FK plants.id ON DELETE CASCADE
  photo_id        TEXT NULL     FK photos.id ON DELETE SET NULL
  ai_request_id   TEXT NOT NULL FK ai_requests.id
  condition       TEXT NOT NULL   -- healthy | needs-attention | unhealthy
  confidence      TEXT NOT NULL
  assessment_json TEXT NOT NULL   -- healthAssessmentSchema
  applied_at      TEXT NULL
  created_at      TEXT NOT NULL
  INDEX (plant_id, created_at)
```

### UI changes
- **Plant form:**
  - "Identify from photo" next to the species picker;
  - a candidates sheet with confidence chips and catalog photos for matches.
- **Photo viewer:** a "Check health" button.
- **Plant page:**
  - a "Check health" action (it uses the cover photo or asks for a new one);
  - a Health checks section;
  - a result card with an Apply-condition button.
- **Settings → AI:**
  - status (on / off / no key);
  - requests used this month and the limit;
  - a privacy note: photos and the plant's details are sent to OpenAI for analysis, and nothing else
    leaves the PC.
- Long waits (5–20 s) show a progress state that names what's happening.

### Dependencies
- api: `openai` (official SDK).

The nginx `/api/` location needs `proxy_read_timeout 120s` for slow model calls.

---

## 2. Personalized care recommendations: folded into the assistant

There's no separate recommendations card or page. Personalized advice is something you *ask* the
assistant ("What should I do for Monty this week?"), and the assistant offers it at the start of a
plant conversation.

To keep that advice consistent and grounded, rather than whatever the model improvises, a small
**care-signals module** (`apps/api/src/care/signals.ts`) computes facts the assistant reads through a
tool. It has no UI and stores nothing. Its inputs:
- the species `careProfile`;
- the plant record (light exposure, window orientation, pot material and size, drainage);
- the activity history;
- the latest health check;
- the season (from `timezone` + `hemisphere`).

It returns signals like these:

| Signal | Trigger |
|---|---|
| `light-mismatch` | Plant light `low` but species prefers `bright-indirect` |
| `direct-sun-risk` | South/west window + `direct` + species doesn't tolerate direct sun |
| `fast-drying-pot` | Terracotta or a small pot |
| `no-drainage` | `hasDrainage = false` |
| `dormant-season` | Current month outside `growingMonths` |
| `fertilizing-overdue` | Growing season and last fertilizing older than `fertilizeEveryDays` |
| `repot-check` | Last repotting more than 2 years ago |
| `watering-pattern` | Your actual intervals are far outside the species' range |
| `recent-health-findings` | A health check with findings in the last 14 days |

The same module also feeds the adaptive reminder interval (section 4), so reminders and the
assistant never disagree. It gets table-driven unit tests.

**Removed from revision 1:** the "For this plant" card, dismissals, the separate AI care notes, and the
`recommendation_dismissals` and `ai_care_notes` tables.

---

## 3. Context-aware assistant (read-only)

### Design
- A chat that knows your collection. A conversation is either **about one plant** (opened from its
  page) or **general** (Assistant tab).
- **Read-only by design.** The assistant can *read* the species catalog and the plant database, and
  *suggest* things in its reply. It can't change anything: no writes, no "apply" buttons, no
  scheduling, no background tasks. Acting on a suggestion is always something you do yourself in the
  normal screens. This also defuses prompt injection through notes or photos, because there's nothing
  for injected instructions to trigger.
- **Grounding via read-only tools.** Each tool is a plain function that runs server-side against
  SQLite or the in-memory catalog and returns JSON:

  | Tool | Returns |
  |---|---|
  | `list_plants` | Nicknames, species, locations, conditions, last care dates, next due checks |
  | `get_plant` | Full record plus recent activities and the latest health check |
  | `get_care_history` | Activities in a date range |
  | `get_health_checks` | Past health assessments for a plant |
  | `get_care_signals` | Output of the care-signals module (section 2) |
  | `search_species` | Catalog species matching a name, in either language |
  | `get_species_guide` | Catalog care text (one language) and care profile |

  Tools take ids or search text only and return data only. The tool layer has no access to
  repositories' write methods: it gets a separate read-only interface, so this is enforced in code,
  not just in the prompt.
- **Photos in chat:** you can attach a photo (stored as one of the plant's photos, or used only for
  that message), and it goes to the model as an image.
- **Streaming:** Server-Sent Events via Hono's `streamSSE`. nginx needs `proxy_buffering off` on the
  stream route.
- **Context size:** the last ~20 messages are sent, plus a rolling summary of older ones, stored on
  the conversation. `store: false` at OpenAI; the history lives only in SQLite.
- **Language:** it replies in the UI language, plant names as written.
- **Guardrails** (system prompt):
  - answer about plant care, using tool data rather than guessing;
  - cite the catalog guide when it's the source;
  - say when unsure;
  - warn about toxicity for pets and children;
  - be clear that it can't make changes ("you can log this from the plant page").

### API
- `GET /api/conversations?plantId=` / `POST /api/conversations` `{ plantId? }`
- `GET /api/conversations/:id/messages`
- `POST /api/conversations/:id/messages` `{ text, photoId?, lang }` → SSE stream of `delta` / `done`
  / `error` events
- `DELETE /api/conversations/:id`

### Database

```text
conversations
  id              TEXT PK
  plant_id        TEXT NULL FK plants.id ON DELETE CASCADE
  title           TEXT NULL        -- generated after the first exchange
  summary         TEXT NULL        -- rolling summary of older messages
  created_at      TEXT NOT NULL
  updated_at      TEXT NOT NULL

messages
  id              TEXT PK
  conversation_id TEXT NOT NULL FK conversations.id ON DELETE CASCADE
  role            TEXT NOT NULL    -- user | assistant
  content         TEXT NOT NULL
  photo_id        TEXT NULL FK photos.id ON DELETE SET NULL
  tool_trace_json TEXT NULL        -- which read-only tools were called (debugging; not shown)
  ai_request_id   TEXT NULL FK ai_requests.id
  created_at      TEXT NOT NULL
  INDEX (conversation_id, created_at)
```

### UI changes
- **Navigation:** a 4th bottom tab, **Assistant**, with a conversation list and a "New chat" button.
- **Plant page:** an "Ask about this plant" button, which opens the plant's latest conversation or
  starts one.
- **Chat screen:**
  - message bubbles with `dir="auto"` for mixed Hebrew and English;
  - Markdown rendering (lists, bold), sanitized with no raw HTML;
  - photo attach;
  - streaming text;
  - starter questions, which replace the old recommendations card: "What should I do for this plant
    this week?", "Why are the leaves yellow?", "Is it getting enough light?", "When should I repot?".
- New mockups go in `docs/design/` (assistant list, chat) before building, as with the MVP screens.

### Dependencies
- web: `react-markdown`.
- api: none beyond `openai`.

---

## 4. Watering reminders and notifications

### Design: schedules on top of the activity log

- A **care schedule** per plant and activity type. It starts with watering, and fertilizing can
  follow with the same machinery. Two modes:
  - **Fixed:** check every *N* days, set by the user.
  - **Adaptive:** the next check comes from the median of the plant's own recent watering intervals,
    bounded by the species' `checkEveryDays` range for the current season, and nudged by the latest
    health check (for example, overwatering lengthens it). With fewer than 3 waterings it uses the
    species range.
- **Built in phase 1** (2026-10-19), with two refinements:
- The adaptive interval stays within *half the species' minimum to twice its maximum*, not the bare
  range. A sunny spot can genuinely need checks twice as often, and a single long gap can't stretch the
  median much.
- Logging a watering clears any snooze, so an early watering never leaves a stale postponed reminder.

The care-signals module (section 2) moved to phase 3, because only the assistant reads it.

**Due dates are derived, never stored:** `next_due = last activity of that type (or schedule
  start) + interval`. This follows the MVP's "derived, not duplicated" rule. Logging "Watered today"
  automatically clears the reminder.
- **Snooze** (1 day / 3 days) sets `snoozed_until`. A vacation pause in Settings silences everything.

### Delivery, in two steps

**Step 1: in-app (no new infrastructure).**
- A "Needs care" strip at the top of My plants (overdue, today, tomorrow).
- Due badges on cards.
- The count as a badge on the My plants tab.
- A home-screen app badge where supported.

**Step 2: Web Push to the iPhone.**
- iOS supports Web Push for a web app **added to the Home Screen** (iOS 16.4+). The app already has
  what that needs: a manifest with `display: standalone` and the Apple web-app meta tags.
- The remaining requirement is **HTTPS with a certificate the iPhone trusts**. Service workers and
  push only work in a secure context, and an untrusted or self-signed certificate doesn't count:
  Safari won't register a service worker on it. Public certificate authorities (like Let's Encrypt)
  only issue certificates for public domain names they can verify. They won't issue one for
  `192.168.1.20` or `my-pc.local`. So on a home network the certificate has to come from one of these:

  | Option | How | iPhone setup | Trade-offs |
  |---|---|---|---|
  | **A. Tailscale HTTPS** (recommended) | Install Tailscale on the PC and iPhone; `tailscale serve` publishes the web app as `https://<pc>.<tailnet>.ts.net` with an automatic Let's Encrypt certificate | Tailscale app, signed in | No certificate to install; also gives secure access away from home; depends on a free third-party service |
  | **B. Own domain + Let's Encrypt** | A subdomain you own (e.g. `plants.example.com`) pointing at the PC's LAN IP; nginx gets a certificate with the DNS-01 challenge | None | Needs a domain (~$10/year) and a DNS provider with an API; LAN-only unless also exposed |
  | **C. Local CA (mkcert)** | mkcert creates your own root certificate authority and signs a certificate for `<pc-name>.local` and the LAN IP; nginx serves it | Install mkcert's root CA once (Settings → General → About → Certificate Trust Settings) | Fully offline; installing a root CA on the phone is a security-sensitive step |

  "Local CA" in revision 1 meant option C. Option A avoids it, and also covers access from outside
  the home, which the cloud-hosting stage would otherwise have to solve.
- A **service worker** (`apps/web/public/sw.js`, hand-written and small) receives push events, shows
  the notification, and opens the plant page on tap.
- Server side:
  - `web-push` with VAPID keys from `.env`;
  - a **scheduler inside the API process**: a one-minute interval checks the clock against
    `notificationTime` in the `timezone` setting, groups everything due into **one daily
    notification** ("3 plants to check today: Monty, ציפורה, …"), and records it in `notifications`
    so restarts never send duplicates;
  - expired subscriptions (HTTP 404/410 from the push service) are deleted.
- The container's clock is UTC, so all due-date maths uses the `timezone` setting explicitly. Tests
  inject a fake clock.

Push still works when the phone is away from home, because delivery goes through Apple's push
service. The PC just has to be on at notification time.

**Alternative to step 2,** if none of the HTTPS options suit: a **Telegram bot** or **ntfy** channel.
Both have reliable iPhone apps and need no HTTPS. Either fits the same `notifications` table as another
`channel`. Moving to cloud hosting later gives real HTTPS anyway.

### API
- `GET /api/plants/:id/schedules` / `PUT /api/plants/:id/schedules/watering`
  `{ mode, intervalDays?, enabled }`
- `POST /api/schedules/:id/snooze` `{ days }`
- `GET /api/due?days=2` → due and overdue items across all plants (powers the strip and badges)
- `POST /api/push/subscriptions` / `DELETE /api/push/subscriptions/:id`
- `POST /api/push/test`

### Database

```text
care_schedules
  id              TEXT PK
  plant_id        TEXT NOT NULL FK plants.id ON DELETE CASCADE
  activity_type   TEXT NOT NULL    -- watering (later: fertilizing, …)
  mode            TEXT NOT NULL    -- fixed | adaptive
  interval_days   INTEGER NULL     -- required for fixed
  enabled         INTEGER NOT NULL DEFAULT 1
  snoozed_until   TEXT NULL
  created_at      TEXT NOT NULL
  updated_at      TEXT NOT NULL
  UNIQUE (plant_id, activity_type)

push_subscriptions
  id              TEXT PK
  endpoint        TEXT NOT NULL UNIQUE
  p256dh          TEXT NOT NULL
  auth            TEXT NOT NULL
  user_agent      TEXT NULL
  created_at      TEXT NOT NULL
  last_success_at TEXT NULL
  failure_count   INTEGER NOT NULL DEFAULT 0

notifications                      -- what was sent, for de-duplication and history
  id              TEXT PK
  channel         TEXT NOT NULL    -- push (later: telegram, email, …)
  digest_date     TEXT NOT NULL    -- local date of the daily digest
  plant_ids_json  TEXT NOT NULL
  status          TEXT NOT NULL    -- sent | failed | skipped
  sent_at         TEXT NOT NULL
  UNIQUE (channel, digest_date)
```

New plants get an adaptive watering schedule by default, after a one-time question in the plant form
("Remind me to check the soil?").

### UI changes
- **My plants:** a "Needs care" strip, due badges on cards, and a tab badge.
- **Plant page:**
  - a "Watering" control (Off / Every N days / Adaptive);
  - a "next check" date with the reason ("based on your last 5 waterings");
  - snooze;
  - "Watered today" stays the one-tap way to clear it.
- **Plant form:** a "Remind me" toggle with a suggested interval.
- **Settings → Notifications:**
  - "Enable notifications" (on iOS it explains Add to Home Screen first, and is only enabled when
    running as an installed app over HTTPS);
  - daily time;
  - vacation pause;
  - "Send test notification";
  - a list of devices.

### Dependencies
- api: `web-push`, `@types/web-push` (dev).
- Infra, step 2 only:
  - mkcert, a host tool rather than an npm package;
  - an nginx TLS config;
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` in `.env`.

---

## Cross-cutting

### Changes per layer

| Layer | Changes |
|---|---|
| `packages/shared` | `ai.ts` (identification, health, chat event schemas), `care.ts` (care-signal keys, schedule input), species `careProfile` schema, new DTOs |
| `apps/api` | `ai/` (provider interface, OpenAI and fake, read-only assistant tools), `care/` (care signals, adaptive interval), `scheduler/` (daily digest, push sender), new repositories, routes and services, migrations `0001_…` onward, `GET /api/config` |
| `apps/web` | Assistant pages, plant page sections (health checks, schedule, "Ask about this plant"), form additions, Settings sections, service worker, push subscription, `config` hook to hide AI features when off |
| `species-catalog` | `careProfile` added to all 14 files, re-reviewed by the owner |
| Infra | Root `.env`: `OPENAI_*`, `VAPID_*`; compose passes them to the api service only; nginx: longer timeout for `/api/`, unbuffered SSE route; HTTPS via the option chosen for push |

### Database migrations

All new tables come from Drizzle migrations generated with `npm run db:generate`. They're applied
automatically at API startup, as today. Existing tables don't change. Backups keep working unchanged:
SQLite's online backup covers the new tables.

### Privacy, cost and safety
- Only the API container holds the OpenAI key. The browser never sees it.
- What leaves the PC, and only when you tap an AI action: the photo (EXIF-free, 1024 px), the plant's
  details and recent history, and the relevant catalog text.
- `store: false` on every OpenAI request. Per OpenAI's API data policy, API data isn't used for
  training by default.
- Monthly request limit plus usage stats in Settings, with a clear message when it's reached.
- Every model output is Zod-validated. The assistant is read-only: its tools get a read-only data
  interface, so it can't change anything even if prompted to. Rendered Markdown has no raw HTML.
- AI labels everywhere AI content appears, and "not a diagnosis" wording on health checks.

### Testing
- The fake provider covers all AI routes: success, invalid output, timeout, refusal and AI disabled.
- The care-signals module and adaptive intervals get table-driven unit tests.
- An assistant test checks that every tool is read-only: database row counts are unchanged after a
  conversation that calls all tools.
- The scheduler gets an injected clock, with tests for timezone and DST edges, duplicate prevention,
  and quiet periods.
- Push sending is tested against a stub of `web-push`.
- Frontend tests cover hidden-when-disabled AI buttons, streaming chat rendering and due badges.
- One opt-in, manual "live" check script hits the real OpenAI API with a sample photo. It's never part
  of `npm test`.

## Looking ahead

Choices made now to keep later features easy:
- **Cloud hosting + authentication:**
  - every new table hangs off `plants`, so adding a `user_id` (or `household_id`) to `plants` and
    `settings` later scopes everything;
  - the AI key and VAPID keys are already server-only;
  - HTTPS comes with hosting, which removes the mkcert step.
- **Propagation tracking:** a propagation is a plant with a `parent_plant_id` plus a `propagation`
  activity type. Schedules and health checks then work unchanged.
- **Growth comparisons:** health checks already store dated photos. Side-by-side views and simple
  measurements (`plant_measurements`: height, leaf count) can build on the photo timeline.
- **Supply inventory:** `supplies` and `activity_supplies` tables. The assistant can then mention
  "you're low on fertilizer" when the `fertilizing-overdue` signal fires.

## Decisions

Answers from the owner, 2026-10-19:

1. **OpenAI key:** the owner has a key created for this project.
   - It goes in the **repository-root `.env`**, next to `compose.yaml`. That's the file Docker Compose
     reads, and both `.gitignore` and `.dockerignore` already exclude it, so it's never committed or
     copied into an image.
   - Compose passes it to the api service only (`OPENAI_API_KEY: ${OPENAI_API_KEY:-}` under
     `api.environment`). The web/nginx container and the browser never see it.
   - Don't use `apps/api/.env`: Compose doesn't read it, and `.dockerignore` only excludes the root
     file, so it would be copied into the dev image along with the API source.
   - `.env.example` gets a commented `OPENAI_API_KEY=` line.
   - The default monthly request limit still needs a number from the owner; 300 until then.
2. **Web Push:** yes, Home Screen web apps on iOS support it, and the app is already set up for that.
   The open part is a *trusted* HTTPS certificate (see [step 2](#4-watering-reminders-and-notifications)).
   **Chosen: Tailscale HTTPS (option A).** Tailscale is already installed on the owner's PC and phone.
   The push phase publishes the web app with `tailscale serve` at the PC's
   `https://<pc>.<tailnet>.ts.net` address, with its Let's Encrypt certificate. It also adds
   `.ts.net` to nginx's host allow-list (today only `localhost`, IPs and `*.local` are answered), and
   the iPhone installs the Home Screen app from that address. In-app reminders don't depend on it.
3. **Assistant:** no actions and no agentic capabilities. It reads the catalog and plant database
   and makes suggestions in text only.
4. **Defaults:** timezone `Asia/Jerusalem`, northern hemisphere, daily digest at 08:30.
