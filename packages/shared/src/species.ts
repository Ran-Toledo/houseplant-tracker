import { z } from 'zod';

/**
 * Bilingual species reference data. One JSON file per species lives in
 * `species-catalog/`; these schemas are the single definition of that format.
 *
 * Language-independent values (ids, numbers, classifications) sit at the top
 * level. All human-readable text lives under `localizations.en` / `.he`.
 */

export const LANGUAGES = ['en', 'he'] as const;
export type Language = (typeof LANGUAGES)[number];

export const SPECIES_SCHEMA_VERSION = 1;

/** Lowercase kebab-case, e.g. `monstera-deliciosa`. */
export const speciesIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase kebab-case (e.g. "monstera-deliciosa")')
  .max(80);

const text = z.string().trim().min(1, 'must not be empty');
const textList = z.array(text).min(1, 'must contain at least one entry');

const careTopic = z.strictObject({
  /** One-line summary shown in compact views. */
  summary: text,
  /** Fuller explanation. */
  details: text,
});

const localizationSchema = z.strictObject({
  commonName: text,
  alternateNames: z.array(text),
  /** Short introduction to the species. */
  description: text,
  /** What the plant generally looks like. */
  appearance: text,
  care: z.strictObject({
    light: careTopic.extend({
      directSun: text,
      lowLight: text,
      warningSigns: textList,
    }),
    watering: careTopic.extend({
      howToCheck: text,
      seasonal: text,
      overwateringSigns: textList,
      underwateringSigns: textList,
    }),
    temperature: careTopic.extend({ extremes: text }),
    humidity: careTopic,
    soil: careTopic.extend({
      drainage: text,
      additives: z.array(text),
    }),
    fertilizing: careTopic.extend({ seasonal: text }),
    repotting: careTopic.extend({
      rootBoundSigns: textList,
      potSizing: text,
    }),
    pruning: careTopic,
    propagation: z.strictObject({
      summary: text,
      methods: z
        .array(z.strictObject({ name: text, instructions: text }))
        .min(1, 'must describe at least one propagation method'),
    }),
  }),
  /** What a healthy specimen normally looks like (leaves, stems, growth). */
  healthyAppearance: text,
  warningSigns: textList,
  commonProblems: z
    .array(z.strictObject({ problem: text, possibleCauses: textList, whatToDo: text }))
    .min(1),
  safety: z.strictObject({
    /** Localized explanation of the toxicity classification. */
    toxicity: text,
    handling: text,
  }),
  additionalNotes: z.array(text),
});

export const TOXICITY_LEVELS = ['non-toxic', 'mildly-toxic', 'toxic', 'unknown'] as const;
export type ToxicityLevel = (typeof TOXICITY_LEVELS)[number];
const toxicityLevel = z.enum(TOXICITY_LEVELS);

export const RESEARCH_STATUSES = ['draft', 'reviewed'] as const;
export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];

const isoDate = z.iso.date();

const temperatureSchema = z
  .strictObject({
    /** Lower end of the comfortable range, °C. */
    idealMin: z.number(),
    /** Upper end of the comfortable range, °C. */
    idealMax: z.number(),
    /** Below this, damage becomes likely, °C. */
    minimum: z.number(),
  })
  .refine((t) => t.minimum <= t.idealMin && t.idealMin <= t.idealMax, {
    message: 'expected minimum <= idealMin <= idealMax',
  });

export const speciesSchema = z
  .strictObject({
    schemaVersion: z.literal(SPECIES_SCHEMA_VERSION),
    id: speciesIdSchema,
    scientificName: text,
    family: text,
    temperatureCelsius: temperatureSchema,
    toxicity: z.strictObject({ cats: toxicityLevel, dogs: toxicityLevel, humans: toxicityLevel }),
    /** Representative photo in `species-catalog/images/`, with attribution for its license. */
    image: z
      .strictObject({
        file: z.string().regex(/^[a-z0-9-]+\.(jpg|jpeg|png|webp)$/, 'must be a file name like "monstera-deliciosa.jpg"'),
        author: text,
        license: text,
        licenseUrl: z.url().nullable(),
        sourceUrl: z.url(),
      })
      .optional(),
    localizations: z.strictObject({ en: localizationSchema, he: localizationSchema }),
    researchMetadata: z
      .strictObject({
        status: z.enum(RESEARCH_STATUSES),
        /** Date a person reviewed the content; null while draft. */
        reviewedAt: isoDate.nullable(),
        /** How the content was produced, e.g. "AI-assisted draft, checked against sources below". */
        method: text,
        sources: z.array(
          z.strictObject({ title: text, url: z.url(), publisher: text, accessedAt: isoDate }),
        ),
      })
      .refine((m) => m.status !== 'reviewed' || (m.reviewedAt !== null && m.sources.length > 0), {
        message: 'reviewed entries need a reviewedAt date and at least one source',
      }),
  });

export type Species = z.infer<typeof speciesSchema>;
export type SpeciesLocalization = Species['localizations']['en'];

/** Compact entry returned by `GET /api/species`. */
export interface SpeciesSummary {
  id: string;
  scientificName: string;
  family: string;
  names: Record<Language, { commonName: string; alternateNames: string[] }>;
  researchStatus: ResearchStatus;
  /** URL of the species photo, or null if the entry has none. */
  imageUrl: string | null;
}

/** URL path that serves a species' catalog photo. */
export const speciesImageUrl = (species: Species) => (species.image ? `/api/species/${species.id}/image` : null);

export function toSpeciesSummary(species: Species): SpeciesSummary {
  const names = (lang: Language) => ({
    commonName: species.localizations[lang].commonName,
    alternateNames: species.localizations[lang].alternateNames,
  });
  return {
    id: species.id,
    scientificName: species.scientificName,
    family: species.family,
    names: { en: names('en'), he: names('he') },
    researchStatus: species.researchMetadata.status,
    imageUrl: speciesImageUrl(species),
  };
}
