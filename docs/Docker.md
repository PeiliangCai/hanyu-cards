# Docker 部署

生产部署使用 Nginx 提供 Vue 静态资源，并将同源 `/api/` 请求转发给独立 Node.js API。两个容器均以非 root 用户运行，根文件系统只读，只在 `/tmp` 使用临时文件。API 不发布宿主机端口；Web 默认只监听宿主机 `127.0.0.1:8080`。需要 Docker Engine 和支持 `up --wait` 的 Docker Compose v2。

当前默认提供本地规则导师（`ASSISTANT_MODE=mock`），不调用付费模型。这套配置提供可部署基础，不代表账户、订阅、支付、跨设备同步和生产运营已经完成。

## 本机验收

在仓库根目录执行：

```sh
docker compose up --build -d --wait --wait-timeout 180
docker compose ps
python3 docker/smoke.py
```

访问 <http://localhost:8080>。Smoke 检查首页、SPA 深链接、编译后的资源、服务工作线程缓存策略、基础安全响应头、错误路由和 mock API。此脚本应在 mock 验收环境运行，不要对已接入真实付费服务的环境直接运行。

可选浏览器验收使用独立安装的 Playwright，不修改应用依赖。它检查六个页面、复习记录持久化、备份恢复、AI 同意开关、离线重载及移动端布局，并将截图输出到 `/tmp/hanyu-browser-artifacts`：

```sh
npm install --prefix /tmp/hanyu-browser playwright@1.63.0
/tmp/hanyu-browser/node_modules/.bin/playwright install chromium
PLAYWRIGHT_MODULE_PATH=/tmp/hanyu-browser/node_modules/playwright node docker/browser-smoke.mjs
```

Linux 主机若缺少浏览器系统依赖，先按 Playwright 提示安装。可通过 `SMOKE_BASE_URL` 和 `SMOKE_ARTIFACTS` 覆盖验收地址及产物目录。

健康检查分为 Web `/healthz` 和 API 容器内 `/health`。Web 健康并不表示模型供应商可用；API 健康端点也不执行付费模型探测。Compose 等待 API 健康后启动 Web，API 重启后 Nginx 会重新解析其容器地址。

```sh
docker compose logs --tail=100 -f
docker compose down
```

## 服务器配置

将以下内容保存为 `.env.docker.local`，该文件已被 Git 忽略，并被排除在 Docker 构建上下文之外：

```dotenv
ASSISTANT_MODE=mock
ALLOWED_ORIGINS=https://learn.example.com
WEB_BIND_ADDRESS=127.0.0.1
WEB_PORT=8080
ASSISTANT_RATE_LIMIT_PER_MINUTE=20
ASSISTANT_GLOBAL_RATE_LIMIT_PER_MINUTE=60
ASSISTANT_DAILY_REQUEST_LIMIT=1000
ASSISTANT_MAX_CONCURRENT=4
```

将域名替换为实际域名，Origin 不带尾部斜杠。为该文件设置最小读权限后启动：

```sh
chmod 600 .env.docker.local
docker compose --env-file .env.docker.local -f docker-compose.yml -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.docker.local -f docker-compose.yml -f docker-compose.prod.yml up --build -d --wait --wait-timeout 180
```

`docker-compose.prod.yml` 增加 Web 128 MiB / 0.5 CPU、API 256 MiB / 1 CPU 的起始资源上限，需要按压测结果调整。基础文件本身也可以独立用于生产模式。

在宿主机或托管入口配置 TLS、证书续期、HTTPS 重定向和 HSTS，将 HTTPS 流量代理到 `127.0.0.1:8080`。除 `localhost` 开发环境外，浏览器 PWA/服务工作线程需要 HTTPS。只有确需通过宿主机外网端口访问时，才设置 `WEB_BIND_ADDRESS=0.0.0.0` 并配套入口和网络访问规则。

Nginx 会覆盖浏览器传入的 `X-Forwarded-For`，API 使用 `TRUST_PROXY=1`。添加外层代理后，应在受信任网络边界正确恢复真实客户端 IP；未经适配时多个用户可能共享入口代理 IP 的限流配额。不要盲目信任来自公网的转发头。

## 接入真实 AI

启用付费调用需要显式选择 `agicto` 或 `openai`，并在 API 运行环境和认证网关上配置相同的服务间凭证。两个模式共用以下设置。

```dotenv
ASSISTANT_ACCESS_MODE=trusted-proxy
ASSISTANT_PROXY_SECRET=<32至256个非空白ASCII字符的随机服务间密钥>
AI_TIMEOUT_MS=20000
```

通过服务器专用的环境变量选择 AGICTO。`AGICTO_MODEL` 默认使用 `gpt-6-luna`，可填该账户支持的其他聊天模型。API 将请求发送到 `https://api.agicto.cn/v1/chat/completions`。[AGICTO 快速开始](https://docs.agicto.com/quickstart) · [gpt-6-luna 模型页](https://agicto.com/model/gpt-6-luna)

```dotenv
ASSISTANT_MODE=agicto
AGICTO_API_KEY=
AGICTO_MODEL=gpt-6-luna
```

通过 OpenAI Responses API 调用时，选择 `openai` 并填入 OpenAI 密钥。`AI_MODEL` 默认使用 `gpt-5.4-mini`。

```dotenv
ASSISTANT_MODE=openai
OPENAI_API_KEY=
AI_MODEL=gpt-5.4-mini
```

上线前必须另外接入认证网关。网关负责验证用户身份、订阅权限和用户配额，清除客户端伪造的 `X-Assistant-Proxy-Token`，然后在认证通过的内部请求中注入服务间凭证。默认 Compose 的 Nginx 会清除该请求头，API 会拒绝经由该入口发出的付费请求，直至部署接入认证网关。

供应商密钥和网关凭证只在 API/认证网关运行时注入，禁止放入 `VITE_` 变量、Docker build args、镜像或 Git。Compose 的环境变量注入适合基础部署；具备 Docker 管理权限的人员仍可查看运行环境。正式环境应由受控密钥管理系统注入和轮换，并限制运维权限。

当前进程内限流和日请求上限会在重启时归零，不是持久化计费账本。扩容前需要共享限流和持久化用户额度，并在供应商账户配置预算。该部署不会备份浏览器中的学习记录：学习数据仍在用户设备，应提供用户导出，并在计划跨设备服务时单独实现账户数据存储和备份恢复。

### AGICTO 本机验证

在仓库根目录的 `.env` 中配置 `ASSISTANT_MODE=agicto`、`ASSISTANT_ACCESS_MODE=trusted-proxy` 和 `ASSISTANT_PROXY_SECRET`，然后填入 `AGICTO_API_KEY`。若文件已包含模式和服务间凭证，只需填写 `AGICTO_API_KEY`。使用默认的本机监听地址 `127.0.0.1`，运行 `npm run dev:api`。

另开一个终端。以下命令读取 `.env` 中的服务间凭证并向本机 API 提交一次测试请求，会使用 AGICTO 额度。成功时返回 `mode: online` 和导师回复。

```sh
node --env-file=.env --input-type=module <<'NODE'
const url = new URL('http://127.0.0.1:8787/api/assistant/chat')
url.port = process.env.PORT || url.port
const response = await fetch(url, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-Assistant-Proxy-Token': process.env.ASSISTANT_PROXY_SECRET,
    },
    body: JSON.stringify({ message: 'How do I say hello in Mandarin?' }),
    redirect: 'error',
})
const body = await response.json()
console.log(response.status, body)
const online = body.mode === 'online' && typeof body.reply === 'string' && body.reply.trim()
process.exitCode = response.ok && online ? 0 : 1
NODE
```

## 构建与缓存

- Docker 使用 Node.js 26，常规质量检查使用 Node.js 22。Node.js 与 Nginx 基础镜像固定到多架构 digest，依赖通过 `npm ci` 和锁文件安装；Dependabot 定期提出镜像、npm 和 Actions 更新。更新后需重新验收。
- `.env`、各环境的 `.env.*`、常见私钥文件、Git、原生移动端构建文件和本地依赖不进入构建上下文。前端构建固定使用同源 API，不嵌入运行时凭证。
- `/assets/` 成功响应使用一年不可变缓存；HTML、manifest 和服务工作线程使用 `no-cache` 重新验证；API 使用 `no-store`。静态资源缺失返回 404，页面深链接回退到首页。
- 内置 CSP、`nosniff`、禁止 iframe、Referrer-Policy 和 Permissions-Policy。若增加外部分析、字体、音频或其他服务，需评估并同步修改 CSP；不要直接放开通配符。

## CI 与发布

`.github/workflows/ci.yml` 对推送和 PR 执行 types、lint、前端测试、Node API 测试和生产构建，同时构建两个容器并运行 HTTP 与 Chromium 浏览器 smoke。浏览器工具固定版本并独立安装，页面截图保留七天。CI 无需 Firebase、测试账户或模型密钥，也不自动部署到任何线上环境。

正式发布前，在目标平台运行完整 CI、浏览器端升级验收和负载测试，配置监控告警，并保留上一版本的镜像 digest 与配置以便回滚。当前 smoke 不覆盖原生 iOS/Android、Safari/Firefox、真实模型、支付及完整业务端到端流程。

## 开发模式

开发 Compose 是独立配置，同时启动 Vite 和 API，不与生产文件合并：

```sh
docker compose -f docker-compose.dev.yml up --build
```

访问 <http://localhost:3000>。源码通过目录挂载，依赖保存在命名卷中。锁文件更新后，在开发容器停止的情况下删除该开发依赖卷并重建：

```sh
docker compose -f docker-compose.dev.yml down --volumes
docker compose -f docker-compose.dev.yml up --build
```

参考：[Compose 服务配置](https://docs.docker.com/reference/compose-file/services/)、[Nginx 官方镜像](https://hub.docker.com/_/nginx)。
