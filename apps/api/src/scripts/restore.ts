/**
 * Restores a backup. Stop the API first so nothing writes during the restore:
 *   docker compose stop api
 *   docker compose run --rm --no-deps api npm run restore -- <backup-name>
 *   docker compose start api
 * Run without a name to list available backups.
 */
import { loadConfig } from '../config';
import { listBackups, restoreBackup } from '../storage/backup';

const { storageDir } = loadConfig();
const name = process.argv[2];

if (!name) {
  const backups = await listBackups(storageDir);
  console.log(backups.length ? `Available backups:\n  ${backups.join('\n  ')}` : 'No backups found.');
  console.log('\nUsage: npm run restore -- <backup-name>');
  process.exit(backups.length ? 0 : 1);
}

const { restored, safetyBackup } = await restoreBackup(storageDir, name);
console.log(`✔ Restored backup "${restored.name}"`);
console.log(`  ${restored.plants} plants, ${restored.activities} activities, ${restored.photos} photos (${restored.photoFiles} files)`);
if (safetyBackup) console.log(`  The previous data was saved as backup "${safetyBackup}".`);
console.log('  Start the API again: docker compose start api');
