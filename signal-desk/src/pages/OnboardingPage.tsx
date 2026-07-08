import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRoleDefaultWeights, type Role } from '../lib/constants'
import { RoleSelector } from '../components/RoleSelector'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [role, setRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(false)
  const [banner, setBanner] = useState('')
  const [roleErr, setRoleErr] = useState('')

  const submit = async () => {
    setRoleErr('')
    if (!role) { setRoleErr('请选择角色'); return }
    setLoading(true)
    setBanner('')
    try {
      const weights = getRoleDefaultWeights(role)
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role, weights, onboarded: true }),
      })
      const data = await res.json()
      if (res.ok && data.ok) navigate('/targets')
      else setBanner(data.error || '保存失败，请稍后重试')
    } catch {
      setBanner('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const preview = role ? getRoleDefaultWeights(role) : null

  return (
    <div className="auth-wrap" style={{ alignItems: 'flex-start', paddingTop: 48 }}>
      <div className="onboarding-card">
        <h2 className="auth-title">第一步：告诉我们你的角色</h2>
        <p className="auth-sub">系统将根据角色自动配置信息权重，进入 Inbox 后可微调</p>
        {banner && <div className="banner banner-error">{banner}</div>}

        <div className="field">
          <label>我的角色（单选，必填）</label>
          <RoleSelector value={role} onChange={setRole} />
          {roleErr && <div className="field-error mt-8">{roleErr}</div>}
        </div>

        {preview && (
          <div className="role-defaults-preview mb-20">
            <h4 className="brief-block-label">将为你配置以下信息权重</h4>
            <div className="role-defaults-grid">
              {Object.entries(preview).map(([label, val]) => (
                <span key={label} className="tag">{label} · {val}</span>
              ))}
            </div>
          </div>
        )}

        <button className="btn btn-primary btn-full" onClick={submit} disabled={loading}>
          {loading ? '保存中…' : '开始监控竞品（进入下一步）'}
        </button>
      </div>
    </div>
  )
}
