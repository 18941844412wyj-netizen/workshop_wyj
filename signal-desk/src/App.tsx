import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import OnboardingPage from './pages/OnboardingPage'
import TargetsPage from './pages/TargetsPage'
import { RequireAuth, OnboardingGuard } from './components/AuthGuard'

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card"><h1>{title}</h1><p className="auth-sub">将在后续任务中实现</p></div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/onboarding" element={<OnboardingGuard><OnboardingPage /></OnboardingGuard>} />
        <Route path="/targets" element={<RequireAuth><TargetsPage /></RequireAuth>} />
        <Route path="/inbox" element={<RequireAuth><PlaceholderPage title="情报 Inbox" /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><PlaceholderPage title="设置" /></RequireAuth>} />
        <Route path="/" element={<Navigate to="/inbox" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
