import { useState } from 'react'
import type { Intel, FeedbackTag, FeedbackModule } from '../lib/types'
import { FEEDBACK_TAGS, FEEDBACK_MODULES, getIntelActionPlan } from '../lib/types'
import { PriorityBadge } from './inbox-ui'

interface Props {
  intel: Intel
  currentRole: string
  onStatus: (status: '已读' | '归档') => void
  onTogglePool: () => void
  onFeedback: (tags: FeedbackTag[], modules: FeedbackModule[], note: string) => void
}

export default function InspectorPanel({ intel, currentRole, onStatus, onTogglePool, onFeedback }: Props) {
  const [showSource, setShowSource] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(intel.feedback.length > 0)
  const [feedbackTags, setFeedbackTags] = useState<FeedbackTag[]>([...intel.feedback])
  const [feedbackModules, setFeedbackModules] = useState<FeedbackModule[]>([...intel.feedbackModules])
  const [feedbackNote, setFeedbackNote] = useState(intel.feedbackNote)

  const toggleTag = (tag: FeedbackTag) => {
    setFeedbackTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  return (
    <div className="inbox-detail-panel">
      <header className="detail-header">
        <div className="detail-header-meta">
          <PriorityBadge priority={intel.priority} />
          {intel.isNoise && (
            <span className="tag tag-noise" title="badcase / 噪音记录">噪音{intel.noiseType ? `·${intel.noiseType}` : ''}</span>
          )}
          <span className="tag tag-target" title="监控目标">{intel.targetName}</span>
          <span className="tag tag-track">{intel.track}</span>
          {intel.labels.map(l => <span key={l} className="tag">{l}</span>)}
          {intel.inCorePool && <span className="tag tag-pool">核心池</span>}
        </div>
        <h2 className="detail-title">{intel.title}</h2>
        <div className="detail-actions">
          <button className="btn btn-ghost btn-sm" onClick={onTogglePool}>
            {intel.inCorePool ? '移出核心池' : '加入核心池'}
          </button>
          {intel.status !== '已读' && (
            <button className="btn btn-ghost btn-sm" onClick={() => onStatus('已读')}>标为已读</button>
          )}
          {intel.status !== '归档' && (
            <button className="btn btn-ghost btn-sm" onClick={() => onStatus('归档')}>归档</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowSource(!showSource)}>
            {showSource ? '隐藏原文' : '查看原文'}
          </button>
        </div>
      </header>

      <div className="detail-body">
        <div className="brief-block">
          <h4 className="brief-block-label">变化内容</h4>
          <p>{intel.whatChanged}</p>
        </div>
        <div className="brief-block">
          <h4 className="brief-block-label">战略意义</h4>
          <p>{intel.whyItMatters}</p>
        </div>
        <div className="brief-block brief-block--muted">
          <h4 className="brief-block-label">通用视角</h4>
          {(['销售', '产品', '营销'] as const).map(k => (
            <p key={k}><strong>{k}：</strong>{intel.actionGeneral[k]}</p>
          ))}
        </div>
        <div className="brief-block brief-block--highlight">
          <h4 className="brief-block-label">行动建议 · {currentRole}</h4>
          <p style={{ whiteSpace: 'pre-line' }}>{getIntelActionPlan(intel, currentRole)}</p>
        </div>

        {showSource && (
          <div className="source-panel">
            <h4 className="brief-block-label">原文变化对比</h4>
            <div className="source-diff">
              <span className="source-tag source-tag-del">变化前</span>
              <pre>{intel.sourceHtml.before}</pre>
            </div>
            <div className="source-diff">
              <span className="source-tag source-tag-add">变化后</span>
              <pre>{intel.sourceHtml.after}</pre>
            </div>
          </div>
        )}

        <div className="feedback-section">
          <button type="button" className="feedback-collapse-trigger" onClick={() => setFeedbackOpen(!feedbackOpen)}>
            <span>意见反馈</span>
            <span className="feedback-collapse-icon">{feedbackOpen ? '−' : '+'}</span>
          </button>
          {feedbackOpen && (
            <div className="feedback-collapse-body">
              <div className="feedback-tags">
                {FEEDBACK_TAGS.map(tag => (
                  <button key={tag} type="button"
                    className={'feedback-tag' + (feedbackTags.includes(tag) ? ' selected' : '')}
                    onClick={() => toggleTag(tag)}>{tag}</button>
                ))}
              </div>
              {feedbackTags.some(t => t !== '有用') && (
                <div className="feedback-modules">
                  <div className="feedback-tags">
                    {FEEDBACK_MODULES.map(mod => (
                      <button key={mod} type="button"
                        className={'feedback-tag' + (feedbackModules.includes(mod) ? ' selected' : '')}
                        onClick={() => setFeedbackModules(prev =>
                          prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod])}>{mod}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="field feedback-note-field">
                <label>补充说明（可选）</label>
                <textarea rows={2} value={feedbackNote}
                  onChange={e => setFeedbackNote(e.target.value)} placeholder="描述哪里不准确…" />
              </div>
              <button type="button" className="btn btn-secondary btn-sm"
                onClick={() => onFeedback(feedbackTags, feedbackModules, feedbackNote)}>提交反馈</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
