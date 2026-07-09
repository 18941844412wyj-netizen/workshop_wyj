import type { Priority, InfoLabel, Role } from '../lib/constants'
import { INFO_LABELS, ROLE_DEFAULT_WEIGHTS } from '../lib/constants'

export function PriorityBadge({ priority }: { priority: Priority }) {
  const cls = priority === '紧急' ? 'urgent' : priority === '中等' ? 'medium' : 'low'
  return <span className={`pri-badge pri-${cls}`}>{priority}</span>
}

export function MatchDots({ score }: { score: number }) {
  return (
    <div className="match-dots" title={`匹配度 ${score}/5`}>
      {[1, 2, 3, 4, 5].map(i => <span key={i} className={'match-dot' + (i <= score ? ' on' : '')} />)}
    </div>
  )
}

export function RelativeTime({ iso }: { iso: string }) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return <>{mins < 1 ? '刚刚' : `${mins}分钟前`}</>
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return <>{hrs}小时前</>
  return <>{Math.floor(hrs / 24)}天前</>
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton" style={{ height: 10, width: '40%' }} />
      <div className="skeleton" style={{ height: 16, width: '85%', marginTop: 10 }} />
    </div>
  )
}

interface RoleSwitcherProps {
  role: string
  onChange: (r: string) => void
}

export function RoleSwitcher({ role, onChange }: RoleSwitcherProps) {
  const roles = ['产品经理', '市场营销负责人', '创业者·创始人', '投资人']
  return (
    <div className="role-switcher">
      <span className="role-switcher-label">当前角色</span>
      <select className="role-switcher-select" value={role} onChange={e => onChange(e.target.value)}>
        {roles.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
    </div>
  )
}

interface FilterPanelProps {
  track: string
  label: string
  priority: string
  archiveFilter: 'hide' | 'all' | 'only'
  contentType: 'intel' | 'noise'
  onTrack: (v: string) => void
  onLabel: (v: string) => void
  onPriority: (v: string) => void
  onArchive: (v: 'hide' | 'all' | 'only') => void
  onContentType: (v: 'intel' | 'noise') => void
  onReset: () => void
}

export function InboxFilterPanel(props: FilterPanelProps) {
  const { track, label, priority, archiveFilter, contentType, onTrack, onLabel, onPriority, onArchive, onContentType, onReset } = props
  return (
    <div className="filter-panel">
      <div className="filter-panel-row">
        <label>内容类型</label>
        <select value={contentType} onChange={e => onContentType(e.target.value as 'intel' | 'noise')}>
          <option value="intel">有效情报</option>
          <option value="noise">噪音记录 (badcase)</option>
        </select>
      </div>
      <div className="filter-panel-row">
        <label>赛道</label>
        <select value={track} onChange={e => onTrack(e.target.value)}>
          <option value="">全部赛道</option>
          <option>生图</option><option>生视频</option><option>Agent</option>
        </select>
      </div>
      <div className="filter-panel-row">
        <label>信息标签</label>
        <select value={label} onChange={e => onLabel(e.target.value)}>
          <option value="">全部标签</option>
          <option>定价</option><option>功能</option><option>更新日志</option>
          <option>招聘</option><option>营销活动</option><option>合规条款</option>
        </select>
      </div>
      <div className="filter-panel-row">
        <label>优先级</label>
        <select value={priority} onChange={e => onPriority(e.target.value)}>
          <option value="">全部优先级</option>
          <option>紧急</option><option>中等</option><option>低</option>
        </select>
      </div>
      <div className="filter-panel-row">
        <label>归档状态</label>
        <select value={archiveFilter} onChange={e => onArchive(e.target.value as 'hide' | 'all' | 'only')}>
          <option value="hide">隐藏归档</option>
          <option value="all">包含归档</option>
          <option value="only">仅看归档</option>
        </select>
      </div>
      <button type="button" className="btn btn-ghost btn-sm filter-panel-reset" onClick={onReset}>重置筛选</button>
    </div>
  )
}

interface WeightModalProps {
  role: Role
  weights: Record<InfoLabel, number>
  onChange: (w: Record<InfoLabel, number>) => void
  onSave: () => void
  onClose: () => void
  loading?: boolean
  error?: string
}

export function WeightModal({ role, weights, onChange, onSave, onClose, loading, error }: WeightModalProps) {
  const defaults = (ROLE_DEFAULT_WEIGHTS as Record<string, Record<InfoLabel, number>>)[role]
    ?? { 定价: 3, 功能: 3, 更新日志: 3, 招聘: 2, 营销活动: 3, 合规条款: 2 }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>信息标签权重 · {role}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p className="text-sm text-muted mb-16">各角色有推荐默认权重（灰色标注）。调整后影响 Inbox 个性化排序。</p>
          {error && <div className="banner banner-error">{error}</div>}
          <div className="weight-grid">
            {INFO_LABELS.map(label => (
              <div key={label} className="weight-row">
                <span className="weight-label">
                  {label}
                  <span className="weight-default-hint">默认 {defaults[label]}</span>
                </span>
                <div className="weight-btns">
                  {[1, 2, 3, 4, 5].map(v => (
                    <button key={v} type="button"
                      className={'weight-btn' + (weights[label] === v ? ' active' : '')}
                      onClick={() => onChange({ ...weights, [label]: v })}>{v}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={onSave} disabled={loading}>
            {loading ? '保存中…' : '保存权重'}
          </button>
        </div>
      </div>
    </div>
  )
}
