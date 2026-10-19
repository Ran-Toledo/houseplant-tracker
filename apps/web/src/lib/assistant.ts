import type { NavigateFunction } from 'react-router';
import { api } from '../api';

/** Starter questions for a new conversation (keys under `assistant.starters`). */
export const PLANT_STARTERS = ['week', 'yellow', 'light', 'repot'] as const;
export const GENERAL_STARTERS = ['generalWeek', 'generalPets', 'generalLight', 'generalWater'] as const;

/** State passed to the chat page so it sends a starter question as soon as it opens. */
export interface ChatLocationState {
  question?: string;
}

/** Opens the plant's latest conversation, or starts one. */
export async function openPlantConversation(plantId: string, navigate: NavigateFunction): Promise<void> {
  const [latest] = await api.listConversations(plantId);
  const conversation = latest ?? (await api.createConversation(plantId));
  navigate(`/assistant/${conversation.id}`);
}
