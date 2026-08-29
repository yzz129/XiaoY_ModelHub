# XiaoY_ModelHub

一个基于 React、TypeScript 和 Vite 构建的本地多模型工作台，覆盖语言、语音、图片、视频、向量与 3D 模型，并可从 31 个服务商目录动态同步可用模型。

## 功能

- 小屎仙多模态 Agent：直接路由账号已配置的免费语言模型，支持图片/文本/代码附件、任务拆解、工具轨迹和联网来源
- Agent 长期能力：D1 云端对话、可删除长期记忆、定时/周期/Cron 任务、模型故障切换与赞踩反馈优化
- 图片生成与编辑：仅展示 Agnes Image 免费模型，兼容模型可上传参考图
- 文生视频：仅展示 Agnes Video 免费模型，并支持异步任务恢复
- 语言模型工作台：仅展示 OpenRouter 的免费路由与 `:free` 模型
- 双服务商设置：API 设置只保留 Agnes AI 与 OpenRouter
- 默认模型广场首页：采用浅色紫色控制台布局，按语言、语音、视觉、向量和智能路由五大类展示常用模型，支持搜索、平台与费用筛选
- 平台入口：每个目录模型都提供官方 API 文档、申请 Key、额度说明和剩余额度查询位置
- 模型级提示词上限：根据所选模型动态使用最高字符数，切换模型时自动适配
- 图片转 3D：支持 Seed3D 2.0 与 Hyper3D Gen2
- 异步任务队列：视频与 3D 任务分别支持 1–4 个并发
- 任务恢复：图片、视频和 3D 的创建请求由本地服务持有；刷新页面后会用原任务 ID 自动续查，不会中断正在进行的生成
- 长任务连接：本地服务使用原生 HTTPS 等待上游结果，单次创建请求最长等待 25 分钟，避免高分辨率图片因默认短连接超时而失败
- 错误诊断：网络失败会显示 `ECONNRESET`、`ENOTFOUND`、TLS 或超时等底层原因；系统不会自动重试可能已被远端接收的 POST 请求，避免重复生成和计费
- 本地素材：生成结果自动下载到 `output`，并按图片、视频和 3D 模型分类
- 本地历史：保存最近生成的图片、视频和 3D 文件索引
- 参数复用：从作品历史或任务队列快速恢复生成设置
- GLB 预览：3D 任务完成后可在工作台内旋转、缩放、自动旋转，并可打开或下载模型文件
- 失效链接恢复：视频或 3D 临时地址过期时，按原任务 ID 自动获取新地址

## 使用的模型

| 类型 | 可选模型 | 提示词上限 |
| --- | --- | --- |
| 图片 | Agnes Image 2.0 Flash、Agnes Image 2.1 Flash | 最高 32,000 字符，按模型动态调整 |
| 视频 | Agnes Video V2.0 | 最高 20,000 字符 |
| 语言 | OpenRouter 免费路由与 `:free` 模型 | 按模型限制 |

默认使用 Agnes AI 免费图片和视频模型；语言工作台默认使用 OpenRouter 免费路由。

## 环境要求

- Node.js 20 或更高版本
- npm
- Agnes AI API Key 和/或 OpenRouter API Key

## 安装

```bash
git clone https://github.com/yzz129/XiaoY_ModelHub.git
cd XiaoY_ModelHub
npm install
```

复制环境变量示例文件：

```bash
cp .env.example .env.local
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env.local
```

在 `.env.local` 中填写配置：

```env
VITE_AGNES_API_KEY=你的AgnesAI APIKey
VITE_AGNES_BASE_URL=https://apihub.agnes-ai.com/v1
VITE_OPENROUTER_API_KEY=你的OpenRouter APIKey
```

只使用其中一个服务商时，另一个 API Key 可以留空。

启动开发服务：

```bash
npm run dev
```

开发服务器固定监听较少使用的 `43129` 端口。打开 <http://127.0.0.1:43129/>。

## Agnes AI

- 图片模型：`agnes-image-2.0-flash`、`agnes-image-2.1-flash`
- 视频模型：`agnes-video-v2.0`
- 图片通过 OpenAI 兼容的 `POST /v1/images/generations` 接口生成，支持 URL 或 Base64 响应解析，也支持把本地上传图片作为图生图参考。
- 视频通过 `POST /v1/videos` 创建异步任务，工作台随后轮询任务状态，并从完成响应的 `metadata.url` 保存视频。
- Agnes 官方说明核心模型可长期免费使用，但免费默认档并不是无限请求：视频接口实际限制为每分钟 1 次。工作台会在创建视频后等待 65 秒再查询，并保持至少 65 秒的查询间隔。
- 状态查询遇到 HTTP 429 时，工作台会把它识别为临时频率限制，保留远端任务并自动等待后继续查询，不会立即把任务判为失败；只有响应正文明确说明额度或余额耗尽时才提示额度不足。
- Agnes Video 当前在界面中开放文生视频。官方图生视频接口要求输入公开可访问的图片 URL，而本地上传组件生成的是 Data URI，因此切换到 Agnes Video 时会自动切回文字生成模式。
- 工作台设置会分别显示 Agnes AI 和 OpenRouter 的密钥连接状态。

接口参数与模型能力以 [Agnes AI 官方文档](https://agnes-ai.com/zh-Hans/docs/overview) 为准；免费范围与限制参见 [常见问题](https://agnes-ai.com/zh-Hans/docs/faqs) 和 [Token 方案及 RPM 限制](https://agnes-ai.com/zh-Hans/docs/tokenplan)。

## 模型广场与费用标记

应用启动后只展示两类免费模型：

- `Agnes AI`：图片与视频生成。
- `OpenRouter`：免费路由与 API 模型 ID 以 `:free` 结尾的语言模型。

目录同步完成后仍会再次按服务商和 `完全免费` 标记过滤，避免付费模型被远端动态目录重新加入。免费服务通常仍有 RPM、RPD、每日时长或并发限制。

## 在页面中保存 API Key

左侧“API 与设置”只提供 Agnes AI 与 OpenRouter 两个平台。浏览器保存的凭据优先于 `.env.local`，保存后无需重启开发服务，模型目录同步、额度查询和工作台请求都会读取最新值。

凭据仅保存在当前浏览器的 `localStorage`，适合个人本地使用，不等同于安全密钥库。公开部署必须迁移到服务端加密存储与代理调用，不能把真实 Key 暴露给前端访问者。

配置 `VITE_OPENROUTER_API_KEY` 后，OpenRouter 模型卡片可通过 Credits API 查询当前账户余额。

## 图片转 3D

1. 在创作面板顶部选择“3D”。
2. 上传一张主体清晰的 JPG、PNG 或 WebP 图片，文件最大 10 MB；不足 300 × 300px 时会保持原图比例并自动居中补齐白边。
3. 选择 `Seed3D 2.0` 或 `Hyper3D Gen2`。
4. 可留空输出命令，默认使用：

   ```text
   --subdivisionlevel medium --fileformat glb
   ```

5. 点击“加入 3D 队列”。
6. 任务完成后，在作品区直接旋转、缩放预览，也可打开或下载 GLB 文件。

视频和 3D 的最高并发数可以分别在“工作台设置”中调整。降低并发不会中断已经提交到远端服务商的任务。

## 可用命令

```bash
# 启动开发服务
npm run dev

# TypeScript 检查并生成生产构建
npm run build

# 检查代码规范
npm run lint

# 本地运行定时任务 Worker（可通过 /__scheduled 触发）
npm run dev:agent

# 部署定时任务 Worker
npm run deploy:agent

# 预览生产构建
npm run preview
```

## 数据存储

- 生成的图片、视频和 3D 模型会分别保存到 `output/images`、`output/videos` 和 `output/models`。
- 页面预览和下载会优先使用 `output` 中的本地文件，不再依赖容易过期的远端结果链接。
- 图片、视频和 3D 作品历史保存在浏览器 `localStorage` 中。
- 视频与 3D 异步任务保存在浏览器 `IndexedDB` 中。
- 未完成的图片任务及其参考图同样保存在浏览器 `IndexedDB` 中；页面刷新后会自动恢复轮询。
- 本地开发服务会继续持有已发出的创建请求，因此刷新浏览器不会取消远端生成；如果开发服务本身被停止或重启，尚未取得远端任务 ID 的请求可能需要重新提交。
- 失败任务只有在用户点击“重试”后才会创建新的提交 ID；恢复轮询始终沿用原 ID，不会因为刷新而重复提交。
- 历史中的旧远端链接如果失效，应用会按任务 ID 刷新，并把刷新后的文件保存到对应的 `output` 分类目录。
- 清除浏览器站点数据会删除本地历史和任务恢复信息。

## 安全说明

本项目目前是本地前端原型。所有以 `VITE_` 开头的变量都会进入浏览器构建产物，因此 API Key 对页面访问者可见。

- 不要提交 `.env.local`。
- 不要将当前实现直接公开部署。
- 公开部署时，应将 Agnes AI 和 OpenRouter 请求迁移到服务端代理，并仅在服务端保存 API Key。
- 如果 API Key 曾出现在截图、日志或提交记录中，请立即在对应服务商控制台作废并重新生成。

### Agent 服务端密钥

Tavily 联网搜索密钥只能配置为 Cloudflare 服务端 Secret，禁止放入 `VITE_*`、`.env.local`、源码或 `wrangler*.jsonc`：

```bash
# Pages Functions 使用的联网搜索密钥
npx wrangler pages secret put TAVILY_API_KEY --project-name xiaoy-modelhub

# Pages Functions 与定时任务 Worker 之间共用的随机鉴权令牌
npx wrangler pages secret put SCHEDULER_HEALTH_TOKEN --project-name xiaoy-modelhub
npx wrangler secret put SCHEDULER_HEALTH_TOKEN --config wrangler.agent.jsonc
```

Pages 项目还必须配置与现有凭据数据库一致的 `KEY_ENCRYPTION_SECRET`。定时 Worker 不直接读取 D1 或服务商密钥，只使用 `SCHEDULER_HEALTH_TOKEN` 调用 Pages 的受保护内部端点；任务执行仍在 Pages Functions 中完成。两个环境中的调度令牌必须一致，且不能写入源码或配置文件。执行远程部署前先运行：

```bash
npx wrangler d1 migrations apply xiaoy-modelhub-db --remote --config wrangler.jsonc
```

Agent 的“自我优化”仅根据模型成功率、响应时间与用户赞踩调整免费模型顺序；不会自行改写源码、系统规则或权限。

## 主要目录

```text
src/
├─ components/       页面组件与任务状态界面
├─ data/             视觉主题模板
├─ hooks/            视频与 3D 并发任务队列
├─ lib/              模型服务 API、提示词和本地存储
├─ types/            TypeScript 类型
├─ App.tsx           工作台主界面
└─ styles.css        全局样式
```

## 注意

当前界面仅展示 Agnes AI 与 OpenRouter 标记为免费的模型；免费模型仍可能有 RPM、每日用量或并发限制，具体以服务商控制台为准。
