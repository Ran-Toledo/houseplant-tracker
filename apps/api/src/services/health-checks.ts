import { randomUUID } from 'node:crypto';
import { healthAssessmentSchema, type Activity, type HealthCheck, type Plant, type Species } from '@houseplant/shared';
import { toModelImage } from '../ai/images';
import type { AiService } from '../ai/service';
import type { SpeciesCatalog } from '../catalog/loader';
import { daysBetween, localDate } from '../lib/zoned-time';
import { ApiError, notFound } from '../middleware/errors';
import type { HealthCheckRepository } from '../repositories/health-checks';
import type { PhotoService } from './photos';
import type { PlantService } from './plants';
import type { SettingsService } from './settings';

interface Deps {
  ai: AiService;
  catalog: SpeciesCatalog;
  checks: HealthCheckRepository;
  plants: PlantService;
  photos: PhotoService;
  settings: SettingsService;
  now?: () => Date;
}

/** Activities sent with a check, newest first. */
const RECENT_ACTIVITIES = 10;

const INSTRUCTIONS = `You assess the health of a houseplant from a photo for a home plant-tracking app.
The photo is the main evidence; the plant's details, care history and species care notes are context.
- condition: "healthy" (no meaningful problems), "needs-attention" (problems the owner should address soon) or "unhealthy" (serious damage, or a problem likely to kill the plant without action).
- findings: up to 5, most important first. Each has a key from the fixed list, an observation of what is visible, a likelihood, and up to 4 short, practical actions that fit this plant's situation.
- Report only what the photo supports. A healthy-looking plant gets no findings (or only "normal-ageing").
- Use the care history to judge causes: for example, yellow leaves after frequent watering point to overwatering.
- Set photoQualityIssue when the photo is blurry, too dark or doesn't show the plant clearly, and lower your confidence.
- Write all text in English (en) and Hebrew (he). This is an assessment, not a diagnosis: don't claim certainty you don't have.`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** AI health checks of a plant's photos, kept as a history the owner can apply. */
export function createHealthCheckService({ ai, catalog, checks, plants, photos, settings, now = () => new Date() }: Deps) {
  function getCheck(id: string): HealthCheck {
    const check = checks.get(id);
    if (!check) throw notFound('Health check');
    return check;
  }

  /** "today", "yesterday" or "N days ago" in the owner's time zone. */
  function ago(timestamp: string, timezone: string): string {
    const days = daysBetween(localDate(new Date(timestamp), timezone), localDate(now(), timezone));
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  }

  function speciesText(species: Species): string {
    const en = species.localizations.en;
    const care = en.care;
    const lines = [
      `Species care notes for ${en.commonName} (${species.scientificName}):`,
      `- Light: ${care.light.summary} Warning signs: ${care.light.warningSigns.join('; ')}.`,
      `- Watering: ${care.watering.summary} How to check: ${care.watering.howToCheck}`,
      `  Overwatering signs: ${care.watering.overwateringSigns.join('; ')}. Underwatering signs: ${care.watering.underwateringSigns.join('; ')}.`,
      `- Humidity: ${care.humidity.summary}`,
      `- Healthy appearance: ${en.healthyAppearance}`,
      `- Warning signs: ${en.warningSigns.join('; ')}.`,
      ...en.commonProblems.map((p) => `- Common problem: ${p.problem}. Causes: ${p.possibleCauses.join('; ')}. What to do: ${p.whatToDo}`),
    ];
    if (species.careProfile) lines.push(`- Care profile: ${JSON.stringify(species.careProfile)}`);
    return lines.join('\n');
  }

  function contextText(plant: Plant, species: Species | undefined, activities: Activity[], photoTakenAt: string): string {
    const { timezone, hemisphere } = settings.get();
    const value = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? 'not recorded' : String(v));
    const speciesLine = species
      ? `${species.localizations.en.commonName} (${species.scientificName})`
      : plant.customSpeciesName
        ? `${plant.customSpeciesName} (named by the owner, not in the app's catalog)`
        : 'unknown';
    const month = MONTHS[Number(localDate(now(), timezone).slice(5, 7)) - 1];
    const lines = [
      `Plant: "${plant.nickname}". Species: ${speciesLine}.`,
      `Location: ${value(plant.location)}. Light: ${value(plant.lightExposure)}. Window faces: ${value(plant.windowOrientation)}.`,
      `Pot: diameter ${plant.potDiameterCm === null ? 'not recorded' : `${plant.potDiameterCm} cm`}, material ${value(plant.potMaterial)}, drainage hole ${plant.hasDrainage === null ? 'not recorded' : plant.hasDrainage ? 'yes' : 'no'}. Soil: ${value(plant.soilDescription)}.`,
      `Condition recorded by the owner: ${plant.condition}.`,
      `Owner's notes: ${value(plant.notes)}`,
      `Current month: ${month} (${hemisphere}ern hemisphere). The photo was taken ${ago(photoTakenAt, timezone)}.`,
      activities.length
        ? `Recent care, newest first:\n${activities
            .map((a) => `- ${a.activityType}, ${ago(a.performedAt, timezone)}${a.notes ? `: ${a.notes}` : ''}`)
            .join('\n')}`
        : 'No care activities recorded.',
    ];
    if (species) lines.push(speciesText(species));
    return lines.join('\n');
  }

  return {
    list(plantId: string): HealthCheck[] {
      plants.get(plantId); // 404 for unknown plants
      return checks.listForPlant(plantId);
    },

    async create(plantId: string, photoId: string): Promise<HealthCheck> {
      const plant = plants.get(plantId);
      const { photo, data } = await photos.load(photoId);
      if (photo.plantId !== plant.id) {
        throw new ApiError(400, 'validation_error', 'The photo belongs to another plant', [
          { path: 'photoId', message: 'is not a photo of this plant' },
        ]);
      }
      const species = plant.speciesId ? catalog.get(plant.speciesId) : undefined;
      const activities = plants.listActivities(plant.id).slice(0, RECENT_ACTIVITIES);

      const { data: assessment, requestId } = await ai.generate(
        { kind: 'health', plantId: plant.id, photoId: photo.id },
        {
          instructions: INSTRUCTIONS,
          input: [
            { type: 'text', text: contextText(plant, species, activities, photo.capturedAt ?? photo.createdAt) },
            { type: 'image', dataUrl: await toModelImage(data) },
          ],
          schema: healthAssessmentSchema,
          schemaName: 'health_assessment',
        },
      );

      const id = randomUUID();
      checks.insert({
        id,
        plantId: plant.id,
        photoId: photo.id,
        aiRequestId: requestId,
        condition: assessment.condition,
        confidence: assessment.confidence,
        assessmentJson: JSON.stringify(assessment),
        appliedAt: null,
        createdAt: now().toISOString(),
      });
      return getCheck(id);
    },

    /** Sets the plant's condition to the assessed one. */
    apply(id: string): { healthCheck: HealthCheck; plant: Plant } {
      const check = getCheck(id);
      const plant = plants.update(check.plantId, { condition: check.condition });
      checks.setApplied(id, now().toISOString());
      return { healthCheck: getCheck(id), plant };
    },

    delete(id: string): void {
      if (!checks.delete(id)) throw notFound('Health check');
    },
  };
}

export type HealthCheckService = ReturnType<typeof createHealthCheckService>;
