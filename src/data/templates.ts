import type { StyleTemplate } from '../types/generation'

export const styleTemplates: StyleTemplate[] = [
  {
    id: 'cinema',
    name: '电影叙事',
    eyebrow: 'CINEMATIC',
    description: '克制的电影色彩与故事感光影',
    gradient: 'linear-gradient(135deg, #243a44, #b67c58 52%, #111a1d)',
    prompt: '电影叙事美学，35mm 胶片质感，克制的青橙色彩，戏剧性自然光，精心构图，统一的视觉世界观',
    tags: ['35mm', '电影光', '叙事感'],
  },
  {
    id: 'oriental',
    name: '东方幻境',
    eyebrow: 'ORIENTAL',
    description: '东方留白、雾气与含蓄色彩',
    gradient: 'linear-gradient(145deg, #17352e, #76917d 40%, #d8b98f 68%, #303c38)',
    prompt: '当代东方幻想，山水留白，薄雾，温润玉石色调，细腻工笔细节，含蓄诗意，统一角色设计',
    tags: ['东方', '雾气', '诗意'],
  },
  {
    id: 'editorial',
    name: '时尚刊物',
    eyebrow: 'EDITORIAL',
    description: '大胆构图与高级杂志质感',
    gradient: 'linear-gradient(135deg, #6f2436, #d98a64 52%, #efe0c4)',
    prompt: '高端时尚杂志大片，雕塑感姿态，大胆留白，精准棚拍布光，细腻肌理，克制奢华，统一艺术指导',
    tags: ['时尚', '棚拍', '杂志'],
  },
  {
    id: 'future',
    name: '未来静谧',
    eyebrow: 'FUTURE',
    description: '冷静、极简的近未来世界',
    gradient: 'linear-gradient(145deg, #192335, #356a7b 45%, #79d5bd 72%, #101317)',
    prompt: '静谧近未来美学，极简建筑，雾面金属与半透明材质，青绿色环境光，宁静宏大尺度，统一科技语言',
    tags: ['未来', '极简', '青绿'],
  },
]
