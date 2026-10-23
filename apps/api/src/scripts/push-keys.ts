/**
 * Creates the VAPID keys Web Push needs and appends them to the repository-root
 * .env (next to compose.yaml), which only the api container receives:
 *   npm run push:keys -w apps/api -- --subject mailto:you@example.com
 * Runs on the host, once. Existing keys are never replaced: new keys would
 * invalidate every device's subscription. The private key is never printed.
 */
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';

// PUSH_KEYS_ENV_FILE points the script at another file (for trying it out).
const envFile = path.resolve(process.env.PUSH_KEYS_ENV_FILE || path.join(import.meta.dirname, '../../../../.env'));
const args = process.argv.slice(2);
const subjectIndex = args.indexOf('--subject');
const subject = subjectIndex >= 0 ? args[subjectIndex + 1] : undefined;

if (!subject || !/^(mailto:[^@\s]+@[^@\s]+\.[^@\s]+|https:\/\/\S+)$/.test(subject)) {
  console.error('✘ Pass a contact for the push services: --subject mailto:you@example.com (or an https:// URL).');
  process.exit(1);
}

const existing = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
if (/^\s*VAPID_(PUBLIC|PRIVATE)_KEY\s*=\s*\S/m.test(existing)) {
  console.error(`✘ ${envFile} already has VAPID keys. Remove them first only if you really want new ones:`);
  console.error('  every device would have to turn notifications on again.');
  process.exit(1);
}

const keys = webpush.generateVAPIDKeys();
const block = [
  '',
  '# Web Push (added by npm run push:keys). Keep the private key secret; changing the keys',
  '# means every device has to turn notifications on again.',
  `VAPID_PUBLIC_KEY=${keys.publicKey}`,
  `VAPID_PRIVATE_KEY=${keys.privateKey}`,
  `VAPID_SUBJECT=${subject}`,
  '',
].join('\n');
fs.appendFileSync(envFile, (existing && !existing.endsWith('\n') ? '\n' : '') + block);

console.log(`✔ VAPID keys added to ${envFile}`);
console.log(`  Public key: ${keys.publicKey}`);
console.log('  Recreate the api container to use them: docker compose up -d');
