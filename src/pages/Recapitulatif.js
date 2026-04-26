import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, AreaChart, Area
} from 'recharts';
import { TrendingUp, TrendingDown, Wallet, Calendar } from 'lucide-react';

export default function Recapitulatif() {
  const [dataMensuel, setDataMensuel] = useState([]);
  const [dataAnnuel, setDataAnnuel] = useState([]);
  const [view, setView] = useState('mensuel');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [evo, evoAnn] = await Promise.all([
      window.api.dashboard.evolution(),
      window.api.dashboard.evolutionAnnuelle()
    ]);
    setDataMensuel(evo || []);
    setDataAnnuel(evoAnn || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Données actives selon la vue
  const data = view === 'mensuel' ? dataMensuel : dataAnnuel;

  // Totaux sur la période active
  const totalRevenus = data.reduce((s, d) => s + (d.revenus || 0), 0);
  const totalDepenses = data.reduce((s, d) => s + (d.depenses || 0), 0);
  const solde = totalRevenus - totalDepenses;

  // Variations : on compare soit mois en cours vs mois précédent, soit année en cours vs année précédente
  const calcVariation = (current, previous) => {
    if (!previous || previous === 0) return null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
  };

  let variationRevenus = null;
  let variationDepenses = null;

  if (view === 'mensuel' && dataMensuel.length >= 2) {
    // On prend le dernier mois avec des données non nulles, et le précédent
    const nonZero = dataMensuel.filter(d => (d.revenus + d.depenses) > 0);
    if (nonZero.length >= 2) {
      const last = nonZero[nonZero.length - 1];
      const prev = nonZero[nonZero.length - 2];
      variationRevenus = calcVariation(last.revenus, prev.revenus);
      variationDepenses = calcVariation(last.depenses, prev.depenses);
    }
  } else if (view === 'annuel' && dataAnnuel.length >= 2) {
    const last = dataAnnuel[dataAnnuel.length - 1];
    const prev = dataAnnuel[dataAnnuel.length - 2];
    variationRevenus = calcVariation(last.revenus, prev.revenus);
    variationDepenses = calcVariation(last.depenses, prev.depenses);
  }

  // Libellés dynamiques selon la vue
  const currentYear = new Date().getFullYear();
  const periodeLabel = view === 'mensuel' ? currentYear : '5 dernières années';
  const xAxisLabel = view === 'mensuel' ? 'Mois' : 'Année';

  return (
    <>
      <PageHeader
        title="Récapitulatif"
        subtitle="Analyse financière complète"
        onRefresh={load}
        actions={
          <div style={{
            display: 'flex', gap: 6, padding: 4,
            background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)'
          }}>
            <button
              className={view === 'mensuel' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              onClick={() => setView('mensuel')}
            >
              Mensuel
            </button>
            <button
              className={view === 'annuel' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              onClick={() => setView('annuel')}
            >
              Annuel
            </button>
          </div>
        }
      />

      <div className="page-container">
        {loading ? (
          <div className="empty-state">
            <div className="spinner spinner-lg" style={{ margin: '40px auto' }} />
          </div>
        ) : (
          <>
            {/* Résumé financier */}
            <div className="grid grid-3 mb-6">
              <StatCard
                label={`Total Revenus ${periodeLabel}`}
                value={totalRevenus}
                color="#10b981"
                icon={TrendingUp}
                variation={variationRevenus}
              />
              <StatCard
                label={`Total Dépenses ${periodeLabel}`}
                value={totalDepenses}
                color="#f59e0b"
                icon={TrendingDown}
                variation={variationDepenses}
                inverse
              />
              <div className="stat-card">
                <div className="stat-card-header">
                  <div className="stat-card-label">Solde Net</div>
                  <div className="stat-card-icon" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>
                    <Wallet size={18} />
                  </div>
                </div>
                <div className="stat-card-value" style={{ color: solde >= 0 ? '#10b981' : '#ef4444' }}>
                  {formatMoney(solde)} €
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  Revenus − Dépenses
                </div>
              </div>
            </div>

            {/* Graphique évolution */}
            <div className="card mb-6">
              <div className="card-header">
                <div className="card-title">
                  <div className="card-title-icon"><Calendar size={18} /></div>
                  {view === 'mensuel'
                    ? `Évolution mensuelle ${currentYear}`
                    : 'Évolution sur 5 ans'}
                </div>
              </div>

              {data.length === 0 || data.every(d => !d.revenus && !d.depenses) ? (
                <EmptyGraph label={xAxisLabel} />
              ) : (
                <ResponsiveContainer width="100%" height={360}>
                  <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradDep" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                    <XAxis dataKey="mois" stroke="var(--text-muted)" fontSize={12} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        color: 'var(--text-primary)'
                      }}
                      formatter={(v) => `${formatMoney(v)} €`}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="revenus" stroke="#10b981" strokeWidth={3} fill="url(#gradRev)" name="Revenus" />
                    <Area type="monotone" dataKey="depenses" stroke="#f59e0b" strokeWidth={3} fill="url(#gradDep)" name="Dépenses" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Comparaison */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <div className="card-title-icon" style={{ background: 'var(--gradient-purple)' }}>
                    <TrendingUp size={18} />
                  </div>
                  {view === 'mensuel'
                    ? 'Comparaison Revenus / Dépenses par mois'
                    : 'Comparaison Revenus / Dépenses par année'}
                </div>
              </div>

              {data.length === 0 || data.every(d => !d.revenus && !d.depenses) ? (
                <EmptyGraph label={xAxisLabel} />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                    <XAxis dataKey="mois" stroke="var(--text-muted)" fontSize={12} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        color: 'var(--text-primary)'
                      }}
                      formatter={(v) => `${formatMoney(v)} €`}
                    />
                    <Legend />
                    <Bar dataKey="revenus" fill="#10b981" radius={[8, 8, 0, 0]} name="Revenus" />
                    <Bar dataKey="depenses" fill="#f59e0b" radius={[8, 8, 0, 0]} name="Dépenses" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function StatCard({ label, value, color, icon: Icon, variation, inverse }) {
  const hasVariation = variation !== null && variation !== undefined;
  const isUp = variation > 0;
  const isDown = variation < 0;
  const isZero = variation === 0;

  // Pour les dépenses, une hausse est "négative" (rouge) et une baisse "positive" (vert)
  const variationColorClass = inverse
    ? (isUp ? 'negative' : isDown ? 'positive' : '')
    : (isUp ? 'positive' : isDown ? 'negative' : '');

  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <div className="stat-card-label">{label}</div>
        <div className="stat-card-icon" style={{ background: color + '26', color }}>
          <Icon size={18} />
        </div>
      </div>
      <div className="stat-card-value" style={{ color }}>
        {formatMoney(value)} €
      </div>
      {hasVariation ? (
        <div className={`stat-card-change ${variationColorClass}`}>
          {isUp && <><TrendingUp size={12} /> +{variation}%</>}
          {isDown && <><TrendingDown size={12} /> {variation}%</>}
          {isZero && <>— stable</>}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>
          Pas de référence
        </div>
      )}
    </div>
  );
}

function EmptyGraph({ label }) {
  return (
    <div style={{
      padding: '60px 20px',
      textAlign: 'center',
      color: 'var(--text-muted)',
      fontSize: 13
    }}>
      <Calendar size={32} style={{ opacity: 0.3, marginBottom: 10 }} />
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Aucune donnée</div>
      <div style={{ fontSize: 12 }}>
        Ajoutez des loyers et factures pour voir vos {label.toLowerCase()}s apparaître ici.
      </div>
    </div>
  );
}

function formatMoney(n) {
  const num = parseFloat(n) || 0;
  return num.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}