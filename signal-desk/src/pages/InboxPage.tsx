import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Layout, Toast } from '../components/Layout'
import { RoleSwitcher, InboxFilterPanel } from '../components/inbox-ui'
import InboxList from '../components/InboxList'
import InspectorPanel from '../components/InspectorPanel'
import type { Intel, FeedbackTag, FeedbackModule } from '../lib/types'
import { fetchProfile } from '../lib/constants'

type ListView = 'morning' | 'pool' | 'all'
type ArchiveFilter = 'hide' | 'all' | 'only'

export default function InboxPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [intels, setIntels] = useState<Intel[]>([])
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [currentRole, setCurrentRole] = useState('产品经理')
  const [listView, setListView] = useState<ListView>('morning')
  const [filterTrack, setFilterTrack] = useState('')
  const [filterLabel, setFilterLabel] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('hide')
  const [showFilters, setShowFilters] = useState(false)
  const [toastMsg, setToastMsg] = useState('')

  const selectedId = searchParams.get('id')
  const selectedIntel = selectedId ? intels.find(i => i.id === selectedId) : undefined
  const poolCount = intels.filter(i => i.inCorePool && i.status !== '归档').length
  const activeFilterCount = [filterTrack, filterLabel, filterPriority].filter(Boolean).length
    + (archiveFilter !== 'hide' ? 1 : 0)

  const buildQuery = useCallback(() => {
    const q = new URLSearchParams()
    q.set('view', listView)
    q.set('archiveFilter', archiveFilter)
    if (filterTrack) q.set('track', filterTrack)
    if (filterLabel) q.set('label', filterLabel)
    if (filterPriority) q.set('priority', filterPriority)
    return q.toString()
  }, [listView, archiveFilter, filterTrack, filterLabel, filterPriority])

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/insights?${buildQuery()}`, { credentials: 'include' })
    if (res.ok) setIntels(await res.json())
  }, [buildQuery])

  useEffect(() => {
    fetchProfile().then(p => {
      if (p?.email) setUserEmail(p.email)
      if (p?.role) setCurrentRole(p.role)
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const selectIntel = (id: string) => setSearchParams({ id, view: 'detail' })

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

          <RoleSwitcher role={currentRole} onChange={(r: string) => { setCurrentRole(r); setToastMsg('角色已切换') }} />

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
                onTrack={setFilterTrack} onLabel={setFilterLabel} onPriority={setFilterPriority}
                onArchive={setArchiveFilter}
                onReset={() => { setFilterTrack(''); setFilterLabel(''); setFilterPriority(''); setArchiveFilter('hide') }}
              />
            )}
          </div>

          <div className="inbox-list-scroll">
            <InboxList intels={intels} loading={loading} selectedId={selectedId} listView={listView} onSelect={selectIntel} />
          </div>
        </section>

        <section className="inbox-inspector-panel">
          {!selectedIntel ? (
            <div className="inspector-empty">
              <div className="empty-state">
                <p className="empty-state-title">选择一条情报</p>
                <p className="empty-state-desc">点击左侧卡片查看详情与反馈</p>
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/targets')}>前往监控</button>
              </div>
            </div>
          ) : (
            <>
              <header className="inspector-header">
                <div className="inspector-tabs">
                  <button type="button" className="inspector-tab active">情报详情</button>
                </div>
                <button type="button" className="inspector-close" onClick={() => setSearchParams({})}>×</button>
              </header>
              <div className="inspector-body">
                <InspectorPanel
                  intel={selectedIntel}
                  currentRole={currentRole}
                  onStatus={(s: '已读' | '归档') => handleStatus(selectedIntel.id, s)}
                  onTogglePool={handleTogglePool}
                  onFeedback={handleFeedback}
                />
              </div>
            </>
          )}
        </section>
      </div>
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </Layout>
  )
}
