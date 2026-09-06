function embeddingData(result) {
  const value = result?.data?.[0]?.embedding || result?.data?.[0] || result?.data || result?.embeddings?.[0]
  return Array.isArray(value) && value.length >= 8 && value.every(Number.isFinite) ? value : null
}

export async function createMemoryEmbedding(env, content) {
  if (!env?.AI?.run || !String(content || '').trim()) return null
  try {
    const result = await env.AI.run(env.AGENT_EMBEDDING_MODEL || '@cf/baai/bge-m3', { text: [String(content).slice(0, 4_000)] })
    return embeddingData(result)
  } catch {
    return null
  }
}

export function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || !left.length) return 0
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < left.length; index += 1) {
    const a = Number(left[index]) || 0
    const b = Number(right[index]) || 0
    dot += a * b
    leftNorm += a * a
    rightNorm += b * b
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0
}
