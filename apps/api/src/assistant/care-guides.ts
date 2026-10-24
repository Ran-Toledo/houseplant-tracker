import { createHash } from 'node:crypto';
import { LANGUAGES, type Language, type Species, type ToxicityLevel } from '@houseplant/shared';
import type { AiService } from '../ai/service';
import type { SpeciesCatalog } from '../catalog/loader';
import type { CareGuideSectionRow } from '../db/schema';
import type { CareGuideSectionRepository } from '../repositories/care-guide-sections';

/**
 * Semantic search over the catalog's care guides. Each guide is split into
 * sections per language. Only the English sections are embedded (once, stored
 * in SQLite): a search embeds an English query, ranks it against them in memory
 * and returns the matching sections in the conversation's language. English
 * ranking is markedly better than Hebrew with the same embedding model.
 */

/** One searchable part of a species' care guide in one language. */
export interface CareGuideSection {
  id: string;
  speciesId: string;
  lang: Language;
  sectionKey: string;
  title: string;
  content: string;
  /** What gets embedded: species names and the title, then the content. */
  embedText: string;
}

const LABELS = {
  en: {
    overview: 'Overview',
    light: 'Light',
    watering: 'Watering',
    wateringSigns: 'Signs of overwatering and underwatering',
    temperature: 'Temperature',
    humidity: 'Humidity',
    soil: 'Soil',
    fertilizing: 'Fertilizing',
    repotting: 'Repotting',
    pruning: 'Pruning',
    propagation: 'Propagation',
    warningSigns: 'Warning signs',
    problem: 'Common problem',
    toxicity: 'Toxicity and handling',
    healthy: 'A healthy plant',
    directSun: 'Direct sun',
    lowLight: 'Low light',
    lightWarnings: 'Signs of wrong light',
    howToCheck: 'How to check',
    overwatering: 'Overwatering signs',
    underwatering: 'Underwatering signs',
    rootBound: 'Root-bound signs',
    potSize: 'Pot size',
    drainage: 'Drainage',
    additives: 'Additives',
    causes: 'Possible causes',
    whatToDo: 'What to do',
    cats: 'cats',
    dogs: 'dogs',
    humans: 'people',
  },
  he: {
    overview: 'סקירה',
    light: 'אור',
    watering: 'השקיה',
    wateringSigns: 'סימנים להשקיית יתר ולחוסר מים',
    temperature: 'טמפרטורה',
    humidity: 'לחות',
    soil: 'מצע',
    fertilizing: 'דישון',
    repotting: 'העברה לעציץ',
    pruning: 'גיזום',
    propagation: 'ריבוי',
    warningSigns: 'סימני אזהרה',
    problem: 'בעיה נפוצה',
    toxicity: 'רעילות ובטיחות',
    healthy: 'צמח בריא',
    directSun: 'שמש ישירה',
    lowLight: 'אור חלש',
    lightWarnings: 'סימנים לאור לא מתאים',
    howToCheck: 'איך לבדוק',
    overwatering: 'סימני השקיית יתר',
    underwatering: 'סימני חוסר מים',
    rootBound: 'סימנים שהשורשים צפופים',
    potSize: 'גודל העציץ',
    drainage: 'ניקוז',
    additives: 'תוספים',
    causes: 'סיבות אפשריות',
    whatToDo: 'מה לעשות',
    cats: 'חתולים',
    dogs: 'כלבים',
    humans: 'בני אדם',
  },
} satisfies Record<Language, Record<string, string>>;

const TOXICITY_LEVEL_NAMES: Record<Language, Record<ToxicityLevel, string>> = {
  en: { 'non-toxic': 'non-toxic', 'mildly-toxic': 'mildly toxic', toxic: 'toxic', unknown: 'unknown' },
  he: { 'non-toxic': 'לא רעיל', 'mildly-toxic': 'רעיל במידה קלה', toxic: 'רעיל', unknown: 'לא ידוע' },
};

const list = (label: string, items: string[]) => `${label}: ${items.join('; ')}.`;
const lines = (...parts: (string | false)[]) => parts.filter(Boolean).join('\n');

/** Splits a species' care guide into searchable sections, in every language. */
export function careGuideSections(species: Species): CareGuideSection[] {
  return LANGUAGES.flatMap((lang) => {
    const l = species.localizations[lang];
    const t = LABELS[lang];
    const c = l.care;
    const level = (x: ToxicityLevel) => TOXICITY_LEVEL_NAMES[lang][x];
    const topic = (x: { summary: string; details: string }) => `${x.summary.replace(/[.!?]$/, '')}. ${x.details}`;
    const sections: [key: string, title: string, content: string][] = [
      ['overview', t.overview, lines(l.description, l.appearance, `${t.healthy}: ${l.healthyAppearance}`, ...l.additionalNotes)],
      [
        'light',
        t.light,
        lines(topic(c.light), `${t.directSun}: ${c.light.directSun}`, `${t.lowLight}: ${c.light.lowLight}`, list(t.lightWarnings, c.light.warningSigns)),
      ],
      ['watering', t.watering, lines(topic(c.watering), `${t.howToCheck}: ${c.watering.howToCheck}`, c.watering.seasonal)],
      ['watering-signs', t.wateringSigns, lines(list(t.overwatering, c.watering.overwateringSigns), list(t.underwatering, c.watering.underwateringSigns))],
      ['temperature', t.temperature, lines(topic(c.temperature), c.temperature.extremes)],
      ['humidity', t.humidity, topic(c.humidity)],
      ['soil', t.soil, lines(topic(c.soil), `${t.drainage}: ${c.soil.drainage}`, c.soil.additives.length > 0 && list(t.additives, c.soil.additives))],
      ['fertilizing', t.fertilizing, lines(topic(c.fertilizing), c.fertilizing.seasonal)],
      ['repotting', t.repotting, lines(topic(c.repotting), list(t.rootBound, c.repotting.rootBoundSigns), `${t.potSize}: ${c.repotting.potSizing}`)],
      ['pruning', t.pruning, topic(c.pruning)],
      ['propagation', t.propagation, lines(c.propagation.summary, ...c.propagation.methods.map((m) => `${m.name}: ${m.instructions}`))],
      ['warning-signs', t.warningSigns, list(t.warningSigns, l.warningSigns)],
      ...l.commonProblems.map((p, i): [string, string, string] => [
        `problem-${i + 1}`,
        `${t.problem}: ${p.problem}`,
        lines(list(t.causes, p.possibleCauses), `${t.whatToDo}: ${p.whatToDo}`),
      ]),
      [
        'toxicity',
        t.toxicity,
        lines(
          `${t.cats}: ${level(species.toxicity.cats)}, ${t.dogs}: ${level(species.toxicity.dogs)}, ${t.humans}: ${level(species.toxicity.humans)}.`,
          l.safety.toxicity,
          l.safety.handling,
        ),
      ],
    ];
    const names = `${l.commonName} (${species.scientificName})`;
    return sections.map(([sectionKey, title, content]) => ({
      id: `${species.id}:${lang}:${sectionKey}`,
      speciesId: species.id,
      lang,
      sectionKey,
      title,
      content,
      embedText: `${names} — ${title}\n${content}`,
    }));
  });
}

/**
 * Sections per embedding request. OpenAI accepts up to 2048 inputs and 300k
 * tokens per request; the whole catalog in both languages is far below both.
 */
const EMBED_BATCH = 512;

export interface SyncResult {
  /** `skipped` when no AI provider is configured, so nothing can be embedded. */
  status: 'synced' | 'skipped';
  embedded: number;
  removed: number;
  total: number;
}

export interface CareGuideMatch {
  speciesId: string;
  sectionKey: string;
  title: string;
  content: string;
  /** Cosine similarity, -1 to 1. */
  score: number;
}

interface Entry {
  row: CareGuideSectionRow;
  vector: Float32Array;
}

interface Deps {
  catalog: SpeciesCatalog;
  sections: CareGuideSectionRepository;
  ai: Pick<AiService, 'embed' | 'embeddingModel'>;
  now?: () => Date;
}

/** The language queries are ranked in; sections in other languages are only returned. */
const RANKING_LANGUAGE: Language = 'en';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

function normalize(vector: ArrayLike<number>): Float32Array {
  const out = Float32Array.from(vector);
  const norm = Math.hypot(...out) || 1;
  for (let i = 0; i < out.length; i++) out[i]! /= norm;
  return out;
}

const toBlob = (vector: number[]) => Buffer.from(Float32Array.from(vector).buffer);
// Copy the bytes: a Buffer from SQLite may not start on a 4-byte boundary.
const fromBlob = (blob: Buffer) => new Float32Array(Uint8Array.from(blob).buffer);

function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

export function createCareGuideIndex({ catalog, sections, ai, now = () => new Date() }: Deps) {
  /** Every section in every language, by id; matches are returned from here in the asked language. */
  const all = new Map(catalog.list().flatMap((s) => careGuideSections(catalog.get(s.id)!)).map((s) => [s.id, s]));
  /** Stored English sections with normalized vectors; loaded after a sync. */
  let cache: Entry[] = [];
  let inSync = false;
  let running: Promise<SyncResult> | null = null;

  function load() {
    cache = sections
      .list()
      .filter((row) => row.lang === RANKING_LANGUAGE)
      .map((row) => ({ row, vector: normalize(fromBlob(row.vector)) }));
  }

  async function runSync(): Promise<SyncResult> {
    const model = ai.embeddingModel();
    const wanted = [...all.values()].filter((s) => s.lang === RANKING_LANGUAGE);
    if (!model) return { status: 'skipped', embedded: 0, removed: 0, total: wanted.length };

    const stored = new Map(sections.list().map((r) => [r.id, r]));
    const wantedIds = new Set(wanted.map((s) => s.id));
    const removed = [...stored.keys()].filter((id) => !wantedIds.has(id));
    sections.delete(removed);

    const stale = wanted
      .map((section) => ({ section, hash: sha256(section.embedText) }))
      .filter(({ section, hash }) => {
        const row = stored.get(section.id);
        return !row || row.contentHash !== hash || row.model !== model;
      });
    for (let i = 0; i < stale.length; i += EMBED_BATCH) {
      const batch = stale.slice(i, i + EMBED_BATCH);
      const vectors = await ai.embed({ kind: 'embed' }, batch.map(({ section }) => section.embedText));
      const createdAt = now().toISOString();
      // Stored per batch, so a later failure keeps the work already paid for.
      sections.upsert(
        batch.map(({ section, hash }, j) => ({
          id: section.id,
          speciesId: section.speciesId,
          lang: section.lang,
          sectionKey: section.sectionKey,
          title: section.title,
          content: section.content,
          contentHash: hash,
          model,
          vector: toBlob(vectors[j]!),
          createdAt,
        })),
      );
    }
    load();
    inSync = true;
    return { status: 'synced', embedded: stale.length, removed: removed.length, total: wanted.length };
  }

  /**
   * Brings the stored sections in line with the catalog: embeds new and
   * changed sections, deletes removed ones. Concurrent calls share one run.
   * Throws an `ApiError` when embedding is needed but AI is unavailable.
   */
  function sync(): Promise<SyncResult> {
    running ??= runSync().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    sync,

    /**
     * The sections closest in meaning to `query`, best first, in `lang`.
     * Ranking is always against the English sections, so the query should be
     * English too. Costs one embedding request.
     */
    async search(query: string, opts: { lang: Language; speciesId?: string | null; limit?: number }): Promise<CareGuideMatch[]> {
      if (!inSync) await sync();
      const [embedded] = await ai.embed({ kind: 'embed' }, [query]);
      const q = normalize(embedded!);
      return cache
        .filter((e) => (!opts.speciesId || e.row.speciesId === opts.speciesId) && e.vector.length === q.length)
        .map((e) => ({ e, score: dot(e.vector, q) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, opts.limit ?? 5)
        .flatMap(({ e, score }) => {
          const section = all.get(`${e.row.speciesId}:${opts.lang}:${e.row.sectionKey}`);
          return section ? [{ speciesId: section.speciesId, sectionKey: section.sectionKey, title: section.title, content: section.content, score }] : [];
        });
    },
  };
}

export type CareGuideIndex = ReturnType<typeof createCareGuideIndex>;
