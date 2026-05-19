import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../components/ConfirmDialog';
import {
  Bell, Info, AlertTriangle, AlertCircle, CheckCircle2,
  Trash2, Check, Zap, ArrowRight
} from 'lucide-react';

const ICONS = {
  info: { icon: Info, cls: 'info' },
  warning: { icon: AlertTriangle, cls: 'warning' },
  danger: { icon: AlertCircle, cls: 'danger' },
  success: { icon: CheckCircle2, cls: 'success' }
};

// Mots-clés → page de navigation
function getActionPage(notif) {
  const t = (notif.titre + ' ' + (notif.message || '')).toLowerCase();
  if (t.includes('loyer') || t.includes('impayé') || t.includes('retard')) return 'loyer';
  if (t.includes('bail') || t.includes('locataire') || t.includes('bien')) return 'biens';
  if (t.includes('document') || t.includes('expir')) return 'biens';
  if (t.includes('backup') || t.includes('sauvegarde')) return 'parametres';
  return null;
}

const PAGE_LABELS = { loyer: 'Voir Loyers', biens: 'Voir Biens', parametres: 'Paramètres' };

export default function Notifications({ onNavigate }) {
  const { notifications, loadNotifications, addNotification } = useApp();
  const [filter, setFilter]     = useState('all');
  const [checking, setChecking] = useState(false);
  const { confirm } = useConfirm();

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const filtered = notifications.filter(n => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !n.lu;
    return n.type === filter;
  });

  const handleMarkRead = async (id) => {
    await window.api.notifications.markRead(id);
    await loadNotifications();
  };

  const handleMarkAllRead = async () => {
    await Promise.all(notifications.filter(n => !n.lu).map(n => window.api.notifications.markRead(n.id)));
    await loadNotifications();
  };

  const handleClearAll = async () => {
    const ok = await confirm({
      type: 'danger',
      title: 'Supprimer toutes les notifications',
      message: 'Toutes vos notifications seront définitivement supprimées. Cette action est irréversible.',
      confirmText: 'Tout supprimer',
      cancelText: 'Annuler'
    });
    if (!ok) return;
    await window.api.notifications.deleteAll();
    await loadNotifications();
  };

  const counts = {
    all: notifications.length,
    unread: notifications.filter(n => !n.lu).length,
    info: notifications.filter(n => n.type === 'info').length,
    warning: notifications.filter(n => n.type === 'warning').length,
    danger: notifications.filter(n => n.type === 'danger').length,
    success: notifications.filter(n => n.type === 'success').length
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={`${counts.unread} non lue${counts.unread > 1 ? 's' : ''} • ${counts.all} au total`}
        onRefresh={loadNotifications}
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={async () => {
              setChecking(true);
              const res = await window.api.alertes.checkAll();
              setChecking(false);
              await loadNotifications();
              addNotification({ type: res?.generated > 0 ? 'warning' : 'success', titre: 'Alertes vérifiées', message: res?.generated > 0 ? `${res.generated} nouvelle(s) alerte(s)` : 'Aucune nouvelle alerte' });
            }} disabled={checking}>
              {checking ? <><div className="spinner" style={{ width: 13, height: 13 }} /> Vérification…</> : <><Zap size={13} /> Vérifier alertes</>}
            </button>
            {counts.unread > 0 && (
              <button className="btn btn-secondary" onClick={handleMarkAllRead}>
                <Check size={14} /> Tout marquer lu
              </button>
            )}
            {counts.all > 0 && (
              <button className="btn btn-ghost" onClick={handleClearAll}>
                <Trash2 size={14} /> Tout effacer
              </button>
            )}
          </>
        }
      />

      <div className="page-container">
        {/* Filtres */}
        <div style={{
          display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap'
        }}>
          <FilterChip label="Toutes" count={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} color="var(--accent-blue)" />
          <FilterChip label="Non lues" count={counts.unread} active={filter === 'unread'} onClick={() => setFilter('unread')} color="var(--accent-blue)" />
          <FilterChip label="Infos" count={counts.info} active={filter === 'info'} onClick={() => setFilter('info')} color="var(--accent-blue)" />
          <FilterChip label="Alertes" count={counts.warning} active={filter === 'warning'} onClick={() => setFilter('warning')} color="var(--accent-orange)" />
          <FilterChip label="Critiques" count={counts.danger} active={filter === 'danger'} onClick={() => setFilter('danger')} color="var(--accent-red)" />
          <FilterChip label="Succès" count={counts.success} active={filter === 'success'} onClick={() => setFilter('success')} color="var(--accent-green)" />
        </div>

        {/* Liste */}
        {filtered.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon"><Bell size={28} /></div>
              <div className="empty-state-title">Aucune notification</div>
              <div className="empty-state-text">
                {filter === 'all'
                  ? 'Vous serez alerté ici en cas d\'événement important'
                  : 'Aucune notification dans cette catégorie'}
              </div>
            </div>
          </div>
        ) : (
          <div>
            {filtered.map(n => {
              const meta = ICONS[n.type] || ICONS.info;
              const Icon = meta.icon;
              return (
                <div key={n.id} className={`notif-item ${!n.lu ? 'unread' : ''}`} onClick={() => !n.lu && handleMarkRead(n.id)} style={{ cursor: !n.lu ? 'pointer' : 'default' }}>
                  <div className={`notif-icon ${meta.cls}`}>
                    <Icon size={18} />
                  </div>
                  <div className="notif-content">
                    <div className="notif-title">{n.titre}</div>
                    {n.message && <div className="notif-message">{n.message}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                      <div className="notif-time">{formatRelative(n.created_at)}</div>
                      {onNavigate && getActionPage(n) && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 11, padding: '2px 8px', height: 'auto' }}
                          onClick={(e) => { e.stopPropagation(); onNavigate(getActionPage(n)); }}
                        >
                          {PAGE_LABELS[getActionPage(n)]} <ArrowRight size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                  {!n.lu && (
                    <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id); }} title="Marquer comme lu">
                      <Check size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function FilterChip({ label, count, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px',
        borderRadius: 'var(--radius-full)',
        background: active ? color : 'var(--bg-tertiary)',
        color: active ? 'white' : 'var(--text-secondary)',
        fontSize: 13, fontWeight: 600,
        transition: 'all 150ms',
        border: '1px solid ' + (active ? color : 'var(--border-color)')
      }}
    >
      {label}
      <span style={{
        background: active ? 'rgba(255,255,255,0.25)' : 'var(--bg-card)',
        padding: '1px 8px',
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 700
      }}>{count}</span>
    </button>
  );
}

function formatRelative(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = (now - date) / 1000;

  if (diff < 60) return 'À l\'instant';
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)} j`;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
