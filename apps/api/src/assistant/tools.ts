import { z } from 'zod';
import type { HealthCheck, Language, Plant, Species } from '@houseplant/shared';
import { ApiError } from '../middleware/errors';
import type { CareGuideIndex } from './care-guides';
import type { ReadModel } from './read-model';

/**
 * The assistant's tools. Each one reads through the read-only model and
 * returns compact JSON; none can change anything. Arguments are validated
 * before a tool runs, and failures come back as `{ error }` for the model.
 */

export interface AssistantTool {
  name: string;
  description: string;
  parameters: z.ZodObject;
  run(args: never, ctx: ToolContext): unknown;
}

export interface ToolContext {
  data: ReadModel;
  guides: Pick<CareGuideIndex, 'search'>;
  lang: Language;
}

const plantIdArg = z.strictObject({ plantId: z.string().describe('A plant id from list_plants') });

function speciesName(p: Plant, data: ReadModel, lang: Language): string | null {
  if (p.speciesId) return data.species(p.speciesId)?.localizations[lang].commonName ?? p.speciesId;
  return p.customSpeciesName;
}

function plantSummary(p: Plant, data: ReadModel, lang: Language) {
  return {
    id: p.id,
    nickname: p.nickname,
    species: speciesName(p, data, lang),
    speciesId: p.speciesId,
    location: p.location,
    condition: p.condition,
    lastWatered: p.lastWateredAt && data.localDate(p.lastWateredAt),
    lastRepotted: p.lastRepottedAt && data.localDate(p.lastRepottedAt),
    nextSoilCheck: p.wateringDue && { dueOn: p.wateringDue.dueOn, status: p.wateringDue.status },
  };
}

function healthCheckSummary(c: HealthCheck, data: ReadModel, lang: Language) {
  return {
    date: data.localDate(c.createdAt),
    condition: c.condition,
    confidence: c.confidence,
    summary: c.assessment.summary[lang],
    findings: c.assessment.findings.map((f) => ({
      key: f.key,
      likelihood: f.likelihood,
      observation: f.observation[lang],
      actions: f.actions.map((a) => a[lang]),
    })),
    appliedToPlant: c.appliedAt !== null,
  };
}

function speciesGuide(s: Species, lang: Language) {
  const l = s.localizations[lang];
  const topic = (t: { summary: string; details: string }) => `${t.summary} ${t.details}`;
  return {
    id: s.id,
    scientificName: s.scientificName,
    commonName: l.commonName,
    researchStatus: s.researchMetadata.status,
    temperatureCelsius: s.temperatureCelsius,
    toxicity: s.toxicity,
    careProfile: s.careProfile ?? null,
    care: {
      light: { text: topic(l.care.light), directSun: l.care.light.directSun, lowLight: l.care.light.lowLight, warningSigns: l.care.light.warningSigns },
      watering: {
        text: topic(l.care.watering),
        howToCheck: l.care.watering.howToCheck,
        seasonal: l.care.watering.seasonal,
        overwateringSigns: l.care.watering.overwateringSigns,
        underwateringSigns: l.care.watering.underwateringSigns,
      },
      temperature: topic(l.care.temperature),
      humidity: topic(l.care.humidity),
      soil: topic(l.care.soil),
      fertilizing: `${topic(l.care.fertilizing)} ${l.care.fertilizing.seasonal}`,
      repotting: { text: topic(l.care.repotting), rootBoundSigns: l.care.repotting.rootBoundSigns, potSizing: l.care.repotting.potSizing },
      pruning: topic(l.care.pruning),
      propagation: l.care.propagation.summary,
    },
    healthyAppearance: l.healthyAppearance,
    warningSigns: l.warningSigns,
    commonProblems: l.commonProblems,
    safety: l.safety,
  };
}

/** A catalog species by id, or by its scientific or common name in either language (models sometimes pass names). */
function findSpecies(data: ReadModel, idOrName: string): Species | undefined {
  const exact = data.species(idOrName);
  if (exact) return exact;
  const needle = idOrName.trim().toLocaleLowerCase();
  const match = data
    .speciesList()
    .find((s) =>
      [s.id, s.scientificName, ...Object.values(s.names).flatMap((n) => [n.commonName, ...n.alternateNames])].some(
        (name) => name.toLocaleLowerCase() === needle,
      ),
    );
  return match && data.species(match.id);
}

const notFound = { error: 'No plant with that id. Call list_plants to find the right id.' };
const speciesNotFound = {
  error: "No species with that id in the catalog. Use the plant record's speciesId, or search_species. Plants without a speciesId have no catalog guide.",
};

function tool<S extends z.ZodObject>(def: { name: string; description: string; parameters: S; run(args: z.output<S>, ctx: ToolContext): unknown }) {
  return def as unknown as AssistantTool;
}

export const ASSISTANT_TOOLS: AssistantTool[] = [
  tool({
    name: 'list_plants',
    description: "All of the owner's plants: id, nickname, species, location, condition, last watering and repotting dates, next soil check.",
    parameters: z.strictObject({}),
    run: (_args, { data, lang }) => ({ today: data.today(), plants: data.listPlants().map((p) => plantSummary(p, data, lang)) }),
  }),
  tool({
    name: 'get_plant',
    description: "One plant's full record (pot, light, window, soil, notes), its last 10 care activities and its latest health check.",
    parameters: plantIdArg,
    run: ({ plantId }, { data, lang }) => {
      const p = data.plant(plantId);
      if (!p) return notFound;
      const latest = data.healthChecks(plantId)[0];
      return {
        ...plantSummary(p, data, lang),
        acquired: p.acquiredAt,
        lightExposure: p.lightExposure,
        windowOrientation: p.windowOrientation,
        potDiameterCm: p.potDiameterCm,
        potMaterial: p.potMaterial,
        hasDrainage: p.hasDrainage,
        soil: p.soilDescription,
        notes: p.notes,
        hasCoverPhoto: p.coverPhoto !== null,
        recentActivities: data
          .activities(plantId)
          .slice(0, 10)
          .map((a) => ({ type: a.activityType, date: data.localDate(a.performedAt), notes: a.notes })),
        latestHealthCheck: latest ? healthCheckSummary(latest, data, lang) : null,
      };
    },
  }),
  tool({
    name: 'get_care_history',
    description: "A plant's care activities (watering, fertilizing, repotting, pruning, treatment), newest first, optionally between two dates.",
    parameters: z.strictObject({
      plantId: z.string().describe('A plant id from list_plants'),
      from: z.string().nullable().describe('Earliest local date, YYYY-MM-DD, or null'),
      to: z.string().nullable().describe('Latest local date, YYYY-MM-DD, or null'),
    }),
    run: ({ plantId, from, to }, { data }) => {
      if (!data.plant(plantId)) return notFound;
      const activities = data
        .activities(plantId)
        .map((a) => ({ type: a.activityType, date: data.localDate(a.performedAt), notes: a.notes }))
        .filter((a) => (!from || a.date >= from) && (!to || a.date <= to));
      return { activities: activities.slice(0, 100), total: activities.length };
    },
  }),
  tool({
    name: 'get_health_checks',
    description: "A plant's past AI health checks from photos, newest first (up to 10).",
    parameters: plantIdArg,
    run: ({ plantId }, { data, lang }) => {
      if (!data.plant(plantId)) return notFound;
      return { healthChecks: data.healthChecks(plantId).slice(0, 10).map((c) => healthCheckSummary(c, data, lang)) };
    },
  }),
  tool({
    name: 'get_care_signals',
    description:
      "Rule-based facts about a plant's situation: light that doesn't suit the species, direct-sun risk, fast-drying pot, no drainage, dormant season, fertilizing overdue, repotting due, unusual watering pattern, recent health findings. Prefer these over guessing.",
    parameters: plantIdArg,
    run: ({ plantId }, { data }) => {
      const signals = data.careSignals(plantId);
      return signals ? { today: data.today(), signals } : notFound;
    },
  }),
  tool({
    name: 'search_species',
    description: "Species in the app's catalog whose names (English, Hebrew or scientific) contain the text. An empty query lists them all.",
    parameters: z.strictObject({ query: z.string() }),
    run: ({ query }, { data }) => {
      const needle = query.trim().toLocaleLowerCase();
      return {
        species: data
          .speciesList()
          .filter((s) =>
            [s.scientificName, ...Object.values(s.names).flatMap((n) => [n.commonName, ...n.alternateNames])].some((n) =>
              n.toLocaleLowerCase().includes(needle),
            ),
          )
          .map((s) => ({ id: s.id, scientificName: s.scientificName, commonName: s.names })),
      };
    },
  }),
  tool({
    name: 'get_species_guide',
    description: "A catalog species' care guide in the conversation's language: care text, warning signs, common problems, toxicity and care profile.",
    parameters: z.strictObject({ speciesId: z.string().describe("A species id (a plant record's speciesId, or from search_species)") }),
    run: ({ speciesId }, { data, lang }) => {
      const s = findSpecies(data, speciesId);
      return s ? speciesGuide(s, lang) : speciesNotFound;
    },
  }),
  tool({
    name: 'search_care_guides',
    description:
      "Searches all catalog care guides by meaning: describe only the symptom, problem or care question in plain English words (for example 'brown crispy leaf edges'), even in a Hebrew conversation; leave out generic words like 'houseplant' or 'care'. Returns the closest guide sections with their species, in the conversation's language. Use it whenever the question describes what a plant looks like or what went wrong, especially when it names no species.",
    parameters: z.strictObject({
      query: z.string().min(1).describe('The symptom or question in plain English, translated if the owner wrote in another language'),
      speciesId: z.string().nullable().describe("Limit the search to one species' guide (a plant record's speciesId), or null to search every guide"),
    }),
    run: async ({ query, speciesId }, { data, guides, lang }) => {
      const species = speciesId ? findSpecies(data, speciesId) : undefined;
      if (speciesId && !species) return speciesNotFound;
      try {
        const matches = await guides.search(query, { lang, speciesId: species?.id ?? null });
        return {
          results: matches.map((m) => ({
            speciesId: m.speciesId,
            commonName: data.species(m.speciesId)?.localizations[lang].commonName ?? m.speciesId,
            section: m.sectionKey,
            title: m.title,
            text: m.content,
            score: Math.round(m.score * 100) / 100,
          })),
        };
      } catch (err) {
        // AI turned off or the monthly limit reached: the model can still use get_species_guide.
        if (err instanceof ApiError) return { error: `Care-guide search is unavailable: ${err.message}. Use get_species_guide instead.` };
        throw err;
      }
    },
  }),
];

/** Runs a tool call from the model; never throws. */
export async function runTool(name: string, rawArguments: string, ctx: ToolContext): Promise<unknown> {
  const tool = ASSISTANT_TOOLS.find((t) => t.name === name);
  if (!tool) return { error: `Unknown tool ${name}` };
  let args: unknown;
  try {
    args = JSON.parse(rawArguments || '{}');
  } catch {
    return { error: 'Arguments must be JSON' };
  }
  const parsed = tool.parameters.safeParse(args);
  if (!parsed.success) return { error: `Invalid arguments: ${parsed.error.issues.map((i) => i.message).join('; ')}` };
  try {
    return await tool.run(parsed.data as never, ctx);
  } catch (err) {
    console.error(`[api] assistant tool ${name} failed`, err);
    return { error: 'The tool failed' };
  }
}
