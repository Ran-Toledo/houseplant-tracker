import { asc, count, desc, eq } from 'drizzle-orm';
import type { ChatMessage, Conversation } from '@houseplant/shared';
import type { Db } from '../db/client';
import { conversations, messages, photos, plants, type ConversationRow, type MessageRow } from '../db/schema';
import { toPhotoDto } from './photos';

export function createConversationRepository(db: Db) {
  function toConversationDto(row: ConversationRow): Conversation {
    let plant: Conversation['plant'] = null;
    if (row.plantId) {
      const p = db.select({ id: plants.id, nickname: plants.nickname }).from(plants).where(eq(plants.id, row.plantId)).get();
      const cover = p
        ? db.select().from(photos).where(eq(photos.plantId, p.id)).all().find((ph) => ph.isCover)
        : undefined;
      if (p) plant = { ...p, coverPhoto: cover ? toPhotoDto(cover) : null };
    }
    return { id: row.id, plantId: row.plantId, plant, title: row.title, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  function toMessageDto(row: MessageRow): ChatMessage {
    const photo = row.photoId ? db.select().from(photos).where(eq(photos.id, row.photoId)).get() : undefined;
    return {
      id: row.id,
      conversationId: row.conversationId,
      role: row.role,
      content: row.content,
      photo: photo ? toPhotoDto(photo) : null,
      createdAt: row.createdAt,
    };
  }

  return {
    toConversationDto,
    toMessageDto,

    /** Newest activity first, optionally only one plant's. */
    list(plantId?: string): ConversationRow[] {
      const query = db.select().from(conversations);
      return (plantId ? query.where(eq(conversations.plantId, plantId)) : query)
        .orderBy(desc(conversations.updatedAt), desc(conversations.id))
        .all();
    },

    get(id: string): ConversationRow | undefined {
      return db.select().from(conversations).where(eq(conversations.id, id)).get();
    },

    insert(row: ConversationRow): void {
      db.insert(conversations).values(row).run();
    },

    update(id: string, changes: Partial<Omit<ConversationRow, 'id' | 'createdAt'>>): void {
      db.update(conversations).set(changes).where(eq(conversations.id, id)).run();
    },

    delete(id: string): boolean {
      return db.delete(conversations).where(eq(conversations.id, id)).run().changes > 0;
    },

    /** Oldest first. */
    messages(conversationId: string): MessageRow[] {
      return db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(asc(messages.createdAt), asc(messages.id))
        .all();
    },

    messageCount(conversationId: string): number {
      return db.select({ n: count() }).from(messages).where(eq(messages.conversationId, conversationId)).get()!.n;
    },

    insertMessage(row: MessageRow): void {
      db.insert(messages).values(row).run();
    },
  };
}

export type ConversationRepository = ReturnType<typeof createConversationRepository>;
