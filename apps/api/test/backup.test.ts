import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/client';
import { createBackup, listBackups, restoreBackup } from '../src/storage/backup';
import { tempDir } from './helpers';

function seed(storageDir: string, nickname: string) {
  const db = openDatabase(path.join(storageDir, 'plants.sqlite'));
  const now = new Date().toISOString();
  const plantId = '11111111-1111-4111-8111-111111111111';
  const photoId = '22222222-2222-4222-8222-222222222222';
  db.$client
    .prepare('insert into plants (id, nickname, condition, created_at, updated_at) values (?, ?, ?, ?, ?)')
    .run(plantId, nickname, 'healthy', now, now);
  db.$client
    .prepare('insert into photos (id, plant_id, storage_key, is_cover, created_at) values (?, ?, ?, 1, ?)')
    .run(photoId, plantId, `${plantId}/${photoId}.jpg`, now);
  fs.mkdirSync(path.join(storageDir, 'photos', plantId), { recursive: true });
  fs.writeFileSync(path.join(storageDir, 'photos', plantId, `${photoId}.jpg`), nickname);
  return db;
}

describe('backup and restore', () => {
  it('backs up while the database is open, then restores it', async () => {
    const storage = tempDir();
    const db = seed(storage, 'Original');

    // Backup runs while the app's connection is still open (WAL mode).
    const backup = await createBackup(storage, 'snapshot');
    expect(backup).toMatchObject({ plants: 1, photos: 1, photoFiles: 1, missingPhotoFiles: [] });

    // Change the live data after the backup.
    db.$client.prepare('update plants set nickname = ?').run('Changed');
    fs.writeFileSync(path.join(storage, 'photos', 'extra.jpg'), 'x');
    db.$client.close();

    const { restored, safetyBackup } = await restoreBackup(storage, 'snapshot');
    expect(restored.plants).toBe(1);
    expect(safetyBackup).toMatch(/^pre-restore-/);

    const after = openDatabase(path.join(storage, 'plants.sqlite'));
    expect(after.$client.prepare('select nickname from plants').get()).toEqual({ nickname: 'Original' });
    after.$client.close();
    expect(fs.existsSync(path.join(storage, 'photos', 'extra.jpg'))).toBe(false);

    // The pre-restore safety copy kept the changed data.
    expect(await listBackups(storage)).toEqual([safetyBackup, 'snapshot']);
  });

  it('rejects unknown or unsafe backup names', async () => {
    const storage = tempDir();
    seed(storage, 'X').$client.close();
    await expect(restoreBackup(storage, 'missing')).rejects.toThrow(/not found/);
    await expect(restoreBackup(storage, '../../etc')).rejects.toThrow(/Invalid backup name/);
  });
});
