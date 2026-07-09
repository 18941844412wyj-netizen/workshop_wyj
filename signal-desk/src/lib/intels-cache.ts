import type { Intel } from './types'

let cached: Intel[] | undefined

export function getCachedIntels(): Intel[] | undefined {
  return cached
}

export function setCachedIntels(list: Intel[]) {
  cached = list
}

export function invalidateIntelsCache() {
  cached = undefined
}
