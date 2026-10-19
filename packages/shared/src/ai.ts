import { z } from 'zod';
import type { Photo } from './plants';

/**
 * Answers the model returns for AI features. Every answer is validated against
 * these schemas before it's used or stored. Text comes back in both languages,
 * like the catalog, so switching language never repeats a request.
 */

const bilingual = z.strictObject({ en: z.string(), he: z.string() });
export type BilingualText = z.infer<typeof bilingual>;

export const AI_CONFIDENCES = ['high', 'medium', 'low'] as const;
export type AiConfidence = (typeof AI_CONFIDENCES)[number];

export const identificationSchema = z.strictObject({
  candidates: z
    .array(
      z.strictObject({
        scientificName: z.string(),
        commonName: bilingual,
        /** A catalog species id, or null. The server drops ids that aren't in the catalog. */
        catalogSpeciesId: z.string().nullable(),
        confidence: z.enum(AI_CONFIDENCES),
        reason: bilingual,
      }),
    )
    .max(3),
  /** The photo doesn't show a plant. */
  notAPlant: z.boolean(),
});
export type Identification = z.infer<typeof identificationSchema>;
export type IdentificationCandidate = Identification['candidates'][number];

/** Assessed conditions: the plant conditions except `unknown`. */
export const ASSESSED_CONDITIONS = ['healthy', 'needs-attention', 'unhealthy'] as const;

/** Fixed finding types, so the UI (and later the reminders) can react without parsing text. */
export const HEALTH_FINDING_KEYS = [
  'overwatering',
  'underwatering',
  'too-little-light',
  'sun-scorch',
  'pests',
  'nutrient-deficiency',
  'root-rot',
  'disease',
  'normal-ageing',
  'other',
] as const;
export type HealthFindingKey = (typeof HEALTH_FINDING_KEYS)[number];

export const PHOTO_QUALITY_ISSUES = ['none', 'blurry', 'too-dark', 'plant-not-visible'] as const;

export const healthAssessmentSchema = z.strictObject({
  condition: z.enum(ASSESSED_CONDITIONS),
  confidence: z.enum(AI_CONFIDENCES),
  summary: bilingual,
  findings: z
    .array(
      z.strictObject({
        key: z.enum(HEALTH_FINDING_KEYS),
        observation: bilingual,
        likelihood: z.enum(['likely', 'possible']),
        actions: z.array(bilingual).max(4),
      }),
    )
    .max(5),
  photoQualityIssue: z.enum(PHOTO_QUALITY_ISSUES),
});
export type HealthAssessment = z.infer<typeof healthAssessmentSchema>;
export type HealthFinding = HealthAssessment['findings'][number];

/** `POST /api/ai/identify` with JSON (the other form is a multipart `photo` upload). */
export const identifyInputSchema = z.strictObject({ photoId: z.uuid() });

/** `POST /api/plants/:id/health-checks`. */
export const healthCheckInputSchema = z.strictObject({ photoId: z.uuid() });

export interface IdentifyResult {
  identification: Identification;
  /** The `ai_requests` row the answer is logged in. */
  requestId: string;
}

export interface HealthCheck {
  id: string;
  plantId: string;
  /** The photo that was checked; null once that photo is deleted. */
  photo: Photo | null;
  condition: HealthAssessment['condition'];
  confidence: AiConfidence;
  assessment: HealthAssessment;
  /** When the assessed condition was applied to the plant, or null. */
  appliedAt: string | null;
  createdAt: string;
}
