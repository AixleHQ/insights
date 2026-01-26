import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { OrgProvider, useOrg } from './contexts/OrgContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { AuthCallback } from './pages/AuthCallback';

// Placeholder for the main dashboard
function Dashboard() {
  const { user, logout } = useAuth();
  const { currentOrg, organizations, setCurrentOrg } = useOrg();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">DB90</h1>
          <div className="flex items-center gap-4">
            {organizations.length > 1 && (
              <select
                value={currentOrg?.id || ''}
                onChange={(e) => {
                  const org = organizations.find((o) => o.id === e.target.value);
                  if (org) setCurrentOrg(org);
                }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            )}
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button
              onClick={logout}
              className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Welcome to DB90 Dashboard
          </h2>
          {currentOrg && (
            <p className="text-gray-600">
              Current organization: <strong>{currentOrg.name}</strong>
            </p>
          )}
          <p className="text-gray-500 mt-4">
            AI Developer Tool Analytics Platform
          </p>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <OrgProvider apiBaseUrl={import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1'}>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Protected routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            {/* Add more routes here */}
          </Routes>
        </OrgProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
