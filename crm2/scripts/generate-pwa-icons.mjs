import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = path.join(root, 'public', 'icons');

const icon = path.join(iconsDir, 'icon.svg');
const maskable = path.join(iconsDir, 'icon-maskable.svg');

// [output file, source svg, size px]
const targets = [
  ['icon-192x192.png', icon, 192],
  ['icon-512x512.png', icon, 512],
  ['icon-maskable-192x192.png', maskable, 192],
  ['icon-maskable-512x512.png', maskable, 512],
  ['apple-touch-icon.png', maskable, 180],
];

await mkdir(iconsDir, { recursive: true });

for (const [file, src, size] of targets) {
  const out = path.join(iconsDir, file);
  await sharp(src).resize(size, size, { fit: 'fill' }).png().toFile(out);
  console.log(
    `wrote ${path.relative(root, out).replaceAll('\\', '/')} (${size}x${size})`
  );
}

console.log('PWA icons generated.');
