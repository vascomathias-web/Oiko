import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ConfirmProvider } from './components/ConfirmDialog';
import Sidebar from './components/Sidebar';
import WelcomeModal from './components/WelcomeModal';

import Dashboard from './pages/Dashboard';
import Facture from './pages/Facture';
import Loyer from './pages/Loyer';
import Recapitulatif from './pages/Recapitulatif';
import Biens from './pages/Biens';
import AssistantIA from './pages/AssistantIA';
import Notifications from './pages/Notifications';
import Parametres from './pages/Parametres';
import TitleBar from './components/TitleBar';

const PAGES = {
  dashboard: Dashboard,
  facture: Facture,
  loyer: Loyer,
  recapitulatif: Recapitulatif,
  biens: Biens,
  ia: AssistantIA,
  notifications: Notifications,
  parametres: Parametres
};

function AppContent() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const { notifications, parametres } = useApp();
  const unreadCount = notifications.filter(n => !n.lu).length;

  const Page = PAGES[currentPage] || Dashboard;

  const [showWelcome, setShowWelcome] = useState(false);

  // Écoute les événements de navigation depuis le tray Windows
  useEffect(() => {
    if (window.events?.onNavigate) {
      window.events.onNavigate((page) => {
        if (PAGES[page]) {
          setCurrentPage(page);
        }
      });
    }
  }, []);

  // Affiche le modal de bienvenue au premier lancement
  useEffect(() => {
    if (parametres && parametres.first_launch_done === 'false') {
      setShowWelcome(true);
    }
  }, [parametres]);

  // Rend le onNavigate disponible globalement pour PageHeader (via window)
  // plutôt que de propager dans toutes les pages.
  React.useEffect(() => {
    window.__gestimmo_navigate = setCurrentPage;
    return () => { delete window.__gestimmo_navigate; };
  }, []);

  return (
    <div className="app-container">
      <TitleBar />
      <div className="app-body">
        <Sidebar
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          unreadCount={unreadCount}
        />
        <main className="main-content">
          <Page onNavigate={setCurrentPage} />
        </main>
      </div>
      {showWelcome && <WelcomeModal onClose={() => setShowWelcome(false)} />}
    </div>
  );
}

export default function App() {
  if (typeof window !== 'undefined' && !window.api) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: 16,
        background: '#0f172a',
        color: 'white',
        fontFamily: 'sans-serif',
        textAlign: 'center',
        padding: 40
      }}>
        <div style={{ fontSize: 48 }}>🖥️</div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>GestImmo</h2>
        <p style={{ color: '#94a3b8', maxWidth: 500 }}>
          Cette application est un logiciel desktop qui doit être lancé avec Electron.
        </p>
        <p style={{ color: '#64748b', fontSize: 13 }}>
          Lancez <code style={{ background: '#1e293b', padding: '2px 8px', borderRadius: 4 }}>npm start</code> dans le terminal.
        </p>
      </div>
    );
  }

  return (
    <AppProvider>
      <ConfirmProvider>
        <AppContent />
      </ConfirmProvider>
    </AppProvider>
  );
}