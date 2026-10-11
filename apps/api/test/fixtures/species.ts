import type { Species, SpeciesLocalization } from '@houseplant/shared';

function localization(name: string): SpeciesLocalization {
  const topic = { summary: `${name} summary`, details: `${name} details` };
  return {
    commonName: name,
    alternateNames: [],
    description: `${name} description`,
    appearance: `${name} appearance`,
    care: {
      light: { ...topic, directSun: 'some', lowLight: 'some', warningSigns: ['pale leaves'] },
      watering: {
        ...topic,
        howToCheck: 'finger test',
        seasonal: 'less in winter',
        overwateringSigns: ['yellow leaves'],
        underwateringSigns: ['crispy leaves'],
      },
      temperature: { ...topic, extremes: 'avoid frost' },
      humidity: topic,
      soil: { ...topic, drainage: 'needs drainage', additives: ['perlite'] },
      fertilizing: { ...topic, seasonal: 'spring and summer' },
      repotting: { ...topic, rootBoundSigns: ['roots out of holes'], potSizing: 'one size up' },
      pruning: topic,
      propagation: { summary: 'cuttings', methods: [{ name: 'stem cuttings', instructions: 'cut and root' }] },
    },
    healthyAppearance: 'firm green leaves',
    warningSigns: ['drooping'],
    commonProblems: [{ problem: 'yellowing', possibleCauses: ['overwatering'], whatToDo: 'water less' }],
    safety: { toxicity: 'toxic to pets', handling: 'wash hands' },
    additionalNotes: [],
  };
}

/** A minimal valid species entry for tests. */
export function makeSpecies(id = 'test-plant', englishName = 'Test Plant'): Species {
  return {
    schemaVersion: 1,
    id,
    scientificName: 'Testus plantus',
    family: 'Testaceae',
    temperatureCelsius: { minimum: 10, idealMin: 18, idealMax: 27 },
    toxicity: { cats: 'toxic', dogs: 'toxic', humans: 'mildly-toxic' },
    localizations: { en: localization(englishName), he: localization(`צמח ${englishName}`) },
    researchMetadata: { status: 'draft', reviewedAt: null, method: 'test fixture', sources: [] },
  };
}
