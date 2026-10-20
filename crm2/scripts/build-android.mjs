import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android');

function fail(message) {
  console.error(`\n[build-android] ${message}`);
  process.exit(1);
}

// 1. Sync web assets + config into the Android project.
const sync = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules', '@capacitor', 'cli', 'bin', 'cap'),
    'sync',
    'android',
  ],
  { stdio: 'inherit', cwd: root }
);
if (sync.status !== 0) fail('`cap sync android` failed.');

// 2. Locate the Gradle wrapper.
const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const gradlePath = path.join(androidDir, gradle);
if (!existsSync(gradlePath)) {
  fail(
    `Gradle wrapper "${gradle}" not found in android/. ` +
      'Re-run `npx cap add android` or open the android/ folder in Android Studio once.'
  );
}

// 3. Assemble the signed release APK.
const gradleRun = spawnSync(gradle, ['assembleRelease'], {
  stdio: 'inherit',
  cwd: androidDir,
  shell: process.platform === 'win32',
});
if (gradleRun.status !== 0) {
  fail(
    'Gradle did not finish successfully. For a signed APK add android/tzmicha-release.keystore ' +
      'and android/keystore.properties (see NATIVE_APPS.md). Without them the app is signed with the debug key.'
  );
}

const apk = path.join(
  androidDir,
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'Tzmicha-CRM.apk'
);
if (existsSync(apk)) {
  console.log(`\n[build-android] done. Artifact: ${apk}`);
  console.log(
    '[build-android] Copy it to public/downloads/Tzmicha-CRM.apk so the website can serve it, then deploy.'
  );
} else {
  fail('Expected release APK was not produced: ' + apk);
}
