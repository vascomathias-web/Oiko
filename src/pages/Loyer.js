import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import Gauge from '../components/Gauge';
import { useApp } from '../context/AppContext';
import {
  TrendingUp, CircleDollarSign, HandCoins, AlertCircle, RefreshCw, Check
} from 'lucide-react';

const STATUTS = [
  { v: 'paye', l: 'Payé', c: 'success' },
  { v: 'en_attente', l: 'En attente', c: 'warning' },
  { v: 'retard', l: 'Retard', c: 'danger' },
  { v: 'partiel', l: 'Partiel', c: 'info' }
];

export default function Loyer() {
  const { addNotification } = useApp();
  const [loyers, setLoyers] = useState([]);
  const [stats, setStats] = useState(null);

  const load = useCallback(async () => {
    const [l, s] = await Promise.all([
      window.api.loyers.getAll(),
      window.api.dashboard.stats()
    ]);
    setLoyers(l);
    setStats(s);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async () => {
    await window.api.loyers.generate();
    addNotification({ type: 'info', titre: 'Loyers générés', message: 'Loyers du mois créés pour tous les locataires' });
    await load();
  };

  const handleStatutChange = async (id, newStatut) => {
    await window.api.loyers.updateStatut(id, newStatut);
    await load();
  };

  if (!stats) return (
    <><PageHeader title="Loyer" /><div className="page-container"><div className="empty-state"><div className="spinner spinner-lg" /></div></div></>
  );

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const loyersCourants = loyers.filter(l => l.mois === currentMonth && l.annee === currentYear);

  return (
    <>
      <PageHeader
        title="Loyer"
        subtitle={`Gestion des loyers - ${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`}
        onRefresh={load}
        actions={
          <button className="btn btn-primary" onClick={handleGenerate}>
            <RefreshCw size={16} /> Générer loyers du mois
          </button>
        }
      />

      <div className="page-container">
        {/* 4 cards principales */}
        <div className="grid grid-4 mb-6">
          <div className="gauge-card">
            <div className="gauge-label">Loyer Attendu</div>
            <Gauge
              value={stats.loyerAttendu}
              max={Math.max(stats.loyerAttendu * 1.2, 1000)}
              color="blue"
              displayValue={`${formatMoney(stats.loyerAttendu)} €`}
            />
          </div>
          <div className="gauge-card">
            <div className="gauge-label">Total Encaissé</div>
            <Gauge
              value={stats.totalEncaisse}
              max={Math.max(stats.loyerAttendu, 1000)}
              color="green"
              displayValue={`${formatMoney(stats.totalEncaisse)} €`}
            />
          </div>
          <div className="gauge-card">
            <div className="gauge-label">Aides APL / AL</div>
            <Gauge
              value={stats.aidesApl}
              max={Math.max(stats.aidesApl * 2, 1000)}
              color="orange"
              displayValue={`${formatMoney(stats.aidesApl)} €`}
            />
          </div>
          <div className="stat-card red">
            <div className="stat-card-header">
              <div className="stat-card-label">Retards de Paiement</div>
              <div className="stat-card-icon" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                <AlertCircle size={18} />
              </div>
            </div>
            <div className="stat-card-value">{stats.retardsPaiement}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              À relancer rapidement
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Locataire</th>
                <th>Appartement</th>
                <th>Loyer</th>
                <th>Aide</th>
                <th>Net</th>
                <th>Statut</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loyersCourants.length === 0 ? (
                <tr><td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-state-icon"><CircleDollarSign size={28} /></div>
                    <div className="empty-state-title">Aucun loyer pour ce mois</div>
                    <div className="empty-state-text">Cliquez sur "Générer loyers du mois"</div>
                  </div>
                </td></tr>
              ) : loyersCourants.map(l => {
                const statut = STATUTS.find(s => s.v === l.statut) || STATUTS[1];
                const net = (l.montant || 0) - (l.aide || 0);
                return (
                  <tr key={l.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{l.prenom} {l.nom}</div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{l.bien_adresse || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{formatMoney(l.montant)} €</td>
                    <td style={{ color: '#f59e0b' }}>{formatMoney(l.aide)} €</td>
                    <td style={{ fontWeight: 600, color: '#10b981' }}>{formatMoney(net)} €</td>
                    <td>
                      <select
                        value={l.statut}
                        onChange={(e) => handleStatutChange(l.id, e.target.value)}
                        className="form-select"
                        style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600 }}
                      >
                        {STATUTS.map(s => (
                          <option key={s.v} value={s.v}>{s.l}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {l.statut !== 'paye' && (
                        <button className="btn btn-success btn-pill btn-sm" onClick={() => handleStatutChange(l.id, 'paye')}>
                          <Check size={12} /> Marquer payé
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function formatMoney(n) {
  const num = parseFloat(n) || 0;
  return num.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
