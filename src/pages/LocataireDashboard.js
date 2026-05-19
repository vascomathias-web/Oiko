import React, { useState, useEffect } from 'react';
import {
  X, Phone, Mail, Calendar, Home, CreditCard, FileText,
  ClipboardList, TrendingUp, AlertTriangle, Check, Shield,
  Car, Banknote, LogIn, LogOut, Download, FolderOpen
} from 'lucide-react';

const MOIS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

const STATUT_CFG = {
  paye:       { label: 'Payé',      bg: '#dcfce7', color: '#16a34a' },
  retard:     { label: 'En retard', bg: '#fee2e2', color: '#dc2626' },
  partiel:    { label: 'Partiel',   bg: '#fef3c7', color: '#d97706' },
  en_attente: { label: 'En attente',bg: '#f1f5f9', color: '#64748b' },
};

function StatutBadge({ statut }) {
  const cfg = STATUT_CFG[statut] || STATUT_CFG.en_attente;
  return (
    <span style={{ background: cfg.bg, color: cfg.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
      {cfg.label}
    </span>
  );
}

function KPI({ label, value, sub, color = 'var(--text-primary)' }) {
  return (
    <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function ScoreDots({ rows }) {
  if (!rows || rows.length === 0) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Aucune donnée</span>;
  const sorted = [...rows].reverse();
  const dotColor = s => ({ paye: '#10b981', retard: '#ef4444', partiel: '#f59e0b', en_attente: '#d1d5db' })[s] || '#d1d5db';
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {sorted.map((m, i) => (
        <div key={i} title={`${MOIS[m.mois-1]} ${m.annee} — ${STATUT_CFG[m.statut]?.label || m.statut}`}
          style={{ width: 18, height: 18, borderRadius: '50%', background: dotColor(m.statut), cursor: 'default', boxShadow: '0 0 0 2px rgba(0,0,0,0.06)' }} />
      ))}
    </div>
  );
}

export default function LocataireDashboard({ locataire, onClose }) {
  const [tab, setTab] = useState('resume');
  const [loyers, setLoyers] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [edls, setEdls] = useState([]);
  const [score, setScore] = useState([]);
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    Promise.all([
      window.api.loyers.getAll(),
      window.api.documents.getByLocataire(locataire.id),
      window.api.edl.getAll(),
      window.api.loyers.scorePaiement(locataire.id),
    ]).then(([allLoyers, docs, allEdls, sc]) => {
      setLoyers((allLoyers || []).filter(l => l.locataire_id === locataire.id).sort((a, b) => b.annee !== a.annee ? b.annee - a.annee : b.mois - a.mois));
      setDocuments(docs || []);
      setEdls((allEdls || []).filter(e => e.locataire_id === locataire.id));
      setScore(sc || []);
    });
  }, [locataire.id]);

  const totalPaye = loyers.filter(l => l.statut === 'paye').reduce((s, l) => s + (l.montant || 0), 0);
  const totalImpaye = loyers.filter(l => l.statut === 'retard').reduce((s, l) => s + (l.montant || 0), 0);
  const tauxRecouvrement = loyers.length > 0 ? Math.round((loyers.filter(l => l.statut === 'paye').length / loyers.length) * 100) : 0;

  const docsByCategorie = documents.reduce((acc, d) => {
    const k = d.categorie || 'Autre';
    if (!acc[k]) acc[k] = [];
    acc[k].push(d);
    return acc;
  }, {});

  const edlEntree = edls.find(e => e.type === 'entree');
  const edlSortie = edls.find(e => e.type === 'sortie');

  const TABS = [
    { id: 'resume', label: 'Résumé' },
    { id: 'loyers', label: `Loyers (${loyers.length})` },
    { id: 'documents', label: `Documents (${documents.length})` },
    { id: 'edl', label: 'États des lieux' },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end'
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: 680, height: '100vh', background: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border-color)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'var(--gradient-purple)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 800, fontSize: 20, flexShrink: 0
              }}>
                {(locataire.prenom?.[0] || '') + (locataire.nom?.[0] || '')}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{locataire.prenom} {locataire.nom}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{locataire.bien_adresse || 'Aucun bien assigné'}</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                  {locataire.telephone && <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}><Phone size={11} />{locataire.telephone}</span>}
                  {locataire.email && <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}><Mail size={11} />{locataire.email}</span>}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
              <X size={20} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '8px 16px', fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
                background: 'none', cursor: 'pointer',
                borderBottom: tab === t.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
                whiteSpace: 'nowrap'
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {tab === 'resume' && (
            <ResumeTab locataire={locataire} score={score} totalPaye={totalPaye} totalImpaye={totalImpaye} tauxRecouvrement={tauxRecouvrement} loyers={loyers} />
          )}
          {tab === 'loyers' && <LoyersTab loyers={loyers} />}
          {tab === 'documents' && <DocumentsTab docsByCategorie={docsByCategorie} downloading={downloading} setDownloading={setDownloading} />}
          {tab === 'edl' && <EdlTab edlEntree={edlEntree} edlSortie={edlSortie} />}
        </div>
      </div>
    </div>
  );
}

function ResumeTab({ locataire, score, totalPaye, totalImpaye, tauxRecouvrement, loyers }) {
  const loyerActuel = loyers[0];
  const jours = locataire.date_fin_bail
    ? Math.ceil((new Date(locataire.date_fin_bail) - new Date()) / (1000*60*60*24))
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Alerte fin de bail */}
      {jours !== null && jours <= 90 && (
        <div style={{
          background: jours < 0 ? '#fef2f2' : '#fffbeb',
          border: `1px solid ${jours < 0 ? '#fca5a5' : '#fcd34d'}`,
          borderRadius: 10, padding: '12px 16px',
          display: 'flex', gap: 10, alignItems: 'center'
        }}>
          <AlertTriangle size={16} style={{ color: jours < 0 ? '#dc2626' : '#d97706', flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: jours < 0 ? '#dc2626' : '#d97706', fontWeight: 600 }}>
            {jours < 0 ? `Bail expiré depuis ${Math.abs(jours)} jour(s)` : `Fin de bail dans ${jours} jour(s) — ${new Date(locataire.date_fin_bail).toLocaleDateString('fr-FR')}`}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <KPI label="Total encaissé" value={`${totalPaye.toLocaleString('fr-FR')} €`} color="#10b981" />
        <KPI label="Impayés" value={`${totalImpaye.toLocaleString('fr-FR')} €`} color={totalImpaye > 0 ? '#ef4444' : 'var(--text-primary)'} />
        <KPI label="Taux recouvrement" value={`${tauxRecouvrement} %`} color={tauxRecouvrement >= 90 ? '#10b981' : tauxRecouvrement >= 70 ? '#f59e0b' : '#ef4444'} />
      </div>

      {/* Infos bail */}
      <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Informations du bail</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
          <InfoLine icon={<Calendar size={13} />} label="Entrée" value={locataire.date_entree ? new Date(locataire.date_entree).toLocaleDateString('fr-FR') : '—'} />
          <InfoLine icon={<Calendar size={13} />} label="Fin de bail" value={locataire.date_fin_bail ? new Date(locataire.date_fin_bail).toLocaleDateString('fr-FR') : '—'} />
          <InfoLine icon={<Banknote size={13} />} label="Loyer mensuel" value={loyerActuel ? `${loyerActuel.montant} €` : `${locataire.loyer_total || '—'} €`} />
          <InfoLine icon={<Calendar size={13} />} label="Réception loyer" value={locataire.date_reception_loyer ? `Le ${locataire.date_reception_loyer}` : '—'} />
          <InfoLine icon={<Shield size={13} />} label="Caution" value={locataire.caution_payee ? 'Payée' : 'Non versée'} valueColor={locataire.caution_payee ? '#10b981' : '#f59e0b'} />
          {locataire.aide_apl > 0 && <InfoLine icon={<Banknote size={13} />} label="APL" value={`${locataire.aide_apl} €`} />}
          {locataire.parking === 1 && <InfoLine icon={<Car size={13} />} label="Parking" value="Inclus" />}
        </div>
      </div>

      {/* Historique paiements */}
      <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Score de paiement (12 derniers mois)
        </div>
        <ScoreDots rows={score} />
        <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
          {[['#10b981','Payé'],['#ef4444','Retard'],['#f59e0b','Partiel'],['#d1d5db','—']].map(([c, l]) => (
            <span key={l} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: c, flexShrink: 0 }} />{l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function LoyersTab({ loyers }) {
  if (loyers.length === 0) return (
    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Aucun loyer enregistré</div>
  );
  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
            {['Période','Montant','Statut'].map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Montant' ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loyers.map(l => (
            <tr key={l.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
              <td style={{ padding: '10px 12px', fontWeight: 500 }}>{MOIS[l.mois - 1]} {l.annee}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{(l.montant || 0).toLocaleString('fr-FR')} €</td>
              <td style={{ padding: '10px 12px' }}><StatutBadge statut={l.statut} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocumentsTab({ docsByCategorie, downloading, setDownloading }) {
  const categories = Object.keys(docsByCategorie);
  if (categories.length === 0) return (
    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
      <FolderOpen size={32} style={{ marginBottom: 12 }} />
      <div>Aucun document</div>
    </div>
  );

  const handleOpen = async (id) => {
    setDownloading(id);
    await window.api.documents.open(id);
    setDownloading(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {categories.map(cat => (
        <div key={cat}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{cat}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {docsByCategorie[cat].map(doc => (
              <div key={doc.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--bg-tertiary)', borderRadius: 8, padding: '10px 14px'
              }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <FileText size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{doc.nom_original || doc.nom_fichier || 'Document'}</div>
                    {doc.date_expiration && (
                      <div style={{ fontSize: 11, color: new Date(doc.date_expiration) < new Date() ? '#ef4444' : 'var(--text-muted)' }}>
                        Expire le {new Date(doc.date_expiration).toLocaleDateString('fr-FR')}
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => handleOpen(doc.id)} disabled={downloading === doc.id}
                  style={{ background: 'none', cursor: 'pointer', color: 'var(--accent-blue)', padding: 4 }}>
                  <Download size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EdlTab({ edlEntree, edlSortie }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <EdlColumn type="entree" edl={edlEntree} />
      <EdlColumn type="sortie" edl={edlSortie} />
    </div>
  );
}

function EdlColumn({ type, edl }) {
  const isEntree = type === 'entree';
  const color = isEntree ? '#10b981' : '#ef4444';
  const Icon = isEntree ? LogIn : LogOut;
  const pieces = edl ? (typeof edl.pieces === 'string' ? JSON.parse(edl.pieces || '[]') : (edl.pieces || [])) : [];

  return (
    <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Icon size={16} style={{ color }} />
        <span style={{ fontWeight: 700, fontSize: 14, color }}>{isEntree ? 'Entrée' : 'Sortie'}</span>
      </div>
      {!edl ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
          Aucun EDL {isEntree ? "d'entrée" : 'de sortie'}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            {edl.date_edl ? new Date(edl.date_edl).toLocaleDateString('fr-FR') : '—'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pieces.map((p, i) => {
              const etatColor = { bon: '#10b981', passable: '#f59e0b', mauvais: '#ef4444' }[p.etat] || '#94a3b8';
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{p.nom}</span>
                  <span style={{ color: etatColor, fontWeight: 600, fontSize: 11 }}>
                    {{ bon: 'Bon', passable: 'Passable', mauvais: 'Mauvais' }[p.etat] || p.etat}
                  </span>
                </div>
              );
            })}
          </div>
          {edl.observations && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {edl.observations}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function InfoLine({ icon, label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{icon}</span>
      <span style={{ color: 'var(--text-muted)' }}>{label} :</span>
      <span style={{ fontWeight: 600, color: valueColor || 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}
