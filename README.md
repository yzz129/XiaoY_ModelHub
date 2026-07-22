# Muse Studio

一个基于 React、TypeScript 和 Vite 构建的本地 AI 图片、视频与 3D 内容生成工作台，调用火山方舟模型完成创作。

## 功能

- 文生图：支持画面比例、清晰度和视觉主题配置
- 文生视频：支持文字、首帧和首尾帧生成模式
- 图片转 3D：支持 Seed3D 2.0 与 Hyper3D Gen2
- 异步任务队列：视频与 3D 任务分别支持 1–4 个并发
- 任务恢复：刷新页面后可继续查询已保存的异步任务
- 本地历史：保存最近生成的图片、视频和 3D 文件链接
- 参数复用：从作品历史或任务队列快速恢复生成设置
- GLB 输出：3D 任务完成后可打开或下载模型文件

## 使用的模型

| 类型 | 默认模型 |
| --- | --- |
| 图片 | `doubao-seedream-5-0-pro-260628` |
| 视频 | `doubao-seedance-2-0-260128` |
| 3D | `doubao-seed3d-2-0-260328` |
| 3D（可选） | `hyper3d-gen2-260112` |

## 环境要求

- Node.js 20 或更高版本
- npm
- 已开通对应模型权限的火山方舟 API Key

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
```

启动开发服务：

```bash
npm run dev -- --host 127.0.0.1 --port 3000
```

打开 <http://127.0.0.1:3000>。

## 图片转 3D

1. 在创作面板顶部选择“3D”。
2. 上传一张主体清晰的 JPG、PNG 或 WebP 图片，文件最大 10 MB。
3. 选择 `Seed3D 2.0` 或 `Hyper3D Gen2`。
4. 可留空输出命令，默认使用：

   ```text
   --subdivisionlevel medium --fileformat glb
   ```

5. 点击“加入 3D 队列”。
6. 任务完成后，在作品区打开或下载 GLB 文件。

视频和 3D 的最高并发数可以分别在“工作台设置”中调整。降低并发不会中断已经提交到方舟的任务。

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

- 图片、视频和 3D 作品历史保存在浏览器 `localStorage` 中。
- 视频与 3D 异步任务保存在浏览器 `IndexedDB` 中。
- 远端结果链接可能过期，重要文件请及时下载。
- 清除浏览器站点数据会删除本地历史和任务恢复信息。

## 安全说明

本项目目前是本地前端原型。所有以 `VITE_` 开头的变量都会进入浏览器构建产物，因此 API Key 对页面访问者可见。

- 不要提交 `.env.local`。
- 不要将当前实现直接公开部署。
- 公开部署时，应将方舟请求迁移到服务端代理，并仅在服务端保存 API Key。
- 如果 API Key 曾出现在截图、日志或提交记录中，请立即在火山方舟控制台作废并重新生成。

## 主要目录

```text
src/
├─ components/       页面组件与任务状态界面
├─ data/             视觉主题模板
├─ hooks/            视频与 3D 并发任务队列
├─ lib/              方舟 API、提示词和本地存储
├─ types/            TypeScript 类型
├─ App.tsx           工作台主界面
└─ styles.css        全局样式
```

## 注意

调用图片、视频或 3D 模型可能产生费用。实际可用模型、调用额度和并发限制以火山方舟控制台中的账号配置为准。
