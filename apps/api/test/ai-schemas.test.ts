import { healthAssessmentSchema, identificationSchema } from '@houseplant/shared';
import { zodTextFormat } from 'openai/helpers/zod';
import { describe, expect, it } from 'vitest';

describe('AI answer schemas', () => {
  it('convert to OpenAI strict structured-output formats', () => {
    for (const [schema, name] of [
      [identificationSchema, 'plant_identification'],
      [healthAssessmentSchema, 'health_assessment'],
    ] as const) {
      const format = zodTextFormat(schema, name);
      expect(format.strict).toBe(true);
      // Strict mode needs every property required and no extra properties, at every level.
      const visit = (node: any): void => {
        if (node?.type === 'object') {
          expect(node.additionalProperties).toBe(false);
          expect([...(node.required ?? [])].sort()).toEqual(Object.keys(node.properties).sort());
          Object.values(node.properties).forEach(visit);
        }
        if (node?.type === 'array') visit(node.items);
        (node?.anyOf ?? []).forEach(visit);
      };
      visit(format.schema);
    }
  });
});
