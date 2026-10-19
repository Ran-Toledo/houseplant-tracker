import { healthAssessmentSchema, identificationSchema } from '@houseplant/shared';
import { zodResponsesFunction, zodTextFormat } from 'openai/helpers/zod';
import { describe, expect, it } from 'vitest';
import { ASSISTANT_TOOLS } from '../src/assistant/tools';

// Strict mode needs every property required and no extra properties, at every level.
function expectStrict(node: any): void {
  if (node?.type === 'object') {
    expect(node.additionalProperties).toBe(false);
    expect([...(node.required ?? [])].sort()).toEqual(Object.keys(node.properties).sort());
    Object.values(node.properties).forEach(expectStrict);
  }
  if (node?.type === 'array') expectStrict(node.items);
  (node?.anyOf ?? []).forEach(expectStrict);
}

describe('AI answer schemas', () => {
  it('assistant tools convert to strict OpenAI function tools', () => {
    for (const tool of ASSISTANT_TOOLS) {
      const fn = zodResponsesFunction({ name: tool.name, description: tool.description, parameters: tool.parameters });
      expect(fn.strict).toBe(true);
      expectStrict(fn.parameters);
    }
  });

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
