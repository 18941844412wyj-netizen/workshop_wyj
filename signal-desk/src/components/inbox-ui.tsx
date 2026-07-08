import type { Priority } from '../lib/constants'

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
  onTrack: (v: string) => void
  onLabel: (v: string) => void
  onPriority: (v: string) => void
  onArchive: (v: 'hide' | 'all' | 'only') => void
  onReset: () => void
}

export function InboxFilterPanel(props: FilterPanelProps) {
  const { track, label, priority, archiveFilter, onTrack, onLabel, onPriority, onArchive, onReset } = props
  return (
    <div className="filter-panel">
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
