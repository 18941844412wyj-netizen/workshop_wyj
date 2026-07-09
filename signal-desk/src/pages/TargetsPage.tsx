import { useEffect, useState } from 'react'
import type { CollectMode, Target, Track } from '../lib/constants'
import { Layout, Toast, ConfirmModal } from '../components/Layout'
import { fetchProfileCached } from '../lib/profile-cache'

interface TargetStats {
  targetId: string
  targetName: string
  total: number
  valuable: number
  noise: number
  noiseTypes: { type: string; count: number }[]
}

function StatsModal({ target, onClose }: { target: Target; onClose: () => void }) {
  const [stats, setStats] = useState<TargetStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/targets/${target.id}?stats=true`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => { setStats(data); setLoading(false) })
      .catch(() => { setError('加载失败，请重试'); setLoading(false) })
  }, [target.id])

  const valuableRate = stats && stats.total > 0
    ? Math.round((stats.valuable / stats.total) * 100)
    : 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ minWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>监控详情 · {target.name}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {loading && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>加载中…</div>}
          {error && <div className="banner banner-error">{error}</div>}
          {stats && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div style={statCardStyle('#f0f4ff')}>
                  <div style={statNumStyle}>{stats.total}</div>
                  <div style={statLabelStyle}>已监控总数</div>
                </div>
                <div style={statCardStyle('#f0fff4')}>
                  <div style={statNumStyle}>{stats.valuable}</div>
                  <div style={statLabelStyle}>有价值信息</div>
                </div>
                <div style={statCardStyle('#fff5f5')}>
                  <div style={statNumStyle}>{stats.noise}</div>
                  <div style={statLabelStyle}>无价值信息</div>
                </div>
              </div>

              {stats.total > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                    <span>有价值比率</span>
                    <span>{valuableRate}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${valuableRate}%`, background: '#2f9e44', borderRadius: 3, transition: 'width 0.4s' }} />
                  </div>
                </div>
              )}

              {stats.noiseTypes.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.03em' }}>
                    无价值类型分布
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {stats.noiseTypes.map(n => {
                      const maxCount = stats.noiseTypes[0]?.count ?? 1
                      const pct = Math.round((n.count / maxCount) * 100)
                      const { color, bg } = NOISE_TYPE_STYLE[n.type] ?? NOISE_TYPE_STYLE['其他']
                      return (
                        <div key={n.type}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{
                              display: 'inline-block', fontSize: 12, fontWeight: 600,
                              padding: '1px 8px', borderRadius: 20,
                              background: bg, color,
                            }}>
                              {n.type || '其他'}
                            </span>
                            <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{n.count}</span>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.4s', opacity: 0.6 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {stats.noise > 0 && stats.noiseTypes.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>（无价值信息未分类型）</div>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

const statCardStyle = (bg: string): React.CSSProperties => ({
  background: bg, borderRadius: 10, padding: '14px 12px', textAlign: 'center',
})
const statNumStyle: React.CSSProperties = {
  fontSize: 28, fontWeight: 700, lineHeight: 1.1, marginBottom: 4,
}
const statLabelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-muted)', fontWeight: 500,
}

const NOISE_TYPE_STYLE: Record<string, { color: string; bg: string }> = {
  '营销数字诱饵': { color: '#d97706', bg: '#fef3c7' },
  '日期变更':    { color: '#6366f1', bg: '#ede9fe' },
  '排版样式调整': { color: '#0891b2', bg: '#e0f2fe' },
  'A-B摇摆':    { color: '#be185d', bg: '#fce7f3' },
  '其他':        { color: '#64748b', bg: '#f1f5f9' },
}

let _targetsCache: Target[] | undefined

interface ToastInfo { msg: string; type: 'success' | 'error' }

function parseSchedule(schedule?: string): string {
  if (!schedule) return '09:00'
  const m = schedule.match(/(\d{2}:\d{2})/)
  return m ? m[1] : '09:00'
}

function TargetFormModal({
  target, onClose, onSaved,
}: {
  target?: Target
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!target
  const [name, setName] = useState(target?.name ?? '')
  const [url, setUrl] = useState(target?.url ?? '')
  const [track, setTrack] = useState<Track>(target?.track ?? '生图')
  const [collectMode, setCollectMode] = useState<CollectMode>(target?.collectMode ?? 'scheduled')
  const [schedule, setSchedule] = useState(parseSchedule(target?.schedule))
  const [loading, setLoading] = useState(false)
  const [banner, setBanner] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (target) {
      setName(target.name)
      setUrl(target.url)
      setTrack(target.track)
      setCollectMode(target.collectMode)
      setSchedule(parseSchedule(target.schedule))
    }
  }, [target?.id])

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = '竞品名称不能为空'
    if (!url.trim()) e.url = 'URL 不能为空'
    else if (!/^https:\/\//.test(url) && !/^test:\/\//.test(url)) e.url = 'URL 需以 https:// 或 test:// 开头'
    if (collectMode === 'scheduled' && !schedule) e.schedule = '请设置采集时间'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setLoading(true)
    setBanner('')
    const scheduleLabel = collectMode === 'scheduled' ? `每日 ${schedule}` : undefined
    const payload = { name, url, track, collectMode, schedule: scheduleLabel }
    try {
      const res = await fetch(isEdit && target ? `/api/targets/${target.id}` : '/api/targets', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok) { onSaved(); onClose() }
      else setBanner(data.error || '保存失败，请稍后重试')
    } catch {
      setBanner('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? '编辑监控竞品' : '新增监控竞品'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {banner && <div className="banner banner-error">{banner}</div>}
          <div className="field">
            <label>竞品名称</label>
            <input className={errors.name ? 'error' : ''} value={name} onChange={e => setName(e.target.value)} placeholder="如 Midjourney" />
            {errors.name && <div className="field-error">{errors.name}</div>}
          </div>
          <div className="field">
            <label>官网 URL</label>
            <input className={errors.url ? 'error' : ''} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" />
            {errors.url && <div className="field-error">{errors.url}</div>}
          </div>
          <div className="field">
            <label>赛道</label>
            <select value={track} onChange={e => setTrack(e.target.value as Track)}>
              <option>生图</option><option>生视频</option><option>Agent</option>
            </select>
          </div>
          <div className="field">
            <label>采集方式</label>
            <div className="role-list role-list--compact">
              <label className={'role-item' + (collectMode === 'manual' ? ' selected' : '')}>
                <input type="radio" name="collectMode" checked={collectMode === 'manual'} onChange={() => setCollectMode('manual')} />
                <span className="role-item-label">手动即时触发</span>
              </label>
              <label className={'role-item' + (collectMode === 'auto' ? ' selected' : '')}>
                <input type="radio" name="collectMode" checked={collectMode === 'auto'} onChange={() => setCollectMode('auto')} />
                <span className="role-item-label">自动采集（每1分钟）</span>
              </label>
              <label className={'role-item' + (collectMode === 'scheduled' ? ' selected' : '')}>
                <input type="radio" name="collectMode" checked={collectMode === 'scheduled'} onChange={() => setCollectMode('scheduled')} />
                <span className="role-item-label">固定时间采集</span>
              </label>
            </div>
          </div>
          {collectMode === 'scheduled' && (
            <div className="field">
              <label>每日采集时间</label>
              <input type="time" value={schedule} onChange={e => setSchedule(e.target.value)} />
              {errors.schedule && <div className="field-error">{errors.schedule}</div>}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? '保存中…' : isEdit ? '保存修改' : '确认添加'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TargetsPage() {
  const [targets, setTargets] = useState<Target[]>(() => _targetsCache ?? [])
  const [userEmail, setUserEmail] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editTarget, setEditTarget] = useState<Target | null>(null)
  const [analyzing, setAnalyzing] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<ToastInfo | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [loading, setLoading] = useState(_targetsCache === undefined)
  const [statsTarget, setStatsTarget] = useState<Target | null>(null)

  const refresh = async () => {
    const res = await fetch('/api/targets', { credentials: 'include' })
    if (res.ok) {
      const list = await res.json()
      _targetsCache = list
      setTargets(list)
    }
  }

  const handleAnalyze = async (t: Target) => {
    setAnalyzing(p => ({ ...p, [t.id]: true }))
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetId: t.id }),
      })
      const data = await res.json()
      if (data.intelIds?.length > 0) {
        setToast({ msg: '分析完成，情报已生成，前往 Inbox 查看', type: 'success' })
      } else if (data.ok) {
        setToast({ msg: data.message || '无重大变化', type: 'success' })
      } else {
        setToast({ msg: data.error || '分析失败', type: 'error' })
      }
    } catch {
      setToast({ msg: '分析失败，请稍后重试', type: 'error' })
    } finally {
      setAnalyzing(p => ({ ...p, [t.id]: false }))
    }
  }

  useEffect(() => {
    fetchProfileCached().then(profile => {
      if (profile?.email) setUserEmail(profile.email)
    })
    if (_targetsCache !== undefined) {
      refresh()
    } else {
      fetch('/api/targets', { credentials: 'include' })
        .then(r => r.ok ? r.json() : [])
        .then(list => { _targetsCache = list; setTargets(list); setLoading(false) })
    }
  }, [])

  const collectLabel = (t: Target) => {
    if (t.collectMode === 'manual') return '手动即时触发'
    if (t.collectMode === 'auto') return '自动采集（每1分钟）'
    return `固定时间（${t.schedule ?? '未设置'}）`
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/targets/${id}`, { method: 'DELETE', credentials: 'include' })
    if (res.ok) { await refresh(); setDeleteConfirm(null) }
    else setToast({ msg: '删除失败', type: 'error' })
  }

  return (
    <Layout userEmail={userEmail}>
      <div className="page">
        <div className="page-header">
          <div>
            <span className="eyebrow">监控管理</span>
            <h1 className="page-title">监控目标</h1>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>新增竞品</button>
        </div>

        {loading ? (
          <div className="empty-state">加载中…</div>
        ) : targets.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🎯</div>
            <div className="empty-state-title">暂无监控目标</div>
            <div className="empty-state-desc">提供竞品 URL，系统将自动识别页面变化并生成情报</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>竞品名称</th><th>URL</th><th>赛道</th><th>采集方式</th><th>状态</th><th>操作</th></tr>
              </thead>
              <tbody>
                {targets.map(t => (
                  <tr key={t.id}>
                    <td className="td-name">
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontWeight: 600, padding: '0 4px', textDecoration: 'underline', textDecorationStyle: 'dotted', color: 'var(--text-primary)' }}
                        onClick={() => setStatsTarget(t)}
                        title="查看监控详情"
                      >
                        {t.name}
                      </button>
                    </td>
                    <td className="td-url"><a href={t.url} target="_blank" rel="noreferrer">{t.url}</a></td>
                    <td><span className="tag tag-track">{t.track}</span></td>
                    <td className="td-muted">{collectLabel(t)}</td>
                    <td><span className="tag">{t.monitorStatus}</span></td>
                    <td>
                      <div className="td-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setStatsTarget(t)}>详情</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleAnalyze(t)} disabled={analyzing[t.id]}>
                          {analyzing[t.id] ? '分析中…' : '立即检测'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditTarget(t)}>编辑</button>
                        <button className="btn-danger-ghost btn-sm" onClick={() => setDeleteConfirm(t.id)}>删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && <TargetFormModal onClose={() => setShowAdd(false)} onSaved={refresh} />}
      {editTarget && <TargetFormModal target={editTarget} onClose={() => setEditTarget(null)} onSaved={refresh} />}
      {statsTarget && <StatsModal target={statsTarget} onClose={() => setStatsTarget(null)} />}
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {deleteConfirm && (
        <ConfirmModal title="删除竞品" body="删除后该竞品及其历史情报将移除，是否确认？"
          confirmLabel="确认删除" danger
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)} />
      )}
    </Layout>
  )
}
