# Species catalog workflow

The catalog (`species-catalog/*.json`) is reference content maintained in Git. The app never edits it and
never calls an AI model to read or translate it.

## Adding a species

1. **Choose the id**: the scientific name in lowercase kebab-case, e.g. `hoya-carnosa`. Ids are permanent
   (plants store them), so use the currently accepted scientific name.
2. **Copy an existing file** to `species-catalog/<id>.json` and replace every value. The format is
   described in [DATA_MODEL.md](DATA_MODEL.md#species-json); the Zod schema in
   `packages/shared/src/species.ts` is authoritative.
3. **Write both languages.** Hebrew should read naturally, not as a word-for-word translation. Use the
   common Hebrew nursery name as `commonName` and put other names in `alternateNames`.
4. **Research honestly** (below), and fill in `researchMetadata`.
5. **Add a photo (optional):** put a JPEG, PNG or WebP named `<id>.jpg` (etc.) in
   `species-catalog/images/`, around 1200 px on the longest side and under ~250 KB, with metadata
   stripped. Add the `image` block with the author, license and source page. Use only images you're
   allowed to use: your own photos, or freely licensed ones such as Wikimedia Commons (CC BY, CC BY-SA,
   CC0, public domain). The app shows the credit next to the photo, as those licenses require.
6. **Validate:** `npm run validate:catalog` (or `docker compose exec api npm run validate:catalog`).
7. **Load it:** `docker compose restart api`. The species appears in the Species tab and the species
   picker.
8. **Commit** the file (and image).

To fix or update an entry, edit it, validate it, and restart the API. Don't change `id`. Renaming a common
name is fine.

## Research rules

- Prefer primary, reputable sources: university extension services (e.g. the NC State Extension Gardener
  Plant Toolbox), botanical gardens, and the ASPCA Animal Poison Control plant lists for pet toxicity.
- Verify especially **toxicity, light, watering and propagation** claims against a source.
- Only list sources you actually consulted, with the real URL and the date you accessed them.
- Don't present watering intervals as schedules. Describe how to check the soil and how needs change
  with season, light and pot.
- Use `unknown` toxicity when the sources don't cover it, and say so in the `safety.toxicity` text.
- AI may help draft content. If it does, say so in `method`.
- Keep `status: "draft"` and `reviewedAt: null` until a person has reviewed the entry against its
  sources. Only then set `status: "reviewed"`, `reviewedAt`, and update `method`. The validator refuses
  `reviewed` without a date and at least one source.

## Current catalog (all drafts)

| id | English | Hebrew | Sources |
|---|---|---|---|
| `monstera-deliciosa` | Monstera | מונסטרה | NC State, ASPCA |
| `epipremnum-aureum` | Golden Pothos | פוטוס זהוב | NC State, ASPCA |
| `dracaena-trifasciata` | Snake Plant | סנסיווריה | NC State, ASPCA |
| `zamioculcas-zamiifolia` | ZZ Plant | זמיוקולקס | NC State |
| `spathiphyllum-wallisii` | Peace Lily | ספטיפיליום | NC State (genus page), ASPCA |
| `ficus-elastica` | Rubber Plant | פיקוס גומי | NC State; ASPCA entry for related *F. benjamina* |
| `chlorophytum-comosum` | Spider Plant | כלורופיטום | NC State, ASPCA |
| `philodendron-hederaceum` | Heartleaf Philodendron | פילודנדרון מטפס | NC State, ASPCA |
| `syngonium-podophyllum` | Arrowhead Plant | סינגוניום | NC State, ASPCA |
| `scindapsus-pictus` | Satin Pothos | סינדפסוס | NC State, ASPCA cat list |
| `tradescantia-zebrina` | Inch Plant | טרדסקנטיה זברינה | NC State |
| `pilea-peperomioides` | Chinese Money Plant | פילאה | NC State |

All entries were drafted with AI assistance on 2026-10-11, and their light, watering, temperature,
propagation and toxicity statements were cross-checked against the listed pages. Notes on specific
entries:

- Some temperature ranges are general guidance where a source gave none; each file's `method` says which.
- No ASPCA entry was found for ZZ plant, *Tradescantia zebrina*, *Pilea peperomioides* or
  *Ficus elastica*.
- Human toxicity is `unknown` for spider plant, satin pothos and rubber plant, because the sources checked
  don't address people.

## Photo credits

All species photos come from Wikimedia Commons (downloaded 2026-10-11, resized to at most 1200 px,
metadata stripped). Each file's author, license and source page are in its JSON `image` block and
shown in the app.

| Species | Author | License |
|---|---|---|
| Monstera | Smatu | CC BY-SA 4.0 |
| Golden Pothos | Mokkie | CC BY-SA 3.0 |
| Snake Plant | Mokkie | CC BY-SA 3.0 |
| ZZ Plant | WeFt | CC BY-SA 3.0 |
| Peace Lily | W.carter | CC BY-SA 4.0 |
| Rubber Plant | B.navez | CC BY-SA 3.0 |
| Spider Plant | Dtarazona (derivative: Peter coxhead) | Public domain |
| Heartleaf Philodendron | KENPEI | CC BY-SA 3.0 |
| Arrowhead Plant | Stephanie cheks | CC BY-SA 4.0 |
| Satin Pothos | Kor!An (Корзун Андрей) | CC BY-SA 3.0 |
| Inch Plant | Flocci Nivis | CC BY 4.0 |
| Chinese Money Plant | Husky | CC0 |
