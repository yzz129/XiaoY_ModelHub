# 小Y中转站

一个基于 React、TypeScript 和 Vite 构建的本地 AI 图片、视频与 3D 内容生成工作台，支持火山方舟与 Agnes AI 模型。

## 功能

- 图片生成与编辑：支持 4 个 Seedream 模型和 Agnes Image 2.0/2.1 Flash，可上传参考图，并配置画面比例、清晰度和视觉主题
- 文生视频：支持 3 个 Seedance 2.0 模型和 Agnes Video V2.0；Seedance 支持文字、首帧、首尾帧和最多 9 张参考图模式
- 多服务商切换：在模型选择器中直接切换火山方舟或 Agnes AI，并按当前模型检查对应 API Key
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
| 图片 | Seedream 5.0 Pro、5.0 Lite、4.5、4.0；Agnes Image 2.0/2.1 Flash；SiliconFlow Kolors；Cloudflare FLUX.1 Schnell | 最高 32,000 字符，按模型动态调整 |
| 视频 | Seedance 2.0、2.0 Fast、2.0 Mini；Agnes Video V2.0 | 20,000 字符 |
| 3D | Seed3D 2.0、Hyper3D Gen2 | 1,200 字符 |

默认使用 `doubao-seedream-5-0-pro-260628` 和 `doubao-seedance-2-0-260128`。可通过 `VITE_ARK_IMAGE_MODEL` 与 `VITE_ARK_VIDEO_MODEL` 指定默认值；Agnes AI 模型可直接在工作台模型选择器中选择。

## 环境要求

- Node.js 20 或更高版本
- npm
- 已开通对应模型权限的火山方舟或 Agnes AI API Key

## 安装

```bash
git clone https://github.com/yzz129/image-video-generator.git
cd image-video-generator
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
VITE_ARK_API_KEY=你的火山方舟APIKey
VITE_ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3

VITE_ARK_IMAGE_MODEL=doubao-seedream-5-0-pro-260628
VITE_ARK_VIDEO_MODEL=doubao-seedance-2-0-260128
VITE_ARK_3D_MODEL=doubao-seed3d-2-0-260328
VITE_ARK_HYPER3D_MODEL=hyper3d-gen2-260112

VITE_AGNES_API_KEY=你的AgnesAI APIKey
VITE_AGNES_BASE_URL=https://apihub.agnes-ai.com/v1

VITE_SILICONFLOW_API_KEY=你的SiliconFlow APIKey
VITE_SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1

VITE_CLOUDFLARE_API_TOKEN=你的Cloudflare Workers AI Token
VITE_CLOUDFLARE_ACCOUNT_ID=你的Cloudflare Account ID
```

只使用其中一个服务商时，其他服务商的 API Key 可以留空；3D 生成目前仍使用火山方舟。模型中心还识别 `VITE_MODELSCOPE_API_KEY`、`VITE_GEMINI_API_KEY`、`VITE_GROQ_API_KEY`、`VITE_OPENROUTER_API_KEY`、`VITE_HUGGINGFACE_TOKEN`、`VITE_DASHSCOPE_API_KEY`、`VITE_POLLINATIONS_API_KEY`、`VITE_ELEVENLABS_API_KEY`、`VITE_JINA_API_KEY` 和 `VITE_COHERE_API_KEY`，完整示例见 `.env.example`。

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
- 工作台设置会分别显示火山方舟和 Agnes AI 的密钥连接状态。

接口参数与模型能力以 [Agnes AI 官方文档](https://agnes-ai.com/zh-Hans/docs/overview) 为准；免费范围与限制参见 [常见问题](https://agnes-ai.com/zh-Hans/docs/faqs) 和 [Token 方案及 RPM 限制](https://agnes-ai.com/zh-Hans/docs/tokenplan)。

## 模型广场与费用标记

应用启动后默认进入模型广场，展示 SiliconFlow、ModelScope、Gemini、Groq、OpenRouter、Cloudflare Workers AI、Hugging Face、阿里云百炼、Pollinations、火山方舟、Agnes AI、ElevenLabs、Jina AI 和 Cohere 的常用模型。界面采用浅色紫色后台视觉、分组侧边导航、顶部分类、左侧筛选和四列模型卡片布局；图片、视频与 3D 创作页使用同一设计体系，创作参数区只保留常用生成模型。

模型广场统一为五类：

- `语言模型`：对话、推理与多模态理解模型。
- `语音模型`：语音识别与语音合成模型。
- `视觉模型`：图片、视频与 3D 生成模型。
- `向量模型`：Embedding 与 Reranker 模型。
- `智能路由模型`：根据可用性自动选择模型的路由服务。

每一类都可继续按模型名称、API 模型 ID、服务平台和费用类型筛选；带有“已接入”标记的模型可通过“在工作台使用”直接进入对应创作页面并选中该模型。精简后的左侧导航仅保留模型广场、图像生成、视频生成、3D 生成、创作历史和 API 设置。

费用标记含义：

- `完全免费`：模型本身无需购买额度，但通常仍有 RPM、RPD、每日时长或并发限制。
- `有免费额度`：存在每日、每月、新用户或试用额度；用完后可能停止服务或转为计费。
- `付费`：正常调用按量计费，控制台活动赠送额度不视为长期免费。
- `按模型计费`：同一平台同时存在免费和付费模型，应以模型页的实时标记为准。

“剩余额度”只有在平台提供账户 API 时才能自动读取。Cloudflare、Groq、Gemini、百炼等平台主要要求在控制台查看；模型中心会显示对应查询位置，不会用静态数字冒充账户实时余额。

配置 `VITE_OPENROUTER_API_KEY` 或 `VITE_ELEVENLABS_API_KEY` 后，对应模型卡片会出现“查询额度”按钮，分别通过 OpenRouter Credits API 和 ElevenLabs Subscription API 显示实时剩余余额或字符数。

当前可在创作工作台直接调用的第三方新增模型：

- SiliconFlow `Kwai-Kolors/Kolors`：`POST /v1/images/generations`。
- Cloudflare Workers AI `@cf/black-forest-labs/flux-1-schnell`：需要 API Token 和 Account ID。

模型广场中的“目录”条目已经完成分类、费用说明和配置检测，但尚未接入当前图片/视频画布的专用输入输出流程；“已接入”条目可以直接生成。模型 ID 和免费策略会变化，使用前请通过卡片中的官方文档确认。

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
- 公开部署时，应将火山方舟和 Agnes AI 请求迁移到服务端代理，并仅在服务端保存 API Key。
- 如果 API Key 曾出现在截图、日志或提交记录中，请立即在对应服务商控制台作废并重新生成。

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

调用图片、视频或 3D 模型可能产生费用。实际可用模型、调用额度和并发限制以火山方舟或 Agnes AI 控制台中的账号配置为准。
