import type {
  Activity,
  ActivityInput,
  AppConfig,
  AppSettings,
  AppSettingsUpdate,
  CareSchedule,
  CareScheduleInput,
  DueItem,
  Condition,
  Photo,
  Plant,
  PlantCreateInput,
  PlantUpdateInput,
  Species,
  SpeciesSummary,
} from '@houseplant/shared';
import { json, request } from './client';

export { ApiRequestError } from './client';

export interface PlantQuery {
  q?: string;
  location?: string;
  condition?: Condition;
}

function queryString(params: object): string {
  const entries = Object.entries(params).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '');
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
}

export const api = {
  listPlants: (query: PlantQuery = {}) =>
    request<{ plants: Plant[] }>(`/plants${queryString(query)}`).then((r) => r.plants),
  listLocations: () => request<{ locations: string[] }>('/plants/locations').then((r) => r.locations),
  getPlant: (id: string) => request<{ plant: Plant }>(`/plants/${id}`).then((r) => r.plant),
  createPlant: (input: PlantCreateInput) =>
    request<{ plant: Plant }>('/plants', json('POST', input)).then((r) => r.plant),
  updatePlant: (id: string, input: PlantUpdateInput) =>
    request<{ plant: Plant }>(`/plants/${id}`, json('PATCH', input)).then((r) => r.plant),
  deletePlant: (id: string) => request<void>(`/plants/${id}`, { method: 'DELETE' }),

  listActivities: (plantId: string) =>
    request<{ activities: Activity[] }>(`/plants/${plantId}/activities`).then((r) => r.activities),
  addActivity: (plantId: string, input: ActivityInput) =>
    request<{ activity: Activity }>(`/plants/${plantId}/activities`, json('POST', input)).then((r) => r.activity),
  deleteActivity: (plantId: string, activityId: string) =>
    request<void>(`/plants/${plantId}/activities/${activityId}`, { method: 'DELETE' }),

  listPhotos: (plantId: string) => request<{ photos: Photo[] }>(`/plants/${plantId}/photos`).then((r) => r.photos),
  uploadPhoto: (plantId: string, file: File, options: { isCover?: boolean } = {}) => {
    const form = new FormData();
    form.set('photo', file);
    if (options.isCover) form.set('isCover', 'true');
    return request<{ photo: Photo }>(`/plants/${plantId}/photos`, { method: 'POST', body: form }).then((r) => r.photo);
  },
  setCoverPhoto: (photoId: string) =>
    request<{ photo: Photo }>(`/photos/${photoId}`, json('PATCH', { isCover: true })).then((r) => r.photo),
  deletePhoto: (photoId: string) => request<void>(`/photos/${photoId}`, { method: 'DELETE' }),

  listSpecies: () => request<{ species: SpeciesSummary[] }>('/species').then((r) => r.species),
  getSpecies: (id: string) => request<{ species: Species }>(`/species/${id}`).then((r) => r.species),

  getSchedules: (plantId: string) =>
    request<{ schedules: CareSchedule[] }>(`/plants/${plantId}/schedules`).then((r) => r.schedules),
  setWateringSchedule: (plantId: string, input: CareScheduleInput) =>
    request<{ schedule: CareSchedule }>(`/plants/${plantId}/schedules/watering`, json('PUT', input)).then((r) => r.schedule),
  snoozeSchedule: (scheduleId: string, days: number) =>
    request<{ schedule: CareSchedule }>(`/schedules/${scheduleId}/snooze`, json('POST', { days })).then((r) => r.schedule),
  listDue: (days = 0) => request<{ items: DueItem[] }>(`/due?days=${days}`).then((r) => r.items),

  getConfig: () => request<{ config: AppConfig }>('/config').then((r) => r.config),
  getSettings: () => request<{ settings: AppSettings }>('/settings').then((r) => r.settings),
  updateSettings: (changes: AppSettingsUpdate) =>
    request<{ settings: AppSettings }>('/settings', json('PATCH', changes)).then((r) => r.settings),
};
