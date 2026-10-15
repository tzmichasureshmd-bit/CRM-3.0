import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native app configuration for Tzmicha CRM.
 *
 * The Android app is a thin, secure WebView that loads the production web
 * application at https://crm.tzmicha.com — it is never a separate build of
 * the CRM, so every feature, login, database and API stays exactly as the
 * deployed website.
 *
 * Build it with:
 *   npm run android:sync   (copies web shell + config into android/)
 *   npm run android:build  (produces android/app/build/outputs/apk/release/Tzmicha-CRM.apk)
 */
const config: CapacitorConfig = {
  appId: 'com.tzmicha.crm',
  appName: 'Tzmicha CRM',
  webDir: 'android-web',

  server: {
    url: 'https://crm.tzmicha.com',
    cleartext: false,
    androidScheme: 'https',
  },

  android: {
    allowMixedContent: false,
    backgroundColor: '#020617',
  },

  ios: {
    backgroundColor: '#020617',
  },
};

export default config;
