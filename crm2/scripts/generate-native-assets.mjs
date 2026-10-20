import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Brand assets (existing)
const appIconSvg = path.join(root, 'public', 'icons', 'icon.svg');

// Glyph-only (white chat bubble on transparent) — used for the Android
// adaptive foreground, the legacy launcher overlay and the splash screen.
const glyphSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="432" height="432" viewBox="0 0 432 432">' +
  '<g transform="translate(62 66) scale(15)">' +
  '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" stroke="#ffffff" ' +
  'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></g></svg>';

const SPLASH_BG = '#020617';
const SPLASH_GLYPH_RATIO = 0.16;

const mipDensities = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

const foregroundSizes = [
  ['mdpi', 108],
  ['hdpi', 162],
  ['xhdpi', 216],
  ['xxhdpi', 324],
  ['xxxhdpi', 432],
];

// Missing density buckets are filled by Android's own scaling.
const splashPort = [
  ['mdpi', 320, 512],
  ['hdpi', 480, 768],
  ['xhdpi', 640, 1024],
  ['xxhdpi', 960, 1536],
  ['xxxhdpi', 1280, 2048],
];

async function writePng(outPath, img) {
  await img.png().toFile(outPath);
  console.log(`wrote ${path.relative(root, outPath).replaceAll('\\', '/')}`);
}

await mkdir(path.join(root, 'build'), { recursive: true });

// 1. Electron icon (electron-builder converts this to .ico automatically)
await sharp(appIconSvg)
  .resize(512, 512)
  .png()
  .toFile(path.join(root, 'build', 'icon.png'));
console.log('wrote build/icon.png (512x512)');

// 2. Legacy Android launcher icons (brand rounded square)
const legacyBase = sharp(appIconSvg);
for (const [density, size] of mipDensities) {
  const dir = path.join(
    root,
    'android',
    'app',
    'src',
    'main',
    'res',
    `mipmap-${density}`
  );
  await mkdir(dir, { recursive: true });
  await writePng(
    path.join(dir, 'ic_launcher.png'),
    legacyBase.clone().resize(size, size, { fit: 'fill' })
  );
  await writePng(
    path.join(dir, 'ic_launcher_round.png'),
    legacyBase.clone().resize(size, size, { fit: 'fill' })
  );
}

// 3. Android adaptive icon foreground (glyph only, transparent)
const glyphBase = sharp(Buffer.from(glyphSvg)).resize(512, 512, {
  fit: 'fill',
});
for (const [density, size] of foregroundSizes) {
  const dir = path.join(
    root,
    'android',
    'app',
    'src',
    'main',
    'res',
    `mipmap-${density}`
  );
  await writePng(
    path.join(dir, 'ic_launcher_foreground.png'),
    glyphBase.clone().resize(size, size, { fit: 'fill' })
  );
}

// 4. Splash screens: brand background + centered glyph
async function makeSplash(width, height) {
  const glyphPx = Math.round(height * SPLASH_GLYPH_RATIO);
  return sharp({
    create: { width, height, channels: 3, background: SPLASH_BG },
  }).composite([
    {
      input: await glyphBase
        .clone()
        .resize(glyphPx, glyphPx, { fit: 'fill' })
        .png()
        .toBuffer(),
      gravity: 'center',
    },
  ]);
}

const defaultSplash = await makeSplash(480, 800);
await writePng(
  path.join(
    root,
    'android',
    'app',
    'src',
    'main',
    'res',
    'drawable',
    'splash.png'
  ),
  defaultSplash
);

for (const [density, w, h] of splashPort) {
  const dir = path.join(
    root,
    'android',
    'app',
    'src',
    'main',
    'res',
    `drawable-port-${density}`
  );
  await writePng(path.join(dir, 'splash.png'), await makeSplash(w, h));
  const landDir = path.join(
    root,
    'android',
    'app',
    'src',
    'main',
    'res',
    `drawable-land-${density}`
  );
  await writePng(path.join(landDir, 'splash.png'), await makeSplash(h, w));
}

console.log('Native assets generated.');
