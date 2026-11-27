# 本次交付与验证报告

日期：2026-09-21。仓库：[PeiliangCai/hanyu-cards](https://github.com/PeiliangCai/hanyu-cards)，下载基线 `f2c5d9de7f753d4983b2d05f6eaa7502e61b0b76`。工作目录 `/root/hanyu-cards`，本地分支 `feat/commercial-readiness`。该首轮记录描述当时的本地交付；后续主分支整合记录见文末。

结论：商用需求基线及关键工程加固已交付，自动化和浏览器核心路径通过。**仍需内容校审、运营信息及目标部署验收，不能认定为已经完成正式商用上线。**

## 已落实的变化

- 个人/家长辅助使用的需求、P0/P1/P2优先级、验收指标、商业验证与发布责任清单。
- 可校验的本地进度备份/恢复、恢复前预览确认、保存失败提示、旧数据迁移、写入串行与修订号检测；保留完整学习历史。
- 在线AI默认关闭，明确共享范围；撤销许可可中止请求并跨标签同步；本地问题不补发到在线历史；区分本地/演示/在线回复，支持超时恢复和清除聊天。
- API严格输入及负载边界、有限容量限流、并发/分钟/日调用上限、服务端网关鉴权、超时/断连取消、结构化错误及不含聊天内容的API日志。
- 修复任务提交即完成、练习级别状态、重复评分、相同英文选项歧义、400词截断和UTC每日统计问题。
- npm兼容范围安全更新、有效ESLint配置、无密钥CI、独立前后端容器、Nginx安全头与PWA缓存配置、定期依赖更新。
- 可复跑的词库审计脚本与103条待人工审核候选；没有自动编造教学释义替换。

## 已执行的检查

| 检查 | 结果 | 证据/范围 |
| --- | --- | --- |
| 依赖安装 | 通过 | `npm ci`；本机Node 24.21.0，CI/镜像目标Node 22 |
| 类型检查 | 通过 | `npm run types`，含应用与TypeScript测试 |
| ESLint | 通过 | `npm run lint`；移除已不存在的自动生成配置引用 |
| 前端回归 | **67项通过，16个文件** | `npm run test:ci`：组件、路由、存储/迁移/备份、隐私授权与撤销、学习反馈 |
| 后端集成 | **19项通过** | `npm run test:server`：真实本地HTTP，注入模拟供应商；不调用真实付费服务 |
| 一键检查 | 通过 | `npm run check`，涵盖上述检查与生产构建 |
| 生产构建 | 通过 | `npm run build`；`dist/`已生成，最新构建含SW对API/healthz导航的排除规则 |
| 依赖漏洞 | **0项已知漏洞** | 最后一次`npm audit --json`：info/low/moderate/high/critical均为0；仅代表本次数据库扫描 |
| Nginx/HTTP | 通过 | 本机原生Nginx 1.18语法及`python3 docker/smoke.py`；静态资源、SPA、CSP、安全头、缓存、SW、404、mock API |
| Chromium浏览器 | 通过 | `docker/browser-smoke.mjs`，真实生产构建+原生Nginx，非仅组件模拟 |
| 工作流/Compose | 静态检查通过 | actionlint；Compose官方JSON schema；尚无目标Docker容器实跑证据 |
| Git补丁 | 通过 | `git diff --check` |

浏览器覆盖六个页面、复习后刷新持久化、目标设置、备份下载→清空→恢复、错误JSON不覆盖、默认零助教请求、明确同意后收到mock响应、service worker控制后的断网刷新/词典搜索/复习再刷新，以及320/390/1280px布局与助教面板边界。记录中未发现非预期console.error/pageerror或CSP违规。移动设备尺寸由Chromium模拟，**不等同于真实iPhone/Safari或Android设备验收**。

可查看合成测试数据截图：[桌面学习](screenshots/desktop-study.png)、[手机学习](screenshots/study-390.png)、[手机助教](screenshots/tutor-390.png)、[备份设置](screenshots/settings-backup.png)。截图没有真实用户数据。

## 构建体积及已知限制

PWA预缓存约794 KiB；词库单块约598 kB、gzip约123 kB，构建存在“单块超过500 kB”提示。本次保留完整离线词库；需在目标中端手机测量加载与解析性能，不能将构建成功视为已达到性能指标。

未执行：实际Docker镜像启动（本机无Docker）、GitHub远程CI、真实供应商调用、生产HTTPS/压力测试、旧已部署版本升级测试、原生签名打包、Safari/真实移动设备验收、收费与商店发布。

未完成的产品能力：家庭多档案和家长锁、儿童专属课程、身份/云同步/持久化额度网关、支付与订阅。当前在线AI生产模式要求另外接入认证网关，默认Nginx不会注入凭证。限流在单进程内存，重启会清零；不能作为账务或持久化用户权益。

无Web Locks的浏览器仍可能在多个标签同时写时发生竞态；当前建议单标签使用。备份明文且恢复为替换，不自动合并。浏览器清理数据/卸载仍可能删除未导出的学习记录。

## 下一步发布所需材料

按 [商用发布清单](commercial-release-checklist.md) 完成内容审核、主体/支持信息、年龄及地区、渠道、目标环境验收，再决定上线范围。特别是 [内容审核清单](content-review.csv) 中的候选需要中文教学人员确认；代码测试并不证明所有词义、读音或HSK映射正确。

来源核验：依赖漏洞更新参考 [node-tar公告](https://github.com/advisories/GHSA-23hp-3jrh-7fpw)、[Vitest公告](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)；供应商响应存储与其他数据保留的区别参考 [OpenAI数据控制说明](https://developers.openai.com/api/docs/guides/your-data)。原生发布要求参考 [Android目标API要求](https://developer.android.com/google/play/requirements/target-sdk) 和 [Apple提交要求](https://developer.apple.com/news/upcoming-requirements/)，检查日期为本报告日期，实际提交时需重新核对。


## 2026-11-27 主分支整合复核

已将远端 `main` 的 `3c6053d`（协作者 PR #2）与本地工程加固提交整合。保留协作者的学习进度组件、布局与 Android/Capacitor 配置，同时保留进度备份、在线 AI 授权和请求保护。冲突逐段处理，不以整文件覆盖另一方实现；新增签名文件的 Docker 构建排除规则，与协作者的 Git 忽略规则一致。

依赖更新后，类型检查、ESLint、67 项前端测试、19 项后端测试和生产构建均通过。前端全量验证使用一个工作进程与 30 秒测试时限，适应本机半核 CPU / 2 GiB 容器；类型检查单独执行。生产 PWA 预缓存约 805 KiB，仍有原有词库单块体积提示及 Vite 对未来原生配置加载方式的迁移提示。

本次最初的依赖扫描报告 35 项问题。完成兼容版本更新，并将 Vue 更新到 3.5.46、测试环境 Happy DOM 更新到 21.0.4 后，`npm audit --audit-level=high` 通过：高危 0、严重 0，剩余 6 项中危，涉及 editorconfig/glob/js-beautify/minimatch/Workbox/PWA 构建工具链。审计工具给出的进一步自动修复涉及回退 PWA 插件，需要独立验证兼容性；这些中危项仍是待办，不能沿用 9 月“0 项”的结果描述当前全部依赖。

GitHub 状态核查：[PR #2](https://github.com/PeiliangCai/hanyu-cards/pull/2) 已合并。先前 [PR 检查运行](https://github.com/PeiliangCai/hanyu-cards/actions/runs/45811996632) 等待维护者批准后过期；这与代码是否已合并是不同状态。旧主分支 CI 构建失败，旧配置仍使用 Node 18，而项目要求 Node 20.19 或更新；本次交付的 CI 统一使用 Node 22。详细失败日志需要 GitHub 登录，因此没有将未取得的日志推测写作已确认事实。

最新整合与依赖更新后的 HTTP smoke 和 Chromium 浏览器验收均通过，覆盖六个页面、复习持久化、备份导出/重置/恢复、错误导入保护、AI 同意机制、离线学习、SW 路由隔离及 320/390/1280px 布局。验收使用临时并发限制适应本机资源，未修改生产逻辑或仓库验收脚本。

`.env` 及其中的供应商密钥、服务间凭证不包含在 Git 提交中。远端发布结果以 GitHub 的 `main` 提交记录为准。
