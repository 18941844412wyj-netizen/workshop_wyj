import { useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { logout } from '../lib/constants'

interface LayoutProps {
  children: React.ReactNode
  userEmail?: string
  compact?: boolean
}

export function Layout({ children, userEmail, compact }: LayoutProps) {
  const navigate = useNavigate()
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">◈</span>
          <div>
            <div className="sidebar-brand-name">Signal Desk</div>
            <div className="sidebar-brand-sub">竞品情报监控</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/inbox" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <span className="nav-dot" /> 情报 Inbox
          </NavLink>
          <NavLink to="/targets" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <span className="nav-dot" /> 监控目标
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <span className="nav-dot" /> 设置
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">{userEmail}</div>
          <button
            className="btn btn-ghost btn-sm btn-full"
            onClick={async () => { await logout(); navigate('/login') }}
          >
            退出登录
          </button>
        </div>
      </aside>
      <main className={'main-content' + (compact ? ' main-content--flush' : '')}>{children}</main>
    </div>
  )
}

interface ToastProps {
  message: string
  type?: 'success' | 'error'
  onClose: () => void
  action?: { label: string; onClick: () => void }
}

export function Toast({ message, type = 'success', onClose, action }: ToastProps) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  return (
    <div className={`toast toast-${type}`} role="status">
      <span className="toast-icon">{type === 'success' ? '✓' : '!'}</span>
      <span className="toast-body">{message}</span>
      {action && <button className="btn btn-ghost btn-sm" onClick={action.onClick}>{action.label}</button>}
      <button className="toast-close" onClick={onClose} aria-label="关闭">×</button>
    </div>
  )
}

interface ConfirmProps {
  title: string
  body: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({ title, body, confirmLabel = '确认', danger, onConfirm, onCancel }: ConfirmProps) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>{title}</h3><button className="modal-close" onClick={onCancel}>×</button></div>
        <div className="modal-body"><p>{body}</p></div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>取消</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
