# 🚀 Build APK Guide for CRM 3.0

Your Android project is now set up with Capacitor! Follow these steps to build your APK.

## ✅ Prerequisites

You need Android Studio installed on your Windows machine:

1. **Download Android Studio**: https://developer.android.com/studio
2. **Install it** with default settings
3. **Open Android Studio** and let it download SDK components

## 📱 Method 1: Build APK via Android Studio (EASIEST)

### Step 1: Open Android Studio
```powershell
npx cap open android
```

This will open your project in Android Studio.

### Step 2: Wait for Gradle Sync
- Android Studio will sync Gradle automatically (first time takes 5-10 minutes)
- Wait for "Gradle sync finished" message at the bottom

### Step 3: Build APK
1. Click **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
2. Wait for build to complete (2-5 minutes)
3. Click **locate** in the notification to find your APK

**APK Location**: `android\app\build\outputs\apk\debug\app-debug.apk`

## 📱 Method 2: Build via Command Line (ADVANCED)

### Step 1: Set ANDROID_HOME environment variable

```powershell
# Add to your PowerShell profile or run each time
$env:ANDROID_HOME = "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk"
$env:PATH += ";$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\tools"
```

### Step 2: Build Debug APK
```powershell
cd android
.\gradlew assembleDebug
```

**Output**: `android\app\build\outputs\apk\debug\app-debug.apk`

### Step 3: Build Release APK (Production)
```powershell
cd android
.\gradlew assembleRelease
```

**Output**: `android\app\build\outputs\apk\release\app-release-unsigned.apk`

## 🔄 Update App After Code Changes

Whenever you make changes to your Next.js code:

```powershell
# Build Next.js
npm run build

# Sync with Capacitor
npx cap sync android

# Then rebuild APK in Android Studio
```

## 🎯 Currently Using Dev Server (localhost:3000)

⚠️ **Important**: Your app is currently configured to load from `http://localhost:3000`. This is ONLY for development testing!

For production APK:
1. Comment out the `server` section in `capacitor.config.ts`
2. Run `npm run build:mobile`
3. Rebuild the APK

## 🐛 Troubleshooting

### "SDK not found"
- Open Android Studio
- Go to **Tools** → **SDK Manager**
- Install Android SDK 33 or higher

### "Gradle sync failed"
- In Android Studio: **File** → **Invalidate Caches / Restart**
- Delete `android\.gradle` folder and sync again

### APK installs but shows blank screen
- Check if Next.js dev server is running on localhost:3000
- Or remove the `server` config and rebuild with static files

## 📦 Install APK on Phone

### Via USB:
```powershell
# Enable USB debugging on your phone
adb install android\app\build\outputs\apk\debug\app-debug.apk
```

### Via File Transfer:
1. Copy APK to your phone
2. Open file manager and tap the APK
3. Allow "Install from unknown sources"
4. Install!

## 🎉 Next Steps

1. Open Android Studio: `npx cap open android`
2. Wait for Gradle sync
3. Build → Build APK(s)
4. Install on your phone!

---

**Your APK will be ready in ~10 minutes!** 🚀
