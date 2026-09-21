import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePolling } from '../hooks/usePolling.js';

function Background() {
  return (
    <div className="bg" aria-hidden="true">
      <div className="bg__grid" />
      <div className="bg__orb bg__orb--cyan" />
      <div className="bg__orb bg__orb--magenta" />
      <div className="bg__scan" />
    </div>
  );
}

function Brand() {
  return (
    <Link to="/" className="brand" aria-label="IDREM TERESHKOVA BOT — accueil">
      <span className="brand__mark" aria-hidden="true">
        IT
      </span>
      <span className="brand__text">
        <span className="brand__title">IDREM TERESHKOVA</span>
        <span className="brand__subtitle">BOT</span>
      </span>
    </Link>
  );
}

function Navbar({ health, authenticated, onLogout }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  const online = health?.whatsappConnected;

  const links = [
    { to: '/', label: 'Connexion', end: true },
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/docs', label: 'Docs' },
  ];

  return (
    <header className="nav">
      <div className="nav__inner">
        <Brand />

        <nav className={`nav__links ${open ? 'is-open' : ''}`} aria-label="Navigation principale">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => `nav__link ${isActive ? 'is-active' : ''}`}>
              {link.label}
            </NavLink>
          ))}

          <div className="nav__side">
            <span className={`nav__status ${online ? 'is-online' : health ? 'is-offline' : 'is-idle'}`} title={online ? 'Bot connecté à WhatsApp' : 'Bot non connecté'}>
              <span className="nav__dot" aria-hidden="true" />
              {online ? 'En ligne' : health ? 'Hors ligne' : '…'}
            </span>

            {authenticated ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={onLogout}>
                <span className="btn__label">Déconnexion</span>
              </button>
            ) : (
              <NavLink to="/login" className="btn btn--subtle btn--sm">
                <span className="btn__label">Accès</span>
              </NavLink>
            )}
          </div>
        </nav>

        <button
          type="button"
          className="nav__burger"
          aria-label="Ouvrir le menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}

function Footer({ health }) {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <p>
          <strong>IDREM TERESHKOVA BOT</strong> — bot WhatsApp Baileys + dashboard. Session ID préfixée{' '}
          <code>IDREM-TERESHKOVA-</code>
        </p>
        <p className="footer__meta">
          <span>{health?.ok ? `API ${health.project ? '✓' : '✓'}` : 'API —'}</span>
          <span>
            Uptime serveur : {health?.uptimeMs ? `${Math.floor(health.uptimeMs / 60000)} min` : '—'}
          </span>
        </p>
      </div>
    </footer>
  );
}

export default function Layout({ children }) {
  const { authenticated, logout } = useAuth();
  const { data: health } = usePolling(() => api.health(), { interval: 20000 });

  return (
    <div className="app">
      <Background />
      <Navbar health={health} authenticated={authenticated} onLogout={logout} />
      <main className="main">{children}</main>
      <Footer health={health} />
    </div>
  );
}
