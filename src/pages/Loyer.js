import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import Gauge from '../components/Gauge';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../components/ConfirmDialog';
import {
  TrendingUp, CircleDollarSign, AlertCircle, RefreshCw, Check,
  Download, Mail, Filter, X, TrendingDown, ArrowUpDown, FileText,
  Send
} from 'lucide-react';

const STATUTS = [
  { v: 'paye',       l: 'Payé',       c: 'success' },
  { v: 'en_attente', l: 'En attente', c: 'warning' },
  { v: 'retard',     l: 'Retard',     c: 'danger'  },
  { v: 'partiel',    l: 'Partiel',    c: 'info'    }
];

const MOIS_LABELS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const YEARS = [2024, 2025, 2026, 2027];

export default function Loyer() {
  const { addNotification } = useApp();
  const { confirm } = useConfirm();

  const [loyers, setLoyers]       = useState([]);
  const [biens, setBiens]         = useState([]);
  const [stats, setStats]         = useState(null);

  // Filtres
  const now = new Date();
  const [filterMois,   setFilterMois]   = useState(now.getMonth() + 1);
  const [filterAnnee,  setFilterAnnee]  = useState(now.getFullYear());
  const [filterBien,   setFilterBien]   = useState('');
  const [filterStatut, setFilterStatut] = useState('');

  // Modals
  const [showIRL,      setShowIRL]      = useState(false);
  const [irlData,      setIrlData]      = useState({ bienId: '', ancienIRL: '', nouvelIRL: '' });
  const [irlLoading,   setIrlLoading]   = useState(false);
  const [relanceLoading, setRelanceLoading] = useState(false);
  const [massLoading,    setMassLoading]   = useState(false);
  const [scores,         setScores]        = useState({}); // locataireId → [{mois,annee,statut}]

  const load = useCallback(async () => {
    const [l, s, b] = await Promise.all([
      window.api.loyers.getAll(),
      window.api.dashboard.stats(),
      window.api.biens.getAll()
    ]);
    setLoyers(l || []);
    setStats(s);
    setBiens(b || []);

    // Charge le score de paiement pour chaque locataire distinct
    const locIds = [...new Set((l || []).map(x => x.locataire_id).filter(Boolean))];
    const scoreMap = {};
    await Promise.all(locIds.map(async id => {
      scoreMap[id] = await window.api.loyers.scorePaiement(id);
    }));
    setScores(scoreMap);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async () => {
    await window.api.loyers.generate();
    addNotification({ type: 'info', titre: 'Loyers générés', message: 'Loyers du mois créés pour tous les locataires actifs' });
    await load();
  };

  const handleStatutChange = async (id, newStatut) => {
    await window.api.loyers.updateStatut(id, newStatut);
    await load();
  };

  const handleQuittance = async (id) => {
    const res = await window.api.loyers.downloadQuittance(id);
    if (!res?.success) addNotification({ type: 'danger', titre: 'Erreur quittance', message: res?.error || 'Erreur inconnue' });
  };

  const handleAvis = async (id) => {
    const res = await window.api.loyers.downloadAvis(id);
    if (!res?.success) addNotification({ type: 'danger', titre: "Erreur avis d'échéance", message: res?.error || 'Erreur inconnue' });
  };

  const handleReminder = async (id) => {
    const ok = await confirm({
      title: 'Envoyer un rappel ?',
      message: 'Un email de rappel sera envoyé au locataire.',
      confirmText: 'Envoyer',
      cancelText: 'Annuler'
    });
    if (!ok) return;
    const res = await window.api.loyers.sendReminder(id);
    if (res?.success) addNotification({ type: 'success', titre: 'Rappel envoyé', message: 'Email envoyé au locataire' });
    else addNotification({ type: 'danger', titre: 'Erreur envoi', message: res?.error || 'Erreur inconnue' });
  };

  const handleApplyIRL = async () => {
    if (!irlData.bienId || !irlData.ancienIRL || !irlData.nouvelIRL) return;
    setIrlLoading(true);
    const res = await window.api.loyers.applyIRL({
      bienId:    parseInt(irlData.bienId),
      ancienIRL: parseFloat(irlData.ancienIRL),
      nouvelIRL: parseFloat(irlData.nouvelIRL)
    });
    setIrlLoading(false);
    if (res.success) {
      addNotification({
        type: 'success',
        titre: 'Révision IRL appliquée',
        message: `Loyer HC : ${formatMoney(res.ancienLoyerHC)} € → ${formatMoney(res.nouveauLoyerHC)} € (total : ${formatMoney(res.nouveauLoyerTotal)} €)`
      });
      setShowIRL(false);
      setIrlData({ bienId: '', ancienIRL: '', nouvelIRL: '' });
      await load();
    } else {
      addNotification({ type: 'danger', titre: 'Erreur IRL', message: res.error });
    }
  };

  const handleMassQuittances = async () => {
    const payesIds = loyersFiltres.filter(l => l.statut === 'paye').map(l => l.id);
    if (payesIds.length === 0) {
      addNotification({ type: 'warning', titre: 'Aucun loyer payé', message: 'Filtrez le mois souhaité et assurez-vous que des loyers sont marqués Payé.' });
      return;
    }
    setMassLoading(true);
    const res = await window.api.loyers.downloadAllQuittances(payesIds);
    setMassLoading(false);
    if (res?.success) {
      addNotification({ type: 'success', titre: `${res.generated} quittance(s) générée(s)`, message: `Dossier ouvert : ${res.destDir}` });
    } else if (!res?.canceled) {
      addNotification({ type: 'danger', titre: 'Erreur génération', message: res?.error || 'Erreur inconnue' });
    }
  };

  const handleRelanceAuto = async () => {
    const nbImpayes = loyers.filter(l =>
      l.mois === now.getMonth() + 1 &&
      l.annee === now.getFullYear() &&
      l.statut !== 'paye'
    ).length;
    if (nbImpayes === 0) {
      addNotification({ type: 'info', titre: 'Aucun impayé', message: 'Tous les loyers du mois sont payés.' });
      return;
    }
    const ok = await confirm({
      title: 'Relance automatique',
      message: `Un email de rappel sera envoyé à ${nbImpayes} locataire(s) avec un loyer impayé ce mois-ci.`,
      confirmText: `Envoyer ${nbImpayes} rappel(s)`,
      cancelText: 'Annuler'
    });
    if (!ok) return;
    setRelanceLoading(true);
    const res = await window.api.loyers.relanceAuto({});
    setRelanceLoading(false);
    if (res.success) {
      if (res.skipped) {
        addNotification({ type: 'info', titre: 'Relance non déclenchée', message: res.reason });
      } else {
        addNotification({ type: 'success', titre: 'Relances envoyées', message: `${res.sent} email(s) envoyé(s) sur ${res.total} impayé(s)` });
      }
    } else {
      addNotification({ type: 'danger', titre: 'Erreur relance', message: res.error });
    }
  };

  const resetFilters = () => {
    setFilterMois(now.getMonth() + 1);
    setFilterAnnee(now.getFullYear());
    setFilterBien('');
    setFilterStatut('');
  };

  // Filtrage
  const loyersFiltres = loyers.filter(l => {
    if (filterMois   && l.mois !== parseInt(filterMois))     return false;
    if (filterAnnee  && l.annee !== parseInt(filterAnnee))   return false;
    if (filterBien   && String(l.bien_id) !== filterBien)    return false;
    if (filterStatut && l.statut !== filterStatut)           return false;
    return true;
  });

  const hasFilter = filterBien || filterStatut || filterMois !== (now.getMonth() + 1) || filterAnnee !== now.getFullYear();

  const totalAttendu   = loyersFiltres.reduce((s, l) => s + (l.montant || 0), 0);
  const totalEncaisse  = loyersFiltres.filter(l => l.statut === 'paye').reduce((s, l) => s + (l.montant || 0), 0);
  const totalRetard    = loyersFiltres.filter(l => l.statut === 'retard' || l.statut === 'en_attente').length;

  if (!stats) return (
    <><PageHeader title="Loyer" /><div className="page-container"><div className="empty-state"><div className="spinner spinner-lg" /></div></div></>
  );

  return (
    <>
      <PageHeader
        title="Loyer"
        subtitle={`${MOIS_LABELS[filterMois] || 'Tous les mois'} ${filterAnnee}`}
        onRefresh={load}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setShowIRL(true)}>
              <ArrowUpDown size={15} /> Révision IRL
            </button>
            <button className="btn btn-ghost" onClick={handleMassQuittances} disabled={massLoading} title="Générer toutes les quittances des loyers payés dans un dossier">
              {massLoading
                ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Génération…</>
                : <><Download size={15} /> Toutes les quittances</>}
            </button>
            <button className="btn btn-warning" onClick={handleRelanceAuto} disabled={relanceLoading}>
              {relanceLoading
                ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Envoi…</>
                : <><Send size={15} /> Relance auto</>}
            </button>
            <button className="btn btn-primary" onClick={handleGenerate}>
              <RefreshCw size={15} /> Générer loyers du mois
            </button>
          </div>
        }
      />

      <div className="page-container">

        {/* ── Jauges ── */}
        <div className="grid grid-4 mb-6">
          <div className="gauge-card">
            <div className="gauge-label">Loyer Attendu</div>
            <Gauge value={stats.loyerAttendu} max={Math.max(stats.loyerAttendu * 1.2, 1000)} color="blue" displayValue={`${formatMoney(stats.loyerAttendu)} €`} />
          </div>
          <div className="gauge-card">
            <div className="gauge-label">Total Encaissé</div>
            <Gauge value={stats.totalEncaisse} max={Math.max(stats.loyerAttendu, 1000)} color="green" displayValue={`${formatMoney(stats.totalEncaisse)} €`} />
          </div>
          <div className="gauge-card">
            <div className="gauge-label">Aides APL / AL</div>
            <Gauge value={stats.aidesApl} max={Math.max(stats.aidesApl * 2, 1000)} color="orange" displayValue={`${formatMoney(stats.aidesApl)} €`} />
          </div>
          <div className="stat-card" style={{ borderTop: '3px solid #ef4444' }}>
            <div className="stat-card-header">
              <div className="stat-card-label">Retards / En attente</div>
              <div className="stat-card-icon" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                <AlertCircle size={18} />
              </div>
            </div>
            <div className="stat-card-value">{stats.retardsPaiement}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>À relancer rapidement</div>
          </div>
        </div>

        {/* ── Filtres ── */}
        <div className="card mb-4" style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Filter size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />

            <select className="form-select" style={{ maxWidth: 150 }} value={filterMois} onChange={e => setFilterMois(parseInt(e.target.value))}>
              {MOIS_LABELS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>

            <select className="form-select" style={{ maxWidth: 110 }} value={filterAnnee} onChange={e => setFilterAnnee(parseInt(e.target.value))}>
              {YEARS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>

            <select className="form-select" style={{ maxWidth: 200 }} value={filterBien} onChange={e => setFilterBien(e.target.value)}>
              <option value="">Tous les biens</option>
              {biens.map(b => <option key={b.id} value={b.id}>{b.adresse}</option>)}
            </select>

            <select className="form-select" style={{ maxWidth: 160 }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
              <option value="">Tous les statuts</option>
              {STATUTS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select>

            {hasFilter && (
              <button className="btn btn-ghost btn-sm" onClick={resetFilters} style={{ marginLeft: 'auto' }}>
                <X size={13} /> Réinitialiser
              </button>
            )}

            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: hasFilter ? 0 : 'auto' }}>
              {loyersFiltres.length} loyer{loyersFiltres.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Mini résumé filtré */}
          {loyersFiltres.length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Attendu : <strong style={{ color: 'var(--text-primary)' }}>{formatMoney(totalAttendu)} €</strong>
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Encaissé : <strong style={{ color: '#10b981' }}>{formatMoney(totalEncaisse)} €</strong>
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                En attente / Retard : <strong style={{ color: '#ef4444' }}>{totalRetard}</strong>
              </span>
            </div>
          )}
        </div>

        {/* ── Table loyers ── */}
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Locataire</th>
                <th>Bien</th>
                <th>Période</th>
                <th>Loyer</th>
                <th>Aide</th>
                <th>Net</th>
                <th>Statut</th>
                <th style={{ width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loyersFiltres.length === 0 ? (
                <tr><td colSpan={8}>
                  <div className="empty-state">
                    <div className="empty-state-icon"><CircleDollarSign size={28} /></div>
                    <div className="empty-state-title">Aucun loyer trouvé</div>
                    <div className="empty-state-text">
                      {hasFilter ? 'Modifiez les filtres ou réinitialisez' : 'Cliquez sur "Générer loyers du mois"'}
                    </div>
                  </div>
                </td></tr>
              ) : loyersFiltres.map(l => {
                const statut = STATUTS.find(s => s.v === l.statut) || STATUTS[1];
                const net = (l.montant || 0) - (l.aide || 0);
                return (
                  <tr key={l.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{l.prenom} {l.nom}</div>
                      {scores[l.locataire_id] && (() => {
                        const hist = scores[l.locataire_id];
                        const payes = hist.filter(h => h.statut === 'paye').length;
                        const total = hist.length;
                        if (total === 0) return null;
                        const pct = Math.round((payes / total) * 100);
                        const color = pct >= 90 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444';
                        const label = pct >= 90 ? '●●●' : pct >= 70 ? '●●○' : '●○○';
                        return (
                          <div title={`Historique : ${payes}/${total} loyers payés (${pct}%)`} style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <span style={{ fontSize: 10, letterSpacing: 1, color }}>{label}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{payes}/{total}</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{l.bien_adresse || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {MOIS_LABELS[l.mois]} {l.annee}
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatMoney(l.montant)} €</td>
                    <td style={{ color: '#f59e0b' }}>{l.aide ? `${formatMoney(l.aide)} €` : '—'}</td>
                    <td style={{ fontWeight: 600, color: '#10b981' }}>{formatMoney(net)} €</td>
                    <td>
                      <select
                        value={l.statut}
                        onChange={e => handleStatutChange(l.id, e.target.value)}
                        className="form-select"
                        style={{ padding: '5px 10px', fontSize: 12, fontWeight: 600 }}
                      >
                        {STATUTS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {l.statut !== 'paye' && (
                          <button className="btn btn-success btn-pill btn-sm" onClick={() => handleStatutChange(l.id, 'paye')} title="Marquer payé">
                            <Check size={12} /> Payé
                          </button>
                        )}
                        <button className="btn btn-ghost btn-icon" onClick={() => handleQuittance(l.id)} title="Télécharger quittance PDF">
                          <FileText size={13} style={{ color: '#3b82f6' }} />
                        </button>
                        <button className="btn btn-ghost btn-icon" onClick={() => handleAvis(l.id)} title="Télécharger avis d'échéance">
                          <Download size={13} />
                        </button>
                        {l.statut !== 'paye' && (
                          <button className="btn btn-ghost btn-icon" onClick={() => handleReminder(l.id)} title="Envoyer rappel par email">
                            <Mail size={13} style={{ color: '#f59e0b' }} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal Révision IRL ── */}
      <Modal
        isOpen={showIRL}
        onClose={() => setShowIRL(false)}
        title="Révision IRL — Mise à jour du loyer"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowIRL(false)}>Annuler</button>
            <button
              className="btn btn-primary"
              onClick={handleApplyIRL}
              disabled={irlLoading || !irlData.bienId || !irlData.ancienIRL || !irlData.nouvelIRL}
            >
              {irlLoading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Calcul…</> : <><ArrowUpDown size={14} /> Appliquer la révision</>}
            </button>
          </>
        }
      >
        {/* Explication */}
        <div style={{ padding: '10px 14px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Comment ça fonctionne :</strong> Le nouveau loyer HC est calculé selon la formule IRL :<br />
          <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>Nouveau loyer HC = Ancien loyer HC × (Nouvel IRL / Ancien IRL)</span><br />
          Retrouvez les indices IRL sur le site de l'INSEE.
        </div>

        <div className="form-group">
          <label className="form-label">Bien concerné</label>
          <select className="form-select" value={irlData.bienId} onChange={e => setIrlData({ ...irlData, bienId: e.target.value })}>
            <option value="">— Choisir un bien —</option>
            {biens.map(b => <option key={b.id} value={b.id}>{b.adresse}</option>)}
          </select>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Ancien indice IRL</label>
            <input
              type="number"
              className="form-input"
              step="0.01"
              placeholder="ex : 143.46"
              value={irlData.ancienIRL}
              onChange={e => setIrlData({ ...irlData, ancienIRL: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Nouvel indice IRL</label>
            <input
              type="number"
              className="form-input"
              step="0.01"
              placeholder="ex : 146.59"
              value={irlData.nouvelIRL}
              onChange={e => setIrlData({ ...irlData, nouvelIRL: e.target.value })}
            />
          </div>
        </div>

        {/* Aperçu du calcul */}
        {irlData.bienId && irlData.ancienIRL && irlData.nouvelIRL && (() => {
          const bien = biens.find(b => String(b.id) === irlData.bienId);
          if (!bien) return null;
          const ancienHC = bien.loyer_hors_charge || 0;
          const nouveauHC = Math.round(ancienHC * (parseFloat(irlData.nouvelIRL) / parseFloat(irlData.ancienIRL)) * 100) / 100;
          const variation = ancienHC > 0 ? Math.round((nouveauHC - ancienHC) / ancienHC * 10000) / 100 : 0;
          return (
            <div style={{ marginTop: 8, padding: '12px 16px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: '#10b981' }}>Aperçu de la révision</div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div><span style={{ color: 'var(--text-secondary)' }}>Loyer HC actuel : </span><strong>{formatMoney(ancienHC)} €</strong></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Nouveau loyer HC : </span><strong style={{ color: '#10b981' }}>{formatMoney(nouveauHC)} €</strong></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Variation : </span><strong style={{ color: variation >= 0 ? '#10b981' : '#ef4444' }}>+{variation} %</strong></div>
              </div>
            </div>
          );
        })()}
      </Modal>
    </>
  );
}

function formatMoney(n) {
  const num = parseFloat(n) || 0;
  return num.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
