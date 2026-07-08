import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { fetchProfile } from '../lib/constants'

type GuardState = 'loading' | 'guest' | 'needs-onboarding' | 'authed'

export function RequireAuth({
  children,
  requireOnboarded = true,
}: {
  children: React.ReactNode
  requireOnboarded?: boolean
}) {
  const location = useLocation()
  const [state, setState] = useState<GuardState>('loading')

  useEffect(() => {
    fetchProfile()
      .then(p => {
        if (!p) setState('guest')
        else if (requireOnboarded && !p.onboarded) setState('needs-onboarding')
        else setState('authed')
      })
      .catch(() => setState('guest'))
  }, [requireOnboarded, location.pathname])

  if (state === 'loading') {
    return <div className="auth-wrap"><div className="auth-card">加载中…</div></div>
  }
  if (state === 'guest') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (state === 'needs-onboarding') return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'guest' | 'onboarded' | 'pending'>('loading')

  useEffect(() => {
    fetchProfile()
      .then(p => {
        if (!p) setState('guest')
        else if (p.onboarded) setState('onboarded')
        else setState('pending')
      })
      .catch(() => setState('guest'))
  }, [])

  if (state === 'loading') {
    return <div className="auth-wrap"><div className="auth-card">加载中…</div></div>
  }
  if (state === 'guest') return <Navigate to="/login" replace />
  if (state === 'onboarded') return <Navigate to="/inbox" replace />
  return <>{children}</>
}
