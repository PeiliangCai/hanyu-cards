# HanYu Cards

面向个人与家长辅助使用的汉语学习产品。本轮已补充商用需求及工程加固；正式发布仍需内容校审、运营资料和目标环境验收。

- [商用产品需求与验收标准（中文）](docs/product-requirements.zh-CN.md)
- [正式发布门槛与待办](docs/commercial-release-checklist.md)
- [本次验证报告](docs/validation-report.md)
- [生产部署手册](docs/Docker.md)
- [词库质量审核](docs/content-audit.md)

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

## Project implementation scope

HanYu Cards is the working prototype for the university innovation project **AI赋能的个性化汉语学习系统开发与运营**. The current milestone maps the proposal to an executable learning loop:

- **Content foundation:** 2,209 HSK 1–3 entries with simplified/traditional forms, pinyin, meanings, radicals, frequency and searchable tags.
- **Personalization:** local spaced review, daily goal, accuracy, mastery and recent-mistake context drive the next recommended action.
- **Scenario application:** six task-based missions cover first meetings, dining, shopping, metro travel, campus teamwork and clinic communication; each combines dialogue, pronunciation, culture notes and a written check.
- **AI extension:** the tutor receives only the active learning context and supports explanation, review planning and role-play, with an offline fallback for prototype demonstrations.

For the 2026 mid-term review, the recommended evidence set is the built web/PWA prototype, automated unit/component tests, a small user-trial feedback log, and screenshots of the study, mission and progress flows. Suggested acceptance indicators are: a complete review-to-feedback loop, six playable missions, persistent offline progress, and a reproducible production build.

## Development

Use Node.js 22 LTS (`nvm use`; Node 24 is also supported).

```bash
npm ci
npm run dev
```

To run the AI assistant backend in mock mode:

```bash
cp .env.example .env
npm run dev:api
```

For frontend and API together:

```bash
npm run dev:all
```

The default UI uses local study notes and makes no chat request until the learner enables online AI. The development server proxies `/api` to `127.0.0.1:8787`; change the proxy target if you change `PORT`.

`ASSISTANT_MODE=mock` returns clearly labelled demonstration replies. `disabled` rejects chat requests. Live `openai` mode requires a server-side authenticating gateway, access quotas, `OPENAI_API_KEY` and a private gateway credential; see [deployment instructions](docs/Docker.md). Setting a provider key alone does not enable paid requests. The frontend uses an optional public `VITE_ASSISTANT_API_URL`; secrets must never use a `VITE_` variable.

### Validation

```bash
npm run check
npm audit
```

`check` runs type checking, lint, stylelint, frontend regression tests, Node API integration tests and a production build. API tests use injected test responses and do not spend provider credits. CI additionally builds the production containers and runs `python3 docker/smoke.py`.

Settings supports versioned JSON backup and restore, including daily routes, mistakes, practice and mission results, study time and learning preferences, with an explicit replacement preview. Both previous main backups and render-deploy backups can be restored. Storage failures remain visible while local study continues in memory. Backups exclude chat messages and AI consent; browser storage remains the only source of saved learning history until you export it. There is no account or automatic cloud sync. Concurrent tabs are protected when Web Locks is available; use one tab at a time otherwise.

## Build

```bash
npm run build
npx cap sync
```

Capacitor 7 native speech, haptics, Android back handling and backup sharing are included. Build instructions are in [docs/mobile-build.md](docs/mobile-build.md); release gates are in [docs/release-checklist.md](docs/release-checklist.md). Platform compilation, signing and device acceptance still require the platform SDKs.

## Compliance Notes

- No Baicizhan branding, assets, or proprietary word data are used.
- Base app attribution and HSK dataset attribution are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- The default release has no account, no ads, and no tracking.
- The privacy notice at `public/privacy.html` is a deployment draft. Fill in the actual publisher, support, provider and retention details before release. Review [commercial release gates](docs/commercial-release-checklist.md).
