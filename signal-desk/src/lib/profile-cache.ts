import type { UserProfile } from './constants'
import { fetchProfile as fetchProfileApi } from './constants'

let cached: UserProfile | null | undefined

export function getCachedProfile(): UserProfile | null | undefined {
  return cached
}

export function setCachedProfile(profile: UserProfile | null) {
  cached = profile
}

export function invalidateProfileCache() {
  cached = undefined
}

/** 带内存缓存的 profile 读取，避免路由切换时重复全屏 loading */
export async function fetchProfileCached(): Promise<UserProfile | null> {
  if (cached !== undefined) return cached
  const profile = await fetchProfileApi()
  cached = profile
  return profile
}
