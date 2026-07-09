import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BUILTIN_ROLES,
  defaultEmailSettings,
  fetchProfile,
  generateApiKey,
  getAllRoles,
  getRoleDefaultWeights,
  revokeApiKey,
  saveProfile,
  sendTestEmail,
  type CustomRole,
  type EmailSettings,
  type InfoLabel,
  type Role,
} from '../lib/constants'
import { Layout, Toast } from '../components/Layout'
import { WeightModal } from '../components/inbox-ui'

type Tab = 'role' | 'email' | 'api'

function buildWeightsMap(role: Role | null, weights: Record<InfoLabel, number>, customRoles: CustomRole[]) {
  const map: Record<string, Record<InfoLabel, number>> = {}
  for (const r of BUILTIN_ROLES) map[r] = getRoleDefaultWeights(r)
  for (const cr of customRoles) map[cr.name] = { ...cr.weights }
  if (role) map[role] = { ...weights }
  return map
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('role')
  const [userEmail, setUserEmail] = useState('')
  const [role, setRole] = useState<Role | null>(null)
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([])
  const [weightsByRole, setWeightsByRole] = useState<Record<string, Record<InfoLabel, number>>>({})
  const [email, setEmail] = useState<EmailSettings>(defaultEmailSettings())
  const [newRoleName, setNewRoleName] = useState('')
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [banner, setBanner] = useState('')
  const [toast, setToast] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [weightModalRole, setWeightModalRole] = useState<Role | null>(null)
  const [editWeights, setEditWeights] = useState<Record<InfoLabel, number>>(getRoleDefaultWeights('产品经理'))
  const [weightError, setWeightError] = useState('')
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [apiKeyGenerating, setApiKeyGenerating] = useState(false)
  const [apiKeyCopied, setApiKeyCopied] = useState(false)

  useEffect(() => {
    fetchProfile().then(p => {
      if (!p) return
      setUserEmail(p.email ?? '')
      setRole(p.role)
      setCustomRoles(p.customRoles ?? [])
      setWeightsByRole(buildWeightsMap(p.role, p.weights, p.customRoles ?? []))
      const es = p.emailSettings ?? defaultEmailSettings()
      setEmail({
        ...es,
        recipientEmails: es.recipientEmails?.length ? [...es.recipientEmails] : [p.email ?? ''],
      })
      setApiKey(p.apiKey ?? null)
    }).finally(() => setPageLoading(false))
  }, [])

  const allRoles = getAllRoles(customRoles)

  const openWeightModal = (r: Role) => {
    setRole(r)
    setEditWeights({ ...(weightsByRole[r] ?? getRoleDefaultWeights(r)) })
    setWeightError('')
    setWeightModalRole(r)
  }

  const saveWeightModal = () => {
    if (!weightModalRole) return
    if (!Object.values(editWeights).some(v => v > 0)) {
      setWeightError('至少一个标签权重需 > 0')
      return
    }
    setWeightsByRole(prev => ({ ...prev, [weightModalRole]: { ...editWeights } }))
    setWeightModalRole(null)
    setToast('权重已更新，保存设置后生效')
  }

  const handleAddRole = () => {
    const trimmed = newRoleName.trim()
    if (!trimmed) { setErrors({ customRole: '请输入角色名称' }); return }
    if (allRoles.includes(trimmed)) { setErrors({ customRole: '该角色已存在' }); return }
    const weights = getRoleDefaultWeights('产品经理')
    setCustomRoles(prev => [...prev, { name: trimmed, weights }])
    setWeightsByRole(prev => ({ ...prev, [trimmed]: weights }))
    setNewRoleName('')
    setErrors({})
    setToast('自定义角色已添加，保存设置后生效')
  }

  const handleGenerateApiKey = async () => {
    setApiKeyGenerating(true)
    setBanner('')
    try {
      const res = await generateApiKey()
      if (res.ok && res.apiKey) {
        setApiKey(res.apiKey)
        setToast('API Key 已生成')
      } else {
        setBanner(res.error || '生成失败')
      }
    } finally {
      setApiKeyGenerating(false)
    }
  }

  const handleRevokeApiKey = async () => {
    if (!window.confirm('确认撤销 API Key？撤销后所有使用该 Key 的应用将立即失效。')) return
    setBanner('')
    try {
      const res = await revokeApiKey()
      if (res.ok) {
        setApiKey(null)
        setToast('API Key 已撤销')
      } else {
        setBanner(res.error || '撤销失败')
      }
    } catch {
      setBanner('撤销失败，请重试')
    }
  }

  const handleCopyApiKey = async () => {
    if (!apiKey) return
    await navigator.clipboard.writeText(apiKey)
    setApiKeyCopied(true)
    setTimeout(() => setApiKeyCopied(false), 2000)
  }

  const handleTestEmail = async () => {
    setBanner('')
    setTesting(true)
    try {
      const res = await sendTestEmail()
      if (res.ok) setToast(`今日情报已发送至 ${(res.to ?? []).join('、') || '收件邮箱'}，请查收`)
      else setBanner(res.error || '发送失败')
    } finally {
      setTesting(false)
    }
  }

  const updateEmailAt = (idx: number, val: string) => {
    setEmail(p => {
      const list = [...p.recipientEmails]
      list[idx] = val
      return { ...p, recipientEmails: list }
    })
  }

  const saveCurrent = async () => {
    setErrors({})
    setBanner('')
    setLoading(true)
    try {
      if (tab === 'role') {
        if (!role) { setErrors({ role: '请选择角色' }); return }
        const w = weightsByRole[role] ?? getRoleDefaultWeights(role)
        if (!Object.values(w).some(v => v > 0)) {
          setErrors({ role: '该角色权重无效，请点击角色调整' })
          return
        }
        const updatedCustom = customRoles.map(cr => ({
          name: cr.name,
          weights: weightsByRole[cr.name] ?? cr.weights,
        }))
        const res = await saveProfile({ role, weights: w, customRoles: updatedCustom, onboarded: true })
        if (!res.ok) setBanner(res.error || '保存失败')
        else setToast('角色与权重已保存')
      } else {
        const w = role
          ? (weightsByRole[role] ?? getRoleDefaultWeights(role))
          : getRoleDefaultWeights('产品经理')
        const res = await saveProfile({
          role: role ?? '产品经理',
          weights: w,
          customRoles: customRoles.map(cr => ({
            name: cr.name,
            weights: weightsByRole[cr.name] ?? cr.weights,
          })),
          emailSettings: email,
          onboarded: true,
        })
        if (!res.ok) setBanner(res.error || '保存失败')
        else setToast('邮件通知设置已保存')
      }
    } finally {
      setLoading(false)
    }
  }

  if (pageLoading) {
    return (
      <Layout userEmail={userEmail}>
        <div className="page"><div className="settings-card">加载中…</div></div>
      </Layout>
    )
  }

  return (
    <Layout userEmail={userEmail}>
      <div className="page">
        <div className="page-header">
          <div>
            <span className="eyebrow">偏好配置</span>
            <h1 className="page-title">设置</h1>
          </div>
        </div>

        <div className="settings-tabs view-tabs">
          <button className={'view-tab' + (tab === 'role' ? ' active' : '')} onClick={() => setTab('role')}>角色与权重</button>
          <button className={'view-tab' + (tab === 'email' ? ' active' : '')} onClick={() => setTab('email')}>邮件通知</button>
          <button className={'view-tab' + (tab === 'api' ? ' active' : '')} onClick={() => setTab('api')}>API 访问</button>
        </div>

        <div className="settings-card">
          {banner && <div className="banner banner-error">{banner}</div>}

          {tab === 'role' && (
            <>
              <h3 className="settings-section-title">我的角色</h3>
              <p className="settings-section-desc">点击角色即可选择并设置该角色的信息标签权重</p>
              <div className="role-list">
                {allRoles.map(r => (
                  <button
                    key={r}
                    type="button"
                    className={'role-item role-item--button' + (role === r ? ' selected' : '')}
                    onClick={() => openWeightModal(r)}
                  >
                    <span className="role-item-radio" aria-hidden />
                    <span className="role-item-label">{r}</span>
                    <span className="role-item-weight-hint">设置权重</span>
                  </button>
                ))}
              </div>
              {errors.role && <div className="field-error mt-8">{errors.role}</div>}

              <div className="custom-role-row">
                <input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="自定义角色名称" />
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddRole}>添加角色</button>
              </div>
              {errors.customRole && <div className="field-error">{errors.customRole}</div>}

              {role && (
                <div className="role-defaults-preview">
                  <h4 className="brief-block-label">{role} · 当前权重</h4>
                  <div className="role-defaults-grid">
                    {Object.entries(weightsByRole[role] ?? getRoleDefaultWeights(role)).map(([label, val]) => (
                      <span key={label} className="tag">{label} · {val}</span>
                    ))}
                  </div>
                  <button type="button" className="link-btn mt-8" onClick={() => openWeightModal(role)}>调整权重</button>
                </div>
              )}
            </>
          )}

          {tab === 'email' && (
            <>
              <h3 className="settings-section-title">邮件通知设置</h3>
              <p className="settings-section-desc mb-20">可配置多个推送邮箱</p>

              <div className="toggle-row mb-20">
                <span className="toggle-info">开启邮件推送</span>
                <label className="toggle">
                  <input type="checkbox" checked={email.enabled} onChange={e => setEmail(p => ({ ...p, enabled: e.target.checked }))} />
                  <span className="toggle-track" />
                </label>
              </div>

              <div className="field">
                <label>推送邮箱</label>
                {email.recipientEmails.map((em, idx) => (
                  <div key={idx} className="email-row">
                    <input type="email" value={em} onChange={e => updateEmailAt(idx, e.target.value)}
                      placeholder="name@company.com" disabled={!email.enabled} />
                    {email.recipientEmails.length > 1 && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEmail(p => ({
                        ...p, recipientEmails: p.recipientEmails.filter((_, i) => i !== idx),
                      }))} disabled={!email.enabled}>删除</button>
                    )}
                  </div>
                ))}
                <button type="button" className="btn btn-ghost btn-sm mt-8"
                  onClick={() => setEmail(p => ({ ...p, recipientEmails: [...p.recipientEmails, ''] }))}
                  disabled={!email.enabled}>+ 添加邮箱</button>
              </div>

              <div className="field">
                <label>推送时间</label>
                <select value={email.pushTime} onChange={e => setEmail(p => ({ ...p, pushTime: e.target.value }))} disabled={!email.enabled}>
                  <option value="09:00">每日 09:00 摘要</option>
                  <option value="12:00">每日 12:00 摘要</option>
                  <option value="18:00">每日 18:00 摘要</option>
                  <option value="immediate">全部即时推送（每条单独发）</option>
                </select>
                <p className="settings-section-desc mt-8">
                  选择每日摘要时段时，<strong>紧急情报仍会即时推送</strong>，其余情报在所选时间汇总成一封发送。
                </p>
              </div>

              <div className="field">
                <label>推送内容</label>
                <div className="settings-checklist">
                  {([
                    ['includeTitle', '情报标题'],
                    ['includeSummary', '变化摘要'],
                    ['includeAction', '行动建议'],
                    ['includeLink', '详情页链接'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="settings-check-item">
                      <input type="checkbox" checked={email.pushContent[key]}
                        onChange={e => setEmail(p => ({ ...p, pushContent: { ...p.pushContent, [key]: e.target.checked } }))}
                        disabled={!email.enabled} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>立即发送情报</label>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleTestEmail}
                  disabled={testing || !email.enabled}>
                  {testing ? '发送中…' : '发送今日情报'}
                </button>
                <p className="settings-section-desc mt-8">
                  立即将今日真实情报（过去 25 小时内，按优先级排序）发送至收件邮箱。
                </p>
              </div>
            </>
          )}

          {tab === 'api' && (
            <>
              <h3 className="settings-section-title">API 访问</h3>
              <p className="settings-section-desc mb-20">
                使用 API Key 从外部系统读取你的竞品情报数据。API Key 仅显示一次，请妥善保存。
              </p>

              {apiKey ? (
                <div className="field">
                  <label>当前 API Key</label>
                  <div className="api-key-row">
                    <code className="api-key-display">{apiKey}</code>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopyApiKey}>
                      {apiKeyCopied ? '已复制 ✓' : '复制'}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={handleRevokeApiKey}>撤销</button>
                  </div>
                  <p className="settings-section-desc mt-8">
                    调用示例：<code style={{fontSize:'12px', background:'var(--bg-card)', padding:'2px 6px', borderRadius:'4px', userSelect:'all'}}>
                      curl "https://signal-desk-sepia.vercel.app/api/v1/changes?format=digest" -H "Authorization: Bearer {apiKey}"
                    </code>
                  </p>
                </div>
              ) : (
                <div className="field">
                  <label>尚未生成 API Key</label>
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleGenerateApiKey} disabled={apiKeyGenerating}>
                    {apiKeyGenerating ? '生成中…' : '生成 API Key'}
                  </button>
                  <p className="settings-section-desc mt-8">
                    生成后可通过 <code>Authorization: Bearer &lt;key&gt;</code> 调用情报 API。
                  </p>
                </div>
              )}

              <div className="field mt-20">
                <label>接口地址</label>
                <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
                  <code className="api-key-display" style={{fontSize:'12px'}}>
                    GET https://signal-desk-sepia.vercel.app/api/v1/changes?format=digest
                  </code>
                  <p className="settings-section-desc">
                    返回：[&#123; competitor, change&#123;summary, before, after&#125;, intent[&#123;role, action&#125;] &#125;]
                  </p>
                </div>
              </div>
            </>
          )}

          <div className="settings-footer">
            <button className="btn btn-secondary" onClick={() => navigate('/inbox')}>返回</button>
            {tab !== 'api' && (
              <button className="btn btn-primary" onClick={saveCurrent} disabled={loading}>
                {loading ? '保存中…' : '保存设置'}
              </button>
            )}
          </div>
        </div>
      </div>

      {weightModalRole && (
        <WeightModal
          role={weightModalRole}
          weights={editWeights}
          onChange={setEditWeights}
          onSave={saveWeightModal}
          onClose={() => setWeightModalRole(null)}
          error={weightError}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </Layout>
  )
}
