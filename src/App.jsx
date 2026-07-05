import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LandingScreen from './screens/LandingScreen'
import SignUpScreen from './screens/SignUpScreen'
import SignInScreen from './screens/SignInScreen'
import HomeScreen from './screens/HomeScreen'
import CardDraftScreen from './screens/CardDraftScreen'
import ProfileScreen from './screens/ProfileScreen'
import StudyScreen from './screens/StudyScreen'
import LibraryScreen from './screens/LibraryScreen'
import DictionaryScreen from './screens/DictionaryScreen'
import BulkImportScreen from './screens/BulkImportScreen'

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
      <Route path="/home" element={<ProtectedRoute><HomeScreen /></ProtectedRoute>} />
      <Route path="/draft" element={<ProtectedRoute><CardDraftScreen /></ProtectedRoute>} />
      <Route path="/import" element={<ProtectedRoute><BulkImportScreen /></ProtectedRoute>} />
      <Route path="/dictionary" element={<ProtectedRoute><DictionaryScreen /></ProtectedRoute>} />
      <Route path="/library" element={<ProtectedRoute><LibraryScreen /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfileScreen /></ProtectedRoute>} />
      <Route path="/study" element={<ProtectedRoute><StudyScreen /></ProtectedRoute>} />
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
