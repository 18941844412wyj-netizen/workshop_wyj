/** 将 DB / postgres.js 返回的 JSONB 规范为对象（兼容曾被 JSON.stringify 双重编码的存量数据） */
export function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value === 'string') {
    try {
      return parseJsonField(JSON.parse(value), fallback)
    } catch {
      return fallback
    }
  }
  if (typeof value === 'object') return value as T
  return fallback
}
