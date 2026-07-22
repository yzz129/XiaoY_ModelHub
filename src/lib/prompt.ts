import type { GenerationSettings, StyleTemplate } from '../types/generation'

export function compilePrompt(settings: GenerationSettings, template?: StyleTemplate) {
  const parts = [settings.prompt.trim()]
  if (template) parts.push(template.prompt)
  if (settings.kind === 'video') {
    parts.push('镜头运动自然流畅，主体与场景风格保持稳定，画面连续且无突变')
  }
  parts.push(`画面比例 ${settings.ratio}，${settings.resolution} 输出`)
  return parts.filter(Boolean).join('。')
}
