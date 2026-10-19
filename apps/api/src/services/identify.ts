import { identificationSchema, type Identification, type IdentifyResult } from '@houseplant/shared';
import { toModelImage } from '../ai/images';
import type { AiService } from '../ai/service';
import type { SpeciesCatalog } from '../catalog/loader';
import { processImage } from './images';
import type { PhotoService } from './photos';

interface Deps {
  ai: AiService;
  catalog: SpeciesCatalog;
  photos: PhotoService;
}

const INSTRUCTIONS = `You identify houseplants from photos for a home plant-tracking app.
Suggest up to 3 species for the plant in the photo, most likely first.
- Prefer a species from the catalog list when it matches. Then set catalogSpeciesId to its id exactly as listed; otherwise set it to null.
- Give the common name and a one-sentence reason (what in the photo points to that species) in English (en) and Hebrew (he).
- Confidence is "high" only when distinctive features are clearly visible; use "medium" or "low" otherwise.
- If you can't tell, return your best guesses with low confidence rather than none.
- If the photo doesn't show a plant, set notAPlant to true and return no candidates.`;

/** Identifies a plant's species from a photo, mapping the answer onto the catalog. */
export function createIdentifyService({ ai, catalog, photos }: Deps) {
  function catalogText(): string {
    const lines = catalog.list().map((s) => `${s.id} | ${s.scientificName} | ${s.names.en.commonName} | ${s.names.he.commonName}`);
    return `Catalog species (id | scientific name | English name | Hebrew name):\n${lines.join('\n')}`;
  }

  /**
   * Keeps only catalog ids that exist, matches unlinked answers by scientific
   * name, and uses the catalog's own names for catalog species.
   */
  function mapOntoCatalog(identification: Identification): Identification {
    const byScientificName = new Map(catalog.list().map((s) => [s.scientificName.toLowerCase(), s.id]));
    return {
      notAPlant: identification.notAPlant,
      candidates: identification.candidates.map((c) => {
        const id =
          (c.catalogSpeciesId && catalog.has(c.catalogSpeciesId) ? c.catalogSpeciesId : null) ??
          byScientificName.get(c.scientificName.trim().toLowerCase()) ??
          null;
        const species = id ? catalog.get(id) : undefined;
        if (!species) return { ...c, catalogSpeciesId: null };
        return {
          ...c,
          catalogSpeciesId: species.id,
          scientificName: species.scientificName,
          commonName: { en: species.localizations.en.commonName, he: species.localizations.he.commonName },
        };
      }),
    };
  }

  async function identify(image: Buffer, context: { plantId?: string; photoId?: string }): Promise<IdentifyResult> {
    const { data, requestId } = await ai.generate(
      { kind: 'identify', plantId: context.plantId, photoId: context.photoId },
      {
        instructions: INSTRUCTIONS,
        input: [
          { type: 'text', text: catalogText() },
          { type: 'image', dataUrl: await toModelImage(image) },
        ],
        schema: identificationSchema,
        schemaName: 'plant_identification',
      },
    );
    return { identification: mapOntoCatalog(data), requestId };
  }

  return {
    /** Identifies an uploaded photo without storing it. */
    async identifyUpload(file: Buffer): Promise<IdentifyResult> {
      // Same checks and EXIF handling as stored photos (rotation, no metadata).
      return identify(await processImage(file), {});
    },

    /** Identifies one of a plant's stored photos. */
    async identifyPhoto(photoId: string): Promise<IdentifyResult> {
      const { photo, data } = await photos.load(photoId);
      return identify(data, { plantId: photo.plantId, photoId: photo.id });
    },
  };
}

export type IdentifyService = ReturnType<typeof createIdentifyService>;
