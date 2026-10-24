# Semantic search over the care guides — implementation plan

Status: implemented on this branch (2026-10-24); see the "Semantic search over the care guides" entry in IMPLEMENTATION_PLAN.md for the results.

Branch: `feature/care-guide-rag`. Task source: `TODO.md`.

## Goal

Let the assistant find the right part of a care guide from a description of a symptom
("brown crispy edges", "leaves curling inward", "עלים מצהיבים") even when the question names no
plant. Today it can only match names (`search_species`, `get_species_guide` in
`apps/api/src/assistant/tools.ts`).

## Design decisions

| Question | Decision | Why |
| --- | --- | --- |
| Where to store vectors | New SQLite table `care_guide_sections` in `storage/plants.sqlite` | `species-catalog/` is mounted **read-only** in Docker, so nothing can be written next to it. SQLite is already backed up by `npm run backup`. |
| Vector format | `Float32Array` stored as a `BLOB` (1536 dims × 4 bytes ≈ 6 KB per row) | Compact; no extension needed. |
| Search | Load all rows for a language into memory once, brute-force cosine similarity | ~14 species × ~20 sections × 2 languages ≈ 550 vectors. Microseconds per query; no vector index worth adding. |
| When to rebuild | On startup, and lazily before the first search if startup couldn't (AI off, limit reached, no network). Each section is keyed by a SHA-256 of its text + embedding model, so only new or changed sections are embedded and removed ones are deleted. | "Rebuild when the catalog changes" without re-embedding everything; changing the embedding model re-embeds all. |
| Embedding model | `text-embedding-3-small`, overridable with `OPENAI_EMBEDDING_MODEL` | Cheap, multilingual (Hebrew works), 1536 dims. |
| Counting toward the limit | Every embedding API call is one `ai_requests` row with the new kind `embed`. Rebuilds batch changed sections, 512 per call. A search costs one call. | Matches "one row per model call"; a full rebuild of the 446 sections costs 1 request. |
| Language | *Changed after the first eval:* rank an English query (written by the model) against the English sections only, and return the matching sections in the conversation's language. Hebrew sections aren't embedded. | Hebrew queries against Hebrew sections ranked the right section 2nd–5th; English ranking put every Hebrew question's section first. The model gets text in the language it answers in. |
| Failure inside the tool | Return `{ error }` to the model (as other tools do), never fail the whole answer | The model can fall back to `get_species_guide`. |

## Sections

One section per `(speciesId, lang, sectionKey)`. The embedded text starts with the species'
common and scientific names and the section's title, so a match carries its context, e.g.
`"Monstera (Monstera deliciosa) — Watering: overwatering signs\n…"`.

| `sectionKey` | Source fields (in `localizations[lang]`) |
| --- | --- |
| `overview` | `description`, `appearance`, `healthyAppearance` |
| `light` | `care.light` (summary, details, directSun, lowLight, warningSigns) |
| `watering` | `care.watering` (summary, details, howToCheck, seasonal) |
| `watering-signs` | `care.watering.overwateringSigns`, `underwateringSigns` (kept apart: these are the symptom-heavy parts) |
| `temperature`, `humidity`, `soil`, `fertilizing`, `pruning`, `propagation` | the matching `care.*` topic |
| `repotting` | `care.repotting` incl. `rootBoundSigns`, `potSizing` |
| `warning-signs` | `warningSigns` |
| `problem-<n>` | each `commonProblems[n]`: problem, possible causes, what to do |
| `toxicity` | `safety.toxicity`, `safety.handling`, plus the `toxicity` level |

Pure function `careGuideSections(species): Section[]` — no I/O, easy to unit-test.

## Steps

### 1. Provider: embeddings
- `apps/api/src/ai/provider.ts`: add
  `EmbedRequest { inputs: string[] }`, `EmbedReply { vectors: number[][]; usage: AiUsage }` and
  `AiProvider.embed(request)` plus `readonly embeddingModel: string`.
- `apps/api/src/ai/openai-provider.ts`: implement with `client.embeddings.create({ model, input })`,
  mapping errors through `toProviderError`. Usage: `prompt_tokens` → `inputTokens`, `outputTokens: null`.
- `apps/api/src/ai/fake-provider.ts`: deterministic fake embeddings (hashed bag-of-words into e.g.
  64 dims, normalised) so tests can check ranking without the network; record `embedRequests`;
  allow an `{ error }` behaviour.
- `apps/api/src/config.ts`: `openai.embeddingModel` from `OPENAI_EMBEDDING_MODEL`, default
  `text-embedding-3-small`; add it to `.env.example`.

### 2. AI service: logged, limited embedding calls
- `apps/api/src/db/schema.ts`: add `'embed'` to `AI_REQUEST_KINDS` (TypeScript-only enum; the SQL
  column has no CHECK, so no migration for this).
- `apps/api/src/ai/service.ts`: `embed(context, inputs)` — `assertAvailable()`, call the provider,
  log one row with `model = provider.embeddingModel` (the logger currently always uses
  `active.model`; give it a model parameter), map failures through `failure()`. No `resultJson`
  (vectors are large).

### 3. Storage and index
- `apps/api/src/db/schema.ts`: table `care_guide_sections` — `id` (pk, `speciesId:lang:sectionKey`),
  `species_id`, `lang`, `section_key`, `title`, `content`, `content_hash`, `model`, `vector` (blob),
  timestamps; index on `(lang)`. Generate migration `0006_*` with `npm run db:generate`.
- `apps/api/src/repositories/care-guide-sections.ts`: list all, upsert many, delete by ids (in one
  transaction).
- `apps/api/src/assistant/care-guides.ts`:
  - `careGuideSections(species)` (above).
  - `createCareGuideIndex({ catalog, repo, ai })` with
    - `sync(): Promise<{ embedded, removed, skipped }>` — diff catalog sections against stored
      `(content_hash, model)`, embed what's missing in batches, delete stale rows, refresh the
      in-memory cache. Concurrent calls share one promise.
    - `search(query, { lang, speciesId?, limit = 5 })` — `sync()` if not yet in sync, embed the
      query (one `embed` call), cosine similarity against the cached vectors for `lang`
      (filtered by `speciesId` when given), return top results with score.
- `apps/api/src/index.ts` / `app.ts`: create the index and start `sync()` after startup without
  blocking it; log the result, or log and continue if AI is unavailable.

### 4. Tool
- `packages/shared/src/assistant.ts`: add `'search_care_guides'` to `ASSISTANT_TOOL_NAMES`.
- `apps/web/src/i18n/en.json` / `he.json`: status labels ("Searching the care guides…" /
  "מחפש במדריכי הטיפול…").
- `apps/api/src/assistant/tools.ts`:
  - `ToolContext` gains `guides: CareGuideIndex`.
  - Tool `run` may return a promise; `runTool` becomes `async` and the call in
    `assistant/service.ts` is awaited.
  - New tool `search_care_guides({ query, speciesId: string | null })` — description says to use it
    for symptoms, problems and care questions, especially when no plant or species is named.
    Unknown `speciesId` → the same `{ error }` style as `get_species_guide` (reuse `findSpecies`).
    Returns `{ results: [{ speciesId, commonName, section, title, text, score }] }` (score rounded
    to 2 places). `ApiError`s (limit reached, AI off) come back as `{ error }`.
- `apps/api/src/assistant/service.ts` instructions: one rule — for a symptom or problem, call
  `search_care_guides` (with the plant's speciesId when the conversation is about one), and name
  the guide the advice came from.

### 5. Tests (`apps/api/test`, fake provider, no network)
- `care-guides.test.ts`
  - `careGuideSections` on a fixture species: expected keys, both languages, names in the text.
  - `sync`: first run embeds all in one call and logs one `embed` row; second run embeds nothing;
    editing one section re-embeds only it; removing a species deletes its rows; changing the
    embedding model re-embeds all.
  - `search`: ranking with the fake vectors, `speciesId` filter, `lang` filter, limit; fails with
    `ai_limit_reached` when the monthly limit is used up, and the embed rows count toward it.
- `assistant-api.test.ts`: the model calls `search_care_guides`; the tool result is in the next
  step's input; a provider error comes back as `{ error }` and the answer still completes; the
  `status` event names the new tool.

### 6. Retrieval check with real embeddings
- `apps/api/src/scripts/eval-care-guides.ts` (`npm run eval:guides`, like `ai:check`: real key,
  logged, counts toward the limit, never part of `npm test`).
- Questions in `apps/api/src/scripts/care-guide-questions.json` (next to the script, because the dev
  container mounts only `src`): ~10 questions with the expected
  `speciesId` + `sectionKey`, including:
  - "brown crispy edges on the leaves" → low humidity / underwatering sections
  - "leaves curling inward" → underwatering / light
  - "yellow lower leaves and soggy soil" → `watering-signs`
  - "white cottony bugs on the stems" → the mealybug `problem-<n>`
  - "is it safe for my cat?" with a speciesId → `toxicity`
  - "leggy stems far apart" → `light`
  - "roots coming out of the drainage holes" → `repotting`
  - 2–3 of the above in Hebrew
  Write the expected answers from the actual catalog text, not from memory.
- Report hit@1 and hit@5 per question. Target: every expected section in the top 5. If misses,
  first adjust section boundaries/prefixes, then the tool description — not the threshold.

### 7. Docs
- `docs/ARCHITECTURE.md`: the index, when it rebuilds, the `embed` request kind.
- `docs/DATA_MODEL.md`: `care_guide_sections`.
- `docs/IMPLEMENTATION_PLAN.md`: a stage entry with the verification result.
- Remove the item from `TODO.md` when done.

## Verification

- `npm run check` (typecheck, catalog validation, all tests).
- `npm run eval:guides` against the real API; record hit@5 in `IMPLEMENTATION_PLAN.md`.
- In the running app: ask a general conversation "my plant has brown crispy edges" in English and
  Hebrew; the status line shows the new tool and the answer cites a guide. Restart the api and
  check the log says nothing was re-embedded.

## Open questions

- Should a rebuild's embedding call be allowed when the monthly limit is reached? Plan: no — it
  goes through the same limit; search stays unavailable until the next month or a raised limit.
- Should `search_care_guides` also cover plants without a catalog species (custom names)? Plan:
  no speciesId filter for them, so they get the best matches across the catalog, labelled with the
  species they came from.
