import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import OnboardingPage from './pages/OnboardingPage'
import TargetsPage from './pages/TargetsPage'
import InboxPage from './pages/InboxPage'
import SettingsPage from './pages/SettingsPage'
import { RequireAuth, OnboardingGuard } from './components/AuthGuard'

function InboxIdRedirect() {
  const { id } = useParams()
  return <Navigate to={`/inbox?id=${id}&view=detail`} replace />
}

function RequireAuthAndOnboarding({ children }: { children: React.ReactNode }) {
  return <RequireAuth requireOnboarded>{children}</RequireAuth>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/onboarding" element={<OnboardingGuard><OnboardingPage /></OnboardingGuard>} />
        <Route path="/targets" element={<RequireAuthAndOnboarding><TargetsPage /></RequireAuthAndOnboarding>} />
        <Route path="/inbox" element={<RequireAuthAndOnboarding><InboxPage /></RequireAuthAndOnboarding>} />
        <Route path="/inbox/:id" element={<InboxIdRedirect />} />
        <Route path="/chat" element={<Navigate to="/inbox?view=chat" replace />} />
        <Route path="/settings" element={<RequireAuthAndOnboarding><SettingsPage /></RequireAuthAndOnboarding>} />
        <Route path="/" element={<Navigate to="/inbox" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
