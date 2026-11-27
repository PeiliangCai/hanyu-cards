# HanYu Cards

HanYu Cards 面向 HSK 1–3 学习者，支持独立学习和家长辅助学习。学习流程从词卡学习、间隔复习延伸到场景任务和进度反馈。本轮已补充商用需求及工程加固，正式发布仍需内容校审、运营资料和目标环境验收。

- [商用产品需求与验收标准（中文）](docs/product-requirements.zh-CN.md)
- [正式发布门槛与待办](docs/commercial-release-checklist.md)
- [本次验证报告](docs/validation-report.md)
- [生产部署手册](docs/Docker.md)
- [词库质量审核](docs/content-audit.md)
- [工程约定](#工程约定) · [项目协作约定](AGENTS.md)

Offline-first Mandarin Chinese learning app for individual HSK learners and parent-supported practice. The app was rebuilt from the MIT-licensed `languages-learner/web` Vue 3 codebase and now focuses on Chinese vocabulary, smart review, and an optional AI tutor.

## Features

- HSK 1-3 vocabulary set with simplified, traditional, pinyin, English meanings, radicals, tags, and review status.
- Fixed, resumable daily card routes with `Again`, `Hard`, `Good`, and `Easy` spaced-review scheduling, focused word study, and a mistake notebook.
- Six progressive real-life missions for introductions, dining, shopping, transit, campus teamwork, and clinic visits.
- Task-based lessons with learning goals, core expressions, bilingual dialogue, pronunciation, culture notes, and local target-phrase checks. These checks measure phrase coverage, not grammar or fluency.
- Five adaptive practice modes (meaning, hanzi, pinyin, listening, context) with ten-question summaries and persistent skill statistics.
- Paginated dictionary and progress views, daily goals, extra-word tracking, study time, accuracy and due counts.
- Device speech synthesis for Mandarin pronunciation.
- Offline-first progress storage through IndexedDB/localforage.
- Personalized learning analytics with a next-step recommendation, seven-day activity, XP, and mission completion.
- Floating AI tutor with HSK level, current mission, due words, and recent mistakes as context; includes role-play and offline fallback.
- PWA plus Capacitor configuration for Android and iOS packaging.

### Backup and restore

Settings supports versioned JSON backup and restore, including daily routes, mistakes, practice and mission results, study time and learning preferences, with an explicit replacement preview. Both previous main backups and render-deploy backups can be restored. Storage failures remain visible while local study continues in memory. Backups exclude chat messages and AI consent. Browser storage remains the only source of saved learning history until you export it. There is no account or automatic cloud sync. Concurrent tabs are protected when Web Locks is available. Use one tab at a time otherwise.

## Project implementation scope

HanYu Cards is the working prototype for the university innovation project **AI赋能的个性化汉语学习系统开发与运营**. The current milestone maps the proposal to an executable learning loop:

- **Content foundation:** 2,209 HSK 1–3 entries with simplified/traditional forms, pinyin, meanings, radicals, frequency and searchable tags.
- **Personalization:** local spaced review, daily goal, accuracy, mastery and recent-mistake context drive the next recommended action.
- **Scenario application:** six task-based missions cover first meetings, dining, shopping, metro travel, campus teamwork and clinic communication; each combines dialogue, pronunciation, culture notes and a written check.
- **AI extension:** the tutor receives only the active learning context and supports explanation, review planning and role-play, with an offline fallback for prototype demonstrations.

For the 2026 mid-term review, the recommended evidence set is the built web/PWA prototype, automated unit/component tests, a small user-trial feedback log, and screenshots of the study, mission and progress flows. Suggested acceptance indicators are: a complete review-to-feedback loop, six playable missions, persistent offline progress, and a reproducible production build.

## Development

Use Node.js `>=22.12.0` as specified in `package.json`. Run `nvm use` to select Node 22 LTS, the version line used by Docker and GitHub Actions. Node 24 is also supported. Install dependencies from the committed `package-lock.json` and start the frontend with npm.

```bash
npm ci
npm run dev
```

To use the optional AI backend, copy the example configuration on first setup if `.env` is absent. The default `ASSISTANT_MODE=mock` returns clearly labelled demonstration replies and works without a key.

```bash
cp .env.example .env
```

Run the backend on its own with `npm run dev:api`. To start both the frontend and the local API, run the following command.

```bash
npm run dev:all
```

The default UI uses local study notes and makes no chat request until the learner enables online AI. The development server proxies `/api` to `127.0.0.1:8787`. Change the proxy target if you change `PORT`.

`ASSISTANT_MODE=disabled` rejects chat requests. Live `ASSISTANT_MODE=openai` requires a server-side authenticating gateway, access quotas, `OPENAI_API_KEY` and a private gateway credential. The frontend uses an optional public `VITE_ASSISTANT_API_URL`. Git ignores `.env`. Keep that file, API keys, signing passwords, user messages and other sensitive data out of version control. [Deployment instructions](docs/Docker.md)

For AGICTO, select `ASSISTANT_MODE=agicto` and fill in `AGICTO_API_KEY` in the server environment. The default model is `gpt-6-luna`. This mode uses the same authenticating gateway and quotas. See the [local AGICTO test](docs/Docker.md#agicto-本机验证).

### Validation

Start with the tests that cover the change. Before committing, run the full check. Use `npm audit` to check dependency advisories.

```bash
npm run check
npm audit
```

`npm run check` runs `npm run types`, `npm run lint`, `npm run stylelint`, `npm run test:ci`, `npm run test:server` and `npm run build` in order. Each command can also run independently. API tests use injected responses and do not spend provider credits. CI also builds the production containers and runs `python3 docker/smoke.py` to check their HTTP responses.

`npm run stylelint` covers standalone `.scss` files. When changing a Vue component’s `<style>` block, also run the following check.

```bash
npx stylelint "src/**/*.{scss,vue}"
```

`docker/browser-smoke.mjs` 是 CI 中的浏览器、隐私及离线验收。`cypress/e2e/learning.cy.ts` 提供补充的端到端学习流程验收，桌面与移动配置分别位于 `cypress/configs/index.ts` 和 `cypress/configs/mobile.ts`。新增关键用户流程时同步扩展该用例，不要恢复旧登录页面的测试假设。

```bash
npm run cypress:run
npm run cypress:run:mobile
```

#### 测试要求

- 工具函数和复习算法使用 Vitest 做边界测试，包括 `again/hard/good/easy`、首次复习、到期时间和掌握状态。
- Vue 组件使用 Vue Test Utils。断言用户可见行为、事件和可访问状态，避免依赖内部实现。
- Store 测试应创建独立 Pinia，清理 localStorage，并使用 `vitest-setup.ts` 已提供的 fake-indexeddb，避免跨用例污染。
- 路由测试使用内存 history，不启动真实服务器。
- AI 相关测试不得访问真实模型或网络，应覆盖 mock/fallback、错误状态和发送上下文的最小化。
- 修改词汇或场景数据时同步增加完整性、唯一性和关键教学字段测试。
- 涉及响应式布局、PWA、语音或原生壳时，在自动化检查之外手动验证移动视口及离线行为。涉及发布时遵循 `docs/release-checklist.md`。

#### 完成标准

改动范围与请求一致，新增行为有相应测试。验收时确认离线学习流程正常、已有本地数据兼容。lint、类型检查、测试和构建均须通过，若有仓库已有且与本次改动无关的失败，须明确记录。行为发生变化时，同步更新相关文档、隐私说明、许可或发布步骤。

## Build

Build the web assets with `npm run build`. When a change requires updating the native shells, run `npx cap sync` after the build and review the generated Android and iOS diffs.

Capacitor 7 provides native speech, haptics, Android back handling and backup sharing. Keep native plugins compatible with Capacitor 7 and validate the full build when upgrading a major version. The Android build uses JDK 21, `minSdk 23`, `compileSdk/targetSdk 35` and AGP 8.7.2. The minimum iOS version is 14.0. Native compilation, signing and device acceptance require the platform SDKs. Use these commands to check the mobile environment and build an Android debug package.

```bash
npm run mobile:doctor
npm run mobile:android:debug
```

Production mobile builds read the public `VITE_ASSISTANT_API_URL` from `.env.mobile.local`. Set it to a deployed HTTPS backend when available. Without a secure public endpoint, the native app must use the local AI fallback. Keep provider keys and private gateway credentials out of this file.

Check current store requirements at release time and update both guides when the release process changes. [Mobile build instructions](docs/mobile-build.md) · [Release checklist](docs/release-checklist.md)

## Compliance Notes

- No Baicizhan branding, assets, or proprietary word data are used.
- Retain the existing license notices for the base app and HSK dataset. Check the license for each new word list, image, font or teaching resource and update [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- The default release has no account, no ads, and no tracking.
- The privacy notice at `public/privacy.html` is a deployment draft. Fill in the actual publisher, support, provider and retention details before release. Review [commercial release gates](docs/commercial-release-checklist.md).

## 工程约定

修改时优先保证离线学习、移动端体验和已有用户的 IndexedDB/localStorage 数据兼容性。学习、词典、复习和进度查看在后端或 AI 服务不可用时仍须正常工作。Web、PWA 和 Capacitor 移动端共享同一套核心行为。中文、拼音、英文释义和 HSK 等级必须准确且彼此一致。

### 当前技术栈

- Vue 3、TypeScript 严格模式、Vite、Vue Router、Pinia。
- `localforage`/IndexedDB 保存学习进度，localStorage 保存偏好设置。
- Vitest、Vue Test Utils、happy-dom 和 fake-indexeddb 用于自动化测试。
- SCSS、Vite PWA、Capacitor 7 支持样式、离线安装及 Android/iOS 打包。
- `server/index.mjs` 使用 Express，通过 OpenAI SDK 连接配置的服务端模型，提供可选 AI 助教接口。

### 有效代码边界

以 `src/main.ts` 的导入链判断当前运行代码。

| 路径 | 职责 |
| --- | --- |
| `src/pages/` | Study、Mistakes、Missions、Practice、Dictionary、Progress、Settings 等页面。 |
| `src/components/` | 跨页面组件，当前包括词卡和 AI 助教。 |
| `src/stores/` | 内容、学习进度、设置和助教状态。 |
| `src/types/learning.ts` | 学习领域模型的主定义文件。 |
| `src/utils/learning.ts` | 复习排期、搜索、语音和学习辅助逻辑。 |
| `src/data/hskWords.json` | 2,209 条 HSK 1–3 词汇数据。 |
| `src/data/scenarios.ts` | 六个任务型真实场景及其教学内容。 |
| `src/assets/app.scss` 与 `src/assets/scenarios.scss` | 当前界面的全局样式。 |
| `src/router/index.ts` | 无需登录的当前路由表。 |
| `server/index.mjs` | AI 助教后端，提供 `GET /health` 和 `POST /api/assistant/chat`。场景目标表达检查在本地运行。 |
| `tests/` | 当前 Vitest 单元、组件、数据和路由测试。 |
| `public/`、`capacitor.config.ts`、`android/`、`ios/` | PWA 与原生壳资源。 |
| `src/utils/native.ts` 与 `src/composables/useNativeBackButton.ts` | 原生语音、分享、触觉反馈和 Android 返回键适配。 |
| `scripts/verify-mobile-config.mjs` | 发布前只检查 `.env.mobile.local` 和签名变量是否存在，不读取后端 `.env`。 |

`src/modules/`、`src/services/`、`src/store/modules/` 以及 Firebase、旧 i18n/路由守卫相关插件来自重构前的 `languages-learner` 应用，且大多已被 TypeScript/ESLint 排除。除非任务明确要求迁移或清理，否则不要在这些目录中添加新功能，也不要把 Firebase 登录或旧多语言路由重新接入当前应用。

### 数据架构决策

当前里程碑不引入远程业务数据库。HSK 和场景内容随应用发布，学习进度保存在 IndexedDB/localforage，偏好保存在 localStorage，AI 代理保持无状态。这样可以保留无账号、低运营成本和离线可用的产品边界。

只有在明确加入账号、跨设备同步、后台内容运营、教师端、付费权限或群体分析时才增加服务端数据库。届时优先采用带鉴权 API 的 PostgreSQL 兼容方案，设计本地与云端冲突规则，并保证核心学习流程不会因网络失败而不可用。

### 实现约定

- 新界面使用 Vue SFC 和 `<script setup lang="ts">`。状态跨页面共享时放入 Pinia store，纯计算逻辑优先放入 `src/utils/`。
- 使用 `@/` 引用 `src/`、使用 `@@/` 引用仓库根目录，避免脆弱的多层相对路径。
- TypeScript/Vue 及 `src/assets/app.scss` 使用 4 空格，其他 SCSS/JSON/YAML 使用 2 空格。使用单引号和多行尾逗号，省略分号，用 `import type` 导入纯类型。
- 保持 TypeScript 严格类型。不要用 `any`、非必要的类型断言或关闭检查来绕过问题。
- 延续现有视觉语言和 CSS 类命名，复用 `.primary-action`、`.secondary-action`、`.screen` 等公共模式。界面至少适配 320 px 宽度，并保留安全区、键盘操作、可见焦点、语义标签和 `aria-*` 状态。
- 不直接编辑 `dist/`、`dist-test/`、`node_modules/` 或其他生成物。
- 添加或升级依赖时同时提交 `package.json` 和 `package-lock.json`，说明依赖的必要性，并优先使用现有能力。

### 领域与数据约束

学习数据类型以 `src/types/learning.ts` 为准。

#### 词库与场景

- `HskWord.id` 和场景 `id` 是持久化及关联键，发布后不得随意改变或复用。
- 词汇必须包含有效的 HSK 1–3 等级、简体、繁体、带声调拼音、数字拼音、英文释义、词性、部首、示例和标签。批量修改 JSON 时必须检查条目数、ID 唯一性和字段完整性。
- 场景保持渐进的 HSK 难度，并包含学习目标、至少五个核心表达、至少五轮示例对话、文化说明、任务提示、目标表达和中/拼/英示范答案。

#### 学习与评分

- 间隔复习规则集中在 `src/utils/learning.ts`，记录写入集中在 `src/stores/progress.ts`。不要在页面中复制排期算法。
- Today 使用“到期复习 → 活跃错题 → 高频新词”生成每天唯一且固定的队列。HSK 范围和用户选择的 `5–120` 张目标在创建新队列时读取。尚未完成任何卡片时允许目标变化触发重建。完成第一张后必须可刷新续学，不能因切换设置或再次渲染而更换。每日进度分子是当天队列中已首次评分的唯一词卡数，`Again` 也计入并同时进入错题本。Practice、错题重练等重复作答只增加总作答数，不增加每日进度，掌握状态另由多次复习结果决定。
- Dictionary 的 `Study this word` 必须携带所选词 ID 并进入专项学习。若该词属于当日队列，其首次评分可完成对应卡片。否则只记录为当日唯一 extra word 并进入后续间隔复习，不得自动扩大当日分母。
- `needsMistakeReview` 是错题本当前状态。答错自动加入，错题本中 `Good`/`Easy` 才自动清除，手动移除必须显式调用 store action。
- Practice 的 `meaning`、`hanzi`、`pinyin`、`listening`、`context` 统计分别持久化。混合模式优先尚未练习或正确率较低的能力，每 10 题结束后显示轮次总结，不得静默重置为第 1 题。
- 场景的每次提交都记录尝试次数和最近成绩，并立即计入“已探索”。本地检查只有覆盖全部目标表达才加入完成列表，分数代表表达覆盖率，不代表语义、语法或流利度。历史最佳成绩不能被较低的新成绩覆盖。兼容导入旧版本评估数据，但不能伪造缺失成绩。

#### 存储与恢复

- `hanyu-progress-v1` 和 `hanyu-settings-v1` 是已发布的存储键。若变更持久化结构，应提供向后兼容的默认值或显式迁移，并验证旧数据、空数据和损坏数据的行为。
- 日期键使用学习者设备的本地日历日期。测试中使用固定时间，避免依赖执行机器的当前时间或时区。
- 设置页导出格式由 `format: "hanyu-cards-progress"`、`version: 1` 标识。兼容导入旧 main 备份以及 render-deploy 的 `app: "hanyu-cards"` 格式。保留全部有效学习历史，严格校验大小、ID、计数、日期及关联字段。偏好备份不含聊天和在线 AI 授权，恢复不得自动授权在线 AI。
- 保留按 store 串行写入、跨标签页 Web Locks 与 revision 检查、存储错误提示、恢复预览及重试。不得截断旧记录或用空数据覆盖损坏存储。

### AI 助教约束

- `OPENAI_API_KEY` 和 `ASSISTANT_PROXY_SECRET` 只用于服务端，绝不能使用 `VITE_` 前缀或发送给浏览器。
- 前端只向 `VITE_ASSISTANT_API_URL` 发送必要的学习上下文。不要加入身份信息、完整本地历史或无关设备数据。
- 场景任务当前只检查本地目标表达，不请求在线评估。可选 AI 对话必须用户主动授权后才发送，支持撤回、跨标签页同步及请求取消。不预热后端，不自动请求模型。未来语义评估需单独设计和验证。
- 后端继续执行输入校验、请求体大小限制、来源限制和速率限制。错误响应不得泄露密钥、提示词、堆栈或供应商原始敏感信息。
- 无 key、mock、断网、超时和上游失败时都必须保留清晰可用的本地 fallback。
- 医疗等场景只用于语言练习，不能把助教包装成专业诊断或安全建议来源。
