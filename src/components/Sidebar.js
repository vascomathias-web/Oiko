import React, { useState } from 'react';
import {
  LayoutDashboard, Receipt, Home, BarChart3, Building2,
  Bot, Bell, Settings, Search, Wrench, CalendarDays, ClipboardList, Wallet,
  ChevronDown
} from 'lucide-react';

const MENU = [
  { id: 'dashboard',    label: 'Dashboard',          icon: LayoutDashboard },
  { id: 'biens',        label: 'Biens & Locataires', icon: Building2       },
  { id: 'loyer',        label: 'Loyer',              icon: Home            },
  { id: 'facture',      label: 'Documents & Relevés',icon: Receipt         },
  { id: 'travaux',      label: 'Travaux',            icon: Wrench          },
  { id: 'charges',      label: 'Charges locatives',  icon: Wallet          },
  { id: 'edl',          label: 'États des lieux',    icon: ClipboardList   },
  { id: 'calendrier',   label: 'Calendrier',         icon: CalendarDays    },
  { id: 'recapitulatif',label: 'Récapitulatif',      icon: BarChart3       },
  { id: 'ia',           label: 'Assistant IA',       icon: Bot             },
  { id: 'notifications',label: 'Notifications',      icon: Bell            },
  { id: 'parametres',   label: 'Paramètres',         icon: Settings        }
];

export default function Sidebar({ currentPage, onNavigate, unreadCount = 0, onOpenSearch, currentClient, onSwitchClient }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: 'white', fontWeight: 900, fontSize: 14, letterSpacing: '-1px' }}>Oï</span>
          </div>
          <div>
            <div className="sidebar-logo-text">Oïko</div>
            <div className="sidebar-logo-subtext">Gestion immobilière</div>
          </div>
        </div>
      </div>

      {/* Dossier actif (switcher) */}
      {currentClient && (
        <ClientBadge client={currentClient} onSwitch={onSwitchClient} />
      )}

      {/* Bouton recherche */}
      <SearchButton onOpen={onOpenSearch} />

      <nav className="sidebar-nav">
        {MENU.map(item => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <div
              key={item.id}
              className={`sidebar-item ${isActive ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {item.id === 'notifications' && unreadCount > 0 && (
                <span style={{
                  marginLeft: 'auto', background: '#ef4444', color: 'white',
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10
                }}>
                  {unreadCount}
                </span>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        Oïko v2.0.0 • 2026
      </div>
    </aside>
  );
}

function ClientBadge({ client, onSwitch }) {
  const [hov, setHov] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <div style={{ padding: '0 12px 8px' }}>
      <button
        onClick={onSwitch}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => { setHov(false); setPressed(false); }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        title="Changer de portefeuille"
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '8px 10px',
          borderRadius: 12,
          border: `1px solid ${hov ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)'}`,
          background: pressed
            ? 'rgba(255,255,255,0.14)'
            : hov
              ? 'rgba(255,255,255,0.10)'
              : 'rgba(255,255,255,0.05)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
          transition: 'all 160ms ease',
          transform: pressed ? 'scale(0.98)' : 'scale(1)',
        }}
      >
        {/* Avatar couleur */}
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: client.couleur || '#6366f1',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: 800, fontSize: 11,
          boxShadow: hov ? `0 0 0 2px ${client.couleur || '#6366f1'}55` : 'none',
          transition: 'box-shadow 160ms ease',
        }}>
          {client.initiales || (client.nom || '?').slice(0, 2).toUpperCase()}
        </div>

        {/* Nom */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 700,
            color: hov ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.75)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            transition: 'color 160ms ease',
          }}>
            {client.nom}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
            Portefeuille actif
          </div>
        </div>

        {/* Chevron */}
        <ChevronDown
          size={13}
          style={{
            color: hov ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)',
            flexShrink: 0, transition: 'all 160ms ease',
            transform: hov ? 'translateY(1px)' : 'none',
          }}
        />
      </button>
    </div>
  );
}

function SearchButton({ onOpen }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <div style={{ padding: '0 12px 12px' }}>
      <button
        onClick={onOpen}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setPressed(false); }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '9px 12px',
          borderRadius: 12,
          border: `1px solid ${hovered ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.14)'}`,
          background: pressed
            ? 'rgba(255,255,255,0.18)'
            : hovered
              ? 'rgba(255,255,255,0.14)'
              : 'rgba(255,255,255,0.07)',
          backdropFilter: 'blur(8px)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
          transition: 'all 180ms ease',
          boxShadow: hovered
            ? '0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12)'
            : '0 1px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
          transform: pressed ? 'scale(0.98)' : 'scale(1)',
        }}
      >
        {/* Icône */}
        <div style={{
          width: 26, height: 26, borderRadius: 7,
          background: hovered ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.10)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, transition: 'background 180ms ease'
        }}>
          <Search size={13} style={{ color: hovered ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)' }} />
        </div>

        {/* Texte */}
        <span style={{
          flex: 1,
          fontSize: 13,
          fontWeight: 500,
          color: hovered ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)',
          letterSpacing: '0.01em',
          transition: 'color 180ms ease'
        }}>
          Rechercher…
        </span>

        {/* Raccourci clavier */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 3,
        }}>
          <kbd style={{
            fontSize: 10,
            fontWeight: 700,
            fontFamily: 'inherit',
            color: hovered ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 5,
            padding: '2px 6px',
            lineHeight: 1.4,
            transition: 'all 180ms ease',
            letterSpacing: '0.03em'
          }}>
            ⌘K
          </kbd>
        </div>
      </button>
    </div>
  );
}
