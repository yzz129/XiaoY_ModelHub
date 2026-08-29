const SKILLS = {
  'moodboard-alignment': {
    name: '情绪板对齐',
    stages: ['moodboard'],
    instruction: `把需求整理为可执行的文字情绪板。保留项目目标、受众、媒介、画幅、视觉关键词、禁用方向与验收标准。用户明确要求自动完成全流程时，视为允许直接生成，不停在 CK1/CK2；否则最多提出 3 个关键问题并设置确认门。不得在这一阶段生成图片。`,
    review: '检查目标、受众、画幅、风格、禁用项、验收标准是否明确，且没有越界生成图片。',
  },
  'script-writing-studio': {
    name: '剧本创作工作室',
    stages: ['script', 'storyboard', 'editing'],
    instruction: `按项目状态推进剧本生产。script 阶段输出主题、人物、场次、节拍、对白与可拍摄正文；storyboard 阶段输出编号镜头、景别、机位、动作、对白/声音、时长和连续性；editing 阶段输出可执行的剪辑决定表、镜头顺序、入出点、声音、字幕与质检清单。不要把不同阶段混成一个不可追踪的大文本。`,
    review: '检查叙事闭环、人物动机、场次推进、对白可演性、镜头连续性以及交付结构。',
  },
  'ren-she-she-ji': {
    name: '人设设计',
    stages: ['character'],
    instruction: `只输出角色设计与可复现的图像提示词，不直接调用生图。锁定不可变 DNA（年龄感、脸型、五官、发型、体型、服装与标志物），给出正面/侧面/背面、表情、姿态、材质和负面词。默认采用项目画幅；真人角色优先角色设定板。`,
    review: '检查角色 DNA 是否具体、跨镜头可复现、只有一个主风格模块，并包含负面词与一致性约束。',
  },
  'scene-concept-art-director': {
    name: '场景美术导演',
    stages: ['scene', 'image'],
    instruction: `建立场景命题、戏剧张力、空间结构、年代与材质、色彩与光线、摄影机方向，并输出场景概念图提示词、负面词和修复策略。场景必须服务剧情和人物，不只堆砌形容词。`,
    review: '检查空间可拍性、叙事功能、材质/年代一致性、光色逻辑、镜头方向和负面约束。',
  },
  'video-prompt-workflow-v2': {
    name: 'Seedance 视频提示词工作流 V2',
    stages: ['video'],
    instruction: `把分镜和资产映射为短视频生成提示词。每组不超过 15 秒、1800 字；使用明确的资产引用；包含画面、镜头、运镜、动作、台词、光线六个字段，并以“约束：有音效，无音乐，无字幕。”收尾。全局风格只声明一次，角色声音需要固定定义。`,
    review: '检查时长和字数上限、六字段、固定约束、资产映射、动作连续性、声音定义与可生成性。',
  },
}

export function skillsForStage(stage) {
  return Object.entries(SKILLS)
    .filter(([, skill]) => skill.stages.includes(stage))
    .map(([id, skill]) => ({ id, ...skill }))
}

export function injectedSkillPrompt(stage) {
  const selected = skillsForStage(stage)
  if (!selected.length) return ''
  return selected.map((skill) => `【Skill: ${skill.id} / ${skill.name}】\n执行规则：${skill.instruction}\n自审重点：${skill.review}`).join('\n\n')
}

export function publicSkillRegistry() {
  return Object.entries(SKILLS).map(([id, skill]) => ({ id, name: skill.name, stages: skill.stages }))
}
