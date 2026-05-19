import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import {
  Calculator, Receipt, Check, Pencil, Trash2, Plus, CheckCircle2, Download
} from 'lucide-react';

const CATEGORIES = [
  { id: 'travaux',         label: 'Travaux & réparations',  color: '#3b82f6' },
  { id: 'assurance',       label: 'Assurances',              color: '#10b981' },
  { id: 'interet_emprunt', label: "Intérêts d'emprunt",      color: '#8b5cf6' },
  { id: 'taxe_fonciere',   label: 'Taxe foncière',           color: '#f59e0b' },
  { id: 'frais_gestion',   label: 'Frais de gestion',        color: '#06b6d4' },
  { id: 'copropriete',     label: 'Charges copropriété',     color: '#ec4899' },
  { id: 'autre',           label: 'Autres charges',          color: '#6b7280' },
];

const TMI_OPTIONS = [
  { value: 0,  label: '0 %' },
  { value: 11, label: '11 %' },
  { value: 30, label: '30 %' },
  { value: 41, label: '41 %' },
  { value: 45, label: '45 %' },
];

const PS = 17.2;
const SEUIL_MICRO = 15000;
const MOIS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

function fmt(n) {
  return (parseFloat(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Impot() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [stats, setStats] = useState(null);
  const [charges, setCharges] = useState([]);
  const [biens, setBiens] = useState([]);
  const [tmi, setTmi] = useState(30);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [s, c, b] = await Promise.all([
      window.api.impot.getStats(annee),
      window.api.impot.getCharges(annee),
      window.api.biens.getAll()
    ]);
    setStats(s);
    setCharges(c);
    setBiens(b);
    setLoading(false);
  }, [annee]);

  useEffect(() => { loadData(); }, [loadData]);

  const revenuBrut = stats?.loyersTotal || 0;
  const totalCharges = stats?.chargesTotal || 0;
  const revenuNetReel = Math.max(0, revenuBrut - totalCharges);
  const revenuNetMicro = revenuBrut > 0 && revenuBrut <= SEUIL_MICRO ? revenuBrut * 0.7 : null;

  const calcImpot = (base) => ({
    ir: (base || 0) * (tmi / 100),
    ps: (base || 0) * (PS / 100),
    total: (base || 0) * ((tmi + PS) / 100)
  });

  const impotReel = calcImpot(revenuNetReel);
  const impotMicro = revenuNetMicro !== null ? calcImpot(revenuNetMicro) : null;

  const years = [];
  const cy = new Date().getFullYear();
  for (let y = cy; y >= cy - 4; y--) years.push(y);

  const TABS = [
    { id: 'dashboard',         label: "Vue d'ensemble" },
    { id: 'revenus',           label: 'Revenus fonciers' },
    { id: 'charges',           label: 'Charges déductibles' },
    { id: 'charges_locatives', label: 'Charges locatives' },
    { id: 'simulateur',        label: 'Simulateur fiscal' },
  ];

  return (
    <>
      <PageHeader title="Impôt" subtitle="Déclarations et calculs fiscaux" onRefresh={loadData} />
      <div className="page-container">

        {/* Barre onglets + sélecteur année */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6, padding: 4, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button
                key={t.id}
                className={activeTab === t.id ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                onClick={() => setActiveTab(t.id)}
              >{t.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="form-select" style={{ width: 110 }} value={annee} onChange={e => setAnnee(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button className="btn btn-secondary btn-sm" title="Exporter le récapitulatif comptable CSV" onClick={async () => {
              const r = await window.api.export.comptable(annee);
              if (!r.success && !r.canceled) alert('Erreur export : ' + r.error);
            }}>
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><div className="spinner spinner-lg" /></div>
        ) : (
          <>
            {activeTab === 'dashboard'         && <TabDashboard stats={stats} revenuBrut={revenuBrut} totalCharges={totalCharges} revenuNetReel={revenuNetReel} revenuNetMicro={revenuNetMicro} impotReel={impotReel} impotMicro={impotMicro} tmi={tmi} annee={annee} />}
            {activeTab === 'revenus'           && <TabRevenus stats={stats} annee={annee} />}
            {activeTab === 'charges'           && <TabCharges charges={charges} biens={biens} annee={annee} onReload={loadData} />}
            {activeTab === 'charges_locatives' && <TabChargesLocatives biens={biens} annee={annee} />}
            {activeTab === 'simulateur'        && <TabSimulateur revenuBrut={revenuBrut} revenuNetReel={revenuNetReel} revenuNetMicro={revenuNetMicro} tmi={tmi} setTmi={setTmi} impotReel={impotReel} impotMicro={impotMicro} />}
          </>
        )}
      </div>
    </>
  );
}

// ─── Tab 1 : Vue d'ensemble ───────────────────────────────────────────────────
function TabDashboard({ stats, revenuBrut, totalCharges, revenuNetReel, revenuNetMicro, impotReel, impotMicro, tmi, annee }) {
  const reelMieux = impotMicro === null || impotReel.total <= impotMicro.total;

  return (
    <>
      <div className="grid grid-4 mb-6">
        <StatFiscal label="Loyers encaissés"      value={`${fmt(revenuBrut)} €`}      color="#3b82f6" sub={`${stats?.loyersNb || 0} paiements`} />
        <StatFiscal label="Charges déductibles"   value={`${fmt(totalCharges)} €`}    color="#f59e0b" sub="Régime réel" />
        <StatFiscal label="Revenu net (réel)"     value={`${fmt(revenuNetReel)} €`}   color="#10b981" sub="Après déduction charges" />
        <StatFiscal
          label="Revenu net (micro)"
          value={revenuNetMicro !== null ? `${fmt(revenuNetMicro)} €` : 'N/A'}
          color="#8b5cf6"
          sub={revenuNetMicro !== null ? 'Abattement 30 %' : '> 15 000 € : non éligible'}
        />
      </div>

      {/* Régime conseillé */}
      <div className="card mb-6" style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Régime fiscal conseillé — TMI {tmi} %</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <RegimeCard label="Régime réel"   base={revenuNetReel}  impot={impotReel}  tmi={tmi} recommended={reelMieux}  note="Charges déduites au réel" />
          <RegimeCard label="Micro-foncier" base={revenuNetMicro} impot={impotMicro} tmi={tmi} recommended={!reelMieux}
            disabled={revenuNetMicro === null}
            note={revenuNetMicro === null ? 'Loyers > 15 000 € : micro non éligible' : 'Abattement forfaitaire 30 %'}
          />
        </div>
      </div>

      {/* Répartition charges */}
      {stats?.chargesParCat?.length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Répartition des charges déductibles</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {stats.chargesParCat.map(c => {
              const cat = CATEGORIES.find(x => x.id === c.categorie) || { label: c.categorie, color: '#6b7280' };
              const pct = totalCharges > 0 ? Math.round((c.total / totalCharges) * 100) : 0;
              return (
                <div key={c.categorie}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{cat.label}</span>
                    <span style={{ fontWeight: 700 }}>{fmt(c.total)} € <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({pct} %)</span></span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-tertiary)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: cat.color, borderRadius: 999, transition: 'width 700ms ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {stats?.chargesParCat?.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Aucune charge enregistrée pour {annee} — rendez-vous dans l'onglet "Charges déductibles" pour en ajouter.
        </div>
      )}
    </>
  );
}

function StatFiscal({ label, value, color, sub }) {
  return (
    <div className="card stat-card" style={{ borderTop: `3px solid ${color}` }}>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function RegimeCard({ label, base, impot, recommended, disabled, note, tmi }) {
  return (
    <div style={{
      padding: 16, borderRadius: 'var(--radius-md)',
      border: `2px solid ${recommended ? '#10b981' : 'var(--border-color)'}`,
      background: recommended ? 'rgba(16,185,129,0.04)' : 'var(--bg-secondary)',
      position: 'relative'
    }}>
      {recommended && (
        <span style={{ position: 'absolute', top: -11, left: 14, background: '#10b981', color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 999 }}>
          Recommandé
        </span>
      )}
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{label}</div>
      {disabled ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>{note}</div>
      ) : (
        <>
          {note && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>{note}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <ImpotRow label="Base imposable"                  value={`${fmt(base)} €`} />
            <ImpotRow label={`Impôt sur le revenu (${tmi} %)`} value={`${fmt(impot?.ir)} €`} color="#ef4444" />
            <ImpotRow label="Prélèvements sociaux (17,2 %)"   value={`${fmt(impot?.ps)} €`} color="#f59e0b" />
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 7, marginTop: 2 }}>
              <ImpotRow label="Total imposition" value={`${fmt(impot?.total)} €`} bold />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ImpotRow({ label, value, color, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 600, color: color || 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

// ─── Tab 2 : Revenus fonciers ─────────────────────────────────────────────────
function TabRevenus({ stats, annee }) {
  const loyers = stats?.loyers_detail || [];
  const total = loyers.reduce((s, l) => s + l.montant, 0);

  const parMois = {};
  loyers.forEach(l => {
    if (!parMois[l.mois]) parMois[l.mois] = [];
    parMois[l.mois].push(l);
  });

  if (loyers.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon"><Receipt size={28} /></div>
          <div className="empty-state-title">Aucun loyer encaissé en {annee}</div>
          <div className="empty-state-text">Les loyers marqués "Payé" dans la section Loyer apparaîtront ici</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700 }}>Loyers encaissés — {annee}</div>
        <div style={{ fontWeight: 800, fontSize: 18, color: '#10b981' }}>{fmt(total)} €</div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg-tertiary)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <th style={{ padding: '10px 20px', textAlign: 'left' }}>Mois</th>
            <th style={{ padding: '10px 20px', textAlign: 'left' }}>Locataire</th>
            <th style={{ padding: '10px 20px', textAlign: 'left' }}>Bien</th>
            <th style={{ padding: '10px 20px', textAlign: 'right' }}>Montant</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(parMois).sort((a, b) => a - b).map(mois =>
            parMois[mois].map((l, i) => (
              <tr key={`${mois}-${i}`} style={{ borderBottom: '1px solid var(--border-color)', fontSize: 13 }}>
                <td style={{ padding: '11px 20px' }}>
                  {i === 0 && <span style={{ fontWeight: 600 }}>{MOIS[l.mois - 1]}</span>}
                </td>
                <td style={{ padding: '11px 20px', fontWeight: 500 }}>{l.prenom} {l.nom}</td>
                <td style={{ padding: '11px 20px', color: 'var(--text-muted)', fontSize: 12 }}>{l.adresse_complete || '—'}</td>
                <td style={{ padding: '11px 20px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{fmt(l.montant)} €</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr style={{ background: 'var(--bg-tertiary)', fontWeight: 700 }}>
            <td colSpan={3} style={{ padding: '12px 20px', fontSize: 13 }}>Total {annee}</td>
            <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 15, color: '#10b981' }}>{fmt(total)} €</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Tab 3 : Charges déductibles ─────────────────────────────────────────────
const CHARGE_EMPTY = { categorie: 'travaux', libelle: '', montant: '', bien_id: '', date_charge: '' };

function TabCharges({ charges, biens, annee, onReload }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...CHARGE_EMPTY });

  const openAdd = () => { setForm({ ...CHARGE_EMPTY }); setEditing(null); setShowForm(true); };
  const openEdit = (c) => { setForm({ ...c, montant: String(c.montant), bien_id: c.bien_id || '' }); setEditing(c.id); setShowForm(true); };

  const handleSave = async () => {
    if (!form.libelle || !form.montant) return;
    const data = { ...form, annee, montant: parseFloat(form.montant) || 0, bien_id: form.bien_id || null };
    if (editing) await window.api.impot.updateCharge(editing, data);
    else await window.api.impot.addCharge(data);
    setShowForm(false);
    onReload();
  };

  const handleDelete = async (id) => {
    await window.api.impot.deleteCharge(id);
    onReload();
  };

  const total = charges.reduce((s, c) => s + c.montant, 0);
  const parCat = CATEGORIES.map(cat => ({
    ...cat,
    items: charges.filter(c => c.categorie === cat.id),
    total: charges.filter(c => c.categorie === cat.id).reduce((s, c) => s + c.montant, 0)
  })).filter(g => g.items.length > 0);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          Charges {annee}
          {total > 0 && <span style={{ marginLeft: 12, fontWeight: 800, color: '#f59e0b' }}>{fmt(total)} €</span>}
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={14} /> Ajouter une charge</button>
      </div>

      {showForm && (
        <div className="card mb-4" style={{ padding: 20, border: '2px solid var(--accent-blue)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
            {editing ? 'Modifier la charge' : 'Nouvelle charge déductible'}
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Catégorie</label>
              <select className="form-select" value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Bien concerné</label>
              <select className="form-select" value={form.bien_id || ''} onChange={e => setForm({ ...form, bien_id: e.target.value })}>
                <option value="">— Tous les biens —</option>
                {biens.map(b => <option key={b.id} value={b.id}>{b.adresse_complete || b.adresse}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Libellé *</label>
              <input className="form-input" value={form.libelle} onChange={e => setForm({ ...form, libelle: e.target.value })} placeholder="ex : Réparation toiture" />
            </div>
            <div className="form-group">
              <label className="form-label">Montant (€) *</label>
              <input
                className="form-input"
                type="text"
                inputMode="decimal"
                value={form.montant}
                onChange={e => { if (/^\d*\.?\d*$/.test(e.target.value)) setForm({ ...form, montant: e.target.value }); }}
                placeholder="0.00"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input className="form-input" type="date" value={form.date_charge || ''} onChange={e => setForm({ ...form, date_charge: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Annuler</button>
            <button className="btn btn-primary btn-sm" onClick={handleSave}><Check size={14} /> {editing ? 'Enregistrer' : 'Ajouter'}</button>
          </div>
        </div>
      )}

      {charges.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><Calculator size={28} /></div>
            <div className="empty-state-title">Aucune charge enregistrée pour {annee}</div>
            <div className="empty-state-text">Ajoutez vos charges déductibles pour calculer votre revenu net foncier</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {parCat.map(group => (
            <div key={group.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{
                padding: '11px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: `${group.color}14`, borderLeft: `4px solid ${group.color}`
              }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: group.color }}>{group.label}</span>
                <span style={{ fontWeight: 800, color: group.color }}>{fmt(group.total)} €</span>
              </div>
              {group.items.map((c, i) => (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', padding: '10px 18px', gap: 12, fontSize: 13,
                  borderBottom: i < group.items.length - 1 ? '1px solid var(--border-color)' : 'none'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{c.libelle}</div>
                    {(c.date_charge || c.bien_adresse) && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {c.date_charge && <span>{c.date_charge}</span>}
                        {c.date_charge && c.bien_adresse && <span> · </span>}
                        {c.bien_adresse && <span>{c.bien_adresse}</span>}
                      </div>
                    )}
                  </div>
                  <span style={{ fontWeight: 700, minWidth: 80, textAlign: 'right' }}>{fmt(c.montant)} €</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(c)}><Pencil size={12} /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(c.id)}><Trash2 size={12} style={{ color: '#ef4444' }} /></button>
                  </div>
                </div>
              ))}
            </div>
          ))}
          <div className="card" style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Total charges déductibles {annee}</span>
            <span style={{ fontWeight: 800, fontSize: 18, color: '#f59e0b' }}>{fmt(total)} €</span>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Tab 4 : Simulateur fiscal ────────────────────────────────────────────────
function TabSimulateur({ revenuBrut, revenuNetReel, revenuNetMicro, tmi, setTmi, impotReel, impotMicro }) {
  const reelMieux = impotMicro === null || impotReel.total <= impotMicro.total;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Sélection TMI */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Votre tranche marginale d'imposition (TMI)</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Sélectionnez votre tranche pour obtenir une simulation précise</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {TMI_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setTmi(opt.value)}
              style={{
                padding: '10px 22px', borderRadius: 'var(--radius-md)',
                border: `2px solid ${tmi === opt.value ? '#3b82f6' : 'var(--border-color)'}`,
                background: tmi === opt.value ? 'rgba(59,130,246,0.1)' : 'var(--bg-secondary)',
                color: tmi === opt.value ? '#3b82f6' : 'var(--text-secondary)',
                fontWeight: tmi === opt.value ? 700 : 500, fontSize: 14, cursor: 'pointer'
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tableau comparatif */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', fontWeight: 700, fontSize: 14 }}>
          Comparaison des régimes — TMI {tmi} %
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)' }}>
              <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Calcul</th>
              <th style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 700, color: '#3b82f6' }}>Régime réel</th>
              <th style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 700, color: '#8b5cf6' }}>Micro-foncier</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Loyers bruts',                         reel: revenuBrut,    micro: revenuBrut },
              { label: 'Abattement / Charges',                 reel: -(revenuBrut - revenuNetReel), micro: revenuNetMicro !== null ? -(revenuBrut * 0.3) : null, note: revenuNetMicro === null ? '> 15 000 €' : '−30 %' },
              { label: 'Base imposable',                       reel: revenuNetReel, micro: revenuNetMicro, bold: true },
              { label: `Impôt sur le revenu (${tmi} %)`,       reel: impotReel?.ir,    micro: impotMicro?.ir,    color: '#ef4444' },
              { label: 'Prélèvements sociaux (17,2 %)',        reel: impotReel?.ps,    micro: impotMicro?.ps,    color: '#f59e0b' },
              { label: 'Total à payer',                        reel: impotReel?.total, micro: impotMicro?.total, bold: true, highlight: true },
            ].map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', background: row.highlight ? 'rgba(59,130,246,0.04)' : undefined }}>
                <td style={{ padding: '11px 20px', fontWeight: row.bold ? 700 : 400, color: 'var(--text-secondary)' }}>{row.label}</td>
                <td style={{ padding: '11px 20px', textAlign: 'right', fontWeight: row.bold ? 800 : 600, color: row.color || (row.bold ? '#3b82f6' : 'var(--text-primary)') }}>
                  {row.reel !== null && row.reel !== undefined ? `${fmt(row.reel)} €` : '—'}
                </td>
                <td style={{ padding: '11px 20px', textAlign: 'right', fontWeight: row.bold ? 800 : 600, color: row.color || (row.bold ? '#8b5cf6' : 'var(--text-primary)') }}>
                  {row.micro !== null && row.micro !== undefined ? `${fmt(row.micro)} €` : (row.note || '—')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recommandation */}
      {revenuBrut > 0 && (
        <div style={{
          padding: 16, borderRadius: 'var(--radius-md)',
          background: reelMieux ? 'rgba(16,185,129,0.08)' : 'rgba(139,92,246,0.08)',
          border: `1px solid ${reelMieux ? '#10b981' : '#8b5cf6'}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: reelMieux ? '#10b981' : '#8b5cf6' }}>
            <CheckCircle2 size={16} />
            {impotMicro === null
              ? 'Le régime réel s\'applique (loyers > 15 000 €)'
              : reelMieux
                ? `Le régime réel vous fait économiser ${fmt(impotMicro.total - impotReel.total)} € par an`
                : `Le micro-foncier vous fait économiser ${fmt(impotReel.total - impotMicro.total)} € par an`
            }
          </div>
        </div>
      )}

      {/* Note légale */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7, padding: '0 2px' }}>
        * Ces calculs sont des estimations indicatives basées sur les données saisies dans Oïko.
        Consultez un expert-comptable ou le site <strong>impots.gouv.fr</strong> pour votre déclaration officielle.
        Le micro-foncier est limité aux revenus fonciers ≤ 15 000 €/an, hors cas particuliers (monuments historiques, déficit foncier...).
      </div>
    </div>
  );
}

const CAT_LOCATIVES = [
  { id: 'eau',         label: 'Eau' },
  { id: 'electricite', label: 'Électricité' },
  { id: 'gaz',         label: 'Gaz' },
  { id: 'ordures',     label: 'Ordures ménagères' },
  { id: 'entretien',   label: 'Entretien parties communes' },
  { id: 'ascenseur',   label: 'Ascenseur' },
  { id: 'autre',       label: 'Autre' },
];

const EMPTY_CL = { bien_id: '', locataire_id: '', categorie: 'eau', libelle: '', montant: '', date_charge: '', facture: false };

function TabChargesLocatives({ biens, annee }) {
  const [charges, setCharges] = useState([]);
  const [locataires, setLocataires] = useState([]);
  const [form, setForm] = useState({ ...EMPTY_CL });
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    const [c, l] = await Promise.all([
      window.api.charges.getAll({ annee }),
      window.api.locataires.getAll()
    ]);
    setCharges(c || []);
    setLocataires(l || []);
  }, [annee]);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.libelle.trim() || !form.montant) { setFormError('Libellé et montant requis.'); return; }
    setFormError('');
    const data = { ...form, bien_id: form.bien_id ? parseInt(form.bien_id) : null, locataire_id: form.locataire_id ? parseInt(form.locataire_id) : null, montant: parseFloat(form.montant) || 0 };
    if (editing) {
      await window.api.charges.update(editing, data);
      setEditing(null);
    } else {
      await window.api.charges.add(data);
    }
    setForm({ ...EMPTY_CL });
    load();
  };

  const handleEdit = (c) => {
    setEditing(c.id);
    setForm({ bien_id: String(c.bien_id || ''), locataire_id: String(c.locataire_id || ''), categorie: c.categorie, libelle: c.libelle, montant: String(c.montant), date_charge: c.date_charge || '', facture: !!c.facture });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette charge ?')) return;
    await window.api.charges.delete(id);
    load();
  };

  const total = charges.reduce((s, c) => s + (parseFloat(c.montant) || 0), 0);

  return (
    <div>
      {/* Formulaire ajout/édition */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>{editing ? 'Modifier la charge' : 'Ajouter une charge locative'}</div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>Bien</label>
              <select className="form-input" style={{ fontSize: 13 }} value={form.bien_id} onChange={e => set('bien_id', e.target.value)}>
                <option value="">— Bien —</option>
                {biens.map(b => <option key={b.id} value={b.id}>{b.adresse_complete || b.adresse}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>Locataire</label>
              <select className="form-input" style={{ fontSize: 13 }} value={form.locataire_id} onChange={e => set('locataire_id', e.target.value)}>
                <option value="">— Locataire —</option>
                {locataires.map(l => <option key={l.id} value={l.id}>{l.prenom} {l.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>Catégorie</label>
              <select className="form-input" style={{ fontSize: 13 }} value={form.categorie} onChange={e => set('categorie', e.target.value)}>
                {CAT_LOCATIVES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>Libellé</label>
              <input className="form-input" style={{ fontSize: 13 }} value={form.libelle} onChange={e => set('libelle', e.target.value)} placeholder="Description de la charge" />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>Montant (€)</label>
              <input className="form-input" style={{ fontSize: 13 }} type="text" inputMode="decimal" value={form.montant}
                onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) set('montant', v); }} placeholder="0.00" />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>Date</label>
              <input className="form-input" style={{ fontSize: 13 }} type="date" value={form.date_charge} onChange={e => set('date_charge', e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 6, paddingBottom: 1 }}>
              <button type="submit" className="btn btn-primary btn-sm">{editing ? 'Modifier' : <><Plus size={14} /> Ajouter</>}</button>
              {editing && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(null); setForm({ ...EMPTY_CL }); }}>Annuler</button>}
            </div>
          </div>
          {formError && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{formError}</div>}
        </form>
      </div>

      {/* Résumé */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600 }}>{charges.length} charge{charges.length !== 1 ? 's' : ''} — Total : <span style={{ color: '#dc2626' }}>{fmt(total)} €</span></span>
      </div>

      {/* Liste */}
      {charges.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Aucune charge locative enregistrée pour {annee}</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              <td style={{ padding: '8px 12px' }}>Date</td>
              <td style={{ padding: '8px 12px' }}>Catégorie</td>
              <td style={{ padding: '8px 12px' }}>Libellé</td>
              <td style={{ padding: '8px 12px' }}>Bien / Locataire</td>
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>Montant</td>
              <td style={{ padding: '8px 12px', textAlign: 'center' }}>Actions</td>
            </tr>
          </thead>
          <tbody>
            {charges.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>{c.date_charge ? new Date(c.date_charge).toLocaleDateString('fr-FR') : '—'}</td>
                <td style={{ padding: '9px 12px' }}>{CAT_LOCATIVES.find(x => x.id === c.categorie)?.label || c.categorie}</td>
                <td style={{ padding: '9px 12px' }}>{c.libelle}</td>
                <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
                  {c.bien_label || '—'}{c.locataire_label ? ` / ${c.locataire_label}` : ''}
                </td>
                <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>{fmt(c.montant)} €</td>
                <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleEdit(c)}><Pencil size={13} /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(c.id)}><Trash2 size={13} style={{ color: '#ef4444' }} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
