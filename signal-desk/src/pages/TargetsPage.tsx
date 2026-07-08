import { useEffect, useState } from 'react'
import type { CollectMode, Target, Track } from '../lib/constants'
import { Layout, Toast, ConfirmModal } from '../components/Layout'

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
    else if (!/^https:\/\//.test(url)) e.url = 'URL 需以 https:// 开头'
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
  const [targets, setTargets] = useState<Target[]>([])
  const [userEmail, setUserEmail] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editTarget, setEditTarget] = useState<Target | null>(null)
  const [toast, setToast] = useState<ToastInfo | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    const res = await fetch('/api/targets', { credentials: 'include' })
    if (res.ok) setTargets(await res.json())
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/targets', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/profile', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
    ]).then(([list, profile]) => {
      setTargets(list)
      if (profile?.email) setUserEmail(profile.email)
      setLoading(false)
    })
  }, [])

  const collectLabel = (t: Target) =>
    t.collectMode === 'manual' ? '手动即时触发' : `固定时间（${t.schedule ?? '未设置'}）`

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
                    <td className="td-name">{t.name}</td>
                    <td className="td-url"><a href={t.url} target="_blank" rel="noreferrer">{t.url}</a></td>
                    <td><span className="tag tag-track">{t.track}</span></td>
                    <td className="td-muted">{collectLabel(t)}</td>
                    <td><span className="tag">{t.monitorStatus}</span></td>
                    <td>
                      <div className="td-actions">
                        <button className="btn btn-secondary btn-sm" disabled title="T7 后可用">
                          立即检测
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
