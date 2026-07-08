import { useState } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { setCachedProfile } from '../lib/profile-cache'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [banner, setBanner] = useState((location.state as { message?: string } | null)?.message ?? '')
  const [emailErr, setEmailErr] = useState('')
  const [pwdErr, setPwdErr] = useState('')

  const validate = () => {
    let ok = true
    if (!email.trim()) { setEmailErr('请输入邮箱'); ok = false }
    else if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { setEmailErr('请输入有效邮箱'); ok = false }
    else setEmailErr('')
    if (!password) { setPwdErr('请输入密码'); ok = false }
    else setPwdErr('')
    return ok
  }

  const submit = async () => {
    if (!validate()) return
    setLoading(true)
    setBanner('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        const profileRes = await fetch('/api/profile', { credentials: 'include' })
        if (profileRes.ok) {
          const profile = await profileRes.json()
          setCachedProfile(profile)
          navigate(profile.onboarded ? '/inbox' : '/onboarding')
        } else {
          navigate('/onboarding')
        }
      } else {
        setBanner(data.error || '邮箱或密码错误，请重试')
        setPassword('')
      }
    } catch {
      setBanner('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="auth-title">竞品情报监控代理</h1>
        <p className="auth-sub">登录您的账号，获取个性化情报</p>
        {banner && <div className="banner banner-error">{banner}</div>}
        <div className="field">
          <label>邮箱</label>
          <input className={emailErr ? 'error' : ''} type="email" placeholder="your@email.com" value={email}
            onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
          {emailErr && <div className="field-error">{emailErr}</div>}
        </div>
        <div className="field">
          <label>密码</label>
          <input className={pwdErr ? 'error' : ''} type="password" placeholder="••••••••" value={password}
            onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
          {pwdErr && <div className="field-error">{pwdErr}</div>}
        </div>
        <button className="btn btn-primary btn-full" onClick={submit} disabled={loading}>
          {loading ? '登录中…' : '登录'}
        </button>
        <div className="auth-footer">还没有账号？ <Link to="/register">立即注册</Link></div>
      </div>
    </div>
  )
}
