import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Layout, Toast } from '../components/Layout'
import { RoleSwitcher, InboxFilterPanel } from '../components/inbox-ui'
import InboxList from '../components/InboxList'
import InspectorPanel from '../components/InspectorPanel'
import DeepChatPanel from '../components/DeepChatPanel'
import type { Intel, FeedbackTag, FeedbackModule } from '../lib/types'
import { fetchProfileCached } from '../lib/profile-cache'
import { getCachedIntels, setCachedIntels } from '../lib/intels-cache'
import { ROLE_DEFAULT_WEIGHTS, getRoleDefaultWeights, type InfoLabel } from '../lib/constants'
import type { CustomRole } from '../lib/constants'

type ListView = 'morning' | 'pool' | 'all'
type ArchiveFilter = 'hide' | 'all' | 'only'
type InspectorTab = 'detail' | 'chat'

export default function InboxPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [intels, setIntels] = useState<Intel[]>(() => getCachedIntels() ?? [])
  const [loading, setLoading] = useState(() => getCachedIntels() === undefined)
  const [userEmail, setUserEmail] = useState('')
  const [currentRole, setCurrentRole] = useState('产品经理')
  const [currentWeights, setCurrentWeights] = useState<Record<InfoLabel, number>>(
    () => ({ ...ROLE_DEFAULT_WEIGHTS['产品经理'] })
  )
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([])
  const [listView, setListView] = useState<ListView>('morning')
  const [filterTrack, setFilterTrack] = useState('')
  const [filterLabel, setFilterLabel] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('hide')
  const [contentType, setContentType] = useState<'intel' | 'noise'>('intel')
  const [showFilters, setShowFilters] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('detail')
  const [chatIntelIds, setChatIntelIds] = useState<string[]>([])

  const selectedId = searchParams.get('id')
  const selectedIntel = selectedId ? intels.find(i => i.id === selectedId) : undefined
  const poolCount = intels.filter(i => i.inCorePool && i.status !== '归档').length
  const activeFilterCount = [filterTrack, filterLabel, filterPriority].filter(Boolean).length
    + (archiveFilter !== 'hide' ? 1 : 0)
    + (contentType !== 'intel' ? 1 : 0)

  const buildQuery = useCallback(() => {
    const q = new URLSearchParams()
    q.set('view', listView)
    q.set('archiveFilter', archiveFilter)
    if (contentType === 'noise') q.set('noise', 'only')
    if (filterTrack) q.set('track', filterTrack)
    if (filterLabel) q.set('label', filterLabel)
    if (filterPriority) q.set('priority', filterPriority)
    return q.toString()
  }, [listView, archiveFilter, contentType, filterTrack, filterLabel, filterPriority])

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/insights?${buildQuery()}`, { credentials: 'include' })
    if (res.ok) {
      const list = await res.json()
      setCachedIntels(list)
      setIntels(list)
    }
  }, [buildQuery])

  useEffect(() => {
    fetchProfileCached().then(p => {
      if (p?.email) setUserEmail(p.email)
      if (p?.role) setCurrentRole(p.role)
      if (p?.weights) setCurrentWeights(p.weights)
      if (p?.customRoles) setCustomRoles(p.customRoles)
    })
  }, [])

  useEffect(() => {
    if (getCachedIntels() !== undefined) {
      refresh()
    } else {
      setLoading(true)
      refresh().finally(() => setLoading(false))
    }
  }, [refresh])

  useEffect(() => {
    if (selectedId) {
      setChatIntelIds(prev => prev.includes(selectedId) ? prev : [selectedId, ...prev.filter(id => id !== selectedId)])
    }
  }, [selectedId])

  useEffect(() => {
    const view = searchParams.get('view')
    if (view === 'chat') setInspectorTab('chat')
    else if (view === 'detail') setInspectorTab('detail')
  }, [searchParams])

  const selectIntel = (id: string) => {
    setSearchParams({ id, view: 'detail' })
    setInspectorTab('detail')
  }

  const toggleChatIntel = (id: string) => {
    setChatIntelIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const patchIntel = async (id: string, body: Record<string, unknown>) => {
    await fetch(`/api/insights/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    await refresh()
  }

  const handleStatus = async (id: string, status: '已读' | '归档') => {
    await patchIntel(id, { status })
    if (status === '归档' && selectedId === id) setSearchParams({})
    setToastMsg(status === '归档' ? '已归档' : '已标为已读')
  }

  const handleTogglePool = async () => {
    if (!selectedIntel) return
    await patchIntel(selectedIntel.id, { inCorePool: !selectedIntel.inCorePool })
    setToastMsg(!selectedIntel.inCorePool ? '已加入核心信息池' : '已从核心信息池移除')
  }

  const handleFeedback = async (tags: FeedbackTag[], modules: FeedbackModule[], note: string) => {
    if (!selectedIntel) return
    await fetch(`/api/insights/${selectedIntel.id}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ tags, modules, note }),
    })
    setToastMsg('反馈已提交，感谢帮助改进')
    await refresh()
  }

  return (
    <Layout userEmail={userEmail} compact>
      <div className="inbox-workspace">
        <section className="inbox-list-panel">
          <header className="workspace-panel-header">
            <div>
              <span className="eyebrow">情报 Inbox</span>
              <h1 className="panel-title">今日信号</h1>
            </div>
            <span className="panel-meta">{intels.length} 条</span>
          </header>

          <RoleSwitcher role={currentRole} onChange={(r: string) => {
            setCurrentRole(r)
            const builtinW = (ROLE_DEFAULT_WEIGHTS as Record<string, Record<InfoLabel, number>>)[r]
            if (builtinW) {
              setCurrentWeights({ ...builtinW })
            } else {
              const cr = customRoles.find(c => c.name === r)
              setCurrentWeights(cr?.weights ?? getRoleDefaultWeights('产品经理'))
            }
            setToastMsg('角色已切换')
          }} />

          <div className="filter-bar">
            <div className="view-tabs">
              <button className={'view-tab' + (listView === 'morning' ? ' active' : '')} onClick={() => setListView('morning')}>晨报</button>
              <button className={'view-tab' + (listView === 'pool' ? ' active' : '')} onClick={() => setListView('pool')}>
                核心池{poolCount > 0 ? ` (${poolCount})` : ''}
              </button>
              <button className={'view-tab' + (listView === 'all' ? ' active' : '')} onClick={() => setListView('all')}>全部</button>
            </div>
            <button type="button" className={'filter-trigger' + (showFilters ? ' active' : '')}
              onClick={() => setShowFilters(!showFilters)}>
              筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
            {showFilters && (
              <InboxFilterPanel
                track={filterTrack} label={filterLabel} priority={filterPriority} archiveFilter={archiveFilter}
                contentType={contentType}
                onTrack={setFilterTrack} onLabel={setFilterLabel} onPriority={setFilterPriority}
                onArchive={setArchiveFilter} onContentType={setContentType}
                onReset={() => { setFilterTrack(''); setFilterLabel(''); setFilterPriority(''); setArchiveFilter('hide'); setContentType('intel') }}
              />
            )}
          </div>

          <div className="inbox-list-scroll">
            <InboxList intels={intels} loading={loading} selectedId={selectedId} listView={listView} weights={currentWeights} onSelect={selectIntel} />
          </div>
        </section>

        <section className="inbox-inspector-panel">
          {!selectedIntel ? (
            <div className="inspector-empty">
              <div className="empty-state">
                <p className="empty-state-title">选择一条情报</p>
                <p className="empty-state-desc">点击左侧卡片查看详情、反馈或深度对话</p>
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/targets')}>前往监控</button>
              </div>
            </div>
          ) : (
            <>
              <header className="inspector-header">
                <div className="inspector-tabs">
                  <button type="button"
                    className={'inspector-tab' + (inspectorTab === 'detail' ? ' active' : '')}
                    onClick={() => setInspectorTab('detail')}>情报详情</button>
                  <button type="button"
                    className={'inspector-tab' + (inspectorTab === 'chat' ? ' active' : '')}
                    onClick={() => setInspectorTab('chat')}>深度对话</button>
                </div>
                <button type="button" className="inspector-close" onClick={() => setSearchParams({})}>×</button>
              </header>
              <div className="inspector-body">
                {inspectorTab === 'detail' ? (
                  <InspectorPanel
                    intel={selectedIntel}
                    currentRole={currentRole}
                    onStatus={(s: '已读' | '归档') => handleStatus(selectedIntel.id, s)}
                    onTogglePool={handleTogglePool}
                    onFeedback={handleFeedback}
                  />
                ) : (
                  <DeepChatPanel
                    embedded
                    selectedIntelIds={chatIntelIds.length ? chatIntelIds : [selectedIntel.id]}
                    availableIntels={intels}
                    onToggleIntel={toggleChatIntel}
                    onOpenDetail={selectIntel}
                  />
                )}
              </div>
            </>
          )}
        </section>
      </div>
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </Layout>
  )
}
