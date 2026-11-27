# HanYu Cards 移动端构建指南

同一套 Vue 应用通过 Capacitor 7 打包为 Android/iOS。词库、每日计划、错题本、练习、进度和场景目标表达检查在设备上运行。在线 AI 对话由用户主动授权后才发送到配置的后端。

## 已接入的原生能力

- 系统普通话朗读，失败时尝试浏览器语音。
- 复习评分触觉反馈。
- 通过系统分享面板导出学习备份；iOS 工程包含文件时间戳 API 的隐私用途声明。
- Android 返回键优先关闭助教，再返回上一页、Today，最后最小化。
- mobile 构建不生成或注册 PWA Service Worker，网页版本保留离线缓存。

插件保持 Capacitor 7 兼容版本；text-to-speech 插件自身版本为 6，它的 peer dependency 支持 Capacitor 7。不要单独把 status-bar 等插件升级至 Capacitor 8。

## 仓库构建基线

- Node.js 22.12+，按 package-lock.json 使用 `npm ci` 安装。
- Android：JDK 21、SDK 35；当前 minSdk 23、compileSdk/targetSdk 35、AGP 8.7.2。
- iOS：macOS、适配该工程的 Xcode 和 CocoaPods；当前最低部署版本 14.0。
- 应用 ID 为 `com.hanyucards.app`。Android 调试和正式构建的 versionCode 为 1，versionName 为 1.0。

这些是仓库现状，不代表符合应用商店当前准入要求。上架前需要另行升级及验证目标 SDK、签名、隐私清单与商店要求，见 [发布清单](release-checklist.md)。Linux 的网页构建和配置检查不能替代原生编译、签名及真机验收。

## 公开配置

```bash
cp .env.mobile.example .env.mobile.local
npm run mobile:doctor
```

`VITE_ASSISTANT_API_URL` 可留空，使用离线学习和本地助教提示。需要在线对话时，填写已部署的公开 HTTPS **网关**地址。原生包会拒绝 localhost、带凭据或非 HTTPS 的在线地址。

`OPENAI_API_KEY`、`AGICTO_API_KEY` 和 `ASSISTANT_PROXY_SECRET` 只放在服务端，不能写入移动配置或任何 `VITE_` 变量。真实 AI 请求必须由可信网关在服务端验证调用者、施加配额并注入代理凭据，不能把网关凭据打包进 App。具体见 [部署手册](Docker.md)。允许的来源需与 `https://localhost`（Android）、`capacitor://localhost`（iOS）及实际 Web 域名匹配；来源白名单不能替代认证。

## Android

准备 JDK 与 Android SDK，在 Android Studio 创建本地 SDK 配置，或设置 `JAVA_HOME`、`ANDROID_HOME`。

```bash
npm run mobile:android:debug
```

命令完成类型检查、mobile 模式网页构建、Capacitor 同步和 Gradle 编译。调试 APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。如缺少 SDK，此命令不能完成，不能据此声称原生包已验证。

### GitHub 公开预览版

Android 预览版显示为 **HanYu Cards Preview**，应用 ID 为 `com.hanyucards.app.preview`，versionName 为 `1.0.0-beta.1`，versionCode 为 `1`。它沿用 release 构建设置，禁用调试，可与原有的 HanYu Cards 共存。两个应用各自保存学习进度，可通过设置中的备份导出和导入迁移进度。

从发布提交检出的干净工作目录执行以下命令可生成 `android/app/build/outputs/apk/preview/app-preview-unsigned.apk`。

```bash
npm ci
VITE_ASSISTANT_API_URL='' npm run mobile:android:preview
```

在 `main` 的发布提交上手动运行 **Android beta** 的 `build` 操作，GitHub Actions 会在离线助教模式下构建 APK。下载 `hanyu-android-beta-unsigned` 工件，核对 `source.txt` 对应的提交，并在工件目录执行 `sha256sum -c SHA256SUMS`。在受信任的本机完成对齐和签名，GitHub Actions 无需签名密钥。[Android beta workflow](../.github/workflows/android-beta.yml)

设置 `preview_keystore` 为仓库外的预览版密钥库绝对路径。仅在首次发布时创建密钥库，保留加密备份。`keytool` 和 `apksigner` 会交互式读取密码。

```bash
keytool -genkeypair -storetype PKCS12 -keystore "$preview_keystore" \
  -alias hanyu-preview -keyalg RSA -keysize 3072 -validity 10000 \
  -dname 'CN=HanYu Cards Android Preview'
```

在已解压的 Actions 工件目录签名，使用已安装的 Android SDK Build Tools 35。先用 `zipalign` 对齐 APK，再用预览版专用密钥签名。签名验证会输出证书 SHA-256 指纹，`SHA256SUMS` 记录签名后 APK 的 SHA-256。[zipalign](https://developer.android.com/tools/zipalign) · [apksigner](https://developer.android.com/tools/apksigner)

```bash
build_tools="$ANDROID_HOME/build-tools/35.0.0"
unsigned_apk=HanYu-Cards-1.0.0-beta.1-unsigned.apk
signed_apk=HanYu-Cards-1.0.0-beta.1.apk

mkdir -p signed
"$build_tools/zipalign" -P 16 -f 4 "$unsigned_apk" preview-aligned.apk
"$build_tools/apksigner" sign --ks "$preview_keystore" --ks-key-alias hanyu-preview \
  --v4-signing-enabled false --out "signed/$signed_apk" preview-aligned.apk
"$build_tools/apksigner" verify --verbose --print-certs "signed/$signed_apk"
"$build_tools/zipalign" -c -P 16 4 "signed/$signed_apk"
(
  cd signed
  sha256sum "$signed_apk" > SHA256SUMS
  sha256sum -c SHA256SUMS
)
```

创建 GitHub Release 草稿，目标设置为 `source.txt` 确认的完整提交 SHA，勾选 **This is a pre-release**，上传 `signed/` 中的 APK 与 `SHA256SUMS`。在同一发布提交运行 **Android beta** 的 `verify` 操作，输入草稿和 APK 的数字 ID、签名 APK 的 SHA-256 以及已核对的签名证书 SHA-256。检查安装、冷启动、离线学习、备份分享及升级后进度，通过验收后发布草稿。

后续预览版继续使用同一个预览版签名密钥及应用 ID，并在 `android/app/build.gradle` 中递增预览版 versionCode。Android 使用这三项识别可原位升级的 APK，升级可以保留预览版进度。

### 正式 Android 构建

正式签名需在本机配置四个环境变量，不提交密钥库或密码：

```text
HANYU_UPLOAD_STORE_FILE       上传密钥库绝对路径
HANYU_UPLOAD_STORE_PASSWORD   密钥库密码
HANYU_UPLOAD_KEY_ALIAS        密钥别名
HANYU_UPLOAD_KEY_PASSWORD     密钥密码
```

```bash
npm run mobile:android:release
```

命令检查配置与签名变量后调用 `bundleRelease`，生成用于商店提交的 `android/app/build/outputs/bundle/release/app-release.aab`。手动从 `android/` 执行 `./gradlew assembleRelease` 可生成直接安装的正式 APK，配置正式签名时文件位于 `android/app/build/outputs/apk/release/app-release.apk`，未配置签名时生成 `app-release-unsigned.apk`。每次发布递增 versionCode，并完成签名检查和设备测试。

## iOS

在 macOS 上执行：

```bash
npm ci
npm run mobile:doctor
npm run mobile:ios:sync
cd ios/App
pod install
open App.xcworkspace
```

在 Xcode 配置开发团队、签名与发布标识，完成真机测试后再 Archive。Linux 可以生成网页资源及更新插件声明，但无法运行 CocoaPods/Xcode 编译和归档。

## 真机验收

- 安装、冷启动、后台恢复、升级安装后进度保持完整。
- 断网时每日计划、错题恢复、五类练习、查词和本地场景检查可用。
- 已开始的每日计划不因设置改变而变更；专项学习和 Practice 不虚增每日完成数。
- 普通话语音、触觉、返回键及备份分享在目标设备上实际可用。
- 备份可预览并恢复全部学习数据；偏好恢复不自动授权在线 AI。
- 在线 AI 默认关闭，显式授权后才发送；撤回授权中止待完成请求。
- 小屏、横屏、字体放大和软键盘不遮挡关键操作。
- 原生权限、隐私清单和商店披露与实际数据流一致。
