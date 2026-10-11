/**
 * Creates a consistent backup of the database and photos (safe while the app runs):
 *   docker compose exec api npm run backup
 */
import { loadConfig } from '../config';
import { createBackup } from '../storage/backup';

const { storageDir } = loadConfig();
const summary = await createBackup(storageDir);

console.log(`✔ Backup created: ${summary.dir}`);
console.log(`  ${summary.plants} plants, ${summary.activities} activities, ${summary.photos} photos (${summary.photoFiles} files)`);
if (summary.missingPhotoFiles.length > 0) {
  console.warn(`  ⚠ ${summary.missingPhotoFiles.length} photo record(s) have no file: ${summary.missingPhotoFiles.join(', ')}`);
}
console.log('  Copy this folder somewhere off this computer (cloud drive, USB disk) to protect it.');
