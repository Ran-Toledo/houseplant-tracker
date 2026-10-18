import fs from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { isThumbnailFile } from './photo-store';

/*
 * Backup layout: <storageDir>/backups/<name>/
 *   plants.sqlite   consistent snapshot made with SQLite's online backup API
 *   photos/         copy of the photo files (not thumbnails, which are regenerated on demand)
 *   backup.json     summary (time, record counts)
 */

export const DB_FILE = 'plants.sqlite';

export interface BackupSummary {
  name: string;
  dir: string;
  createdAt: string;
  plants: number;
  activities: number;
  photos: number;
  photoFiles: number;
  missingPhotoFiles: string[];
}

const backupsDir = (storageDir: string) => path.join(storageDir, 'backups');

async function exists(p: string) {
  return fs.access(p).then(
    () => true,
    () => false,
  );
}

async function countFiles(dir: string): Promise<number> {
  if (!(await exists(dir))) return 0;
  const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).length;
}

/** Checks a database file's integrity and returns its record counts. */
function inspect(dbFile: string) {
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  try {
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`Integrity check failed for ${dbFile}: ${String(integrity)}`);
    const count = (table: string) => (db.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;
    const storageKeys = (db.prepare('select storage_key as key from photos').all() as { key: string }[]).map((r) => r.key);
    return { plants: count('plants'), activities: count('activities'), photos: count('photos'), storageKeys };
  } finally {
    db.close();
  }
}

/** Creates a backup while the app may still be running. */
export async function createBackup(storageDir: string, name = new Date().toISOString().replace(/[:.]/g, '-')): Promise<BackupSummary> {
  const source = path.join(storageDir, DB_FILE);
  if (!(await exists(source))) throw new Error(`No database found at ${source}`);
  const dir = path.join(backupsDir(storageDir), name);
  if (await exists(dir)) throw new Error(`Backup ${dir} already exists`);
  await fs.mkdir(dir, { recursive: true });

  // The online backup API copies a consistent snapshot even while the API writes.
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await db.backup(path.join(dir, DB_FILE));
  } finally {
    db.close();
  }

  const photosSource = path.join(storageDir, 'photos');
  if (await exists(photosSource)) {
    await fs.cp(photosSource, path.join(dir, 'photos'), { recursive: true, filter: (src) => !isThumbnailFile(src) });
  }

  const info = inspect(path.join(dir, DB_FILE));
  const missingPhotoFiles: string[] = [];
  for (const key of info.storageKeys) {
    if (!(await exists(path.join(dir, 'photos', key)))) missingPhotoFiles.push(key);
  }
  const summary: BackupSummary = {
    name,
    dir,
    createdAt: new Date().toISOString(),
    plants: info.plants,
    activities: info.activities,
    photos: info.photos,
    photoFiles: await countFiles(path.join(dir, 'photos')),
    missingPhotoFiles,
  };
  await fs.writeFile(path.join(dir, 'backup.json'), JSON.stringify(summary, null, 2));
  return summary;
}

export async function listBackups(storageDir: string): Promise<string[]> {
  const dir = backupsDir(storageDir);
  if (!(await exists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

/**
 * Replaces the current database and photos with a backup. The API must be
 * stopped first. The current data is saved as a "pre-restore" backup.
 */
export async function restoreBackup(storageDir: string, name: string): Promise<{ restored: BackupSummary; safetyBackup: string | null }> {
  if (!/^[\w.-]+$/.test(name)) throw new Error(`Invalid backup name: ${name}`);
  const dir = path.join(backupsDir(storageDir), name);
  const backupDb = path.join(dir, DB_FILE);
  if (!(await exists(backupDb))) throw new Error(`Backup not found: ${backupDb}`);
  const info = inspect(backupDb);

  const currentDb = path.join(storageDir, DB_FILE);
  let safetyBackup: string | null = null;
  if (await exists(currentDb)) {
    safetyBackup = (await createBackup(storageDir, `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`)).name;
  }

  for (const suffix of ['', '-wal', '-shm']) await fs.rm(currentDb + suffix, { force: true });
  await fs.copyFile(backupDb, currentDb);

  const photosDir = path.join(storageDir, 'photos');
  await fs.rm(photosDir, { recursive: true, force: true });
  if (await exists(path.join(dir, 'photos'))) await fs.cp(path.join(dir, 'photos'), photosDir, { recursive: true });
  else await fs.mkdir(photosDir, { recursive: true });

  return {
    restored: {
      name,
      dir,
      createdAt: new Date().toISOString(),
      plants: info.plants,
      activities: info.activities,
      photos: info.photos,
      photoFiles: await countFiles(photosDir),
      missingPhotoFiles: [],
    },
    safetyBackup,
  };
}
