# HanYu Cards Release Checklist

Before this native packaging checklist, complete the [commercial release gates](commercial-release-checklist.md). Native builds, signing, device tests and store submission have not been verified in this workspace. Recheck platform requirements at the time of submission.

## Android

- The [GitHub preview instructions](mobile-build.md#github-公开预览版) cover the separately signed prerelease APK and its verification workflow.
- For the GitHub preview, check the signed draft APK on the narrow portrait and short landscape emulator profiles. Confirm offline review, backup sharing and progress after upgrading from the published beta.1 APK.
- Build with Node 22.12+ and `npm run mobile:build`; see [mobile build instructions](mobile-build.md).
- Run `npx cap sync android` after each web build.
- Use Android Studio with an SDK and build tools compatible with the required target API.
- As checked on September 21, 2026, new phone apps and updates submitted after August 31, 2026 must target Android 16/API 36 or higher. Inspect and update the native project, then test Android 16 behavior changes; do not assume the checked-in native configuration is ready. See [Google Play target API requirements](https://developer.android.com/google/play/requirements/target-sdk).
- Build a signed Android App Bundle (`.aab`) with the publisher keystore.
- To sign locally, set `HANYU_UPLOAD_STORE_FILE`, `HANYU_UPLOAD_STORE_PASSWORD`, `HANYU_UPLOAD_KEY_ALIAS`, and `HANYU_UPLOAD_KEY_PASSWORD`, then run `cd android && ./gradlew bundleRelease`.
- Confirm native dependencies support 16 KB page sizes for Android 15+ devices.

## iOS

- Build on macOS with the Xcode and iOS SDK versions accepted at submission time; verify [Apple’s current submission requirements](https://developer.apple.com/news/upcoming-requirements/).
- Run `npx cap sync ios`, open `ios/App/App.xcworkspace`, and archive.
- Set the production bundle identifier and signing team.
- Test with TestFlight on current iPhone and iPad devices.

## Store Metadata

- App name: HanYu Cards.
- Subtitle: HSK Mandarin flashcards with an AI tutor.
- Category: Education.
- Privacy policy URL: host `public/privacy.html` on the publisher domain.
- Data disclosure: local learning progress; optional AI tutor messages and vocabulary context.
- No ads, no tracking, no account required in the default release.

## Pre-Submission QA

- Offline launch and offline study work without the assistant API.
- AI tutor defaults to local notes, requires explicit online consent, and shows a clear fallback when the backend is unreachable.
- Font scaling, small screens, dark system UI overlays, and safe areas do not obscure controls.
- Reset progress removes local study history.
- Third-party notices are included in the app website or support bundle.
