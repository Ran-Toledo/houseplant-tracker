// Generates the PWA / Home Screen icons in apps/web/public from the brand mark.
// Usage (from the repo root): node scripts/generate-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const outDir = path.resolve(import.meta.dirname, '../apps/web/public/icons');
mkdirSync(outDir, { recursive: true });

// Leaf from the app's icon set, on the forest-green background. Full-bleed so it
// also works as a maskable icon and for iOS, which rounds corners itself.
const leaf = (size, padding) => {
  const scale = (size * (1 - 2 * padding)) / 24;
  const offset = size * padding;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#234b35"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 4c-9-.2-15 3.7-15 11a5 5 0 0 0 5 5c7.3 0 11.2-6 10-16Z"/>
    <path d="M5 20c1.7-5.7 5.8-9.9 11.8-12.5"/>
  </g>
</svg>`;
};

const targets = [
  { file: 'icon-192.png', size: 192, padding: 0.22 },
  { file: 'icon-512.png', size: 512, padding: 0.22 },
  // Maskable icons need the artwork inside the central 80% safe zone.
  { file: 'icon-maskable-512.png', size: 512, padding: 0.3 },
  { file: 'apple-touch-icon.png', size: 180, padding: 0.22 },
];

for (const { file, size, padding } of targets) {
  await sharp(Buffer.from(leaf(size, padding))).png().toFile(path.join(outDir, file));
  console.log(`wrote ${file}`);
}
writeFileSync(path.join(outDir, 'icon.svg'), leaf(64, 0.18));
console.log('wrote icon.svg');
