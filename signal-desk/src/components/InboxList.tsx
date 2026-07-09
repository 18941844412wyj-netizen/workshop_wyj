import type { Intel } from '../lib/types'
import type { Priority, InfoLabel } from '../lib/constants'
import { getEffectivePriority } from '../lib/constants'
import { PriorityBadge, MatchDots, RelativeTime, SkeletonCard } from './inbox-ui'

const PRIORITY_STRIPE: Record<Priority, string> = {
  '紧急': 'stripe-urgent', '中等': 'stripe-medium', '低': 'stripe-low',
}

interface Props {
  intels: Intel[]
  loading: boolean
  selectedId: string | null
  listView: 'morning' | 'pool' | 'all'
  weights?: Record<InfoLabel, number>
  onSelect: (id: string) => void
  chatMode?: boolean
  referencedIds?: string[]
  onToggleRef?: (id: string) => void
}

export default function InboxList({ intels, loading, selectedId, listView, weights, onSelect, chatMode, referencedIds, onToggleRef }: Props) {
  if (loading) return <>{[1, 2, 3].map(i => <SkeletonCard key={i} />)}</>
  if (intels.length === 0) {
    return (
      <div className="empty-state empty-state--compact">
        <p className="empty-state-title">{listView === 'pool' ? '核心信息池为空' : '暂无情报'}</p>
        <p className="empty-state-desc">
          {listView === 'pool' ? '在情报详情中标记「有用」或手动加入核心池' : '添加监控目标并触发分析'}
        </p>
      </div>
    )
  }
  return (
    <>
      {intels.map(intel => {
        const effectivePriority = weights
          ? getEffectivePriority(intel.labels, intel.priority, weights)
          : intel.priority
        const isReferenced = chatMode && referencedIds?.includes(intel.id)
        const handleClick = () => {
          if (chatMode && onToggleRef) {
            onToggleRef(intel.id)
          } else {
            onSelect(intel.id)
          }
        }
        return (
          <article
            key={intel.id}
            className={`intel-brief ${PRIORITY_STRIPE[effectivePriority]}${selectedId === intel.id && !chatMode ? ' selected' : ''}${intel.status === '已读' ? ' read' : ''}${isReferenced ? ' intel-brief--referenced' : ''}${chatMode ? ' intel-brief--chat-mode' : ''}`}
            onClick={handleClick}
            title={chatMode ? (isReferenced ? '点击取消引用' : '点击添加到深度对话引用') : undefined}
          >
            <div className="intel-brief-top">
              <PriorityBadge priority={effectivePriority} />
              <MatchDots score={intel.matchScore} />
              {intel.inCorePool && <span className="tag tag-pool">核心池</span>}
              <span className="intel-brief-time"><RelativeTime iso={intel.createdAt} /></span>
              {chatMode && (
                <span className={`intel-brief-ref-badge${isReferenced ? ' intel-brief-ref-badge--on' : ''}`}>
                  {isReferenced ? '✓ 已引用' : '+ 引用'}
                </span>
              )}
            </div>
            <h3 className="intel-brief-title">{intel.title}</h3>
            <p className="intel-brief-excerpt">{intel.whatChanged.slice(0, 72)}…</p>
            <div className="intel-brief-tags">
              {intel.isNoise && (
                <span className="tag tag-noise" title="badcase / 噪音记录">噪音{intel.noiseType ? `·${intel.noiseType}` : ''}</span>
              )}
              <span className="tag tag-target" title="监控目标">{intel.targetName}</span>
              <span className="tag tag-track">{intel.track}</span>
              {intel.labels.map(l => <span key={l} className="tag">{l}</span>)}
            </div>
          </article>
        )
      })}
    </>
  )
}
