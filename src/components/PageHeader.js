import React, { useState, useRef, useEffect } from 'react';
import {
  Bell, RefreshCw, Settings, Info, X, Copy, Check, LogOut,
  BookOpen, Download, ExternalLink, FileText, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, AlertCircle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import Modal from './Modal';

export default function PageHeader({ title, subtitle, onRefresh, actions, onNavigate }) {
  const { notifications, parametres } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const menuRef = useRef(null);

  const unreadCount = notifications.filter(n => !n.lu).length;
  const userName = parametres.user_name || 'Utilisateur';
  const userInitial = userName.trim().charAt(0).toUpperCase() || 'U';

  // Ferme le menu au clic à l'extérieur
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const openGuide = () => {
    setMenuOpen(false);
    setShowGuide(true);
  };

  const goToSettings = () => {
    setMenuOpen(false);
    if (window.__gestimmo_navigate) window.__gestimmo_navigate('parametres');
  };

  const openAbout = () => {
    setMenuOpen(false);
    setAboutOpen(true);
  };

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <div className="page-subtitle">{subtitle}</div>}
        </div>

        <div className="header-actions">
          {actions}
          {onRefresh && (
            <button className="header-btn" onClick={onRefresh} title="Actualiser">
              <RefreshCw size={18} />
            </button>
          )}
          <button
            className="header-btn"
            title="Notifications"
            onClick={() => window.__gestimmo_navigate?.('notifications')}
          >
            <Bell size={18} />
            {unreadCount > 0 && <span className="header-btn-badge" />}
          </button>

          {/* Menu utilisateur */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <div
              className="user-avatar"
              title={userName}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {userInitial}
            </div>

            {menuOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 10px)',
                right: 0,
                width: 240,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 500,
                overflow: 'hidden',
                animation: 'modalIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
              }}>
                {/* Header avec nom + avatar */}
                <div style={{
                  padding: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  borderBottom: '1px solid var(--border-color)',
                  background: 'var(--bg-tertiary)'
                }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: '50%',
                    background: 'var(--gradient-purple)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontWeight: 700, fontSize: 16,
                    boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
                    flexShrink: 0
                  }}>
                    {userInitial}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 700,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {userName}
                    </div>
                    <div style={{
                      fontSize: 11, color: 'var(--text-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {parametres.user_email || 'Aucun email renseigné'}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ padding: 6 }}>
                  <MenuButton icon={<Settings size={15} />} label="Paramètres" onClick={goToSettings} />
                  <MenuButton icon={<BookOpen size={15} />} label="Guide d'utilisation" onClick={openGuide} />
                  <MenuButton icon={<Info size={15} />} label="À propos" onClick={openAbout} />
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <AboutModal isOpen={aboutOpen} onClose={() => setAboutOpen(false)} />
      <GuideModal isOpen={showGuide} onClose={() => setShowGuide(false)} />
    </>
  );
}

function MenuButton({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        color: 'var(--text-primary)',
        fontSize: 13.5,
        fontWeight: 500,
        transition: 'background 150ms',
        textAlign: 'left'
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ color: 'var(--text-muted)', display: 'flex' }}>{icon}</span>
      {label}
    </button>
  );
}

function AboutModal({ isOpen, onClose }) {
  const [info, setInfo] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  useEffect(() => {
    if (isOpen && window.api?.app?.getInfo) {
      window.api.app.getInfo().then(setInfo);
    }
  }, [isOpen]);

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="À propos de GestImmo">
      {/* Logo + nom */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '10px 0 24px', gap: 10
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'var(--gradient-blue)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 20px rgba(59, 130, 246, 0.3)',
          fontSize: 28, fontWeight: 800, color: 'white',
          letterSpacing: '-0.05em'
        }}>
          G
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>GestImmo</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Comptabilité immobilière assistée par IA
          </div>
        </div>
        {info && (
          <div style={{
            padding: '4px 12px',
            background: 'rgba(59, 130, 246, 0.1)',
            color: 'var(--accent-blue)',
            borderRadius: 'var(--radius-full)',
            fontSize: 12,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)'
          }}>
            v{info.version}
          </div>
        )}
      </div>

      {/* Informations techniques */}
      {info && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <InfoRow
            label="Plateforme"
            value={info.platform === 'win32' ? 'Windows' : info.platform === 'darwin' ? 'macOS' : 'Linux'}
          />
          <InfoRow label="Electron" value={info.electronVersion} mono />
          <InfoRow label="Node.js" value={info.nodeVersion} mono />
          <InfoRow
            label="Base de données"
            value={info.dbPath}
            mono
            small
            copyable
            onCopy={() => copyToClipboard(info.dbPath, 'db')}
            copied={copiedField === 'db'}
          />
          <InfoRow
            label="Fichiers Excel"
            value={info.excelFolder}
            mono
            small
            copyable
            onCopy={() => copyToClipboard(info.excelFolder, 'excel')}
            copied={copiedField === 'excel'}
          />
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: 24,
        paddingTop: 16,
        borderTop: '1px solid var(--border-color)',
        textAlign: 'center',
        fontSize: 11,
        color: 'var(--text-muted)',
        lineHeight: 1.6
      }}>
        🔐 Toutes les données sont stockées localement<br />
        Chiffrement AES-256 des numéros d'identification sensibles
      </div>
    </Modal>
  );
}

function InfoRow({ label, value, mono, small, copyable, onCopy, copied }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 12px',
      background: 'var(--bg-tertiary)',
      borderRadius: 'var(--radius-md)',
      gap: 10
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>
        {label}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        minWidth: 0, flex: 1, justifyContent: 'flex-end'
      }}>
        <div style={{
          fontSize: small ? 11 : 13,
          fontWeight: 500,
          fontFamily: mono ? 'var(--font-mono)' : 'inherit',
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          direction: copyable ? 'rtl' : 'ltr'
        }}
          title={value}>
          {value}
        </div>
        {copyable && (
          <button
            onClick={onCopy}
            className="btn btn-ghost btn-icon"
            style={{ width: 26, height: 26, flexShrink: 0 }}
            title="Copier"
          >
            {copied ? <Check size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />}
          </button>
        )}
      </div>
    </div>
  );
}
function GuideModal({ isOpen, onClose }) {
  const [pdfFile, setPdfFile] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const scrollContainerRef = useRef(null);
  const pageRefs = useRef([]);

  // Lazy import de react-pdf pour éviter de plomber le bundle initial
  const [pdfComponents, setPdfComponents] = useState(null);

  useEffect(() => {
    if (!isOpen) return; // On ne charge rien tant que le modal est fermé
    const loadPdf = async () => {
      try {
        // Charge react-pdf dynamiquement
        const reactPdf = await import('react-pdf');
        reactPdf.pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', window.location.href).toString();

        setPdfComponents({
          Document: reactPdf.Document,
          Page: reactPdf.Page
        });

        // Charge le PDF depuis le backend
        const result = await window.api.app.getGuideData();
        if (result.success) {
          const binary = atob(result.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          setPdfFile({ data: bytes });
          setLoaded(true);
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };
    loadPdf();
  }, [isOpen]);

  const handleDownload = async () => {
    setDownloading(true);
    const result = await window.api.app.downloadGuide();
    setDownloading(false);
    if (result.success) {
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2500);
    } else if (!result.canceled) {
      alert('Erreur : ' + result.error);
    }
  };

  const scrollToPage = (pageNum) => {
    const el = pageRefs.current[pageNum - 1];
    if (el && scrollContainerRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const goPrev = () => {
    const target = Math.max(1, currentPage - 1);
    setCurrentPage(target);
    scrollToPage(target);
  };

  const goNext = () => {
    const target = Math.min(numPages, currentPage + 1);
    setCurrentPage(target);
    scrollToPage(target);
  };
  const zoomIn = () => {
    setScale(s => Math.min(2.5, s + 0.2));
    setTimeout(() => scrollToPage(currentPage), 100);
  };
  const zoomOut = () => {
    setScale(s => Math.max(0.5, s - 0.2));
    setTimeout(() => scrollToPage(currentPage), 100);
  };
  const resetZoom = () => {
    setScale(1.0);
    setTimeout(() => scrollToPage(currentPage), 100);
  };

  // Gestion clavier : flèches pour naviguer, Échap pour fermer
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [numPages, onClose]);

  // Détecte la page actuellement visible pendant le scroll
  useEffect(() => {
    if (!loaded || !numPages) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Trouve la page dont le haut est le plus proche du haut du conteneur
      const containerTop = container.scrollTop;
      const containerMiddle = containerTop + container.clientHeight / 3;

      let closestPage = 1;
      let closestDistance = Infinity;

      pageRefs.current.forEach((el, idx) => {
        if (!el) return;
        const elTop = el.offsetTop;
        const distance = Math.abs(elTop - containerMiddle);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPage = idx + 1;
        }
      });

      setCurrentPage(closestPage);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [loaded, numPages]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ zIndex: 2000 }}
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '90vw',
          width: 900,
          maxHeight: '90vh',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', flexShrink: 0
          }}>
            <BookOpen size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>
              Guide d'utilisation
            </h2>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {numPages ? `${numPages} pages` : 'Chargement...'}
            </p>
          </div>

          {/* Bouton télécharger */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleDownload}
            disabled={downloading || loading}
            title="Télécharger une copie sur votre ordinateur"
          >
            {downloaded
              ? <><Check size={14} style={{ color: '#10b981' }} /> Téléchargé</>
              : downloading
                ? <><div className="spinner" /> Téléchargement</>
                : <><Download size={14} /> Télécharger</>
            }
          </button>

          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Barre de contrôles */}
        {!loading && !error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 24px',
            background: 'var(--bg-tertiary)',
            borderBottom: '1px solid var(--border-color)',
            fontSize: 12
          }}>
            <button
              className="btn btn-ghost btn-icon"
              onClick={goPrev}
              disabled={currentPage <= 1}
              title="Page précédente (←)"
            >
              <ChevronLeft size={16} />
            </button>

            <div style={{
              minWidth: 80,
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'var(--font-mono)'
            }}>
              {currentPage} / {numPages || '?'}
            </div>

            <button
              className="btn btn-ghost btn-icon"
              onClick={goNext}
              disabled={currentPage >= numPages}
              title="Page suivante (→)"
            >
              <ChevronRight size={16} />
            </button>

            <div style={{ flex: 1 }} />

            <button
              className="btn btn-ghost btn-icon"
              onClick={zoomOut}
              disabled={scale <= 0.5}
              title="Dézoomer"
            >
              <ZoomOut size={16} />
            </button>

            <button
              onClick={resetZoom}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                background: 'transparent',
                border: '1px solid var(--border-color)',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                minWidth: 56,
                cursor: 'pointer'
              }}
              title="Réinitialiser le zoom"
            >
              {Math.round(scale * 100)}%
            </button>

            <button
              className="btn btn-ghost btn-icon"
              onClick={zoomIn}
              disabled={scale >= 2.5}
              title="Zoomer"
            >
              <ZoomIn size={16} />
            </button>
          </div>
        )}

        {/* Zone d'affichage du PDF */}
        {/* Zone d'affichage du PDF */}
        <div
          ref={scrollContainerRef}
          style={{
            flex: 1,
            overflow: 'auto',
            background: '#525659',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: (loading || error) ? 40 : 20,
            minHeight: 400
          }}
        >
          {loading && (
            <div style={{ textAlign: 'center', color: 'white' }}>
              <div className="spinner spinner-lg" style={{ margin: '0 auto 12px', borderColor: 'white', borderTopColor: 'transparent' }} />
              <div style={{ fontSize: 13 }}>Chargement du guide...</div>
            </div>
          )}

          {error && (
            <div style={{
              textAlign: 'center',
              padding: 30,
              background: 'white',
              borderRadius: 10,
              maxWidth: 400
            }}>
              <AlertCircle size={32} style={{ color: '#ef4444', marginBottom: 10 }} />
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: '#1e293b' }}>
                Impossible de charger le guide
              </div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                {error}
              </div>
            </div>
          )}
          {!loading && !error && pdfComponents && pdfFile && (
            <pdfComponents.Document
              file={pdfFile}
              onLoadSuccess={({ numPages }) => {
                setNumPages(numPages);
                pageRefs.current = new Array(numPages).fill(null);
              }}
              onLoadError={(err) => setError(err.message)}
              loading={
                <div style={{ textAlign: 'center', color: 'white', padding: 40 }}>
                  <div className="spinner spinner-lg" style={{ margin: '0 auto 12px', borderColor: 'white', borderTopColor: 'transparent' }} />
                </div>
              }
            >
              {numPages && Array.from({ length: numPages }, (_, i) => (
                <div
                  key={`page-${i + 1}`}
                  ref={el => pageRefs.current[i] = el}
                  style={{
                    marginBottom: 16,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    display: 'flex',
                    justifyContent: 'center',
                    position: 'relative'
                  }}
                >
                  <pdfComponents.Page
                    pageNumber={i + 1}
                    scale={scale}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                  {/* Numéro de page en bas à droite */}
                  <div style={{
                    position: 'absolute',
                    bottom: 8,
                    right: 12,
                    padding: '3px 8px',
                    background: 'rgba(0, 0, 0, 0.6)',
                    color: 'white',
                    fontSize: 10,
                    fontWeight: 600,
                    borderRadius: 4,
                    fontFamily: 'var(--font-mono)',
                    pointerEvents: 'none'
                  }}>
                    {i + 1} / {numPages}
                  </div>
                </div>
              ))}
            </pdfComponents.Document>
          )}
        </div>

        {/* Footer info */}
        <div style={{
          padding: '10px 24px',
          borderTop: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          fontSize: 11,
          color: 'var(--text-muted)',
          textAlign: 'center'
        }}>
          💡 Utilisez les flèches ← → du clavier pour naviguer, ou Échap pour fermer
        </div>
      </div>
    </div>
  );
}