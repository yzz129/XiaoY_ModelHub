export type ModelCategory = 'chat' | 'image' | 'video' | 'audio' | 'embedding' | 'reranker' | '3d'
export type PricingTier = 'free' | 'daily-refresh' | 'free-quota' | 'paid' | 'variable'
export type IntegrationState = 'ready' | 'catalog'

export interface CatalogModel {
  id: string
  apiModel: string
  name: string
  provider: string
  providerId: string
  category: ModelCategory
  pricing: PricingTier
  quota: string
  quotaLookup: string
  integration: IntegrationState
  description: string
  docsUrl: string
  keyUrl: string
}

export const categoryLabels: Record<ModelCategory, string> = {
  chat: '大语言模型',
  image: '图片生成',
  video: '视频生成',
  audio: '语音',
  embedding: 'Embedding',
  reranker: '重排',
  '3d': '3D',
}

export interface ProviderDefinition {
  id: string
  name: string
  docsUrl: string
  keyUrl: string
  publicModelCatalog?: boolean
}

const allProviderDefinitions: ProviderDefinition[] = [
  { id: 'agnes', name: 'Agnes AI', docsUrl: 'https://agnes-ai.com/zh-Hans/docs', keyUrl: 'https://agnes-ai.com/' },
  { id: 'anthropic', name: 'Anthropic Claude', docsUrl: 'https://platform.claude.com/docs/en/api/models/list', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'baidu', name: '百度智能云千帆', docsUrl: 'https://cloud.baidu.com/doc/qianfan-api/s/Dmba8k71y', keyUrl: 'https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application' },
  { id: 'cerebras', name: 'Cerebras', docsUrl: 'https://inference-docs.cerebras.ai/api-reference/models/list-models', keyUrl: 'https://cloud.cerebras.ai/' },
  { id: 'cloudflare', name: 'Cloudflare Workers AI', docsUrl: 'https://developers.cloudflare.com/workers-ai/models/', keyUrl: 'https://dash.cloudflare.com/', publicModelCatalog: true },
  { id: 'cohere', name: 'Cohere', docsUrl: 'https://docs.cohere.com/', keyUrl: 'https://dashboard.cohere.com/api-keys', publicModelCatalog: true },
  { id: 'deepinfra', name: 'DeepInfra', docsUrl: 'https://deepinfra.com/docs', keyUrl: 'https://deepinfra.com/dash/api_keys', publicModelCatalog: true },
  { id: 'deepseek', name: 'DeepSeek', docsUrl: 'https://api-docs.deepseek.com/api/list-models', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'elevenlabs', name: 'ElevenLabs', docsUrl: 'https://elevenlabs.io/docs/api-reference/models/list', keyUrl: 'https://elevenlabs.io/app/settings/api-keys' },
  { id: 'fireworks', name: 'Fireworks AI', docsUrl: 'https://docs.fireworks.ai/api-reference/list-models', keyUrl: 'https://app.fireworks.ai/settings/users/api-keys' },
  { id: 'gemini', name: 'Google Gemini', docsUrl: 'https://ai.google.dev/api/models', keyUrl: 'https://aistudio.google.com/apikey', publicModelCatalog: true },
  { id: 'groq', name: 'Groq', docsUrl: 'https://console.groq.com/docs/models', keyUrl: 'https://console.groq.com/keys', publicModelCatalog: true },
  { id: 'huggingface', name: 'Hugging Face', docsUrl: 'https://huggingface.co/docs/inference-providers/en/hub-api', keyUrl: 'https://huggingface.co/settings/tokens', publicModelCatalog: true },
  { id: 'jina', name: 'Jina AI', docsUrl: 'https://jina.ai/embeddings/', keyUrl: 'https://jina.ai/api-dashboard/', publicModelCatalog: true },
  { id: 'zhipu', name: '智谱 BigModel', docsUrl: 'https://docs.bigmodel.cn/cn/guide/models', keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys', publicModelCatalog: true },
  { id: 'stepfun', name: '阶跃星辰 StepFun', docsUrl: 'https://platform.stepfun.com/docs/zh/guides/models/model-lab', keyUrl: 'https://platform.stepfun.com/interface-key', publicModelCatalog: true },
  { id: 'scaleway', name: 'Scaleway Generative APIs', docsUrl: 'https://www.scaleway.com/en/docs/generative-apis/reference-content/supported-models/', keyUrl: 'https://console.scaleway.com/iam/api-keys', publicModelCatalog: true },
  { id: 'hyperbolic', name: 'Hyperbolic', docsUrl: 'https://docs.hyperbolic.xyz/docs/supported-models', keyUrl: 'https://app.hyperbolic.xyz/settings' },
  { id: 'novita', name: 'Novita AI', docsUrl: 'https://novita.ai/docs/api-reference/model-apis-llm-list-models', keyUrl: 'https://novita.ai/settings/key-management', publicModelCatalog: true },
  { id: 'aimlapi', name: 'AI/ML API', docsUrl: 'https://docs.aimlapi.com/api-references/service-endpoints/complete-model-list', keyUrl: 'https://aimlapi.com/app/keys', publicModelCatalog: true },
  { id: 'minimax', name: 'MiniMax', docsUrl: 'https://platform.minimaxi.com/docs/api-reference/models/openai/list-models', keyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key', publicModelCatalog: true },
  { id: 'mistral', name: 'Mistral AI', docsUrl: 'https://docs.mistral.ai/api/endpoint/models', keyUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'modelscope', name: 'ModelScope', docsUrl: 'https://modelscope.cn/docs', keyUrl: 'https://modelscope.cn/my/myaccesstoken', publicModelCatalog: true },
  { id: 'moonshot', name: 'Moonshot AI', docsUrl: 'https://platform.moonshot.cn/docs/api-reference', keyUrl: 'https://platform.moonshot.cn/console/api-keys' },
  { id: 'nvidia', name: 'NVIDIA NIM', docsUrl: 'https://docs.api.nvidia.com/nim/reference/llm-apis', keyUrl: 'https://build.nvidia.com/settings/api-keys', publicModelCatalog: true },
  { id: 'openai', name: 'OpenAI', docsUrl: 'https://platform.openai.com/docs/api-reference/models/list', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'openrouter', name: 'OpenRouter', docsUrl: 'https://openrouter.ai/docs/api/api-reference/models/get-models', keyUrl: 'https://openrouter.ai/settings/keys', publicModelCatalog: true },
  { id: 'perplexity', name: 'Perplexity', docsUrl: 'https://docs.perplexity.ai/api-reference/models-get', keyUrl: 'https://www.perplexity.ai/settings/api' },
  { id: 'pollinations', name: 'Pollinations', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/', publicModelCatalog: true },
  { id: 'replicate', name: 'Replicate', docsUrl: 'https://replicate.com/docs/reference/http#models.list', keyUrl: 'https://replicate.com/account/api-tokens' },
  { id: 'sambanova', name: 'SambaNova', docsUrl: 'https://docs.sambanova.ai/docs/api-reference/endpoints/model-list', keyUrl: 'https://cloud.sambanova.ai/apis' },
  { id: 'siliconflow', name: 'SiliconFlow', docsUrl: 'https://docs.siliconflow.cn/en/api-reference/models/get-model-list', keyUrl: 'https://cloud.siliconflow.cn/account/ak', publicModelCatalog: true },
  { id: 'tencent', name: '腾讯混元 TokenHub', docsUrl: 'https://cloud.tencent.com/document/product/1823', keyUrl: 'https://console.cloud.tencent.com/tokenhub' },
  { id: 'together', name: 'Together AI', docsUrl: 'https://docs.together.ai/reference/models', keyUrl: 'https://api.together.ai/settings/api-keys' },
  { id: 'xai', name: 'xAI', docsUrl: 'https://docs.x.ai/developers/rest-api-reference/inference/models', keyUrl: 'https://console.x.ai/team/default/api-keys' },
  { id: 'alibaba', name: '阿里云百炼', docsUrl: 'https://help.aliyun.com/zh/model-studio/', keyUrl: 'https://bailian.console.aliyun.com/', publicModelCatalog: true },
  { id: 'ark', name: '火山方舟', docsUrl: 'https://www.volcengine.com/docs/82379', keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey' },
]

export const providerDefinitions = allProviderDefinitions

export const providerDefinitionById = Object.fromEntries(
  providerDefinitions.map((provider) => [provider.id, provider]),
) as Record<string, ProviderDefinition>

export const pricingLabels: Record<PricingTier, string> = {
  free: '完全免费',
  'daily-refresh': '每日刷新',
  'free-quota': '限量试用',
  variable: '按模型计费',
  paid: '付费',
}

interface QuotaDescription {
  quota: string
  quotaLookup: string
}

export const dailyRefreshQuotaByProvider: Partial<Record<string, QuotaDescription>> = {
  openrouter: {
    quota: '免费模型每日 50 次；账户累计购买至少 10 美元额度后，每日提高到 1,000 次',
    quotaLookup: 'OpenRouter Activity 或 API Key 页面查看今日用量',
  },
  cloudflare: {
    quota: '所有模型共享每日 10,000 Neurons 免费额度；北京时间每天 08:00 刷新',
    quotaLookup: 'Workers AI Dashboard 查看 Neurons 用量',
  },
  gemini: {
    quota: 'Free Tier 按模型提供每日请求额度；太平洋时间午夜刷新',
    quotaLookup: 'Google AI Studio 的 Rate limits 页面查看精确上限',
  },
  groq: {
    quota: 'Free Plan 按模型提供 RPD、TPD 和音频时长额度，每日自动恢复',
    quotaLookup: 'Groq Limits 页面查看当前模型的精确上限',
  },
  modelscope: {
    quota: '指定 API-Inference 模型通常每天至少 50 次免费调用',
    quotaLookup: 'ModelScope 模型页与控制台查看今日剩余量',
  },
  cerebras: {
    quota: 'Free Tier 多数模型每日约 100 万 Token；请求次数上限按模型计算',
    quotaLookup: 'Cerebras 控制台 Limits 与响应头查看重置时间',
  },
  sambanova: {
    quota: 'Free Tier 常见上限为每个模型每日 20 次、20 万 Token',
    quotaLookup: 'SambaCloud 响应头或控制台查看今日剩余量',
  },
}

export const freeQuotaByProvider: Partial<Record<string, QuotaDescription>> = {
  scaleway: {
    quota: 'Free Tier 为按 Token 计费的模型共享前 100 万 Token，并含 60 分钟音频转写；超出后按量计费',
    quotaLookup: 'Scaleway Console 的 Billing / Consumption 查看免费额度与后续用量',
  },
  hyperbolic: {
    quota: '完成手机号验证后可获 $1 推广额度；耗尽后按模型价格计费',
    quotaLookup: 'Hyperbolic Console 的 Billing 页面查看 promotional credits 余额',
  },
  novita: {
    quota: '新注册账户可获赠试用 credits；赠送金额和有效期以注册时控制台显示为准',
    quotaLookup: 'Novita AI Billing / Credits 页面查看当前赠额和消耗',
  },
  aimlapi: {
    quota: '官方提供注册即得的免费试用 credits；额度数值可能随活动调整',
    quotaLookup: 'AI/ML API Dashboard 的 Billing / Usage 页面查看实际余额',
  },
  huggingface: {
    quota: '免费账户每月包含少量 Inference Providers 额度；官方当前示例为 $0.10，额度可能调整',
    quotaLookup: 'Hugging Face Billing 页面查看本月剩余额度',
  },
  cohere: {
    quota: 'Trial Key 免费但限流，当前上限通常为每月 1,000 次 API 调用',
    quotaLookup: 'Cohere Dashboard 与 Rate limits 页面查看',
  },
  jina: {
    quota: '新 API Key 可获 1,000 万免费 Token；用完后按官方价格计费',
    quotaLookup: 'Jina API Dashboard 查看 Token 余额',
  },
  nvidia: {
    quota: 'NVIDIA Developer Program 成员可免费使用托管 NIM 端点进行原型开发；不适用于生产部署',
    quotaLookup: 'build.nvidia.com 账户与模型页面查看端点权限和限流',
  },
  pollinations: {
    quota: '使用账户赠送的 Pollen 额度；只有带 :free 的模型才归入“完全免费”',
    quotaLookup: 'Pollinations 工作台或 /account/balance 查看余额',
  },
  mistral: {
    quota: 'Studio 默认可启用 Free mode，无需信用卡；按组织的月度 Token 上限限流',
    quotaLookup: 'Mistral Admin 的 Limits 与 Subscription 页面查看',
  },
  fireworks: {
    quota: '新账户当前包含 $1 免费 credits，耗尽后按模型价格计费',
    quotaLookup: 'Fireworks Billing 与 Usage 页面查看余额',
  },
  elevenlabs: {
    quota: '免费计划每月含 10,000 credits；目录仅把允许免费用户调用的模型归入限量试用',
    quotaLookup: 'ElevenLabs Developers Analytics 查看剩余 credits',
  },
  alibaba: {
    quota: '华北 2（北京）新人额度按模型独立发放，通常为 100 万 Token，有效期 90 天',
    quotaLookup: '百炼控制台模型详情或免费额度页面查看；其他地域不享受该额度',
  },
  baidu: {
    quota: '官方指定模型首次开通赠送 100 万 Token，有效期 3 个月',
    quotaLookup: '千帆模型广场的模型版本详情和计费详情查看剩余额度',
  },
  minimax: {
    quota: '未订阅的新用户可使用按量账户赠送的体验额度；具体余额与有效期以账户页面为准',
    quotaLookup: 'MiniMax 开放平台账户余额、用量与活动页面查看',
  },
  ark: {
    quota: '仅官方免费额度表列出的豆包模型享受一次性体验额度；不同模态按 Token、图片张数、字符或小时计量',
    quotaLookup: '火山方舟控制台费用中心与模型详情查看剩余额度',
  },
}

export const freeModelQuotaByProvider: Partial<Record<string, QuotaDescription>> = {
  zhipu: {
    quota: '官方免费模型核心调用价格为 0；仍受账户并发、速率和上下文限制',
    quotaLookup: 'BigModel 模型文档与控制台用量页查看当前限流规则',
  },
  stepfun: {
    quota: '模型实验室列出的模型免费开放，当前并发为 1，仅建议实验和开发验证',
    quotaLookup: 'StepFun 模型实验室页面查看当前免费模型及实验限制',
  },
}

const pricingPriority: Record<PricingTier, number> = {
  free: 0,
  'daily-refresh': 1,
  'free-quota': 2,
  variable: 3,
  paid: 4,
}

export function sortModelsByPricing<T extends { pricing: PricingTier }>(models: readonly T[]): T[] {
  return [...models].sort((left, right) => pricingPriority[left.pricing] - pricingPriority[right.pricing])
}

function providerCatalogModel(
  providerId: 'alibaba' | 'ark' | 'baidu' | 'minimax' | 'zhipu' | 'stepfun',
  apiModel: string,
  name: string,
  category: ModelCategory,
  pricing: PricingTier = 'variable',
  description = '',
): CatalogModel {
  const provider = providerDefinitionById[providerId]
  const quotaDescription = pricing === 'free-quota'
    ? freeQuotaByProvider[providerId]
    : pricing === 'free'
      ? freeModelQuotaByProvider[providerId]
      : undefined
  return {
    id: `${providerId}-${apiModel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    apiModel,
    name,
    provider: provider.name,
    providerId,
    category,
    pricing,
    quota: quotaDescription?.quota ?? '按模型和实际调用量计费，价格以服务商控制台为准',
    quotaLookup: quotaDescription?.quotaLookup ?? '服务商模型广场与费用中心查看',
    integration: category === 'chat' ? 'ready' : 'catalog',
    description: description || `${provider.name} 官方模型目录`,
    docsUrl: provider.docsUrl,
    keyUrl: provider.keyUrl,
  }
}

// `/models` generally lists only models visible to the current account. Keep a broad
// official-catalog fallback so the marketplace is useful before a key is configured.
const alibabaCatalogModels: CatalogModel[] = [
  providerCatalogModel('alibaba', 'qwen3.8-max-preview', 'Qwen 3.8 Max Preview', 'chat', 'paid', 'Token Plan 旗舰预览模型'),
  providerCatalogModel('alibaba', 'qwen3.7-max', 'Qwen 3.7 Max', 'chat', 'free-quota', '千问旗舰推理与通用模型'),
  providerCatalogModel('alibaba', 'qwen3.7-plus', 'Qwen 3.7 Plus', 'chat', 'free-quota', '高性能通用语言模型'),
  providerCatalogModel('alibaba', 'qwen3.7-flash', 'Qwen 3.7 Flash', 'chat', 'free-quota', '低延迟通用语言模型'),
  providerCatalogModel('alibaba', 'qwen3.5-plus', 'Qwen 3.5 Plus', 'chat', 'free-quota'),
  providerCatalogModel('alibaba', 'qwen3.5-flash', 'Qwen 3.5 Flash', 'chat', 'free-quota'),
  providerCatalogModel('alibaba', 'qwen3-max', 'Qwen 3 Max', 'chat', 'free-quota'),
  providerCatalogModel('alibaba', 'qwen3-plus', 'Qwen 3 Plus', 'chat', 'variable'),
  providerCatalogModel('alibaba', 'qwen3-turbo', 'Qwen 3 Turbo', 'chat', 'variable'),
  providerCatalogModel('alibaba', 'qwen3-coder-plus', 'Qwen 3 Coder Plus', 'chat', 'free-quota', '代码生成与智能体开发'),
  providerCatalogModel('alibaba', 'qwen3-coder-flash', 'Qwen 3 Coder Flash', 'chat', 'free-quota', '低延迟代码模型'),
  providerCatalogModel('alibaba', 'qwen3.5-omni-plus', 'Qwen 3.5 Omni Plus', 'chat', 'variable', '文本、图像、音频和视频全模态理解'),
  providerCatalogModel('alibaba', 'qwen-vl-max', 'Qwen VL Max', 'chat', 'free-quota', '视觉理解旗舰模型'),
  providerCatalogModel('alibaba', 'qwen-vl-plus', 'Qwen VL Plus', 'chat', 'free-quota', '视觉理解通用模型'),
  providerCatalogModel('alibaba', 'deepseek-v4-pro', 'DeepSeek V4 Pro', 'chat', 'free-quota'),
  providerCatalogModel('alibaba', 'deepseek-v4-flash', 'DeepSeek V4 Flash', 'chat', 'free-quota'),
  providerCatalogModel('alibaba', 'kimi/kimi-k3', 'Kimi K3', 'chat', 'variable'),
  providerCatalogModel('alibaba', 'glm-5.2', 'GLM 5.2', 'chat', 'free-quota'),
  providerCatalogModel('alibaba', 'MiniMax/MiniMax-M3', 'MiniMax M3', 'chat', 'variable'),
  providerCatalogModel('alibaba', 'xiaomi/mimo-v2.5-pro', 'MiMo V2.5 Pro', 'chat', 'variable'),
  providerCatalogModel('alibaba', 'qwen-image-3.0-pro', 'Qwen Image 3.0 Pro', 'image', 'free-quota', '高质量图像生成与编辑'),
  providerCatalogModel('alibaba', 'wan2.7-image-pro', 'Wan 2.7 Image Pro', 'image', 'free-quota', '通义万相高质量图像生成'),
  providerCatalogModel('alibaba', 'wan2.6-image', 'Wan 2.6 Image', 'image', 'free-quota'),
  providerCatalogModel('alibaba', 'wan2.6-i2v', 'Wan 2.6 Image to Video', 'video', 'free-quota'),
  providerCatalogModel('alibaba', 'wan2.6-t2v', 'Wan 2.6 Text to Video', 'video', 'free-quota'),
  providerCatalogModel('alibaba', 'happyhorse-1.1-t2v', 'HappyHorse 1.1 T2V', 'video', 'free-quota'),
  providerCatalogModel('alibaba', 'qwen-audio-3.0-tts-plus', 'Qwen Audio 3.0 TTS Plus', 'audio', 'free-quota', '多语种语音合成'),
  providerCatalogModel('alibaba', 'qwen-audio-3.0-realtime-plus', 'Qwen Audio 3.0 Realtime Plus', 'audio', 'free-quota', '实时端到端语音对话'),
  providerCatalogModel('alibaba', 'MiniMax/speech-2.8-hd', 'MiniMax Speech 2.8 HD', 'audio', 'variable'),
  providerCatalogModel('alibaba', 'fun-asr', 'Fun-ASR', 'audio', 'free-quota', '录音文件语音识别'),
  providerCatalogModel('alibaba', 'fun-asr-realtime', 'Fun-ASR Realtime', 'audio', 'free-quota', '实时语音识别'),
  providerCatalogModel('alibaba', 'fun-music-v1', 'Fun Music V1', 'audio', 'variable', '文本与歌词生成音乐'),
  providerCatalogModel('alibaba', 'text-embedding-v4', 'Text Embedding V4', 'embedding', 'free-quota'),
  providerCatalogModel('alibaba', 'text-embedding-v3', 'Text Embedding V3', 'embedding', 'free-quota'),
  providerCatalogModel('alibaba', 'qwen2.5-vl-embedding', 'Qwen 2.5 VL Embedding', 'embedding', 'free-quota', '文本、图片与视频多模态向量化'),
  providerCatalogModel('alibaba', 'tongyi-embedding-vision-plus', 'Tongyi Vision Embedding Plus', 'embedding', 'free-quota'),
  providerCatalogModel('alibaba', 'gte-rerank-v2', 'GTE Rerank V2', 'reranker', 'free-quota'),
  providerCatalogModel('alibaba', 'Tripo/Tripo-H3.1', 'Tripo H3.1', '3d', 'paid', '文生与图生 3D 模型'),
  providerCatalogModel('alibaba', 'Tripo/Tripo-P1.0', 'Tripo P1.0', '3d', 'paid', '文生与图生 3D 模型'),
]

const baiduCatalogModels: CatalogModel[] = [
  providerCatalogModel('baidu', 'ERNIE-4.5-Turbo-128K', 'ERNIE 4.5 Turbo 128K', 'chat', 'free-quota'),
  providerCatalogModel('baidu', 'ERNIE-4.5-Turbo-32K', 'ERNIE 4.5 Turbo 32K', 'chat', 'free-quota'),
  providerCatalogModel('baidu', 'ERNIE-4.5-Turbo-VL', 'ERNIE 4.5 Turbo VL', 'chat', 'free-quota'),
  providerCatalogModel('baidu', 'ERNIE-X1-Turbo-32K', 'ERNIE X1 Turbo 32K', 'chat', 'free-quota'),
  providerCatalogModel('baidu', 'DeepSeek-R1', 'DeepSeek R1', 'chat', 'free-quota'),
  providerCatalogModel('baidu', 'DeepSeek-R1-250528', 'DeepSeek R1 250528', 'chat', 'free-quota'),
  providerCatalogModel('baidu', 'DeepSeek-V3-250324', 'DeepSeek V3 250324', 'chat', 'free-quota'),
  providerCatalogModel('baidu', 'DeepSeek-V3.1-250821', 'DeepSeek V3.1 250821', 'chat', 'free-quota'),
  providerCatalogModel('baidu', 'DeepSeek-V3.1-Think-250821', 'DeepSeek V3.1 Think 250821', 'chat', 'free-quota'),
  providerCatalogModel('baidu', 'Kimi-K2-Instruct', 'Kimi K2 Instruct', 'chat', 'free-quota'),
  providerCatalogModel('baidu', 'Qwen3-235B-A22B-Instruct-2507', 'Qwen3 235B A22B Instruct 2507', 'chat', 'free-quota'),
  providerCatalogModel('baidu', 'Qwen3-30B-A3B-Instruct-2507', 'Qwen3 30B A3B Instruct 2507', 'chat', 'free-quota'),
  providerCatalogModel('baidu', 'Qwen3-Coder-30B-A3B-Instruct', 'Qwen3 Coder 30B A3B Instruct', 'chat', 'free-quota'),
  providerCatalogModel('baidu', 'Qwen3-Coder-480B-A35B-Instruct', 'Qwen3 Coder 480B A35B Instruct', 'chat', 'free-quota'),
  providerCatalogModel('baidu', 'bge-large-en', 'BGE Large EN', 'embedding', 'free-quota'),
  providerCatalogModel('baidu', 'bge-large-zh', 'BGE Large ZH', 'embedding', 'free-quota'),
  providerCatalogModel('baidu', 'qianfan-sug-8k', 'Qianfan SUG 8K', 'chat', 'free-quota'),
]

const minimaxCatalogModels: CatalogModel[] = [
  providerCatalogModel('minimax', 'MiniMax-M3', 'MiniMax M3', 'chat', 'free-quota'),
  providerCatalogModel('minimax', 'MiniMax-M2.7', 'MiniMax M2.7', 'chat', 'free-quota'),
  providerCatalogModel('minimax', 'MiniMax-M2.7-highspeed', 'MiniMax M2.7 Highspeed', 'chat', 'free-quota'),
  providerCatalogModel('minimax', 'MiniMax-M2.5', 'MiniMax M2.5', 'chat', 'free-quota'),
  providerCatalogModel('minimax', 'MiniMax-M2.5-highspeed', 'MiniMax M2.5 Highspeed', 'chat', 'free-quota'),
  providerCatalogModel('minimax', 'MiniMax-M2.1', 'MiniMax M2.1', 'chat', 'free-quota'),
  providerCatalogModel('minimax', 'MiniMax-M2', 'MiniMax M2', 'chat', 'free-quota'),
]

const zhipuCatalogModels: CatalogModel[] = [
  providerCatalogModel('zhipu', 'glm-4.7-flash', 'GLM-4.7 Flash', 'chat', 'free', '官方价格为 0 的通用文本与推理模型'),
  providerCatalogModel('zhipu', 'glm-4.6v-flash', 'GLM-4.6V Flash', 'chat', 'free', '免费的图像、视频、文本与文件理解模型'),
  providerCatalogModel('zhipu', 'glm-4v-flash', 'GLM-4V Flash', 'chat', 'free', '官方完全免费的图像理解模型'),
  providerCatalogModel('zhipu', 'bge-reranker-large', 'BGE Reranker Large', 'reranker', 'free', '知识库检索结果重排模型，官方调用价格为 0'),
]

const stepfunCatalogModels: CatalogModel[] = [
  providerCatalogModel('stepfun', 'step-gui', 'Step GUI', 'chat', 'free', '模型实验室免费开放的 GUI 理解与操作模型'),
  providerCatalogModel('stepfun', 'step-2x-large', 'Step 2X Large', 'image', 'free', '模型实验室免费开放的图像生成模型'),
  providerCatalogModel('stepfun', 'step-1x-edit', 'Step 1X Edit', 'image', 'free', '模型实验室免费开放的图像编辑模型'),
]

const arkCatalogModels: CatalogModel[] = [
  providerCatalogModel('ark', 'doubao-seed-2-1-pro-260628', 'Doubao Seed 2.1 Pro', 'chat', 'free-quota', '方舟当前免费额度表列出的旗舰推理模型'),
  providerCatalogModel('ark', 'doubao-seed-2-1-turbo-260628', 'Doubao Seed 2.1 Turbo', 'chat', 'free-quota', '方舟当前免费额度表列出的高性价比模型'),
  providerCatalogModel('ark', 'doubao-seed-evolving', 'Doubao Seed Evolving', 'chat', 'free-quota', '方舟当前免费额度表列出的持续演进模型'),
  providerCatalogModel('ark', 'doubao-seed-character-260628', 'Doubao Seed Character', 'chat', 'free-quota', '方舟当前免费额度表列出的角色扮演模型'),
  providerCatalogModel('ark', 'doubao-seed-2-0-pro-260215', 'Doubao Seed 2.0 Pro', 'chat', 'variable', '复杂推理与多模态旗舰模型'),
  providerCatalogModel('ark', 'doubao-seed-2-0-lite-260215', 'Doubao Seed 2.0 Lite', 'chat', 'variable', '低延迟多模态通用模型'),
  providerCatalogModel('ark', 'doubao-seed-2-0-code', 'Doubao Seed 2.0 Code', 'chat', 'variable', '代码生成与前端视觉理解'),
  providerCatalogModel('ark', 'doubao-seed-1-8-251228', 'Doubao Seed 1.8', 'chat', 'variable'),
  providerCatalogModel('ark', 'doubao-seed-1-6-250615', 'Doubao Seed 1.6', 'chat', 'variable'),
  providerCatalogModel('ark', 'doubao-seed-1-6-thinking-250715', 'Doubao Seed 1.6 Thinking', 'chat', 'variable', '深度思考模型'),
  providerCatalogModel('ark', 'doubao-seed-1-6-flash-250715', 'Doubao Seed 1.6 Flash', 'chat', 'variable'),
  providerCatalogModel('ark', 'doubao-1-5-pro-32k-250115', 'Doubao 1.5 Pro 32K', 'chat', 'variable'),
  providerCatalogModel('ark', 'doubao-1-5-lite-32k-250115', 'Doubao 1.5 Lite 32K', 'chat', 'variable'),
  providerCatalogModel('ark', 'doubao-1-5-thinking-pro-250415', 'Doubao 1.5 Thinking Pro', 'chat', 'variable'),
  providerCatalogModel('ark', 'doubao-1-5-vision-pro-32k-250115', 'Doubao 1.5 Vision Pro', 'chat', 'variable', '图片与视频理解'),
  providerCatalogModel('ark', 'kimi-k2-5', 'Kimi K2.5', 'chat', 'variable'),
  providerCatalogModel('ark', 'deepseek-v3-2', 'DeepSeek V3.2', 'chat', 'variable'),
  providerCatalogModel('ark', 'deepseek-r1-250528', 'DeepSeek R1', 'chat', 'variable'),
  providerCatalogModel('ark', 'doubao-seedream-5-0-lite-260128', 'Seedream 5.0 Lite', 'image', 'free-quota', '方舟当前免费额度表列出的图像生成模型'),
  providerCatalogModel('ark', 'doubao-seedream-4-5-251128', 'Seedream 4.5', 'image', 'free-quota', '方舟当前免费额度表列出的图像生成模型'),
  providerCatalogModel('ark', 'doubao-seedream-4-0-250828', 'Seedream 4.0', 'image', 'free-quota', '方舟当前免费额度表列出的图像生成模型'),
  providerCatalogModel('ark', 'doubao-seededit-3-0-i2i-250628', 'SeedEdit 3.0', 'image', 'paid', '图片编辑模型'),
  providerCatalogModel('ark', 'doubao-seedance-1-5-pro-251215', 'Seedance 1.5 Pro', 'video', 'free-quota', '方舟当前免费额度表列出 200 万 Token 体验额度'),
  providerCatalogModel('ark', 'doubao-seedance-1-0-pro-250528', 'Seedance 1.0 Pro', 'video', 'free-quota', '方舟当前免费额度表列出 200 万 Token 体验额度'),
  providerCatalogModel('ark', 'doubao-seedance-1-5-pro-fast', 'Seedance 1.5 Pro Fast', 'video', 'free-quota', '方舟当前免费额度表列出 200 万 Token 体验额度'),
  providerCatalogModel('ark', 'doubao-seedance-1-0-pro-fast-251015', 'Seedance 1.0 Pro Fast', 'video', 'paid'),
  providerCatalogModel('ark', 'doubao-embedding-text-240515', 'Doubao Text Embedding', 'embedding', 'variable'),
  providerCatalogModel('ark', 'doubao-embedding-vision-251215', 'Doubao Vision Embedding', 'embedding', 'free-quota', '方舟当前免费额度表列出 50 万 Token 体验额度'),
  providerCatalogModel('ark', 'doubao-embedding-large-text-250515', 'Doubao Large Text Embedding', 'embedding', 'variable'),
]

const baseCatalogModels: CatalogModel[] = [
  ...alibabaCatalogModels,
  ...baiduCatalogModels,
  ...minimaxCatalogModels,
  ...zhipuCatalogModels,
  ...stepfunCatalogModels,
  ...arkCatalogModels,
  { id: 'alibaba-qwen-plus', apiModel: 'qwen-plus', name: 'Qwen Plus', provider: '阿里云百炼', providerId: 'alibaba', category: 'chat', pricing: 'free-quota', quota: '北京地域新人按模型获赠免费额度，通常 100 万 Token、有效期 90 天', quotaLookup: '百炼免费额度页可查余量并开启“用完即停”', integration: 'ready', description: '通义千问主力语言模型，支持 OpenAI 兼容调用', docsUrl: 'https://help.aliyun.com/zh/model-studio/qwen-api-reference', keyUrl: 'https://bailian.console.aliyun.com/?tab=model#/api-key' },
  { id: 'sf-qwen3-8b', apiModel: 'Qwen/Qwen3-8B', name: 'Qwen3 8B', provider: 'SiliconFlow', providerId: 'siliconflow', category: 'chat', pricing: 'variable', quota: '部分模型长期免费，具体以模型页实时标记为准', quotaLookup: '控制台模型页/账单查看', integration: 'ready', description: '国内访问友好的 OpenAI 兼容推理服务', docsUrl: 'https://docs.siliconflow.cn/', keyUrl: 'https://cloud.siliconflow.cn/account/ak' },
  { id: 'modelscope-qwen3', apiModel: 'Qwen/Qwen3-8B', name: 'Qwen3 8B', provider: 'ModelScope', providerId: 'modelscope', category: 'chat', pricing: 'free-quota', quota: '免费推理额度与并发限制按账号及模型变化', quotaLookup: '魔搭控制台查看', integration: 'ready', description: '适合测试社区开源模型', docsUrl: 'https://modelscope.cn/docs/model-service/API-Inference/intro', keyUrl: 'https://modelscope.cn/my/myaccesstoken' },
  { id: 'gemini-2.5-flash', apiModel: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google Gemini', providerId: 'gemini', category: 'chat', pricing: 'free-quota', quota: 'Free Tier 可用；限制按项目和模型计算', quotaLookup: 'AI Studio 项目页查看', integration: 'catalog', description: '多模态、长上下文与结构化输出', docsUrl: 'https://ai.google.dev/gemini-api/docs', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'groq-gpt-oss', apiModel: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'Groq', providerId: 'groq', category: 'chat', pricing: 'free-quota', quota: '免费账户受 RPM、RPD、TPM 与 TPD 限制', quotaLookup: 'Groq Limits 页面查看精确剩余限制', integration: 'ready', description: '低延迟大语言模型推理', docsUrl: 'https://console.groq.com/docs/models', keyUrl: 'https://console.groq.com/keys' },
  { id: 'groq-gpt-oss-20b', apiModel: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', provider: 'Groq', providerId: 'groq', category: 'chat', pricing: 'free-quota', quota: 'Developer Plan 提供免费限流额度', quotaLookup: 'Groq Limits 页面查看 RPM、TPM 与每日限制', integration: 'ready', description: '速度优先的轻量推理模型', docsUrl: 'https://console.groq.com/docs/models', keyUrl: 'https://console.groq.com/keys' },
  { id: 'groq-llama-31-8b', apiModel: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', provider: 'Groq', providerId: 'groq', category: 'chat', pricing: 'free-quota', quota: 'Developer Plan 提供免费限流额度', quotaLookup: 'Groq Limits 页面查看 RPM、TPM 与每日限制', integration: 'ready', description: '高速通用对话与文本处理', docsUrl: 'https://console.groq.com/docs/models', keyUrl: 'https://console.groq.com/keys' },
  { id: 'openrouter-free', apiModel: 'openrouter/free', name: 'Free Models Router', provider: 'OpenRouter', providerId: 'openrouter', category: 'chat', pricing: 'free', quota: '自动路由到免费模型，限流较低，不适合生产', quotaLookup: '可通过 Credits API 查询账户余额', integration: 'ready', description: '自动选择当前可用免费模型', docsUrl: 'https://openrouter.ai/docs', keyUrl: 'https://openrouter.ai/settings/keys' },
  { id: 'openrouter-ox-alpha', apiModel: 'stealth/ox-alpha', name: 'Ox Alpha（牛阿尔法）', provider: 'OpenRouter', providerId: 'openrouter', category: 'chat', pricing: 'free', quota: '当前为免费预览；价格、限流与可用性可能动态变化，匿名第三方提供商会保留提示词与输出', quotaLookup: 'OpenRouter 模型页与 Credits API 查看', integration: 'ready', description: '1M 上下文的多模态推理模型，面向编程、复杂推理和长周期智能体任务，当前工作台支持文本与图片输入', docsUrl: 'https://openrouter.ai/stealth/ox-alpha', keyUrl: 'https://openrouter.ai/settings/keys' },
  { id: 'openrouter-ling-3-flash-free', apiModel: 'inclusionai/ling-3.0-flash:free', name: 'Ling 3.0 Flash', provider: 'OpenRouter', providerId: 'openrouter', category: 'chat', pricing: 'free', quota: '明确的 :free 路由，限流与可用性会动态变化', quotaLookup: 'OpenRouter 模型页与 Credits API 查看', integration: 'ready', description: '262K 上下文的免费高速文本模型', docsUrl: 'https://openrouter.ai/models', keyUrl: 'https://openrouter.ai/settings/keys' },
  { id: 'openrouter-laguna-s-free', apiModel: 'poolside/laguna-s-2.1:free', name: 'Laguna S 2.1', provider: 'OpenRouter', providerId: 'openrouter', category: 'chat', pricing: 'free', quota: '明确的 :free 路由，限流与可用性会动态变化', quotaLookup: 'OpenRouter 模型页与 Credits API 查看', integration: 'ready', description: '面向代码与复杂任务的免费模型', docsUrl: 'https://openrouter.ai/models', keyUrl: 'https://openrouter.ai/settings/keys' },
  { id: 'openrouter-north-mini-code-free', apiModel: 'cohere/north-mini-code:free', name: 'North Mini Code', provider: 'OpenRouter', providerId: 'openrouter', category: 'chat', pricing: 'free', quota: '明确的 :free 路由，限流与可用性会动态变化', quotaLookup: 'OpenRouter 模型页与 Credits API 查看', integration: 'ready', description: '256K 上下文的免费代码模型', docsUrl: 'https://openrouter.ai/models', keyUrl: 'https://openrouter.ai/settings/keys' },
  { id: 'openrouter-nemotron-ultra-free', apiModel: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron 3 Ultra', provider: 'OpenRouter', providerId: 'openrouter', category: 'chat', pricing: 'free', quota: '明确的 :free 路由，限流与可用性会动态变化', quotaLookup: 'OpenRouter 模型页与 Credits API 查看', integration: 'ready', description: '超长上下文推理与通用任务', docsUrl: 'https://openrouter.ai/models', keyUrl: 'https://openrouter.ai/settings/keys' },
  { id: 'openrouter-gemma-4-31b-free', apiModel: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B', provider: 'OpenRouter', providerId: 'openrouter', category: 'chat', pricing: 'free', quota: '明确的 :free 路由，限流与可用性会动态变化', quotaLookup: 'OpenRouter 模型页与 Credits API 查看', integration: 'ready', description: '支持文本、图片与视频输入的免费路由', docsUrl: 'https://openrouter.ai/models', keyUrl: 'https://openrouter.ai/settings/keys' },
  { id: 'openrouter-gpt-54', apiModel: 'openai/gpt-5.4', name: 'GPT-5.4', provider: 'OpenRouter', providerId: 'openrouter', category: 'chat', pricing: 'paid', quota: '按量计费：输入约 $2.50 / 1M tokens，输出约 $15 / 1M tokens', quotaLookup: '工作台可查询 OpenRouter Credits 余额', integration: 'ready', description: '约 1.05M 上下文的旗舰通用模型', docsUrl: 'https://openrouter.ai/models/openai/gpt-5.4', keyUrl: 'https://openrouter.ai/settings/keys' },
  { id: 'openrouter-claude-sonnet-5', apiModel: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'OpenRouter', providerId: 'openrouter', category: 'chat', pricing: 'paid', quota: '按量计费：输入约 $2 / 1M tokens，输出约 $10 / 1M tokens', quotaLookup: '工作台可查询 OpenRouter Credits 余额', integration: 'ready', description: '长上下文、编程与复杂任务', docsUrl: 'https://openrouter.ai/models/anthropic/claude-sonnet-5', keyUrl: 'https://openrouter.ai/settings/keys' },
  { id: 'openrouter-gemini-31-pro', apiModel: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', provider: 'OpenRouter', providerId: 'openrouter', category: 'chat', pricing: 'paid', quota: '按量计费：基础输入约 $2 / 1M tokens，输出约 $12 / 1M tokens', quotaLookup: '工作台可查询 OpenRouter Credits 余额', integration: 'ready', description: '百万上下文的多模态旗舰模型', docsUrl: 'https://openrouter.ai/models/google/gemini-3.1-pro-preview', keyUrl: 'https://openrouter.ai/settings/keys' },
  { id: 'openrouter-deepseek-v4-pro', apiModel: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'OpenRouter', providerId: 'openrouter', category: 'chat', pricing: 'paid', quota: '按量计费：输入约 $0.435 / 1M tokens，输出约 $0.87 / 1M tokens', quotaLookup: '工作台可查询 OpenRouter Credits 余额', integration: 'ready', description: '高性价比长上下文推理模型', docsUrl: 'https://openrouter.ai/models/deepseek/deepseek-v4-pro', keyUrl: 'https://openrouter.ai/settings/keys' },
  { id: 'pollinations-openai-fast', apiModel: 'openai-fast', name: 'OpenAI Fast', provider: 'Pollinations', providerId: 'pollinations', category: 'chat', pricing: 'free-quota', quota: '使用 Quest Pollen 赠送余额，余额不足返回 402', quotaLookup: '工作台可查询 /account/balance 当前余额', integration: 'ready', description: '统一 API 的快速文本模型', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-mistral-small', apiModel: 'mistral-small-3.2', name: 'Mistral Small 3.2', provider: 'Pollinations', providerId: 'pollinations', category: 'chat', pricing: 'free-quota', quota: '使用 Quest Pollen 赠送余额，余额不足返回 402', quotaLookup: '工作台可查询 /account/balance 当前余额', integration: 'ready', description: '多语言通用对话与写作', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-gpt-oss', apiModel: 'gpt-oss', name: 'GPT-OSS 20B', provider: 'Pollinations', providerId: 'pollinations', category: 'chat', pricing: 'free-quota', quota: '使用 Quest Pollen 赠送余额，余额不足返回 402', quotaLookup: '工作台可查询 /account/balance 当前余额', integration: 'ready', description: '低成本开源推理模型', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-claude-sonnet-5', apiModel: 'claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'Pollinations', providerId: 'pollinations', category: 'chat', pricing: 'paid', quota: 'paid_only 模型，按实际 tokens 扣减付费 Pollen', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: '支持文本和图片输入的付费模型', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'cf-llama', apiModel: '@cf/meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', provider: 'Cloudflare Workers AI', providerId: 'cloudflare', category: 'chat', pricing: 'free-quota', quota: '每天共享 10,000 Neurons 免费额度，00:00 UTC 重置', quotaLookup: 'Workers AI Dashboard 查看用量', integration: 'catalog', description: 'Cloudflare 全球网络上的开源模型推理', docsUrl: 'https://developers.cloudflare.com/workers-ai/models/', keyUrl: 'https://dash.cloudflare.com/' },
  { id: 'hf-chat', apiModel: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B Instruct', provider: 'Hugging Face', providerId: 'huggingface', category: 'chat', pricing: 'free-quota', quota: '免费账户每月 $0.10 Inference Providers 额度（可能调整）', quotaLookup: 'Hugging Face Billing 查看', integration: 'catalog', description: '通过 Inference Providers 路由模型', docsUrl: 'https://huggingface.co/docs/inference-providers/index', keyUrl: 'https://huggingface.co/settings/tokens' },

  { id: 'sf-kolors', apiModel: 'Kwai-Kolors/Kolors', name: 'Kolors', provider: 'SiliconFlow', providerId: 'siliconflow', category: 'image', pricing: 'variable', quota: '是否免费及速率以模型页实时标记为准', quotaLookup: '控制台模型页/账单查看', integration: 'ready', description: '中文提示词表现良好的文生图模型', docsUrl: 'https://docs.siliconflow.cn/cn/api-reference/images/images-generations', keyUrl: 'https://cloud.siliconflow.cn/account/ak' },
  { id: 'cf-flux-schnell', apiModel: '@cf/black-forest-labs/flux-1-schnell', name: 'FLUX.1 Schnell', provider: 'Cloudflare Workers AI', providerId: 'cloudflare', category: 'image', pricing: 'free-quota', quota: '每天共享 10,000 Neurons 免费额度，超出后需付费计划', quotaLookup: 'Workers AI Dashboard 查看用量', integration: 'ready', description: '快速文生图，最多 8 个推理步骤', docsUrl: 'https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/', keyUrl: 'https://dash.cloudflare.com/' },
  { id: 'cf-sdxl-lightning', apiModel: '@cf/bytedance/stable-diffusion-xl-lightning', name: 'SDXL-Lightning', provider: 'Cloudflare Workers AI', providerId: 'cloudflare', category: 'image', pricing: 'free-quota', quota: '模型单步标价 $0，仍受每天共享 10,000 Neurons 免费额度限制', quotaLookup: 'Workers AI Dashboard 查看用量', integration: 'ready', description: '支持 1024px 快速生成与参考图转换', docsUrl: 'https://developers.cloudflare.com/workers-ai/models/stable-diffusion-xl-lightning/', keyUrl: 'https://dash.cloudflare.com/' },
  { id: 'modelscope-sdxl', apiModel: 'AI-ModelScope/stable-diffusion-xl-base-1.0', name: 'Stable Diffusion XL', provider: 'ModelScope', providerId: 'modelscope', category: 'image', pricing: 'free-quota', quota: 'API-Inference 免费额度与模型可用性动态变化', quotaLookup: '魔搭控制台查看', integration: 'catalog', description: '社区开源文生图模型', docsUrl: 'https://modelscope.cn/models', keyUrl: 'https://modelscope.cn/my/myaccesstoken' },
  { id: 'alibaba-wan-image', apiModel: 'wan2.6-t2i', name: 'Wan 2.6 文生图', provider: '阿里云百炼', providerId: 'alibaba', category: 'image', pricing: 'free-quota', quota: '北京地域新人额度通常 90 天，到期或耗尽后按量计费', quotaLookup: '百炼免费额度页面可查看并开启“用完即停”', integration: 'catalog', description: '通义万相文生图', docsUrl: 'https://help.aliyun.com/zh/model-studio/text-to-image-v2-api-reference', keyUrl: 'https://bailian.console.aliyun.com/' },
  { id: 'pollinations-zimage', apiModel: 'zimage', name: 'Z-Image', provider: 'Pollinations', providerId: 'pollinations', category: 'image', pricing: 'free-quota', quota: 'Publishable Key 提供少量赠送额度，额度与速率按账户策略为准', quotaLookup: 'Pollinations 账户页查看 Pollen 余额', integration: 'ready', description: '速度快、适合日常文生图', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-flux', apiModel: 'flux', name: 'FLUX', provider: 'Pollinations', providerId: 'pollinations', category: 'image', pricing: 'free-quota', quota: 'Publishable Key 提供少量赠送额度，额度与速率按账户策略为准', quotaLookup: 'Pollinations 账户页查看 Pollen 余额', integration: 'ready', description: '统一 API 图片生成入口', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-sana', apiModel: 'sana', name: 'Sana', provider: 'Pollinations', providerId: 'pollinations', category: 'image', pricing: 'free-quota', quota: '使用 Quest Pollen 赠送余额', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: '轻量快速文生图', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-kontext', apiModel: 'kontext', name: 'Kontext', provider: 'Pollinations', providerId: 'pollinations', category: 'image', pricing: 'free-quota', quota: '使用 Quest Pollen 赠送余额', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: '支持参考图编辑与风格转换', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-gptimage', apiModel: 'gptimage', name: 'GPT Image Mini', provider: 'Pollinations', providerId: 'pollinations', category: 'image', pricing: 'free-quota', quota: '使用 Quest Pollen 赠送余额', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: '支持参考图、透明背景与画面文字', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-klein', apiModel: 'klein', name: 'FLUX Klein', provider: 'Pollinations', providerId: 'pollinations', category: 'image', pricing: 'free-quota', quota: '使用 Quest Pollen 赠送余额', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: '支持参考图的快速 FLUX 模型', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-nova-canvas', apiModel: 'nova-canvas', name: 'Nova Canvas', provider: 'Pollinations', providerId: 'pollinations', category: 'image', pricing: 'free-quota', quota: '使用 Quest Pollen 赠送余额', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: 'Amazon Nova 系列图片生成', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-qwen-image-community', apiModel: 'Catniti/qwen-image-3.0-pro', name: 'Qwen Image 3.0 Pro', provider: 'Pollinations 社区', providerId: 'pollinations', category: 'image', pricing: 'free-quota', quota: '社区模型可使用 Quest Pollen 赠送余额，稳定性由社区端点决定', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: '中文提示词与文字生成社区模型', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-qwen-image', apiModel: 'qwen-image', name: 'Qwen Image', provider: 'Pollinations', providerId: 'pollinations', category: 'image', pricing: 'paid', quota: '当前官方模型标记为 paid_only，赠送余额不可调用', quotaLookup: 'Pollinations 账户页查看付费余额', integration: 'ready', description: '支持中文提示词、参考图与画面文字生成', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-nanobanana-pro', apiModel: 'nanobanana-pro', name: 'Nano Banana Pro', provider: 'Pollinations', providerId: 'pollinations', category: 'image', pricing: 'paid', quota: 'paid_only 模型，按图片生成量扣减付费 Pollen', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: '高质量生图与参考图编辑', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-seedream5-pro', apiModel: 'seedream5-pro', name: 'Seedream 5 Pro', provider: 'Pollinations', providerId: 'pollinations', category: 'image', pricing: 'paid', quota: '约 0.09 Pollen/张，价格会随服务端调整', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: '高质量中文生图与参考图创作', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-ideogram-v4-turbo', apiModel: 'ideogram-v4-turbo', name: 'Ideogram V4 Turbo', provider: 'Pollinations', providerId: 'pollinations', category: 'image', pricing: 'paid', quota: '约 0.03 Pollen/张，价格会随服务端调整', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: '擅长海报、文字与设计类画面', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-wan-image-pro', apiModel: 'wan-image-pro', name: 'Wan Image Pro', provider: 'Pollinations', providerId: 'pollinations', category: 'image', pricing: 'paid', quota: '约 0.03 Pollen/张，价格会随服务端调整', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: '支持参考图的通义万相高质量版本', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-grok-imagine-pro', apiModel: 'grok-imagine-pro', name: 'Grok Imagine Pro', provider: 'Pollinations', providerId: 'pollinations', category: 'image', pricing: 'paid', quota: 'paid_only 模型，按图片生成量扣减付费 Pollen', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: '高质量创意生图与参考图重绘', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'hf-flux', apiModel: 'black-forest-labs/FLUX.1-schnell', name: 'FLUX.1 Schnell', provider: 'Hugging Face', providerId: 'huggingface', category: 'image', pricing: 'free-quota', quota: '共享每月 $0.10 免费推理额度', quotaLookup: 'Hugging Face Billing 查看', integration: 'catalog', description: '通过 Inference Providers 调用 FLUX', docsUrl: 'https://huggingface.co/docs/inference-providers/index', keyUrl: 'https://huggingface.co/settings/tokens' },
  { id: 'agnes-image-21', apiModel: 'agnes-image-2.1-flash', name: 'Agnes Image 2.1 Flash', provider: 'Agnes AI', providerId: 'agnes', category: 'image', pricing: 'free', quota: '核心模型免费，但有 RPM 等调用限制', quotaLookup: 'Agnes Token 方案页查看限制', integration: 'ready', description: '复杂构图与丰富细节', docsUrl: 'https://agnes-ai.com/zh-Hans/docs/agnes-image-21-flash', keyUrl: 'https://agnes-ai.com/' },
  { id: 'tencent-hy-image-v3', apiModel: 'hy-image-v3.0', name: '混元生图 3.0', provider: '腾讯混元 TokenHub', providerId: 'tencent', category: 'image', pricing: 'paid', quota: '按实际生成量计费，活动体验额度以 TokenHub 控制台为准', quotaLookup: 'TokenHub 用量统计与费用中心查看', integration: 'ready', description: '支持中文长提示词、文生图和参考图生成', docsUrl: 'https://cloud.tencent.com/document/product/1823/130080', keyUrl: 'https://console.cloud.tencent.com/tokenhub' },
  { id: 'tencent-hy-image-lite', apiModel: 'hy-image-lite', name: '混元生图 极速版', provider: '腾讯混元 TokenHub', providerId: 'tencent', category: 'image', pricing: 'paid', quota: '按实际生成量计费，活动体验额度以 TokenHub 控制台为准', quotaLookup: 'TokenHub 用量统计与费用中心查看', integration: 'ready', description: '面向电商、设计与游戏场景的快速中文生图', docsUrl: 'https://cloud.tencent.com/document/product/1823/130080', keyUrl: 'https://console.cloud.tencent.com/tokenhub' },
  { id: 'seedream-5-pro', apiModel: 'doubao-seedream-5-0-pro-260628', name: 'Seedream 5.0 Pro', provider: '火山方舟', providerId: 'ark', category: 'image', pricing: 'paid', quota: '按实际调用量计费，活动赠送额度以控制台为准', quotaLookup: '方舟费用中心查看', integration: 'ready', description: '旗舰图片生成模型', docsUrl: 'https://www.volcengine.com/docs/82379', keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey' },

  { id: 'alibaba-wan-video', apiModel: 'wan2.7-t2v', name: 'Wan 2.7 文生视频', provider: '阿里云百炼', providerId: 'alibaba', category: 'video', pricing: 'free-quota', quota: '北京地域新人额度通常 90 天，之后按量计费', quotaLookup: '百炼免费额度页面查看', integration: 'catalog', description: '通义万相异步文生视频', docsUrl: 'https://help.aliyun.com/zh/model-studio/text-to-video-api-reference', keyUrl: 'https://bailian.console.aliyun.com/' },
  { id: 'modelscope-wan-video', apiModel: 'Wan-AI/Wan2.1-T2V-14B', name: 'Wan 2.1 T2V', provider: 'ModelScope', providerId: 'modelscope', category: 'video', pricing: 'free-quota', quota: '托管推理额度及可用性按模型页面变化', quotaLookup: '魔搭控制台查看', integration: 'catalog', description: '社区视频生成模型', docsUrl: 'https://modelscope.cn/models?tasks=text-to-video-synthesis', keyUrl: 'https://modelscope.cn/my/myaccesstoken' },
  { id: 'pollinations-nova-reel', apiModel: 'nova-reel', name: 'Nova Reel', provider: 'Pollinations', providerId: 'pollinations', category: 'video', pricing: 'free-quota', quota: '当前未标 paid_only，可使用 Pollen 赠送余额；6–120 秒且时长为 6 的倍数', quotaLookup: 'Pollinations /account/balance 查看余额', integration: 'catalog', description: '支持文生视频和首帧参考，API 返回 MP4', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-veo', apiModel: 'veo', name: 'Veo 3.1 Fast', provider: 'Pollinations', providerId: 'pollinations', category: 'video', pricing: 'paid', quota: 'paid_only，按视频秒数计费；支持 4、6、8 秒', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: '支持首尾帧和音频输出', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-veo-1080p', apiModel: 'veo-1080p', name: 'Veo 3.1 Fast 1080p', provider: 'Pollinations', providerId: 'pollinations', category: 'video', pricing: 'paid', quota: '约 0.10 Pollen/视频秒，音频另计', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: '1080p、首尾帧与音频输出', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-seedance-2', apiModel: 'seedance-2.0', name: 'Seedance 2.0', provider: 'Pollinations', providerId: 'pollinations', category: 'video', pricing: 'paid', quota: '约 0.18 Pollen/视频秒', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: '支持首尾帧和音频输出的旗舰视频模型', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-wan-fast', apiModel: 'wan-fast', name: 'Wan Fast', provider: 'Pollinations', providerId: 'pollinations', category: 'video', pricing: 'paid', quota: '约 0.01 Pollen/视频秒', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: '低成本快速视频生成，支持首尾帧', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-wan-pro', apiModel: 'wan-pro', name: 'Wan Pro', provider: 'Pollinations', providerId: 'pollinations', category: 'video', pricing: 'paid', quota: '约 0.10 Pollen/视频秒', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: '高质量视频生成，支持首尾帧与音频', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-grok-video-pro', apiModel: 'grok-video-pro', name: 'Grok Video Pro', provider: 'Pollinations', providerId: 'pollinations', category: 'video', pricing: 'paid', quota: '约 0.07 Pollen/视频秒，参考图另计', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: '支持首帧参考的高质量视频生成', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'seedance-2', apiModel: 'doubao-seedance-2-0-260128', name: 'Seedance 2.0', provider: '火山方舟', providerId: 'ark', category: 'video', pricing: 'paid', quota: '按生成规格和时长计费', quotaLookup: '方舟费用中心查看', integration: 'ready', description: '文生视频与多模态参考视频', docsUrl: 'https://www.volcengine.com/docs/82379/1366799', keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey' },
  { id: 'agnes-video', apiModel: 'agnes-video-v2.0', name: 'Agnes Video V2.0', provider: 'Agnes AI', providerId: 'agnes', category: 'video', pricing: 'free', quota: '免费默认档实际约 1 RPM，并受每日时长限制', quotaLookup: 'Agnes Token 方案页查看', integration: 'ready', description: '异步文生视频', docsUrl: 'https://agnes-ai.com/zh-Hans/docs/agnes-video-v20', keyUrl: 'https://agnes-ai.com/' },

  { id: 'groq-whisper', apiModel: 'whisper-large-v3-turbo', name: 'Whisper Large V3 Turbo', provider: 'Groq', providerId: 'groq', category: 'audio', pricing: 'free-quota', quota: '免费账户受音频时长和每日请求限制', quotaLookup: 'Groq Limits 页面查看', integration: 'ready', description: '高速语音转文字', docsUrl: 'https://console.groq.com/docs/speech-to-text', keyUrl: 'https://console.groq.com/keys' },
  { id: 'groq-whisper-large', apiModel: 'whisper-large-v3', name: 'Whisper Large V3', provider: 'Groq', providerId: 'groq', category: 'audio', pricing: 'free-quota', quota: 'Developer Plan 提供免费限流额度', quotaLookup: 'Groq Limits 页面查看音频分钟数与请求限制', integration: 'ready', description: '更重视准确率的多语言语音转文字', docsUrl: 'https://console.groq.com/docs/speech-to-text', keyUrl: 'https://console.groq.com/keys' },
  { id: 'pollinations-whisper', apiModel: 'whisper', name: 'Whisper', provider: 'Pollinations', providerId: 'pollinations', category: 'audio', pricing: 'free-quota', quota: '使用 Quest Pollen 赠送余额，单文件最大 25MB', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: 'OpenAI 兼容语音转文字', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'eleven-flash', apiModel: 'eleven_flash_v2_5', name: 'Eleven Flash v2.5', provider: 'ElevenLabs', providerId: 'elevenlabs', category: 'audio', pricing: 'free-quota', quota: '新账户含约 10,000 免费 credits，生成会扣减 credits', quotaLookup: 'Developers Analytics 可查看精确用量', integration: 'ready', description: '低延迟文字转语音', docsUrl: 'https://elevenlabs.io/docs/api-reference/introduction', keyUrl: 'https://elevenlabs.io/app/settings/api-keys' },
  { id: 'pollinations-qwen-tts', apiModel: 'qwen-tts', name: 'Qwen TTS', provider: 'Pollinations', providerId: 'pollinations', category: 'audio', pricing: 'paid', quota: 'paid_only，约 0.00001 Pollen/音频 token', quotaLookup: '工作台可查询当前 Pollen 余额', integration: 'ready', description: '多语言文字转语音', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },

  { id: 'jina-embed-v3', apiModel: 'jina-embeddings-v3', name: 'Jina Embeddings v3', provider: 'Jina AI', providerId: 'jina', category: 'embedding', pricing: 'free-quota', quota: '新 API Key 含 1,000 万免费 tokens', quotaLookup: 'Jina API Dashboard 查看', integration: 'catalog', description: '多语言文本向量', docsUrl: 'https://jina.ai/embeddings/', keyUrl: 'https://jina.ai/api-dashboard/' },
  { id: 'cohere-embed-v4', apiModel: 'embed-v4.0', name: 'Embed v4.0', provider: 'Cohere', providerId: 'cohere', category: 'embedding', pricing: 'free-quota', quota: 'Trial Key 免费但限流，通常每月最多 1,000 次 API 调用', quotaLookup: 'Cohere Dashboard 查看', integration: 'catalog', description: '文本与多模态向量', docsUrl: 'https://docs.cohere.com/', keyUrl: 'https://dashboard.cohere.com/api-keys' },
  { id: 'sf-bge-m3', apiModel: 'BAAI/bge-m3', name: 'BGE-M3', provider: 'SiliconFlow', providerId: 'siliconflow', category: 'embedding', pricing: 'variable', quota: '免费或付费状态以模型页实时标记为准', quotaLookup: '控制台模型页/账单查看', integration: 'catalog', description: '多语言多功能 Embedding', docsUrl: 'https://docs.siliconflow.cn/', keyUrl: 'https://cloud.siliconflow.cn/account/ak' },
  { id: 'cf-bge-m3', apiModel: '@cf/baai/bge-m3', name: 'BGE-M3', provider: 'Cloudflare Workers AI', providerId: 'cloudflare', category: 'embedding', pricing: 'free-quota', quota: '每天共享 10,000 Neurons 免费额度', quotaLookup: 'Workers AI Dashboard 查看', integration: 'catalog', description: 'Cloudflare 托管向量模型', docsUrl: 'https://developers.cloudflare.com/workers-ai/models/', keyUrl: 'https://dash.cloudflare.com/' },
  { id: 'jina-reranker-v3', apiModel: 'jina-reranker-v3', name: 'Jina Reranker v3', provider: 'Jina AI', providerId: 'jina', category: 'reranker', pricing: 'free-quota', quota: '与 Embedding 共享新 Key 的 1,000 万免费 tokens', quotaLookup: 'Jina API Dashboard 查看', integration: 'catalog', description: '多语言长上下文重排', docsUrl: 'https://jina.ai/reranker/', keyUrl: 'https://jina.ai/api-dashboard/' },
  { id: 'cohere-rerank', apiModel: 'rerank-v3.5', name: 'Rerank 3.5', provider: 'Cohere', providerId: 'cohere', category: 'reranker', pricing: 'free-quota', quota: 'Trial Key 免费，Rerank 通常 10 RPM', quotaLookup: 'Cohere Dashboard 查看', integration: 'catalog', description: '语义搜索结果重排', docsUrl: 'https://docs.cohere.com/', keyUrl: 'https://dashboard.cohere.com/api-keys' },

  { id: 'seed3d', apiModel: 'doubao-seed3d-2-0-260328', name: 'Seed3D 2.0', provider: '火山方舟', providerId: 'ark', category: '3d', pricing: 'paid', quota: '按量计费', quotaLookup: '方舟费用中心查看', integration: 'ready', description: '图片转 3D', docsUrl: 'https://www.volcengine.com/docs/82379', keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey' },
  { id: 'tencent-hy-3d-31', apiModel: 'hy-3d-3.1', name: '混元生 3D 3.1', provider: '腾讯混元 TokenHub', providerId: 'tencent', category: '3d', pricing: 'paid', quota: '按 3D 生成任务计费，活动体验额度以 TokenHub 控制台为准', quotaLookup: 'TokenHub 用量统计与费用中心查看', integration: 'ready', description: '高精度文生与图生 3D，支持更高质量几何和纹理', docsUrl: 'https://cloud.tencent.com/document/product/1823/130082', keyUrl: 'https://console.cloud.tencent.com/tokenhub' },
  { id: 'tencent-hy-3d-30', apiModel: 'hy-3d-3.0', name: '混元生 3D 3.0', provider: '腾讯混元 TokenHub', providerId: 'tencent', category: '3d', pricing: 'paid', quota: '按 3D 生成任务计费，活动体验额度以 TokenHub 控制台为准', quotaLookup: 'TokenHub 用量统计与费用中心查看', integration: 'ready', description: '专业版文生与图生 3D 模型', docsUrl: 'https://cloud.tencent.com/document/product/1823/130082', keyUrl: 'https://console.cloud.tencent.com/tokenhub' },
  { id: 'tencent-hy-3d-express', apiModel: 'hy-3d-express', name: '混元生 3D 极速版', provider: '腾讯混元 TokenHub', providerId: 'tencent', category: '3d', pricing: 'paid', quota: '按 3D 生成任务计费，活动体验额度以 TokenHub 控制台为准', quotaLookup: 'TokenHub 用量统计与费用中心查看', integration: 'ready', description: '更短等待时间的快速 3D 生成模型', docsUrl: 'https://cloud.tencent.com/document/product/1823/130082', keyUrl: 'https://console.cloud.tencent.com/tokenhub' },
]

const staticDailyRefreshProviders = new Set(['cloudflare', 'groq', 'modelscope'])

function applyDailyRefreshPricing(model: CatalogModel): CatalogModel {
  const isGeminiDailyFree = model.providerId === 'gemini'
    && /^gemini-2\.5-flash(?:-lite)?(?:$|-)/i.test(model.apiModel)
  const isDailyRefresh = staticDailyRefreshProviders.has(model.providerId)
    || isGeminiDailyFree

  if (!isDailyRefresh) return model
  const quotaDescription = dailyRefreshQuotaByProvider[model.providerId]
  return {
    ...model,
    pricing: 'daily-refresh',
    quota: quotaDescription?.quota ?? model.quota,
    quotaLookup: quotaDescription?.quotaLookup ?? model.quotaLookup,
  }
}

export const catalogModels: CatalogModel[] = sortModelsByPricing(
  baseCatalogModels.map(applyDailyRefreshPricing),
)
