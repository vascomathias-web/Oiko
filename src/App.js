import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ConfirmProvider } from './components/ConfirmDialog';
import Sidebar from './components/Sidebar';
import WelcomeModal from './components/WelcomeModal';
import GlobalSearch from './components/GlobalSearch';
import ClientSelector from './pages/ClientSelector';
import Activation from './pages/Activation';

import Dashboard from './pages/Dashboard';
import Facture from './pages/Facture';
import Loyer from './pages/Loyer';
import Recapitulatif from './pages/Recapitulatif';
import Biens from './pages/Biens';
import AssistantIA from './pages/AssistantIA';
import Notifications from './pages/Notifications';
import Parametres from './pages/Parametres';
import Travaux from './pages/Travaux';
import Charges from './pages/Charges';
import Calendrier from './pages/Calendrier';
import EtatDesLieux from './pages/EtatDesLieux';
import TitleBar from './components/TitleBar';

const PAGES = {
  dashboard: Dashboard,
  facture: Facture,
  loyer: Loyer,
  recapitulatif: Recapitulatif,
  biens: Biens,
  travaux: Travaux,
  charges: Charges,
  edl: EtatDesLieux,
  calendrier: Calendrier,
  ia: AssistantIA,
  notifications: Notifications,
  parametres: Parametres
};

function AppContent() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const { notifications, parametres } = useApp();
  const unreadCount = notifications.filter(n => !n.lu).length;

  const Page = PAGES[currentPage] || Dashboard;

  const [showWelcome, setShowWelcome]       = useState(false);
  const [showSearch,  setShowSearch]        = useState(false);

  // ── Licence ─────────────────────────────────────────────────────────
  const [licenseStatus,  setLicenseStatus]  = useState(null);  // null = chargement
  const [licenseInfo,    setLicenseInfo]    = useState(null);

  useEffect(() => {
    (async () => {
      const status = await window.api.license.check();
      setLicenseStatus(status);
      if (status.status === 'valid' || status.status === 'grace') {
        setLicenseInfo(status);
      }
    })();
  }, []);

  // ── Gestion multi-dossiers ──────────────────────────────────────────
  const [clientLoading,    setClientLoading]    = useState(true);
  const [currentClient,    setCurrentClient]    = useState(null);
  const [showClientSwitch, setShowClientSwitch] = useState(false);

  // Au démarrage : vérifier quel dossier client est actif
  useEffect(() => {
    if (!licenseStatus) return; // attendre la vérif licence d'abord
    if (licenseStatus.status !== 'valid' && licenseStatus.status !== 'grace') return;
    (async () => {
      const client = await window.api.clients.getCurrent();
      setCurrentClient(client || null);
      setClientLoading(false);
    })();
  }, [licenseStatus]);

  // Quand l'utilisateur choisit / crée un dossier
  const handleClientSelected = (client) => {
    setCurrentClient(client);
    setShowClientSwitch(false);
    // Recharger la page pour que tous les composants relisent la nouvelle DB
    setCurrentPage('dashboard');
  };
  // ───────────────────────────────────────────────────────────────────

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
  React.useEffect(() => {
    window.__gestimmo_navigate = setCurrentPage;
    return () => { delete window.__gestimmo_navigate; };
  }, []);

  // Raccourci clavier Ctrl+K → ouvre la recherche globale
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(s => !s);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Chargement licence ───────────────────────────────────────────────
  if (!licenseStatus) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0f172a'
      }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  // ── Activation requise ───────────────────────────────────────────────
  if (licenseStatus.status === 'not_activated' || licenseStatus.status === 'revoked') {
    return (
      <Activation
        onActivated={(info) => {
          setLicenseStatus({ status: 'valid', ...info });
          setLicenseInfo(info);
        }}
      />
    );
  }

  // ── Licence expirée ─────────────────────────────────────────────────
  if (licenseStatus.status === 'expired') {
    return <LicenseExpired info={licenseStatus} onReactivate={() => setLicenseStatus({ status: 'not_activated' })} />;
  }

  // ── Chargement dossier client ─────────────────────────────────────────
  if (clientLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0f172a'
      }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  // Aucun dossier actif → montrer le sélecteur
  if (!currentClient || showClientSwitch) {
    return (
      <ClientSelector onClientSelected={handleClientSelected} />
    );
  }

  return (
    <div className="app-container">
      {licenseStatus?.status === 'grace' && (
        <GraceBanner daysLeft={licenseStatus.daysLeft} />
      )}
      <TitleBar />
      <div className="app-body">
        <Sidebar
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          unreadCount={unreadCount}
          onOpenSearch={() => setShowSearch(true)}
          currentClient={currentClient}
          onSwitchClient={() => setShowClientSwitch(true)}
        />
        <main className="main-content">
          <Page onNavigate={setCurrentPage} />
        </main>
      </div>
      {showWelcome && <WelcomeModal onClose={() => setShowWelcome(false)} />}
      <GlobalSearch
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        onNavigate={(page) => { setCurrentPage(page); setShowSearch(false); }}
      />
    </div>
  );
}

// ── Bandeau mode grâce (hors ligne) ─────────────────────────────────────────
function GraceBanner({ daysLeft }) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9000,
      background: 'linear-gradient(90deg, #f59e0b, #d97706)',
      padding: '8px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      fontSize: 13, fontWeight: 600, color: 'white'
    }}>
      ⚠️ Mode hors ligne — Reconnectez-vous à internet dans {daysLeft} jour{daysLeft > 1 ? 's' : ''} pour revalider votre licence.
    </div>
  );
}

// ── Écran licence expirée ────────────────────────────────────────────────────
function LicenseExpired({ info, onReactivate }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#0f172a', flexDirection: 'column', gap: 20, padding: 40
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 20,
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 8
      }}>
        <span style={{ color: 'white', fontWeight: 900, fontSize: 24 }}>Oï</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'white' }}>Licence expirée</div>
      <div style={{ fontSize: 14, color: '#94a3b8', textAlign: 'center', maxWidth: 400, lineHeight: 1.6 }}>
        Votre licence Oïko {info?.plan ? `(plan ${info.plan})` : ''} a expiré
        {info?.expires ? ` le ${new Date(info.expires).toLocaleDateString('fr-FR')}` : ''}.
        <br />Renouvelez pour continuer à accéder à vos données.
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button
          onClick={() => window.api.shell.openExternal('https://oiko.app/renouveler')}
          style={{
            padding: '12px 24px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer'
          }}
        >
          Renouveler ma licence
        </button>
        <button
          onClick={onReactivate}
          style={{
            padding: '12px 24px', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'transparent', color: '#94a3b8',
            fontWeight: 600, fontSize: 14, cursor: 'pointer'
          }}
        >
          Entrer une nouvelle clé
        </button>
      </div>
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
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>Oïko</h2>
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