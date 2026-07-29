export type ModelCategory = 'chat' | 'image' | 'video' | 'audio' | 'embedding' | 'reranker' | '3d'
export type PricingTier = 'free' | 'free-quota' | 'paid' | 'variable'
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

export const pricingLabels: Record<PricingTier, string> = {
  free: '完全免费',
  'free-quota': '有免费额度',
  paid: '付费',
  variable: '按模型计费',
}

export const providerEnvironmentKeys: Record<string, string[]> = {
  ark: ['VITE_ARK_API_KEY'],
  agnes: ['VITE_AGNES_API_KEY'],
  siliconflow: ['VITE_SILICONFLOW_API_KEY'],
  modelscope: ['VITE_MODELSCOPE_API_KEY'],
  gemini: ['VITE_GEMINI_API_KEY'],
  groq: ['VITE_GROQ_API_KEY'],
  openrouter: ['VITE_OPENROUTER_API_KEY'],
  cloudflare: ['VITE_CLOUDFLARE_API_TOKEN', 'VITE_CLOUDFLARE_ACCOUNT_ID'],
  huggingface: ['VITE_HUGGINGFACE_TOKEN'],
  alibaba: ['VITE_DASHSCOPE_API_KEY'],
  pollinations: ['VITE_POLLINATIONS_API_KEY'],
  elevenlabs: ['VITE_ELEVENLABS_API_KEY'],
  jina: ['VITE_JINA_API_KEY'],
  cohere: ['VITE_COHERE_API_KEY'],
}

export const configuredProviders: Record<string, boolean> = {
  ark: Boolean(import.meta.env.VITE_ARK_API_KEY),
  agnes: Boolean(import.meta.env.VITE_AGNES_API_KEY),
  siliconflow: Boolean(import.meta.env.VITE_SILICONFLOW_API_KEY),
  modelscope: Boolean(import.meta.env.VITE_MODELSCOPE_API_KEY),
  gemini: Boolean(import.meta.env.VITE_GEMINI_API_KEY),
  groq: Boolean(import.meta.env.VITE_GROQ_API_KEY),
  openrouter: Boolean(import.meta.env.VITE_OPENROUTER_API_KEY),
  cloudflare: Boolean(import.meta.env.VITE_CLOUDFLARE_API_TOKEN && import.meta.env.VITE_CLOUDFLARE_ACCOUNT_ID),
  huggingface: Boolean(import.meta.env.VITE_HUGGINGFACE_TOKEN),
  alibaba: Boolean(import.meta.env.VITE_DASHSCOPE_API_KEY),
  pollinations: Boolean(import.meta.env.VITE_POLLINATIONS_API_KEY),
  elevenlabs: Boolean(import.meta.env.VITE_ELEVENLABS_API_KEY),
  jina: Boolean(import.meta.env.VITE_JINA_API_KEY),
  cohere: Boolean(import.meta.env.VITE_COHERE_API_KEY),
}

export const catalogModels: CatalogModel[] = [
  { id: 'sf-qwen3-8b', apiModel: 'Qwen/Qwen3-8B', name: 'Qwen3 8B', provider: 'SiliconFlow', providerId: 'siliconflow', category: 'chat', pricing: 'variable', quota: '部分模型长期免费，具体以模型页实时标记为准', quotaLookup: '控制台模型页/账单查看', integration: 'ready', description: '国内访问友好的 OpenAI 兼容推理服务', docsUrl: 'https://docs.siliconflow.cn/', keyUrl: 'https://cloud.siliconflow.cn/account/ak' },
  { id: 'modelscope-qwen3', apiModel: 'Qwen/Qwen3-8B', name: 'Qwen3 8B', provider: 'ModelScope', providerId: 'modelscope', category: 'chat', pricing: 'free-quota', quota: '免费推理额度与并发限制按账号及模型变化', quotaLookup: '魔搭控制台查看', integration: 'catalog', description: '适合测试社区开源模型', docsUrl: 'https://modelscope.cn/docs/model-service/API-Inference/intro', keyUrl: 'https://modelscope.cn/my/myaccesstoken' },
  { id: 'gemini-2.5-flash', apiModel: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google Gemini', providerId: 'gemini', category: 'chat', pricing: 'free-quota', quota: 'Free Tier 可用；限制按项目和模型计算', quotaLookup: 'AI Studio 项目页查看', integration: 'catalog', description: '多模态、长上下文与结构化输出', docsUrl: 'https://ai.google.dev/gemini-api/docs', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'groq-gpt-oss', apiModel: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'Groq', providerId: 'groq', category: 'chat', pricing: 'free-quota', quota: '免费账户受 RPM、RPD、TPM 与 TPD 限制', quotaLookup: 'Groq Limits 页面查看精确剩余限制', integration: 'ready', description: '低延迟大语言模型推理', docsUrl: 'https://console.groq.com/docs/models', keyUrl: 'https://console.groq.com/keys' },
  { id: 'openrouter-free', apiModel: 'openrouter/free', name: 'Free Models Router', provider: 'OpenRouter', providerId: 'openrouter', category: 'chat', pricing: 'free', quota: '自动路由到免费模型，限流较低，不适合生产', quotaLookup: '可通过 Credits API 查询账户余额', integration: 'ready', description: '自动选择当前可用免费模型', docsUrl: 'https://openrouter.ai/docs', keyUrl: 'https://openrouter.ai/settings/keys' },
  { id: 'cf-llama', apiModel: '@cf/meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', provider: 'Cloudflare Workers AI', providerId: 'cloudflare', category: 'chat', pricing: 'free-quota', quota: '每天共享 10,000 Neurons 免费额度，00:00 UTC 重置', quotaLookup: 'Workers AI Dashboard 查看用量', integration: 'catalog', description: 'Cloudflare 全球网络上的开源模型推理', docsUrl: 'https://developers.cloudflare.com/workers-ai/models/', keyUrl: 'https://dash.cloudflare.com/' },
  { id: 'hf-chat', apiModel: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B Instruct', provider: 'Hugging Face', providerId: 'huggingface', category: 'chat', pricing: 'free-quota', quota: '免费账户每月 $0.10 Inference Providers 额度（可能调整）', quotaLookup: 'Hugging Face Billing 查看', integration: 'catalog', description: '通过 Inference Providers 路由模型', docsUrl: 'https://huggingface.co/docs/inference-providers/index', keyUrl: 'https://huggingface.co/settings/tokens' },

  { id: 'sf-kolors', apiModel: 'Kwai-Kolors/Kolors', name: 'Kolors', provider: 'SiliconFlow', providerId: 'siliconflow', category: 'image', pricing: 'variable', quota: '是否免费及速率以模型页实时标记为准', quotaLookup: '控制台模型页/账单查看', integration: 'ready', description: '中文提示词表现良好的文生图模型', docsUrl: 'https://docs.siliconflow.cn/cn/api-reference/images/images-generations', keyUrl: 'https://cloud.siliconflow.cn/account/ak' },
  { id: 'cf-flux-schnell', apiModel: '@cf/black-forest-labs/flux-1-schnell', name: 'FLUX.1 Schnell', provider: 'Cloudflare Workers AI', providerId: 'cloudflare', category: 'image', pricing: 'free-quota', quota: '每天共享 10,000 Neurons 免费额度，超出后需付费计划', quotaLookup: 'Workers AI Dashboard 查看用量', integration: 'ready', description: '快速文生图，最多 8 个推理步骤', docsUrl: 'https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/', keyUrl: 'https://dash.cloudflare.com/' },
  { id: 'modelscope-sdxl', apiModel: 'AI-ModelScope/stable-diffusion-xl-base-1.0', name: 'Stable Diffusion XL', provider: 'ModelScope', providerId: 'modelscope', category: 'image', pricing: 'free-quota', quota: 'API-Inference 免费额度与模型可用性动态变化', quotaLookup: '魔搭控制台查看', integration: 'catalog', description: '社区开源文生图模型', docsUrl: 'https://modelscope.cn/models', keyUrl: 'https://modelscope.cn/my/myaccesstoken' },
  { id: 'alibaba-wan-image', apiModel: 'wan2.6-t2i', name: 'Wan 2.6 文生图', provider: '阿里云百炼', providerId: 'alibaba', category: 'image', pricing: 'free-quota', quota: '北京地域新人额度通常 90 天，到期或耗尽后按量计费', quotaLookup: '百炼免费额度页面可查看并开启“用完即停”', integration: 'catalog', description: '通义万相文生图', docsUrl: 'https://help.aliyun.com/zh/model-studio/text-to-image-v2-api-reference', keyUrl: 'https://bailian.console.aliyun.com/' },
  { id: 'pollinations-zimage', apiModel: 'zimage', name: 'Z-Image', provider: 'Pollinations', providerId: 'pollinations', category: 'image', pricing: 'free-quota', quota: 'Publishable Key 提供少量赠送额度，额度与速率按账户策略为准', quotaLookup: 'Pollinations 账户页查看 Pollen 余额', integration: 'ready', description: '速度快、适合日常文生图', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-flux', apiModel: 'flux', name: 'FLUX', provider: 'Pollinations', providerId: 'pollinations', category: 'image', pricing: 'free-quota', quota: 'Publishable Key 提供少量赠送额度，额度与速率按账户策略为准', quotaLookup: 'Pollinations 账户页查看 Pollen 余额', integration: 'ready', description: '统一 API 图片生成入口', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'pollinations-qwen-image', apiModel: 'qwen-image', name: 'Qwen Image', provider: 'Pollinations', providerId: 'pollinations', category: 'image', pricing: 'free-quota', quota: 'Publishable Key 提供少量赠送额度，额度与速率按账户策略为准', quotaLookup: 'Pollinations 账户页查看 Pollen 余额', integration: 'ready', description: '支持中文提示词与画面文字生成', docsUrl: 'https://gen.pollinations.ai/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'hf-flux', apiModel: 'black-forest-labs/FLUX.1-schnell', name: 'FLUX.1 Schnell', provider: 'Hugging Face', providerId: 'huggingface', category: 'image', pricing: 'free-quota', quota: '共享每月 $0.10 免费推理额度', quotaLookup: 'Hugging Face Billing 查看', integration: 'catalog', description: '通过 Inference Providers 调用 FLUX', docsUrl: 'https://huggingface.co/docs/inference-providers/index', keyUrl: 'https://huggingface.co/settings/tokens' },
  { id: 'agnes-image-21', apiModel: 'agnes-image-2.1-flash', name: 'Agnes Image 2.1 Flash', provider: 'Agnes AI', providerId: 'agnes', category: 'image', pricing: 'free', quota: '核心模型免费，但有 RPM 等调用限制', quotaLookup: 'Agnes Token 方案页查看限制', integration: 'ready', description: '复杂构图与丰富细节', docsUrl: 'https://agnes-ai.com/zh-Hans/docs/agnes-image-21-flash', keyUrl: 'https://agnes-ai.com/' },
  { id: 'seedream-5-pro', apiModel: 'doubao-seedream-5-0-pro-260628', name: 'Seedream 5.0 Pro', provider: '火山方舟', providerId: 'ark', category: 'image', pricing: 'paid', quota: '按实际调用量计费，活动赠送额度以控制台为准', quotaLookup: '方舟费用中心查看', integration: 'ready', description: '旗舰图片生成模型', docsUrl: 'https://www.volcengine.com/docs/82379', keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey' },

  { id: 'alibaba-wan-video', apiModel: 'wan2.7-t2v', name: 'Wan 2.7 文生视频', provider: '阿里云百炼', providerId: 'alibaba', category: 'video', pricing: 'free-quota', quota: '北京地域新人额度通常 90 天，之后按量计费', quotaLookup: '百炼免费额度页面查看', integration: 'catalog', description: '通义万相异步文生视频', docsUrl: 'https://help.aliyun.com/zh/model-studio/text-to-video-api-reference', keyUrl: 'https://bailian.console.aliyun.com/' },
  { id: 'modelscope-wan-video', apiModel: 'Wan-AI/Wan2.1-T2V-14B', name: 'Wan 2.1 T2V', provider: 'ModelScope', providerId: 'modelscope', category: 'video', pricing: 'free-quota', quota: '托管推理额度及可用性按模型页面变化', quotaLookup: '魔搭控制台查看', integration: 'catalog', description: '社区视频生成模型', docsUrl: 'https://modelscope.cn/models?tasks=text-to-video-synthesis', keyUrl: 'https://modelscope.cn/my/myaccesstoken' },
  { id: 'pollinations-video', apiModel: 'video', name: 'Pollinations Video', provider: 'Pollinations', providerId: 'pollinations', category: 'video', pricing: 'free-quota', quota: '免费入口和视频模型可用性可能动态调整', quotaLookup: 'Pollinations 账户页查看', integration: 'catalog', description: '统一 API 视频生成入口', docsUrl: 'https://enter.pollinations.ai/api/docs', keyUrl: 'https://enter.pollinations.ai/' },
  { id: 'seedance-2', apiModel: 'doubao-seedance-2-0-260128', name: 'Seedance 2.0', provider: '火山方舟', providerId: 'ark', category: 'video', pricing: 'paid', quota: '按生成规格和时长计费', quotaLookup: '方舟费用中心查看', integration: 'ready', description: '文生视频与多模态参考视频', docsUrl: 'https://www.volcengine.com/docs/82379/1366799', keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey' },
  { id: 'agnes-video', apiModel: 'agnes-video-v2.0', name: 'Agnes Video V2.0', provider: 'Agnes AI', providerId: 'agnes', category: 'video', pricing: 'free', quota: '免费默认档实际约 1 RPM，并受每日时长限制', quotaLookup: 'Agnes Token 方案页查看', integration: 'ready', description: '异步文生视频', docsUrl: 'https://agnes-ai.com/zh-Hans/docs/agnes-video-v20', keyUrl: 'https://agnes-ai.com/' },

  { id: 'groq-whisper', apiModel: 'whisper-large-v3-turbo', name: 'Whisper Large V3 Turbo', provider: 'Groq', providerId: 'groq', category: 'audio', pricing: 'free-quota', quota: '免费账户受音频时长和每日请求限制', quotaLookup: 'Groq Limits 页面查看', integration: 'ready', description: '高速语音转文字', docsUrl: 'https://console.groq.com/docs/speech-to-text', keyUrl: 'https://console.groq.com/keys' },
  { id: 'eleven-flash', apiModel: 'eleven_flash_v2_5', name: 'Eleven Flash v2.5', provider: 'ElevenLabs', providerId: 'elevenlabs', category: 'audio', pricing: 'free-quota', quota: '新账户含约 10,000 免费 credits，生成会扣减 credits', quotaLookup: 'Developers Analytics 可查看精确用量', integration: 'ready', description: '低延迟文字转语音', docsUrl: 'https://elevenlabs.io/docs/api-reference/introduction', keyUrl: 'https://elevenlabs.io/app/settings/api-keys' },

  { id: 'jina-embed-v3', apiModel: 'jina-embeddings-v3', name: 'Jina Embeddings v3', provider: 'Jina AI', providerId: 'jina', category: 'embedding', pricing: 'free-quota', quota: '新 API Key 含 1,000 万免费 tokens', quotaLookup: 'Jina API Dashboard 查看', integration: 'catalog', description: '多语言文本向量', docsUrl: 'https://jina.ai/embeddings/', keyUrl: 'https://jina.ai/api-dashboard/' },
  { id: 'cohere-embed-v4', apiModel: 'embed-v4.0', name: 'Embed v4.0', provider: 'Cohere', providerId: 'cohere', category: 'embedding', pricing: 'free-quota', quota: 'Trial Key 免费但限流，通常每月最多 1,000 次 API 调用', quotaLookup: 'Cohere Dashboard 查看', integration: 'catalog', description: '文本与多模态向量', docsUrl: 'https://docs.cohere.com/', keyUrl: 'https://dashboard.cohere.com/api-keys' },
  { id: 'sf-bge-m3', apiModel: 'BAAI/bge-m3', name: 'BGE-M3', provider: 'SiliconFlow', providerId: 'siliconflow', category: 'embedding', pricing: 'variable', quota: '免费或付费状态以模型页实时标记为准', quotaLookup: '控制台模型页/账单查看', integration: 'catalog', description: '多语言多功能 Embedding', docsUrl: 'https://docs.siliconflow.cn/', keyUrl: 'https://cloud.siliconflow.cn/account/ak' },
  { id: 'cf-bge-m3', apiModel: '@cf/baai/bge-m3', name: 'BGE-M3', provider: 'Cloudflare Workers AI', providerId: 'cloudflare', category: 'embedding', pricing: 'free-quota', quota: '每天共享 10,000 Neurons 免费额度', quotaLookup: 'Workers AI Dashboard 查看', integration: 'catalog', description: 'Cloudflare 托管向量模型', docsUrl: 'https://developers.cloudflare.com/workers-ai/models/', keyUrl: 'https://dash.cloudflare.com/' },
  { id: 'jina-reranker-v3', apiModel: 'jina-reranker-v3', name: 'Jina Reranker v3', provider: 'Jina AI', providerId: 'jina', category: 'reranker', pricing: 'free-quota', quota: '与 Embedding 共享新 Key 的 1,000 万免费 tokens', quotaLookup: 'Jina API Dashboard 查看', integration: 'catalog', description: '多语言长上下文重排', docsUrl: 'https://jina.ai/reranker/', keyUrl: 'https://jina.ai/api-dashboard/' },
  { id: 'cohere-rerank', apiModel: 'rerank-v3.5', name: 'Rerank 3.5', provider: 'Cohere', providerId: 'cohere', category: 'reranker', pricing: 'free-quota', quota: 'Trial Key 免费，Rerank 通常 10 RPM', quotaLookup: 'Cohere Dashboard 查看', integration: 'catalog', description: '语义搜索结果重排', docsUrl: 'https://docs.cohere.com/', keyUrl: 'https://dashboard.cohere.com/api-keys' },

  { id: 'seed3d', apiModel: 'doubao-seed3d-2-0-260328', name: 'Seed3D 2.0', provider: '火山方舟', providerId: 'ark', category: '3d', pricing: 'paid', quota: '按量计费', quotaLookup: '方舟费用中心查看', integration: 'ready', description: '图片转 3D', docsUrl: 'https://www.volcengine.com/docs/82379', keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey' },
]
