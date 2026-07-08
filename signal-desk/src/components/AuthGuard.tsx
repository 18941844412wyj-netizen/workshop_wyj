import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { fetchProfileCached, getCachedProfile } from '../lib/profile-cache'

type GuardState = 'loading' | 'guest' | 'needs-onboarding' | 'authed'

function resolveGuardState(
  profile: Awaited<ReturnType<typeof fetchProfileCached>>,
  requireOnboarded: boolean,
): GuardState {
  if (!profile) return 'guest'
  if (requireOnboarded && !profile.onboarded) return 'needs-onboarding'
  return 'authed'
}

export function RequireAuth({
  children,
  requireOnboarded = true,
}: {
  children: React.ReactNode
  requireOnboarded?: boolean
}) {
  const location = useLocation()
  const cached = getCachedProfile()
  const [state, setState] = useState<GuardState>(() => {
    if (cached !== undefined) return resolveGuardState(cached, requireOnboarded)
    return 'loading'
  })

  useEffect(() => {
    const cachedNow = getCachedProfile()
    if (cachedNow !== undefined) {
      setState(resolveGuardState(cachedNow, requireOnboarded))
      return
    }
    let cancelled = false
    fetchProfileCached()
      .then(p => {
        if (!cancelled) setState(resolveGuardState(p, requireOnboarded))
      })
      .catch(() => {
        if (!cancelled) setState('guest')
      })
    return () => { cancelled = true }
  }, [requireOnboarded, location.pathname])

  if (state === 'loading') {
    return <div className="auth-wrap"><div className="auth-card">加载中…</div></div>
  }
  if (state === 'guest') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (state === 'needs-onboarding') return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const cached = getCachedProfile()
  const [state, setState] = useState<'loading' | 'guest' | 'onboarded' | 'pending'>(() => {
    if (cached !== undefined) {
      if (!cached) return 'guest'
      if (cached.onboarded) return 'onboarded'
      return 'pending'
    }
    return 'loading'
  })

  useEffect(() => {
    const cachedNow = getCachedProfile()
    if (cachedNow !== undefined) {
      if (!cachedNow) setState('guest')
      else if (cachedNow.onboarded) setState('onboarded')
      else setState('pending')
      return
    }
    let cancelled = false
    fetchProfileCached()
      .then(p => {
        if (cancelled) return
        if (!p) setState('guest')
        else if (p.onboarded) setState('onboarded')
        else setState('pending')
      })
      .catch(() => {
        if (!cancelled) setState('guest')
      })
    return () => { cancelled = true }
  }, [])

  if (state === 'loading') {
    return <div className="auth-wrap"><div className="auth-card">加载中…</div></div>
  }
  if (state === 'guest') return <Navigate to="/login" replace />
  if (state === 'onboarded') return <Navigate to="/inbox" replace />
  return <>{children}</>
}
