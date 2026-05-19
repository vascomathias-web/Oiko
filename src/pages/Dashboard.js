import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import Gauge from '../components/Gauge';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts';
import {
  TrendingUp, TrendingDown, AlertTriangle, Users, Wallet,
  Receipt, Home, PieChart, CircleDollarSign, Clock, AlertCircle,
  Building2, ChevronDown, Check, ArrowRight, Zap, CalendarDays, RefreshCw,
  CalendarRange, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const YEARS = [2024, 2025, 2026, 2027];

const MOIS_LABELS = ['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];

export default function Dashboard({ onNavigate }) {
  const { notifications } = useApp();
  const [stats, setStats]         = useState(null);
  const [evolution, setEvolution] = useState([]);
  const [parBien, setParBien]     = useState([]);
  const [loyersMois, setLoyersMois] = useState([]);
  const [annee, setAnnee]         = useState(new Date().getFullYear());
  const [loading, setLoading]     = useState(true);
  const [updatingLoyer, setUpdatingLoyer] = useState(null);

  // Bilan annuel N vs N-1
  const [anneeCompar, setAnneeCompar]     = useState(new Date().getFullYear());
  const [evN,   setEvN]                   = useState([]);
  const [evNm1, setEvNm1]                 = useState([]);
  const [loadingCompar, setLoadingCompar] = useState(false);

  const now = new Date();
  const moisCourant  = now.getMonth() + 1;
  const anneeCourante = now.getFullYear();

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [s, ev, pb, allLoyers] = await Promise.all([
      window.api.dashboard.stats(),
      window.api.dashboard.evolution(),
      window.api.dashboard.parBien(annee),
      window.api.loyers.getAll()
    ]);
    setStats(s);
    setEvolution(ev || []);
    setParBien(pb || []);
    // Loyers du mois courant uniquement
    setLoyersMois((allLoyers || []).filter(l => l.mois === moisCourant && l.annee === anneeCourante));
    setLoading(false);
  }, [annee]); // eslint-disable-line

  const handleMarkPaid = async (id) => {
    setUpdatingLoyer(id);
    await window.api.loyers.updateStatut(id, 'paye');
    setUpdatingLoyer(null);
    await loadAll();
  };

  useEffect(() => { loadAll(); }, [loadAll]);

  // Chargement comparaison annuelle
  const loadCompar = useCallback(async () => {
    setLoadingCompar(true);
    const [n, nm1] = await Promise.all([
      window.api.dashboard.evolutionParAnnee(anneeCompar),
      window.api.dashboard.evolutionParAnnee(anneeCompar - 1),
    ]);
    setEvN(n   || []);
    setEvNm1(nm1 || []);
    setLoadingCompar(false);
  }, [anneeCompar]);

  useEffect(() => { loadCompar(); }, [loadCompar]);

  const alertNotifs = notifications.filter(n => (n.type === 'warning' || n.type === 'danger') && !n.lu).slice(0, 5);
  const alertMessages = alertNotifs.map(n => n.titre);
  const hasAlerts = alertMessages.length > 0;

  if (loading || !stats) {
    return (
      <>
        <PageHeader title="Tableau de Bord" onRefresh={loadAll} />
        <div className="page-container">
          <div className="empty-state"><div className="spinner spinner-lg" /></div>
        </div>
      </>
    );
  }

  const totalRevAnnee  = parBien.reduce((s, b) => s + b.revenus, 0);
  const totalCharges   = parBien.reduce((s, b) => s + b.charges, 0);
  const totalSolde     = parBien.reduce((s, b) => s + b.solde,   0);

  return (
    <>
      <PageHeader
        title="Tableau de Bord"
        subtitle="Vue d'ensemble de votre activité"
        onRefresh={loadAll}
      />
      <div className="page-container">

        {/* Sous-titre + Actions rapides */}
        <div style={{ marginBottom: hasAlerts ? 16 : 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', fontWeight: 500 }}>
            Bienvenue sur Oïko — voici un aperçu de votre activité en temps réel
          </div>
          {onNavigate && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <QuickAction icon={Home}        label="Loyers"       color="#3b82f6" onClick={() => onNavigate('loyer')} />
              <QuickAction icon={Zap}         label="Import auto"  color="#10b981" onClick={() => onNavigate('facture')} />
              <QuickAction icon={CalendarDays} label="Calendrier"  color="#8b5cf6" onClick={() => onNavigate('calendrier')} />
            </div>
          )}
        </div>

        {/* Alertes */}
        {hasAlerts && <AlertBanner messages={alertMessages} />}

        {/* Bannière : loyers du mois non générés */}
        {loyersMois.length === 0 && stats.tauxOccupation > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 18px', borderRadius: 10, marginBottom: 16,
            background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)'
          }}>
            <RefreshCw size={18} style={{ color: '#3b82f6', flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>
              Les loyers de <strong style={{ color: 'var(--text-primary)' }}>{MOIS_LABELS[moisCourant - 1]} {anneeCourante}</strong> n'ont pas encore été générés.
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={async () => {
                await window.api.loyers.generate();
                await loadAll();
              }}
            >
              <RefreshCw size={13} /> Générer maintenant
            </button>
          </div>
        )}

        {/* ── KPI cards ── */}
        <div className="grid grid-4 mb-6">
          <StatCard icon={TrendingUp}    label="Revenus du mois"       value={`${formatMoney(stats.revenusMois)} €`}       variation={stats.variationRevenus}  color="#3b82f6" />
          <StatCard icon={TrendingDown}  label="Dépenses du mois"      value={`${formatMoney(stats.depensesMois)} €`}      variation={stats.variationDepenses} color="#f59e0b" />
          <StatCard icon={Users}         label="Locataires en retard"  value={stats.locatairesRetard || 0}                                                     color="#ef4444" />
          <StatCard icon={Home}          label="Taux d'occupation"     value={`${stats.tauxOccupation || 0} %`}                                                color="#10b981" />
        </div>

        {/* ── Gradient cards ── */}
        <div className="grid grid-4 mb-6">
          <GradientCard color="blue"   label="Solde Bancaire"      value={`${formatMoney(stats.soldeBancaire)} €`}   icon={<Wallet size={40} />} />
          <GradientCard color="teal"   label="Loyers en Attente"   value={`${formatMoney(stats.loyersAttente)} €`}   icon={<Clock size={40} />} />
          <GradientCard color="orange" label="Charges à Venir"     value={`${formatMoney(stats.chargesAVenir)} €`}   icon={<Receipt size={40} />} />
          <GradientCard color="red"    label="Retards de Paiement" value={stats.retardsPaiement}                     icon={<AlertCircle size={40} />} />
        </div>

        {/* ── Jauges ── */}
        <div className="grid grid-3 mb-6">
          <div className="gauge-card">
            <div className="gauge-label">Loyer Attendu</div>
            <Gauge value={stats.loyerAttendu} max={Math.max(stats.loyerAttendu * 1.2, 1000)} color="blue" displayValue={`${formatMoney(stats.loyerAttendu)} €`} />
            <GaugeTrend variation={stats.variationRevenus} />
          </div>
          <div className="gauge-card">
            <div className="gauge-label">Total Encaissé</div>
            <Gauge value={stats.totalEncaisse} max={Math.max(stats.loyerAttendu, 1000)} color="green" displayValue={`${formatMoney(stats.totalEncaisse)} €`} />
            <GaugeTrend variation={stats.variationEncaisse} />
          </div>
          <div className="gauge-card">
            <div className="gauge-label">Aides APL / AL</div>
            <Gauge value={stats.aidesApl} max={Math.max(stats.aidesApl * 2, 1000)} color="orange" displayValue={`${formatMoney(stats.aidesApl)} €`} />
            <GaugeTrend variation={stats.variationApl} />
          </div>
        </div>

        {/* ── Graphique évolution mensuelle ── */}
        <div className="card mb-6">
          <div className="card-header">
            <div className="card-title">
              <div className="card-title-icon"><TrendingUp size={18} /></div>
              Évolution mensuelle {new Date().getFullYear()}
            </div>
          </div>
          {evolution.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <div className="empty-state-icon"><CircleDollarSign size={28} /></div>
              <div className="empty-state-title">Aucune donnée disponible</div>
              <div className="empty-state-text">Générez des loyers ou importez des relevés pour voir l'évolution</div>
            </div>
          ) : (
            <>
              {/* Mini résumé au-dessus du graphique */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '8px 16px', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Revenus annuels : </span>
                  <strong style={{ color: '#3b82f6' }}>{formatMoney(evolution.reduce((s, m) => s + m.revenus, 0))} €</strong>
                </div>
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 16px', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Dépenses annuelles : </span>
                  <strong style={{ color: '#ef4444' }}>{formatMoney(evolution.reduce((s, m) => s + m.depenses, 0))} €</strong>
                </div>
                <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, padding: '8px 16px', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Solde net : </span>
                  <strong style={{ color: '#10b981' }}>{formatMoney(evolution.reduce((s, m) => s + m.revenus - m.depenses, 0))} €</strong>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={evolution} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradDep" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="mois" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `${v} €`} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={70} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={v => v === 'revenus' ? 'Revenus' : 'Dépenses'} wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="revenus"  stroke="#3b82f6" strokeWidth={2} fill="url(#gradRev)" dot={{ fill: '#3b82f6', r: 3 }} activeDot={{ r: 5 }} />
                  <Area type="monotone" dataKey="depenses" stroke="#ef4444" strokeWidth={2} fill="url(#gradDep)" dot={{ fill: '#ef4444', r: 3 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </>
          )}
        </div>

        {/* ── Stats par bien ── */}
        <div className="card mb-6">
          <div className="card-header">
            <div className="card-title">
              <div className="card-title-icon"><Building2 size={18} /></div>
              Rentabilité par bien
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select
                className="form-select"
                style={{ fontSize: 13, padding: '5px 10px', maxWidth: 120 }}
                value={annee}
                onChange={e => setAnnee(parseInt(e.target.value))}
              >
                {YEARS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          {parBien.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <div className="empty-state-icon"><Building2 size={28} /></div>
              <div className="empty-state-title">Aucun bien enregistré</div>
            </div>
          ) : (
            <>
              {/* Graphique barres */}
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={parBien} margin={{ top: 5, right: 10, left: 10, bottom: 5 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="adresse" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `${v} €`} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={70} />
                  <Tooltip content={<BienTooltip />} />
                  <Legend formatter={v => ({ revenus: 'Revenus', charges: 'Charges', solde: 'Solde net' }[v] || v)} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenus"  fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="charges"  fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="solde"    fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>

              {/* Tableau détaillé */}
              <div style={{ marginTop: 16, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
                <table className="table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Bien</th>
                      <th style={{ textAlign: 'right' }}>Loyers encaissés</th>
                      <th style={{ textAlign: 'right' }}>Attendu</th>
                      <th style={{ textAlign: 'right' }}>Charges / Travaux</th>
                      <th style={{ textAlign: 'right' }}>Solde net</th>
                      <th style={{ textAlign: 'right' }}>Taux encaissement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parBien.map(b => (
                      <tr key={b.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{b.adresse}</div>
                          {b.adresseFull !== b.adresse && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{b.adresseFull}</div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', color: '#3b82f6', fontWeight: 600 }}>{formatMoney(b.revenus)} €</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{formatMoney(b.attendu)} €</td>
                        <td style={{ textAlign: 'right', color: '#f59e0b' }}>{formatMoney(b.charges)} €</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: b.solde >= 0 ? '#10b981' : '#ef4444' }}>
                          {b.solde >= 0 ? '+' : ''}{formatMoney(b.solde)} €
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                            <div style={{ width: 60, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(b.taux, 100)}%`, height: '100%', background: b.taux >= 90 ? '#10b981' : b.taux >= 60 ? '#f59e0b' : '#ef4444', borderRadius: 3 }} />
                            </div>
                            <span style={{ fontWeight: 600, color: b.taux >= 90 ? '#10b981' : b.taux >= 60 ? '#f59e0b' : '#ef4444', minWidth: 36 }}>
                              {b.taux} %
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--bg-tertiary)', fontWeight: 700 }}>
                      <td>Total {annee}</td>
                      <td style={{ textAlign: 'right', color: '#3b82f6' }}>{formatMoney(totalRevAnnee)} €</td>
                      <td></td>
                      <td style={{ textAlign: 'right', color: '#f59e0b' }}>{formatMoney(totalCharges)} €</td>
                      <td style={{ textAlign: 'right', color: totalSolde >= 0 ? '#10b981' : '#ef4444' }}>
                        {totalSolde >= 0 ? '+' : ''}{formatMoney(totalSolde)} €
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ── Loyers ce mois ── */}
        {loyersMois.length > 0 && (() => {
          const payes    = loyersMois.filter(l => l.statut === 'paye');
          const enAttente = loyersMois.filter(l => l.statut === 'en_attente');
          const retards  = loyersMois.filter(l => l.statut === 'retard');
          const totalAttendu  = loyersMois.reduce((s, l) => s + (parseFloat(l.montant) || 0), 0);
          const totalEncaisse = payes.reduce((s, l) => s + (parseFloat(l.montant) || 0), 0);
          return (
            <div className="card mb-6">
              <div className="card-header">
                <div className="card-title">
                  <div className="card-title-icon"><Home size={18} /></div>
                  Loyers — {MOIS_LABELS[moisCourant - 1]} {anneeCourante}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    <strong style={{ color: '#10b981' }}>{payes.length} payé{payes.length > 1 ? 's' : ''}</strong>
                    {enAttente.length > 0 && <> • <strong style={{ color: '#f59e0b' }}>{enAttente.length} en attente</strong></>}
                    {retards.length > 0 && <> • <strong style={{ color: '#ef4444' }}>{retards.length} en retard</strong></>}
                  </span>
                  {onNavigate && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => onNavigate('loyer')}>
                      Voir tout <ArrowRight size={11} />
                    </button>
                  )}
                </div>
              </div>

              {/* Barre de progression */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                  <span>{formatMoney(totalEncaisse)} € encaissés</span>
                  <span>{formatMoney(totalAttendu)} € attendus</span>
                </div>
                <div style={{ height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${totalAttendu > 0 ? Math.min(100, (totalEncaisse / totalAttendu) * 100) : 0}%`,
                    background: totalEncaisse >= totalAttendu ? '#10b981' : totalEncaisse / totalAttendu >= 0.6 ? '#f59e0b' : '#ef4444',
                    borderRadius: 4, transition: 'width 0.5s ease'
                  }} />
                </div>
              </div>

              {/* Liste des loyers */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {loyersMois.map(l => {
                  const isPaid   = l.statut === 'paye';
                  const isRetard = l.statut === 'retard';
                  const statusColor = isPaid ? '#10b981' : isRetard ? '#ef4444' : '#f59e0b';
                  const statusLabel = isPaid ? 'Payé' : isRetard ? 'Retard' : 'En attente';
                  return (
                    <div key={l.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 10,
                      background: isPaid ? 'rgba(16,185,129,0.04)' : isRetard ? 'rgba(239,68,68,0.04)' : 'var(--bg-tertiary)',
                      border: `1px solid ${isPaid ? 'rgba(16,185,129,0.15)' : isRetard ? 'rgba(239,68,68,0.2)' : 'var(--border-color)'}`
                    }}>
                      {/* Avatar statut */}
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                      {/* Infos */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {l.nom} {l.prenom}
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                            — {l.bien_adresse}
                          </span>
                        </div>
                      </div>
                      {/* Montant */}
                      <div style={{ fontWeight: 700, fontSize: 14, color: statusColor, minWidth: 80, textAlign: 'right' }}>
                        {formatMoney(l.montant)} €
                      </div>
                      {/* Badge statut */}
                      <div style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: `${statusColor}18`, color: statusColor, minWidth: 70, textAlign: 'center' }}>
                        {statusLabel}
                      </div>
                      {/* Action */}
                      {!isPaid && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 11, padding: '4px 10px', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}
                          onClick={() => handleMarkPaid(l.id)}
                          disabled={updatingLoyer === l.id}
                          title="Marquer comme payé"
                        >
                          {updatingLoyer === l.id
                            ? <div className="spinner" style={{ width: 12, height: 12 }} />
                            : <><Check size={12} /> Payé</>}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── Bilan annuel N vs N-1 ── */}
        <BilanAnnuel
          annee={anneeCompar}
          onPrev={() => setAnneeCompar(a => a - 1)}
          onNext={() => setAnneeCompar(a => a + 1)}
          evN={evN}
          evNm1={evNm1}
          loading={loadingCompar}
        />

        {/* ── Quick info cards ── */}
        <div className="grid grid-2">
          <QuickInfoCard
            title="Prochaines échéances"
            icon={<Clock size={18} />}
            items={[
              { label: 'Loyers à encaisser ce mois', value: `${formatMoney(stats.loyersAttente)} €` },
              { label: 'Charges prévues',             value: `${formatMoney(stats.chargesAVenir)} €` },
              { label: "Taux d'occupation",           value: `${stats.tauxOccupation} %` }
            ]}
          />
          <QuickInfoCard
            title="Résumé Financier"
            icon={<PieChart size={18} />}
            items={[
              { label: 'Revenus encaissés', value: `${formatMoney(stats.totalEncaisse)} €`, color: '#10b981' },
              { label: 'Dépenses du mois',  value: `${formatMoney(stats.depensesMois)} €`,  color: '#f59e0b' },
              { label: 'Solde net',         value: `${formatMoney(stats.soldeBancaire)} €`,  color: '#3b82f6' }
            ]}
          />
        </div>

      </div>
    </>
  );
}

// ── Tooltip graphique évolution ──
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
          {p.name === 'revenus' ? 'Revenus' : 'Dépenses'} : <strong>{formatMoney(p.value)} €</strong>
        </div>
      ))}
      {payload.length === 2 && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border-color)', color: '#10b981' }}>
          Solde : <strong>{formatMoney(payload[0].value - payload[1].value)} €</strong>
        </div>
      )}
    </div>
  );
}

// ── Tooltip graphique par bien ──
function BienTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
          {{ revenus: 'Revenus', charges: 'Charges', solde: 'Solde net' }[p.dataKey] || p.dataKey} : <strong>{formatMoney(p.value)} €</strong>
        </div>
      ))}
    </div>
  );
}

function AlertBanner({ messages }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (messages.length <= 1) return;
    const interval = setInterval(() => setIdx(i => (i + 1) % messages.length), 4000);
    return () => clearInterval(interval);
  }, [messages]);
  return (
    <div className="alert-banner" style={{ marginBottom: 16 }}>
      <AlertTriangle className="alert-banner-icon" size={18} />
      <div className="alert-banner-content" key={idx} style={{ animation: 'slideIn 0.5s ease' }}>
        {messages[idx]}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, variation, color }) {
  const hasVariation = variation !== null && variation !== undefined;
  const isPositive = variation > 0;
  const isNegative = variation < 0;
  return (
    <div className="card stat-card" style={{ borderTop: `3px solid ${color}` }}>
      <div className="stat-card-header">
        <div className="stat-card-label">{label}</div>
        <div className="stat-card-icon" style={{ background: `${color}20`, color }}>
          <Icon size={18} />
        </div>
      </div>
      <div className="stat-card-value">{value}</div>
      {hasVariation && (
        <div className={`stat-card-change ${isPositive ? 'positive' : isNegative ? 'negative' : 'neutral'}`}>
          {isPositive && <><TrendingUp size={12} /> +{variation}%</>}
          {isNegative && <><TrendingDown size={12} /> {variation}%</>}
          {!isPositive && !isNegative && <>— stable</>}
        </div>
      )}
    </div>
  );
}

function GradientCard({ color, label, value, icon }) {
  return (
    <div className={`gradient-card ${color}`}>
      <div className="gradient-card-icon">{icon}</div>
      <div className="gradient-card-label">{label}</div>
      <div className="gradient-card-value">{value}</div>
    </div>
  );
}

function QuickInfoCard({ title, icon, items }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          <div className="card-title-icon">{icon}</div>
          {title}
        </div>
      </div>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '12px 0',
          borderBottom: i < items.length - 1 ? '1px solid var(--border-color)' : 'none'
        }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{item.label}</span>
          <span style={{ fontWeight: 700, color: item.color || 'var(--text-primary)' }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function QuickAction({ icon: Icon, label, color, onClick }) {
  const [hov, setHov] = useState(false);
  const [pressed, setPressed] = useState(false);
  const bg = `${color}14`;
  const bgHov = `${color}22`;
  const border = `${color}30`;
  const borderHov = `${color}60`;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 13px 7px 9px',
        borderRadius: 'var(--radius-full)',
        border: `1px solid ${hov ? borderHov : border}`,
        background: pressed ? bgHov : hov ? bgHov : bg,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 160ms ease',
        transform: pressed ? 'scale(0.96)' : 'scale(1)',
        boxShadow: hov ? `0 4px 14px ${color}25` : 'none',
      }}
    >
      {/* Icône dans un cercle */}
      <div style={{
        width: 26, height: 26, borderRadius: 8,
        background: hov ? `${color}28` : `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, transition: 'background 160ms ease'
      }}>
        <Icon size={13} style={{ color, transition: 'transform 160ms ease', transform: hov ? 'scale(1.15)' : 'scale(1)' }} />
      </div>
      {/* Label */}
      <span style={{
        fontSize: 12.5, fontWeight: 600,
        color: hov ? color : 'var(--text-secondary)',
        transition: 'color 160ms ease',
        letterSpacing: '0.01em'
      }}>
        {label}
      </span>
      {/* Flèche animée */}
      <ArrowRight
        size={12}
        style={{
          color: hov ? color : 'var(--text-muted)',
          transition: 'all 160ms ease',
          transform: hov ? 'translateX(2px)' : 'translateX(0)',
          opacity: hov ? 1 : 0.5
        }}
      />
    </button>
  );
}

function formatMoney(n) {
  const num = parseFloat(n) || 0;
  return num.toLocaleString('fr-FR', { minimumFractionDigits: num >= 100 ? 0 : 2, maximumFractionDigits: 2 });
}

function GaugeTrend({ variation }) {
  if (variation === null || variation === undefined) {
    return <div className="gauge-trend neutral" style={{ color: 'var(--text-muted)' }}>— Pas de référence</div>;
  }
  if (variation === 0) {
    return <div className="gauge-trend neutral" style={{ color: 'var(--text-muted)' }}>— Stable</div>;
  }
  const isPositive = variation > 0;
  return (
    <div className={`gauge-trend ${isPositive ? 'up' : 'down'}`}>
      {isPositive ? <><TrendingUp size={12} /> +{variation}%</> : <><TrendingDown size={12} /> {variation}%</>}
    </div>
  );
}

// ── Bilan Annuel N vs N-1 ──
function BilanAnnuel({ annee, onPrev, onNext, evN, evNm1, loading }) {
  // Totaux annuels
  const totRevN   = evN.reduce((s, m) => s + m.revenus, 0);
  const totRevNm1 = evNm1.reduce((s, m) => s + m.revenus, 0);
  const totDepN   = evN.reduce((s, m) => s + m.depenses, 0);
  const totDepNm1 = evNm1.reduce((s, m) => s + m.depenses, 0);
  const soldeN    = totRevN   - totDepN;
  const soldeNm1  = totRevNm1 - totDepNm1;

  const pct = (n, ref) => ref === 0 ? null : Math.round(((n - ref) / ref) * 100);
  const dRevPct   = pct(totRevN,   totRevNm1);
  const dDepPct   = pct(totDepN,   totDepNm1);
  const dSoldePct = pct(soldeN,    soldeNm1);

  const MOIS_ABBR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

  // Données du graphe : fusion N + N-1
  const chartData = Array.from({ length: 12 }, (_, i) => {
    const n   = evN[i]   || { revenus: 0, depenses: 0 };
    const nm1 = evNm1[i] || { revenus: 0, depenses: 0 };
    return {
      mois: MOIS_ABBR[i],
      revN:    n.revenus,
      depN:    n.depenses,
      soldeN:  n.revenus - n.depenses,
      revNm1:  nm1.revenus,
      depNm1:  nm1.depenses,
      soldeNm1: nm1.revenus - nm1.depenses,
    };
  });

  const [view, setView] = useState('revenus'); // 'revenus' | 'depenses' | 'solde'

  const MOIS_FULL = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  return (
    <div className="card mb-6">
      {/* ── En-tête ── */}
      <div className="card-header" style={{ marginBottom: 0 }}>
        <div className="card-title">
          <div className="card-title-icon"><CalendarRange size={18} /></div>
          Bilan annuel — comparaison N / N-1
        </div>
        {/* Navigation année */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={onPrev}
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            <ChevronLeft size={16} />
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', minWidth: 80, textAlign: 'center' }}>
            {annee - 1} → {annee}
          </div>
          <button
            onClick={onNext}
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner spinner-lg" />
        </div>
      ) : (
        <>
          {/* ── Chips résumé ── */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <BilanChip
              label="Revenus"
              vN={totRevN}
              vNm1={totRevNm1}
              delta={dRevPct}
              color="#3b82f6"
              positiveIsGood={true}
              annee={annee}
            />
            <BilanChip
              label="Dépenses"
              vN={totDepN}
              vNm1={totDepNm1}
              delta={dDepPct}
              color="#f59e0b"
              positiveIsGood={false}
              annee={annee}
            />
            <BilanChip
              label="Solde net"
              vN={soldeN}
              vNm1={soldeNm1}
              delta={dSoldePct}
              color="#10b981"
              positiveIsGood={true}
              annee={annee}
            />
          </div>

          {/* ── Sélecteur vue ── */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {[
              { key: 'revenus',  label: 'Revenus',  color: '#3b82f6' },
              { key: 'depenses', label: 'Dépenses', color: '#f59e0b' },
              { key: 'solde',    label: 'Solde net',color: '#10b981' },
            ].map(v => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${view === v.key ? v.color : 'var(--border-color)'}`,
                  background: view === v.key ? `${v.color}18` : 'transparent',
                  color: view === v.key ? v.color : 'var(--text-secondary)',
                  cursor: 'pointer', transition: 'all 150ms ease',
                }}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* ── Graphique barres groupées ── */}
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="mois" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `${v} €`} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={65} />
              <Tooltip content={<BilanTooltip annee={annee} view={view} />} />
              <Legend
                formatter={(val) => val === 'N' ? `${annee}` : `${annee - 1}`}
                wrapperStyle={{ fontSize: 12 }}
              />
              {view === 'solde' && <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />}
              <Bar
                dataKey={view === 'revenus' ? 'revNm1' : view === 'depenses' ? 'depNm1' : 'soldeNm1'}
                name="N-1"
                fill={view === 'revenus' ? 'rgba(59,130,246,0.28)' : view === 'depenses' ? 'rgba(245,158,11,0.28)' : 'rgba(16,185,129,0.28)'}
                radius={[3,3,0,0]}
                maxBarSize={28}
              />
              <Bar
                dataKey={view === 'revenus' ? 'revN' : view === 'depenses' ? 'depN' : 'soldeN'}
                name="N"
                fill={view === 'revenus' ? '#3b82f6' : view === 'depenses' ? '#f59e0b' : '#10b981'}
                radius={[3,3,0,0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>

          {/* ── Tableau mensuel ── */}
          <div style={{ marginTop: 20, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Mois</th>
                  <th style={{ textAlign: 'right' }}>Rev. {annee - 1}</th>
                  <th style={{ textAlign: 'right' }}>Rev. {annee}</th>
                  <th style={{ textAlign: 'right', color: 'var(--text-muted)' }}>Δ Rev.</th>
                  <th style={{ textAlign: 'right' }}>Dép. {annee - 1}</th>
                  <th style={{ textAlign: 'right' }}>Dép. {annee}</th>
                  <th style={{ textAlign: 'right', color: 'var(--text-muted)' }}>Δ Dép.</th>
                  <th style={{ textAlign: 'right' }}>Solde {annee}</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((m, i) => {
                  const dRev = pct(m.revN, m.revNm1);
                  const dDep = pct(m.depN, m.depNm1);
                  const isEmpty = m.revN === 0 && m.depN === 0 && m.revNm1 === 0 && m.depNm1 === 0;
                  return (
                    <tr key={i} style={{ opacity: isEmpty ? 0.35 : 1 }}>
                      <td style={{ fontWeight: 500 }}>{MOIS_FULL[i]}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatMoney(m.revNm1)} €</td>
                      <td style={{ textAlign: 'right', color: '#3b82f6', fontWeight: 600 }}>{formatMoney(m.revN)} €</td>
                      <td style={{ textAlign: 'right' }}><DeltaBadge delta={dRev} positiveIsGood={true} /></td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatMoney(m.depNm1)} €</td>
                      <td style={{ textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>{formatMoney(m.depN)} €</td>
                      <td style={{ textAlign: 'right' }}><DeltaBadge delta={dDep} positiveIsGood={false} /></td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: m.soldeN >= 0 ? '#10b981' : '#ef4444' }}>
                        {m.soldeN >= 0 ? '+' : ''}{formatMoney(m.soldeN)} €
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg-tertiary)', fontWeight: 700 }}>
                  <td>Total</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatMoney(totRevNm1)} €</td>
                  <td style={{ textAlign: 'right', color: '#3b82f6' }}>{formatMoney(totRevN)} €</td>
                  <td style={{ textAlign: 'right' }}><DeltaBadge delta={dRevPct} positiveIsGood={true} /></td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatMoney(totDepNm1)} €</td>
                  <td style={{ textAlign: 'right', color: '#f59e0b' }}>{formatMoney(totDepN)} €</td>
                  <td style={{ textAlign: 'right' }}><DeltaBadge delta={dDepPct} positiveIsGood={false} /></td>
                  <td style={{ textAlign: 'right', color: soldeN >= 0 ? '#10b981' : '#ef4444' }}>
                    {soldeN >= 0 ? '+' : ''}{formatMoney(soldeN)} €
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function BilanChip({ label, vN, vNm1, delta, color, positiveIsGood, annee }) {
  const isGood = delta === null ? null : positiveIsGood ? delta >= 0 : delta <= 0;
  const deltaColor = delta === null ? 'var(--text-muted)' : isGood ? '#10b981' : '#ef4444';
  return (
    <div style={{
      flex: '1 1 160px',
      background: 'var(--bg-tertiary)',
      border: `1px solid var(--border-color)`,
      borderRadius: 12,
      padding: '14px 18px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      {/* Valeur N */}
      <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
        {formatMoney(vN)} €
      </div>
      {/* Comparaison N-1 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{annee - 1} : {formatMoney(vNm1)} €</span>
        {delta !== null && (
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: deltaColor,
            background: `${deltaColor}18`,
            borderRadius: 20,
            padding: '1px 7px',
            display: 'flex', alignItems: 'center', gap: 3
          }}>
            {delta > 0 ? <TrendingUp size={10} /> : delta < 0 ? <TrendingDown size={10} /> : null}
            {delta > 0 ? '+' : ''}{delta} %
          </span>
        )}
      </div>
    </div>
  );
}

function DeltaBadge({ delta, positiveIsGood }) {
  if (delta === null || delta === undefined) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>;
  const isGood = positiveIsGood ? delta >= 0 : delta <= 0;
  const color = delta === 0 ? 'var(--text-muted)' : isGood ? '#10b981' : '#ef4444';
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color }}>
      {delta > 0 ? '+' : ''}{delta} %
    </span>
  );
}

function BilanTooltip({ active, payload, label, annee }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => {
        const isCurrentYear = p.name === 'N';
        return (
          <div key={i} style={{ color: isCurrentYear ? p.fill : 'var(--text-muted)', marginBottom: 2, opacity: isCurrentYear ? 1 : 0.75 }}>
            {isCurrentYear ? annee : annee - 1} : <strong>{formatMoney(p.value)} €</strong>
          </div>
        );
      })}
    </div>
  );
}
