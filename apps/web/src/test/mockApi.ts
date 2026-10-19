import { vi } from 'vitest';
import type { Plant, SpeciesSummary } from '@houseplant/shared';

export const species: SpeciesSummary[] = [
  {
    id: 'monstera-deliciosa',
    scientificName: 'Monstera deliciosa',
    family: 'Araceae',
    names: {
      en: { commonName: 'Monstera', alternateNames: [] },
      he: { commonName: 'מונסטרה', alternateNames: [] },
    },
    researchStatus: 'draft',
    imageUrl: '/api/species/monstera-deliciosa/image',
  },
];

export function makePlant(overrides: Partial<Plant> = {}): Plant {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    speciesId: 'monstera-deliciosa',
    nickname: 'My Monstera',
    customSpeciesName: null,
    location: 'Living room',
    lightExposure: null,
    windowOrientation: null,
    acquiredAt: null,
    potDiameterCm: null,
    potMaterial: null,
    hasDrainage: null,
    soilDescription: null,
    condition: 'healthy',
    notes: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    lastWateredAt: null,
    lastRepottedAt: null,
    coverPhoto: null,
    wateringDue: null,
    ...overrides,
  };
}

type Handler = (url: URL, init: RequestInit) => unknown;

/** A `text/event-stream` response carrying `events` as JSON data lines. */
export function sseResponse(events: unknown[]): Response {
  const text = events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(text, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

/**
 * Replaces `fetch` with a router of `"METHOD /path"` handlers. Returns the
 * spy so tests can inspect request bodies.
 */
export function mockApi(routes: Record<string, Handler>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const key = `${init.method ?? 'GET'} ${url.pathname}`;
    const handler = routes[key];
    if (!handler) {
      return new Response(JSON.stringify({ error: { code: 'not_found', message: key } }), { status: 404 });
    }
    const body = handler(url, init);
    // Handlers may build their own response, e.g. an event stream.
    if (body instanceof Response) return body;
    return body === undefined
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}
