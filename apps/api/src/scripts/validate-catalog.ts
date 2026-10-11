/**
 * Validates every species JSON file: `npm run validate:catalog`.
 * Exits non-zero and lists every problem if anything is wrong.
 */
import { CatalogValidationError, loadCatalog } from '../catalog/loader';
import { loadConfig } from '../config';

const dir = process.argv[2] ?? loadConfig().catalogDir;

try {
  const catalog = await loadCatalog(dir);
  const drafts = catalog.list().filter((s) => s.researchStatus === 'draft');
  console.log(`✔ ${catalog.size} species files in ${dir} are valid.`);
  if (drafts.length > 0) {
    console.log(`  ${drafts.length} marked as draft (not yet reviewed): ${drafts.map((s) => s.id).join(', ')}`);
  }
} catch (err) {
  if (!(err instanceof CatalogValidationError)) throw err;
  console.error(`✘ ${err.problems.length} problem(s) found:`);
  for (const problem of err.problems) console.error(`  - ${problem}`);
  process.exit(1);
}
