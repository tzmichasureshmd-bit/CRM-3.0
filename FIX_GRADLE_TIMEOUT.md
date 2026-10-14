# 🔧 Fix Gradle Download Timeout

## Problem
Gradle download is timing out from `services.gradle.org`

## ✅ Solution 1: Use Local Gradle (FASTEST)

### Step 1: Download Gradle Manually
1. Open browser: https://services.gradle.org/distributions/gradle-8.14.3-all.zip
2. Download the file (it's ~150MB, may take a few minutes)
3. Save it to: `C:\Users\danie\.gradle\wrapper\dists\gradle-8.14.3-all\`

### Step 2: Update Gradle Wrapper
After downloading, Android Studio will detect it automatically.

---

## ✅ Solution 2: Use Different Gradle Mirror (RECOMMENDED)

Use Aliyun mirror (faster in many regions):

### Update gradle-wrapper.properties:
File: `android\gradle\wrapper\gradle-wrapper.properties`

Change the URL to use a mirror.

---

## ✅ Solution 3: Increase Timeout

Add to `android\gradle.properties`:
```properties
systemProp.org.gradle.internal.http.connectionTimeout=180000
systemProp.org.gradle.internal.http.socketTimeout=180000
systemProp.http.socketTimeout=180000
systemProp.http.connectionTimeout=180000
```

---

## ✅ Solution 4: Use Installed Gradle

If you have Gradle installed locally, skip the wrapper.

---

Let me apply Solution 3 (increase timeout) for you now...
