import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LandingScreen from './screens/LandingScreen'
import SignUpScreen from './screens/SignUpScreen'
import SignInScreen from './screens/SignInScreen'

function ProtectedRoute({ children }) {
  const { user } = useAuth()
  if (user === undefined) return null // loading
  if (!user) return <Navigate to="/" replace />
  return children
}

function AuthRoute({ children }) {
  const { user } = useAuth()
  if (user === undefined) return null // loading
  if (user) return <Navigate to="/home" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AuthRoute><LandingScreen /></AuthRoute>} />
      <Route path="/signup" element={<AuthRoute><SignUpScreen /></AuthRoute>} />
      <Route path="/signin" element={<AuthRoute><SignInScreen /></AuthRoute>} />
      <Route path="/home" element={<ProtectedRoute><div style={{padding:20}}>Home — coming soon</div></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
