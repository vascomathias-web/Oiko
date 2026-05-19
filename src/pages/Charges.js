import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import { useApp } from '../context/AppContext';
import {
  Plus, Wallet, Trash2, Edit2, CheckSquare, Square,
  Filter, Euro, Receipt, Droplets, Flame, Trash, Building,
  ShieldCheck, BarChart3, ChevronDown
} from 'lucide-react';

/* ── Catégories ── */
const CATEGORIES = [
  { value: 'eau',            label: 'Eau',                   icon: Droplets,    color: '#06b6d4' },
  { value: 'chauffage',      label: 'Chauffage',             icon: Flame,       color: '#f59e0b' },
  { value: 'ordures',        label: 'Ordures ménagères',     icon: Trash,       color: '#10b981' },
  { value: 'parties_comm',   label: 'Parties communes',      icon: Building,    color: '#8b5cf6' },
  { value: 'ascenseur',      label: 'Ascenseur',             icon: Building,    color: '#3b82f6' },
  { value: 'assurance',      label: 'Assurance immeuble',    icon: ShieldCheck, color: '#ec4899' },
  { value: 'taxe_ordures',   label: 'Taxe ordures (TEOM)',   icon: Receipt,     color: '#f97316' },
  { value: 'autre',          label: 'Autres',                icon: Euro,        color: '#64748b' },
];
const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));

function CatBadge({ categorie, small }) {
  const cfg = CAT_MAP[categorie] || CAT_MAP['autre'];
  const Icon = cfg.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: small ? 4 : 5,
      background: `${cfg.color}14`, color: cfg.color,
      borderRadius: 6, padding: small ? '2px 7px' : '3px 10px',
      fontSize: small ? 10 : 11, fontWeight: 700, whiteSpace: 'nowrap'
    }}>
      <Icon size={small ? 10 : 11} />
      {cfg.label}
    </span>
  );
}

function fmt(n) {
  return parseFloat(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });
}

/* ════════════════════════════════════════════
   MODAL AJOUT / ÉDITION
════════════════════════════════════════════ */
function ChargeModal({ charge, biens, locataires, onClose, onSaved }) {
  const [form, setForm] = useState({
    bien_id: '',
    locataire_id: '',
    categorie: 'eau',
    libelle: '',
    montant: '',
    date_charge: new Date().toISOString().slice(0, 10),
    facture: false,
    ...(charge || {})
  });
  const [error, setError] = useState('');

  const handleBienChange = (bienId) => {
    const loc = locataires.find(l => String(l.bien_id) === String(bienId));
    setForm(f => ({ ...f, bien_id: bienId, locataire_id: loc?.id || '' }));
  };

  const handleSubmit = async () => {
    if (!form.libelle.trim()) { setError('Le libellé est obligatoire.'); return; }
    if (!form.montant || parseFloat(form.montant) <= 0) { setError('Le montant doit être supérieur à 0.'); return; }
    const data = { ...form, montant: parseFloat(form.montant) };
    if (charge) await window.api.charges.update(charge.id, data);
    else await window.api.charges.add(data);
    onSaved();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={charge ? 'Modifier la charge' : 'Nouvelle charge locative'}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            {charge ? 'Enregistrer' : 'Ajouter'}
          </button>
        </>
      }
    >
      {error && (
        <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Catégorie — grille visuelle */}
      <div className="form-group">
        <label className="form-label">Catégorie</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const active = form.categorie === cat.value;
            return (
              <button
                key={cat.value}
                onClick={() => setForm(f => ({ ...f, categorie: cat.value }))}
                style={{
                  padding: '8px 6px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                  border: `2px solid ${active ? cat.color : 'var(--border-color)'}`,
                  background: active ? `${cat.color}14` : 'var(--bg-tertiary)',
                  transition: 'all 150ms ease',
                }}
              >
                <Icon size={14} style={{ color: active ? cat.color : 'var(--text-muted)', display: 'block', margin: '0 auto 3px' }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: active ? cat.color : 'var(--text-secondary)', lineHeight: 1.2 }}>
                  {cat.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Bien concerné</label>
          <select className="form-select" value={form.bien_id} onChange={e => handleBienChange(e.target.value)}>
            <option value="">— Tous les biens —</option>
            {biens.map(b => <option key={b.id} value={b.id}>{b.adresse || b.adresse_complete}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Locataire</label>
          <select className="form-select" value={form.locataire_id} onChange={e => setForm(f => ({ ...f, locataire_id: e.target.value }))}>
            <option value="">— Optionnel —</option>
            {locataires
              .filter(l => !form.bien_id || String(l.bien_id) === String(form.bien_id))
              .map(l => <option key={l.id} value={l.id}>{l.prenom} {l.nom}</option>)
            }
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Libellé</label>
        <input
          className="form-input"
          placeholder="Ex : Eau 3e trimestre 2025"
          value={form.libelle}
          onChange={e => setForm(f => ({ ...f, libelle: e.target.value }))}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Montant (€)</label>
          <input
            className="form-input"
            type="number" min="0" step="0.01"
            placeholder="0,00"
            value={form.montant}
            onChange={e => setForm(f => ({ ...f, montant: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Date</label>
          <input
            className="form-input"
            type="date"
            value={form.date_charge}
            onChange={e => setForm(f => ({ ...f, date_charge: e.target.value }))}
          />
        </div>
      </div>

      <div className="form-checkbox">
        <input
          type="checkbox" id="facture"
          checked={!!form.facture}
          onChange={e => setForm(f => ({ ...f, facture: e.target.checked }))}
        />
        <label htmlFor="facture" style={{ fontSize: 13, cursor: 'pointer' }}>
          Facture justificative disponible
        </label>
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════════════
   PAGE PRINCIPALE
════════════════════════════════════════════ */
export default function Charges() {
  const { addNotification } = useApp();
  const { confirm } = useConfirm();
  const currentYear = new Date().getFullYear();

  const [charges, setCharges]       = useState([]);
  const [biens, setBiens]           = useState([]);
  const [locataires, setLocataires] = useState([]);
  const [modal, setModal]           = useState(null); // null | 'new' | charge object
  const [filterAnnee, setFilterAnnee] = useState(currentYear);
  const [filterBien, setFilterBien]   = useState('');
  const [filterCat, setFilterCat]     = useState('');

  const load = useCallback(async () => {
    const filters = {};
    if (filterAnnee) filters.annee = filterAnnee;
    if (filterBien)  filters.bien_id = filterBien;
    const [ch, bl, ll] = await Promise.all([
      window.api.charges.getAll(filters),
      window.api.biens.getAll(),
      window.api.locataires.getAll(),
    ]);
    setCharges(ch || []);
    setBiens(bl || []);
    setLocataires(ll || []);
  }, [filterAnnee, filterBien]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    const ok = await confirm({ title: 'Supprimer la charge ?', message: 'Cette action est irréversible.', confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    await window.api.charges.delete(id);
    addNotification({ type: 'info', titre: 'Charge supprimée', message: 'La charge a été retirée.' });
    load();
  };

  /* ── Calculs stats ── */
  const filtered = filterCat ? charges.filter(c => c.categorie === filterCat) : charges;
  const total       = filtered.reduce((s, c) => s + parseFloat(c.montant || 0), 0);
  const avecFacture = filtered.filter(c => c.facture).length;

  // Répartition par catégorie
  const parCat = CATEGORIES.map(cat => {
    const items = charges.filter(c => c.categorie === cat.value);
    const montant = items.reduce((s, c) => s + parseFloat(c.montant || 0), 0);
    return { ...cat, count: items.length, montant };
  }).filter(c => c.count > 0);

  // Répartition par bien
  const parBien = biens.map(b => {
    const items = charges.filter(c => String(c.bien_id) === String(b.id));
    const montant = items.reduce((s, c) => s + parseFloat(c.montant || 0), 0);
    return { ...b, count: items.length, montant };
  }).filter(b => b.count > 0).sort((a, b) => b.montant - a.montant);

  const years = [];
  for (let y = currentYear; y >= currentYear - 4; y--) years.push(y);

  return (
    <>
      <PageHeader
        title="Charges locatives"
        subtitle={`${charges.length} charge${charges.length !== 1 ? 's' : ''} · ${fmt(total)} € en ${filterAnnee}`}
        onRefresh={load}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setModal('new')}>
            <Plus size={14} /> Nouvelle charge
          </button>
        }
      />

      <div className="page-container">

        {/* ── Stats bar ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total',         value: `${fmt(total)} €`,     color: '#3b82f6',  bg: 'rgba(59,130,246,0.08)'  },
            { label: 'Nb de charges', value: filtered.length,        color: '#8b5cf6',  bg: 'rgba(139,92,246,0.08)'  },
            { label: 'Avec facture',  value: avecFacture,            color: '#10b981',  bg: 'rgba(16,185,129,0.08)'  },
            { label: 'Catégories',    value: parCat.length,          color: '#f59e0b',  bg: 'rgba(245,158,11,0.08)'  },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: 12, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: '-0.02em' }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>

          {/* ── Colonne principale ── */}
          <div>
            {/* Filtres */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <Filter size={14} style={{ color: 'var(--text-muted)' }} />

              {/* Année */}
              <select
                className="form-select"
                style={{ width: 100, fontSize: 12, padding: '6px 10px' }}
                value={filterAnnee}
                onChange={e => setFilterAnnee(Number(e.target.value))}
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>

              {/* Bien */}
              <select
                className="form-select"
                style={{ flex: 1, maxWidth: 240, fontSize: 12, padding: '6px 10px' }}
                value={filterBien}
                onChange={e => setFilterBien(e.target.value)}
              >
                <option value="">Tous les biens</option>
                {biens.map(b => <option key={b.id} value={b.id}>{b.adresse || b.adresse_complete}</option>)}
              </select>

              {/* Catégorie */}
              <select
                className="form-select"
                style={{ flex: 1, maxWidth: 200, fontSize: 12, padding: '6px 10px' }}
                value={filterCat}
                onChange={e => setFilterCat(e.target.value)}
              >
                <option value="">Toutes catégories</option>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            {/* Table */}
            {filtered.length === 0 ? (
              <div className="empty-state" style={{ padding: '48px 24px' }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <Wallet size={24} style={{ color: 'white' }} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Aucune charge</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20, textAlign: 'center', maxWidth: 300 }}>
                  Enregistrez les charges locatives récupérables sur vos locataires.
                </div>
                <button className="btn btn-primary" onClick={() => setModal('new')}>
                  <Plus size={14} /> Nouvelle charge
                </button>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Catégorie</th>
                      <th>Libellé</th>
                      <th>Bien / Locataire</th>
                      <th>Date</th>
                      <th style={{ textAlign: 'right' }}>Montant</th>
                      <th style={{ textAlign: 'center' }}>Facture</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(c => (
                      <ChargeRow
                        key={c.id}
                        charge={c}
                        onEdit={() => setModal(c)}
                        onDelete={() => handleDelete(c.id)}
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--bg-tertiary)' }}>
                      <td colSpan={4} style={{ padding: '10px 16px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                        Total — {filtered.length} charge{filtered.length !== 1 ? 's' : ''}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 800, fontSize: 14, color: '#3b82f6' }}>
                        {fmt(total)} €
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ── Colonne répartitions ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Par catégorie */}
            {parCat.length > 0 && (
              <div className="card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <BarChart3 size={15} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>Par catégorie</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {parCat.sort((a, b) => b.montant - a.montant).map(cat => {
                    const pct = total > 0 ? (cat.montant / total) * 100 : 0;
                    return (
                      <div key={cat.value}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{cat.label}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: cat.color }}>{fmt(cat.montant)} €</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: cat.color, borderRadius: 3, transition: 'width 400ms ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Par bien */}
            {parBien.length > 0 && (
              <div className="card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <Building size={15} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>Par bien</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {parBien.map(b => {
                    const pct = total > 0 ? (b.montant / total) * 100 : 0;
                    return (
                      <div key={b.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                            {b.adresse || b.adresse_complete}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', flexShrink: 0, marginLeft: 4 }}>{fmt(b.montant)} €</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: '#8b5cf6', borderRadius: 3, transition: 'width 400ms ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <ChargeModal
          charge={modal === 'new' ? null : modal}
          biens={biens}
          locataires={locataires}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </>
  );
}

/* ── Ligne de tableau ── */
function ChargeRow({ charge, onEdit, onDelete }) {
  const [hov, setHov] = useState(false);
  const date = charge.date_charge
    ? new Date(charge.date_charge).toLocaleDateString('fr-FR')
    : '—';

  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <td><CatBadge categorie={charge.categorie} small /></td>
      <td style={{ fontWeight: 500 }}>{charge.libelle}</td>
      <td>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{charge.bien_label || '—'}</div>
        {charge.locataire_label && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{charge.locataire_label}</div>
        )}
      </td>
      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{date}</td>
      <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#3b82f6' }}>
        {parseFloat(charge.montant || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
      </td>
      <td style={{ textAlign: 'center' }}>
        {charge.facture
          ? <CheckSquare size={14} style={{ color: '#10b981' }} />
          : <Square      size={14} style={{ color: 'var(--text-muted)' }} />
        }
      </td>
      <td>
        <div style={{ display: 'flex', gap: 2, opacity: hov ? 1 : 0, transition: 'opacity 150ms' }}>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onEdit} title="Modifier">
            <Edit2 size={13} />
          </button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onDelete} title="Supprimer"
            style={{ color: '#ef4444' }}>
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}
