# Data model

There are two kinds of data, kept strictly apart:

- **Personal plant data** — SQLite, `storage/plants.sqlite`. Read-write, persists across container rebuilds.
- **Species reference data** — JSON, `species-catalog/<id>.json`. Read-only at runtime, version-controlled.

## SQLite

Defined in `apps/api/src/db/schema.ts`. Migrations live in `apps/api/drizzle/` and are applied
automatically at startup. After changing the schema, run `npm run db:generate -w apps/api` and commit the
generated SQL.

Conventions:

| Kind | Representation |
|---|---|
| ids | UUID v4 text |
| timestamps | ISO 8601 UTC text, e.g. `2026-10-11T07:30:00.000Z` (sorts lexically) |
| calendar dates | `YYYY-MM-DD` text |
| booleans | INTEGER 0/1 |
| enumerations | stable lowercase identifiers, translated in the UI |

Pragmas: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`.

### `plants` — one row per physical plant

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `species_id` | TEXT NULL | Catalog id; validated by the API, not a foreign key. Indexed. |
| `nickname` | TEXT NOT NULL | Stored exactly as entered (1–100 chars) |
| `custom_species_name` | TEXT NULL | For species not in the catalog |
| `location` | TEXT NULL | Free text, e.g. "Living room" |
| `light_exposure` | TEXT NULL | `direct` · `bright-indirect` · `medium` · `low` |
| `window_orientation` | TEXT NULL | `north` … `north-west` (8 directions) |
| `acquired_at` | TEXT NULL | Calendar date |
| `pot_diameter_cm` | REAL NULL | > 0, ≤ 500 |
| `pot_material` | TEXT NULL | `plastic` · `terracotta` · `ceramic` · `concrete` · `metal` · `glass` · `fabric` · `other` |
| `has_drainage` | INTEGER NULL | NULL = unknown |
| `soil_description` | TEXT NULL | |
| `condition` | TEXT NOT NULL | `healthy` · `needs-attention` · `unhealthy` · `unknown` (default) |
| `notes` | TEXT NULL | Up to 5000 chars |
| `created_at`, `updated_at` | TEXT NOT NULL | |

### `activities` — care history

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `plant_id` | TEXT NOT NULL | FK → `plants.id`, `ON DELETE CASCADE` |
| `activity_type` | TEXT NOT NULL | `watering` · `fertilizing` · `repotting` · `pruning` · `treatment` |
| `performed_at` | TEXT NOT NULL | When the care happened |
| `notes` | TEXT NULL | |
| `created_at` | TEXT NOT NULL | When it was recorded |

Index `(plant_id, activity_type, performed_at)` serves "latest watering/repotting" lookups.

**Derived values:** `lastWateredAt` / `lastRepottedAt` in API responses are
`max(performed_at)` over that plant's `watering` / `repotting` rows. They're never stored. Known past dates
entered when adding a plant become ordinary activity rows.

### `photos` — photo metadata (files live on disk)

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `plant_id` | TEXT NOT NULL | FK → `plants.id`, `ON DELETE CASCADE` |
| `storage_key` | TEXT NOT NULL UNIQUE | `<plantId>/<photoId>.jpg`, relative to `storage/photos/` |
| `is_cover` | INTEGER NOT NULL | Partial unique index: at most one cover per plant |
| `captured_at` | TEXT NULL | Optional, if supplied by the client |
| `created_at` | TEXT NOT NULL | |

A plant's first photo becomes its cover. When the cover is deleted, the newest remaining photo becomes
the cover.

Each photo has a thumbnail next to it, `<plantId>/<photoId>.thumb.jpg`. Its path is derived from
`storage_key`, so it has no column of its own, and a missing thumbnail is regenerated on request.

## Species JSON

One file per species, `species-catalog/<id>.json`; the file name must equal `id`. The authoritative
definition is the Zod schema in `packages/shared/src/species.ts`, which uses strict objects, so unknown
or misspelled fields are errors.

```jsonc
{
  "schemaVersion": 1,
  "id": "monstera-deliciosa",              // lowercase kebab-case, stable forever
  "scientificName": "Monstera deliciosa",
  "family": "Araceae",
  "temperatureCelsius": { "idealMin": 18, "idealMax": 29, "minimum": 12 },
  "toxicity": { "cats": "toxic", "dogs": "toxic", "humans": "mildly-toxic" },
                                            // non-toxic | mildly-toxic | toxic | unknown
  "image": {                                // optional; file must exist in species-catalog/images/
    "file": "monstera-deliciosa.jpg",
    "author": "Smatu",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",   // null for public domain
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Monstera_deliciosa_DSC02605.jpg"
  },
  "localizations": {
    "en": { /* localization, below */ },
    "he": { /* same structure, in Hebrew */ }
  },
  "researchMetadata": {
    "status": "draft",                      // draft | reviewed
    "reviewedAt": null,                     // YYYY-MM-DD; required (with ≥1 source) when reviewed
    "method": "How the content was produced and checked",
    "sources": [{ "title": "…", "url": "https://…", "publisher": "…", "accessedAt": "2026-10-11" }]
  }
}
```

Language-independent values (ids, temperatures, toxicity classes, research status) live at the top
level. All prose lives in each localization:

| Field | Content |
|---|---|
| `commonName`, `alternateNames[]` | Primary display name and other names |
| `description`, `appearance` | Short introduction; general appearance |
| `care.light` | `summary`, `details`, `directSun`, `lowLight`, `warningSigns[]` |
| `care.watering` | `summary`, `details`, `howToCheck`, `seasonal`, `overwateringSigns[]`, `underwateringSigns[]` |
| `care.temperature` | `summary`, `details`, `extremes` |
| `care.humidity` | `summary`, `details` |
| `care.soil` | `summary`, `details`, `drainage`, `additives[]` |
| `care.fertilizing` | `summary`, `details`, `seasonal` |
| `care.repotting` | `summary`, `details`, `rootBoundSigns[]`, `potSizing` |
| `care.pruning` | `summary`, `details` |
| `care.propagation` | `summary`, `methods[{ name, instructions }]` |
| `healthyAppearance`, `warningSigns[]` | What healthy looks like; signs of trouble |
| `commonProblems[]` | `{ problem, possibleCauses[], whatToDo }` |
| `safety` | `toxicity` (explanation), `handling` |
| `additionalNotes[]` | Anything else (may be empty) |

Text fields must be non-empty, and listed arrays must have at least one entry except `alternateNames`,
`additives` and `additionalNotes`. Missing Hebrew (or English) content fails validation.
