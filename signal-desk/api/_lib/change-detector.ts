import { diffLines } from 'diff'

export interface ChangeCandidate {
  before: string
  after: string
  type: 'added' | 'removed' | 'modified'
}

const NOISE_LINE = /^[\d\s:./\-–—,，。、|]+$/

function isNoiseLine(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (t.length < 2) return true
  if (NOISE_LINE.test(t)) return true
  return false
}

function normalizeBlock(text: string): string {
  return text.split('\n').map(l => l.trim()).filter(Boolean).join('\n')
}

/** 两层去噪第 1 层：可见文本 diff，过滤纯格式/空白/数字噪音 */
export function detectChanges(prevText: string, currText: string): ChangeCandidate[] {
  const changes = diffLines(normalizeBlock(prevText), normalizeBlock(currText))
  const candidates: ChangeCandidate[] = []
  let pendingRemoved = ''

  for (const part of changes) {
    const value = part.value.trim()
    if (!value) continue

    if (part.removed) {
      pendingRemoved = value
      continue
    }

    if (part.added) {
      if (pendingRemoved) {
        if (!isNoiseLine(pendingRemoved) || !isNoiseLine(value)) {
          if (pendingRemoved !== value) {
            candidates.push({ before: pendingRemoved, after: value, type: 'modified' })
          }
        }
        pendingRemoved = ''
      } else if (!isNoiseLine(value)) {
        candidates.push({ before: '', after: value, type: 'added' })
      }
      continue
    }

    pendingRemoved = ''
  }

  if (pendingRemoved && !isNoiseLine(pendingRemoved)) {
    candidates.push({ before: pendingRemoved, after: '', type: 'removed' })
  }

  return candidates.filter(c => {
    const meaningful = (c.before + c.after).replace(/\s/g, '').length >= 4
    return meaningful
  })
}

/** 判断候选是否有业务意义（非纯样式噪音） */
export function hasMeaningfulChanges(candidates: ChangeCandidate[]): boolean {
  return candidates.some(c => c.type === 'added' || c.type === 'modified')
}
