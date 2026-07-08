import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [banner, setBanner] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const strength = (p: string) => p.length === 0 ? '' : p.length < 6 ? '弱' : p.length < 10 ? '中' : '强'
  const strColor = (p: string) => p.length < 6 ? 'var(--danger)' : p.length < 10 ? 'var(--warning)' : 'var(--success)'

  const validate = () => {
    const e: Record<string, string> = {}
    if (!email.trim()) e.email = '请输入邮箱'
    else if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) e.email = '请输入有效邮箱'
    if (!password) e.password = '请输入密码'
    else if (password.length < 6) e.password = '密码至少 6 位'
    if (!confirm) e.confirm = '请确认密码'
    else if (confirm !== password) e.confirm = '两次密码不一致'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setLoading(true)
    setBanner('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, confirm }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        navigate('/onboarding')
      } else {
        setBanner(data.error || '注册失败，请稍后重试')
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
        <h1 className="auth-title">创建账号</h1>
        <p className="auth-sub">开始监控竞品，获取 AI 个性化情报</p>
        {banner && <div className="banner banner-error">{banner}</div>}
        <div className="field">
          <label>邮箱</label>
          <input className={errors.email ? 'error' : ''} type="email" placeholder="your@email.com" value={email}
            onChange={e => setEmail(e.target.value)} />
          {errors.email && <div className="field-error">{errors.email}</div>}
        </div>
        <div className="field">
          <label>密码</label>
          <input className={errors.password ? 'error' : ''} type="password" placeholder="至少 6 位" value={password}
            onChange={e => setPassword(e.target.value)} />
          {password && <div style={{ fontSize: 12, marginTop: 4, color: strColor(password) }}>密码强度：{strength(password)}</div>}
          {errors.password && <div className="field-error">{errors.password}</div>}
        </div>
        <div className="field">
          <label>确认密码</label>
          <input className={errors.confirm ? 'error' : ''} type="password" placeholder="再次输入密码" value={confirm}
            onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
          {errors.confirm && <div className="field-error">{errors.confirm}</div>}
        </div>
        <button className="btn btn-primary btn-full" onClick={submit} disabled={loading}>
          {loading ? '注册中…' : '注册'}
        </button>
        <div className="auth-footer">已有账号？ <Link to="/login">去登录</Link></div>
      </div>
    </div>
  )
}
