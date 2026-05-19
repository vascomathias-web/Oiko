import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, AreaChart, Area, LineChart, Line, ReferenceLine
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, Calendar, Download,
  FileText, Building2, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const YEARS = [2023, 2024, 2025, 2026, 2027];

export default function Recapitulatif() {
  const { addNotification } = useApp();
  const [dataMensuel,    setDataMensuel]    = useState([]);
  const [dataAnnuel,     setDataAnnuel]     = useState([]);
  const [dataPrev,       setDataPrev]       = useState([]);
  const [dataParBien,    setDataParBien]    = useState([]);
  const [view,           setView]           = useState('mensuel');
  const [annee,          setAnnee]          = useState(new Date().getFullYear());
  const [loading,        setLoading]        = useState(true);
  const [exporting,      setExporting]      = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [evo, evoAnn, prev, parBien] = await Promise.all([
      window.api.dashboard.evolution(),
      window.api.dashboard.evolutionAnnuelle(),
      window.api.dashboard.previsionnel(annee),
      window.api.dashboard.parBien(annee)
    ]);
    setDataMensuel(evo   || []);
    setDataAnnuel(evoAnn || []);
    setDataPrev(prev?.data || []);
    setDataParBien(parBien || []);
    setLoading(false);
  }, [annee]);

  useEffect(() => { load(); }, [load]);

  const handleExportCSV = async () => {
    setExporting('csv');
    const res = await window.api.export.comptable(annee);
    setExporting('');
    if (res?.success) addNotification({ type: 'success', titre: 'Export CSV réussi', message: `Fichier enregistré : ${res.path}` });
    else addNotification({ type: 'danger', titre: 'Erreur export', message: res?.error || 'Erreur inconnue' });
  };

  const handleExportPDF = async () => {
    setExporting('pdf');
    const res = await window.api.impot.exportFiscal2044PDF(annee);
    setExporting('');
    if (res?.success) addNotification({ type: 'success', titre: 'PDF Fiscal 2044 généré', message: `Fichier enregistré : ${res.path}` });
    else addNotification({ type: 'danger', titre: 'Erreur export PDF', message: res?.error || 'Erreur inconnue' });
  };

  // Totaux
  const data = view === 'mensuel' ? dataMensuel : dataAnnuel;
  const totalRevenus  = data.reduce((s, d) => s + (d.revenus  || 0), 0);
  const totalDepenses = data.reduce((s, d) => s + (d.depenses || 0), 0);
  const solde = totalRevenus - totalDepenses;

  const totalRevBiens    = dataParBien.reduce((s, b) => s + b.revenus, 0);
  const totalChargesBien = dataParBien.reduce((s, b) => s + b.charges, 0);
  const totalSoldeBien   = dataParBien.reduce((s, b) => s + b.solde,   0);

  // Variation
  const calcVariation = (cur, prev) => {
    if (!prev || prev === 0) return null;
    return Math.round(((cur - prev) / prev) * 1000) / 10;
  };
  let variationRevenus = null, variationDepenses = null;
  if (view === 'mensuel' && dataMensuel.length >= 2) {
    const nonZero = dataMensuel.filter(d => (d.revenus + d.depenses) > 0);
    if (nonZero.length >= 2) {
      variationRevenus  = calcVariation(nonZero[nonZero.length-1].revenus,  nonZero[nonZero.length-2].revenus);
      variationDepenses = calcVariation(nonZero[nonZero.length-1].depenses, nonZero[nonZero.length-2].depenses);
    }
  } else if (view === 'annuel' && dataAnnuel.length >= 2) {
    variationRevenus  = calcVariation(dataAnnuel[dataAnnuel.length-1].revenus,  dataAnnuel[dataAnnuel.length-2].revenus);
    variationDepenses = calcVariation(dataAnnuel[dataAnnuel.length-1].depenses, dataAnnuel[dataAnnuel.length-2].depenses);
  }

  const periodeLabel = view === 'mensuel' ? annee : '5 dernières années';

  return (
    <>
      <PageHeader
        title="Récapitulatif"
        subtitle="Analyse financière complète"
        onRefresh={load}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Sélecteur d'année */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-tertiary)', borderRadius: 8, padding: '4px 8px', border: '1px solid var(--border-color)' }}>
              <button className="btn btn-ghost btn-icon" style={{ padding: 4 }} onClick={() => setAnnee(a => Math.max(a - 1, 2020))}>
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, minWidth: 40, textAlign: 'center' }}>{annee}</span>
              <button className="btn btn-ghost btn-icon" style={{ padding: 4 }} onClick={() => setAnnee(a => Math.min(a + 1, 2030))}>
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Vue mensuel / annuel */}
            <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
              <button className={view === 'mensuel' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} onClick={() => setView('mensuel')}>Mensuel</button>
              <button className={view === 'annuel'  ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} onClick={() => setView('annuel')}>Annuel</button>
            </div>

            {/* Exports */}
            <button className="btn btn-ghost btn-sm" onClick={handleExportCSV} disabled={!!exporting}>
              {exporting === 'csv' ? <><div className="spinner" style={{ width: 13, height: 13 }} /> Export…</> : <><Download size={13} /> CSV {annee}</>}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleExportPDF} disabled={!!exporting}>
              {exporting === 'pdf' ? <><div className="spinner" style={{ width: 13, height: 13 }} /> Export…</> : <><FileText size={13} /> Fiscal 2044</>}
            </button>
          </div>
        }
      />

      <div className="page-container">
        {loading ? (
          <div className="empty-state"><div className="spinner spinner-lg" style={{ margin: '40px auto' }} /></div>
        ) : (
          <>
            {/* ── KPI cards ── */}
            <div className="grid grid-3 mb-6">
              <StatCard label={`Revenus ${periodeLabel}`}  value={totalRevenus}  color="#10b981" icon={TrendingUp}   variation={variationRevenus} />
              <StatCard label={`Dépenses ${periodeLabel}`} value={totalDepenses} color="#f59e0b" icon={TrendingDown} variation={variationDepenses} inverse />
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
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Revenus − Dépenses</div>
              </div>
            </div>

            {/* ── Graphique évolution ── */}
            <div className="card mb-6">
              <div className="card-header">
                <div className="card-title">
                  <div className="card-title-icon"><Calendar size={18} /></div>
                  {view === 'mensuel' ? `Évolution mensuelle ${annee}` : 'Évolution sur 5 ans'}
                </div>
              </div>
              {data.length === 0 || data.every(d => !d.revenus && !d.depenses) ? (
                <EmptyGraph />
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="grRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0}    />
                      </linearGradient>
                      <linearGradient id="grDep" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#f59e0b" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                    <XAxis dataKey="mois" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v} €`} width={70} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend formatter={v => v === 'revenus' ? 'Revenus' : 'Dépenses'} wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="revenus"  stroke="#10b981" strokeWidth={2.5} fill="url(#grRev)" dot={{ fill: '#10b981', r: 3 }} activeDot={{ r: 5 }} />
                    <Area type="monotone" dataKey="depenses" stroke="#f59e0b" strokeWidth={2.5} fill="url(#grDep)" dot={{ fill: '#f59e0b', r: 3 }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Graphique prévisionnel (mensuel uniquement) ── */}
            {view === 'mensuel' && dataPrev.length > 0 && (
              <div className="card mb-6">
                <div className="card-header">
                  <div className="card-title">
                    <div className="card-title-icon" style={{ background: 'var(--gradient-blue)' }}><TrendingUp size={18} /></div>
                    Prévisionnel {annee} — Loyers attendus vs perçus
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Les mois futurs (en pointillés) affichent le loyer attendu comme projection.
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={dataPrev} margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                    <XAxis dataKey="mois" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v} €`} width={70} />
                    <Tooltip content={<PrevTooltip />} />
                    <Legend formatter={v => ({ attendu: 'Attendu', percu: 'Perçu', projection: 'Projection' }[v] || v)} wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="attendu"    stroke="#6366f1" strokeWidth={2} dot={false} strokeDasharray="5 3" />
                    <Line type="monotone" dataKey="percu"      stroke="#10b981" strokeWidth={2.5} dot={{ fill: '#10b981', r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
                    <Line type="monotone" dataKey="projection" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Comparaison barres ── */}
            <div className="card mb-6">
              <div className="card-header">
                <div className="card-title">
                  <div className="card-title-icon" style={{ background: 'var(--gradient-purple)' }}><TrendingUp size={18} /></div>
                  {view === 'mensuel' ? 'Revenus / Dépenses par mois' : 'Revenus / Dépenses par année'}
                </div>
              </div>
              {data.length === 0 || data.every(d => !d.revenus && !d.depenses) ? <EmptyGraph /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                    <XAxis dataKey="mois" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v} €`} width={70} />
                    <Tooltip formatter={v => `${formatMoney(v)} €`} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12 }} />
                    <Legend formatter={v => v === 'revenus' ? 'Revenus' : 'Dépenses'} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="revenus"  fill="#10b981" radius={[6,6,0,0]} name="revenus"  maxBarSize={40} />
                    <Bar dataKey="depenses" fill="#f59e0b" radius={[6,6,0,0]} name="depenses" maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Rentabilité par bien ── */}
            {dataParBien.length > 0 && (
              <div className="card mb-6">
                <div className="card-header">
                  <div className="card-title">
                    <div className="card-title-icon" style={{ background: 'var(--gradient-green)' }}><Building2 size={18} /></div>
                    Rentabilité par bien — {annee}
                  </div>
                </div>
                <table className="table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Bien</th>
                      <th style={{ textAlign: 'right' }}>Revenus encaissés</th>
                      <th style={{ textAlign: 'right' }}>Loyer annuel attendu</th>
                      <th style={{ textAlign: 'right' }}>Charges / Travaux</th>
                      <th style={{ textAlign: 'right' }}>Solde net</th>
                      <th style={{ textAlign: 'right' }}>Taux</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataParBien.map(b => (
                      <tr key={b.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{b.adresse}</div>
                          {b.adresseFull && b.adresseFull !== b.adresse && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.adresseFull}</div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{formatMoney(b.revenus)} €</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{formatMoney(b.attendu)} €</td>
                        <td style={{ textAlign: 'right', color: '#f59e0b' }}>{formatMoney(b.charges)} €</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: b.solde >= 0 ? '#10b981' : '#ef4444' }}>
                          {b.solde >= 0 ? '+' : ''}{formatMoney(b.solde)} €
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <div style={{ width: 50, height: 5, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(b.taux, 100)}%`, height: '100%', borderRadius: 3, background: b.taux >= 90 ? '#10b981' : b.taux >= 60 ? '#f59e0b' : '#ef4444' }} />
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
                      <td style={{ textAlign: 'right', color: '#10b981' }}>{formatMoney(totalRevBiens)} €</td>
                      <td />
                      <td style={{ textAlign: 'right', color: '#f59e0b' }}>{formatMoney(totalChargesBien)} €</td>
                      <td style={{ textAlign: 'right', color: totalSoldeBien >= 0 ? '#10b981' : '#ef4444' }}>
                        {totalSoldeBien >= 0 ? '+' : ''}{formatMoney(totalSoldeBien)} €
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const rev = payload.find(p => p.dataKey === 'revenus')?.value || 0;
  const dep = payload.find(p => p.dataKey === 'depenses')?.value || 0;
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ color: '#10b981', marginBottom: 2 }}>Revenus : <strong>{formatMoney(rev)} €</strong></div>
      <div style={{ color: '#f59e0b', marginBottom: 6 }}>Dépenses : <strong>{formatMoney(dep)} €</strong></div>
      <div style={{ paddingTop: 6, borderTop: '1px solid var(--border-color)', color: rev - dep >= 0 ? '#10b981' : '#ef4444' }}>
        Solde : <strong>{formatMoney(rev - dep)} €</strong>
      </div>
    </div>
  );
}

function PrevTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => p.value != null && (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
          {{ attendu: 'Attendu', percu: 'Perçu', projection: 'Projection' }[p.dataKey] || p.dataKey} : <strong>{formatMoney(p.value)} €</strong>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, color, icon: Icon, variation, inverse }) {
  const hasVariation = variation !== null && variation !== undefined;
  const isUp = variation > 0;
  const isDown = variation < 0;
  const varClass = inverse
    ? (isUp ? 'negative' : isDown ? 'positive' : '')
    : (isUp ? 'positive' : isDown ? 'negative' : '');
  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <div className="stat-card-label">{label}</div>
        <div className="stat-card-icon" style={{ background: color + '26', color }}><Icon size={18} /></div>
      </div>
      <div className="stat-card-value" style={{ color }}>{formatMoney(value)} €</div>
      {hasVariation ? (
        <div className={`stat-card-change ${varClass}`}>
          {isUp && <><TrendingUp size={12} /> +{variation}%</>}
          {isDown && <><TrendingDown size={12} /> {variation}%</>}
          {!isUp && !isDown && <>— stable</>}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>Pas de référence</div>
      )}
    </div>
  );
}

function EmptyGraph() {
  return (
    <div style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
      <Calendar size={32} style={{ opacity: 0.3, marginBottom: 10 }} />
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Aucune donnée</div>
      <div style={{ fontSize: 12 }}>Ajoutez des loyers et relevés pour voir l'analyse ici.</div>
    </div>
  );
}

function formatMoney(n) {
  const num = parseFloat(n) || 0;
  return num.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
