import React from 'react';
import {
  LayoutDashboard, Receipt, Home, BarChart3, Building2,
  Bot, Bell, Settings, Building
} from 'lucide-react';

const MENU = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'facture', label: 'Facture', icon: Receipt },
  { id: 'loyer', label: 'Loyer', icon: Home },
  { id: 'recapitulatif', label: 'Récapitulatif', icon: BarChart3 },
  { id: 'biens', label: 'Biens & Locataires', icon: Building2 },
  { id: 'ia', label: 'Assistant IA', icon: Bot },
  { id: 'notifications', label: 'Notification', icon: Bell },
  { id: 'parametres', label: 'Paramètre', icon: Settings }
];

export default function Sidebar({ currentPage, onNavigate, unreadCount = 0 }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Building size={20} color="white" />
          </div>
          <div>
            <div className="sidebar-logo-text">GestImmo</div>
            <div className="sidebar-logo-subtext">Comptabilité IA</div>
          </div>
        </div>
      </div>

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
                  marginLeft: 'auto',
                  background: '#ef4444',
                  color: 'white',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 10
                }}>
                  {unreadCount}
                </span>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        GestImmo v1.0 • 2026
      </div>
    </aside>
  );
}
