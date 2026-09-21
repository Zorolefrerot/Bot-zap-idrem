import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Docs from './pages/Docs.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';

/**
 * `import.meta.env.BASE_URL` reflète le `base` de Vite : le routeur reste
 * aligné automatiquement, que le site soit servi à la racine (Render, VPS)
 * ou dans un sous-dossier (GitHub Pages).
 */
const basename = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/';

function NotFound() {
  return (
    <div className="page page--centered">
      <h1 className="page__title">404</h1>
      <p className="empty">Cette page n’existe pas.</p>
      <Link to="/" className="btn btn--primary">
        <span className="btn__label">Retour à l’accueil</span>
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <ToastProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route path="/docs" element={<Docs />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
