import { useCallback, useEffect, useRef, useState } from 'react'
import type { Intel, ConvMsg, ChatSessionSummary, ChatSessionDetail } from '../lib/types'
import { ConfirmModal } from './Layout'

const REF_OPTIONS = ['整条情报', '变化内容', '战略意义', '行动建议']

interface Props {
  selectedIntelIds: string[]
  availableIntels: Intel[]
  onToggleIntel: (id: string) => void
  embedded?: boolean
  onOpenDetail?: (id: string) => void
}

export default function DeepChatPanel({
  selectedIntelIds,
  availableIntels,
  onToggleIntel,
  embedded,
  onOpenDetail,
}: Props) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ConvMsg[]>([])
  const [ended, setEnded] = useState(false)
  const [refLabel, setRefLabel] = useState('整条情报')
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)

  const selectedIntels = selectedIntelIds
    .map(id => availableIntels.find(i => i.id === id))
    .filter(Boolean) as Intel[]

  const loadSessions = useCallback(async () => {
    const res = await fetch('/api/chat-sessions', { credentials: 'include' })
    if (res.ok) setSessions(await res.json())
  }, [])

  const loadSession = useCallback(async (sessionId: string) => {
    const res = await fetch(`/api/chat-sessions/${sessionId}`, { credentials: 'include' })
    if (!res.ok) return
    const data: ChatSessionDetail = await res.json()
    setMessages(data.messages)
    setEnded(data.ended)
    setActiveSessionId(sessionId)
  }, [])

  useEffect(() => { loadSessions() }, [loadSessions])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages.length, sending])

  const handleNewSession = async () => {
    const res = await fetch('/api/chat-sessions', {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) return
    const data: ChatSessionDetail = await res.json()
    setActiveSessionId(data.id)
    setMessages([])
    setEnded(false)
    setShowHistory(false)
    await loadSessions()
  }

  const handleSend = async () => {
    if (!msgText.trim() || ended || selectedIntelIds.length === 0) return
    const primaryId = selectedIntelIds[0]
    setSending(true)
    try {
      const res = await fetch(`/api/insights/${primaryId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: activeSessionId ?? undefined,
          message: msgText,
          referenceIntelIds: selectedIntelIds,
          referenceLabel: refLabel,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert((err as { error?: string }).error ?? '发送失败')
        return
      }
      const data = await res.json()
      if (!activeSessionId) setActiveSessionId(data.sessionId)
      setMsgText('')
      await loadSession(data.sessionId)
      await loadSessions()
    } finally {
      setSending(false)
    }
  }

  const handleEndSession = async () => {
    if (!activeSessionId) return
    await fetch(`/api/chat-sessions/${activeSessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ended: true }),
    })
    setEnded(true)
    setConfirmEnd(false)
    await loadSessions()
  }

  const PanelTag = embedded ? 'div' : 'aside'
  const session = sessions.find(s => s.id === activeSessionId)

  return (
    <PanelTag className="inbox-chat-panel">
      {!embedded && (
        <div className="workspace-panel-header">
          <div>
            <span className="eyebrow">深度对话</span>
            <h2 className="panel-title">引用情报追问</h2>
          </div>
        </div>
      )}

      <div className="chat-session-bar">
        <div className="chat-session-bar-left">
          <button type="button" className={'btn btn-ghost btn-sm' + (showHistory ? ' active' : '')}
            onClick={() => setShowHistory(!showHistory)}>
            历史会话 ({sessions.length})
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleNewSession}>新开会话</button>
        </div>
        {!ended && activeSessionId && (
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmEnd(true)}>终止</button>
        )}
      </div>

      {showHistory && (
        <div className="chat-session-list">
          {sessions.length === 0 ? (
            <p className="chat-session-empty">暂无历史会话</p>
          ) : (
            sessions.map(sess => (
              <button
                key={sess.id}
                type="button"
                className={'chat-session-item' + (sess.id === activeSessionId ? ' active' : '') + (sess.ended ? ' ended' : '')}
                onClick={() => { loadSession(sess.id); setShowHistory(false) }}
              >
                <span className="chat-session-item-title">{sess.title}</span>
                <span className="chat-session-item-meta">
                  {sess.messageCount ?? 0} 条 · {new Date(sess.updatedAt).toLocaleDateString('zh-CN')}
                  {sess.ended ? ' · 已结束' : ''}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      <div className="chat-ref-banner">
        <div className="chat-ref-banner-head">
          <span className="chat-ref-label">引用情报（{selectedIntelIds.length}）</span>
          {!ended && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPicker(!showPicker)}>
              {showPicker ? '收起' : '+ 添加引用'}
            </button>
          )}
        </div>
        {selectedIntels.length > 0 ? (
          <div className="chat-ref-chips">
            {selectedIntels.map(intel => (
              <span key={intel.id} className="chat-ref-chip-item">
                <button type="button" className="chat-ref-chip-title" onClick={() => onOpenDetail?.(intel.id)}>
                  {intel.title.slice(0, 28)}{intel.title.length > 28 ? '…' : ''}
                </button>
                {!ended && selectedIntelIds.length > 1 && (
                  <button type="button" className="chat-ref-chip-remove" onClick={() => onToggleIntel(intel.id)} aria-label="移除">×</button>
                )}
              </span>
            ))}
          </div>
        ) : (
          <p className="chat-ref-empty">从左侧选择情报，或点击「添加引用」多选后联合分析</p>
        )}
        {showPicker && (
          <div className="chat-ref-picker">
            {availableIntels.filter(i => i.status !== '归档').map(intel => (
              <label key={intel.id} className="chat-ref-picker-item">
                <input type="checkbox" checked={selectedIntelIds.includes(intel.id)} onChange={() => onToggleIntel(intel.id)} />
                <span>{intel.title}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="chat-history" ref={chatRef}>
        {messages.length === 0 && !ended && (
          <div className="chat-empty">
            <p>可引用一条或多条情报进行跨情报分析</p>
            <p className="chat-empty-hint">选择引用范围后输入追问</p>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`chat-msg chat-msg-${m.role}`}>
            {m.role === 'user' && m.referenceIntelIds && m.referenceIntelIds.length > 0 && (
              <div className="chat-ref-chip">
                引用 · {m.referenceIntelIds.length} 条 · {m.referenceLabel}
              </div>
            )}
            <div className="chat-bubble">{m.content}</div>
            <div className={`chat-meta chat-meta-${m.role}`}>
              {m.role === 'user' ? '你' : '分析助手'} · {new Date(m.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
        {sending && (
          <div className="chat-msg chat-msg-ai">
            <div className="chat-bubble"><div className="typing-dots"><span /><span /><span /></div></div>
          </div>
        )}
        {ended && <div className="chat-ended">会话已终止，可查看历史或新开会话继续</div>}
      </div>

      {!ended ? (
        <div className="chat-compose">
          <div className="chat-compose-ref">
            <label>引用范围</label>
            <select value={refLabel} onChange={e => setRefLabel(e.target.value)} disabled={selectedIntelIds.length === 0}>
              {REF_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="chat-compose-row">
            <textarea
              value={msgText}
              onChange={e => setMsgText(e.target.value)}
              placeholder={selectedIntelIds.length > 0 ? '输入追问…' : '请先选择至少一条情报'}
              disabled={sending || selectedIntelIds.length === 0}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            />
            <button className="btn btn-primary" onClick={handleSend}
              disabled={sending || !msgText.trim() || selectedIntelIds.length === 0}>
              发送
            </button>
          </div>
        </div>
      ) : (
        <div className="chat-ended chat-ended--footer">
          <button type="button" className="btn btn-primary btn-sm" onClick={handleNewSession}>新开会话</button>
        </div>
      )}

      {confirmEnd && session && (
        <ConfirmModal
          title="终止对话"
          body="终止后不可继续追问，历史仍可回看。"
          confirmLabel="确认终止"
          danger
          onConfirm={handleEndSession}
          onCancel={() => setConfirmEnd(false)}
        />
      )}
    </PanelTag>
  )
}
