import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Wrench, Trash2, Pencil, CheckCircle2, Clock, AlertCircle, X, Building2, Euro } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';

const STATUTS = [
  { id: 'prevu', label: 'Prévu', color: '#d97706', bg: '#fef3c7' },
  { id: 'en_cours', label: 'En cours', color: '#2563eb', bg: '#dbeafe' },
  { id: 'termine', label: 'Terminé', color: '#16a34a', bg: '#dcfce7' }
];

const STATUT_MAP = Object.fromEntries(STATUTS.map(s => [s.id, s]));

const EMPTY = { bien_id: '', titre: '', description: '', prestataire: '', cout: '', date_debut: '', date_fin: '', statut: 'prevu' };

function StatutBadge({ statut }) {
  const s = STATUT_MAP[statut] || STATUTS[0];
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 99, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

function TravauxModal({ item, biens, onSave, onClose }) {
  const [form, setForm] = useState(item ? { ...item, cout: String(item.cout || ''), bien_id: String(item.bien_id || '') } : { ...EMPTY });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.titre.trim()) { setError('Le titre est requis.'); return; }
    setError('');
    setSaving(true);
    const data = { ...form, bien_id: form.bien_id ? parseInt(form.bien_id) : null, cout: parseFloat(form.cout) || 0 };
    await onSave(data);
    setSaving(false);
    onClose();
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={item ? 'Modifier les travaux' : 'Ajouter des travaux'}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Enregistrement…</> : 'Enregistrer'}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label">Titre *</label>
        <input className="form-input" value={form.titre} onChange={e => set('titre', e.target.value)} placeholder="Ex: Réfection toiture" />
      </div>
      <div className="form-group">
        <label className="form-label">Bien concerné</label>
        <select className="form-select" value={form.bien_id} onChange={e => set('bien_id', e.target.value)}>
          <option value="">— Tous les biens —</option>
          {biens.map(b => <option key={b.id} value={b.id}>{b.adresse_complete || b.adresse}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-textarea" rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Détails des travaux..." />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Prestataire</label>
          <input className="form-input" value={form.prestataire} onChange={e => set('prestataire', e.target.value)} placeholder="Nom de l'entreprise" />
        </div>
        <div className="form-group">
          <label className="form-label">Coût estimé (€)</label>
          <input className="form-input" type="text" inputMode="decimal" value={form.cout}
            onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) set('cout', v); }}
            placeholder="0.00" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Date de début</label>
          <input className="form-input" type="date" value={form.date_debut} onChange={e => set('date_debut', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Date de fin prévue</label>
          <input className="form-input" type="date" value={form.date_fin} onChange={e => set('date_fin', e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Statut</label>
        <select className="form-select" value={form.statut} onChange={e => set('statut', e.target.value)}>
          {STATUTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      {error && <div style={{ color: '#dc2626', background: '#fee2e2', padding: '8px 12px', borderRadius: 6, fontSize: 13 }}>{error}</div>}
    </Modal>
  );
}

export default function Travaux() {
  const [travaux, setTravaux] = useState([]);
  const [biens, setBiens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [filterStatut, setFilterStatut] = useState('');
  const [filterBien, setFilterBien] = useState('');
  const { confirm } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const [t, b] = await Promise.all([window.api.travaux.getAll(), window.api.biens.getAll()]);
    setTravaux(t || []);
    setBiens(b || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data) => {
    if (modal?.id) {
      await window.api.travaux.update(modal.id, data);
    } else {
      await window.api.travaux.add(data);
    }
    load();
  };

  const handleDelete = async (id, titre) => {
    const ok = await confirm({
      type: 'danger',
      title: 'Supprimer ces travaux',
      message: `"${titre || 'ce chantier'}" sera définitivement supprimé.`,
      confirmText: 'Supprimer',
      cancelText: 'Annuler'
    });
    if (!ok) return;
    await window.api.travaux.delete(id);
    load();
  };

  const filtered = travaux.filter(t => {
    if (filterStatut && t.statut !== filterStatut) return false;
    if (filterBien && String(t.bien_id) !== String(filterBien)) return false;
    return true;
  });

  const totalCout = travaux.reduce((s, t) => s + (parseFloat(t.cout) || 0), 0);
  const coutEnCours = travaux.filter(t => t.statut !== 'termine').reduce((s, t) => s + (parseFloat(t.cout) || 0), 0);

  return (
    <>
      <PageHeader
        title="Suivi des travaux"
        subtitle={`${travaux.length} chantier${travaux.length !== 1 ? 's' : ''} enregistré${travaux.length !== 1 ? 's' : ''}`}
        onRefresh={load}
        actions={
          <button className="btn btn-primary" onClick={() => setModal('new')}>
            <Plus size={16} /> Ajouter
          </button>
        }
      />

      <div className="page-container">

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          {STATUTS.map(s => {
            const count = travaux.filter(t => t.statut === s.id).length;
            const Icon = s.id === 'prevu' ? Clock : s.id === 'en_cours' ? Wrench : CheckCircle2;
            return (
              <div key={s.id} className="card" style={{ padding: '14px 18px', cursor: 'pointer', border: filterStatut === s.id ? `2px solid ${s.color}` : undefined }}
                onClick={() => setFilterStatut(filterStatut === s.id ? '' : s.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={17} style={{ color: s.color }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1.1 }}>{count}</div>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="card" style={{ padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Euro size={17} style={{ color: '#6366f1' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Budget engagé</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#6366f1', lineHeight: 1.1 }}>
                  {coutEnCours.toLocaleString('fr-FR', { minimumFractionDigits: 0 })} €
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Total : {totalCout.toLocaleString('fr-FR')} €</div>
              </div>
            </div>
          </div>
        </div>

        {/* Filtres */}
        <div className="card mb-6" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="form-select" style={{ maxWidth: 180 }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
              <option value="">Tous les statuts</option>
              {STATUTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <select className="form-select" style={{ maxWidth: 260 }} value={filterBien} onChange={e => setFilterBien(e.target.value)}>
              <option value="">Tous les biens</option>
              {biens.map(b => <option key={b.id} value={b.id}>{b.adresse_complete || b.adresse}</option>)}
            </select>
            {(filterStatut || filterBien) && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setFilterStatut(''); setFilterBien(''); }}>
                <X size={13} /> Effacer filtres
              </button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
              {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner spinner-lg" style={{ margin: '0 auto' }} /></div>
        ) : filtered.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon"><Wrench size={28} /></div>
              <div className="empty-state-title">Aucun travaux</div>
              <div className="empty-state-text">{filterStatut || filterBien ? 'Aucun résultat pour ce filtre' : 'Cliquez sur "Ajouter" pour créer votre premier chantier'}</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(t => {
              const s = STATUT_MAP[t.statut] || STATUTS[0];
              const Icon = t.statut === 'prevu' ? Clock : t.statut === 'en_cours' ? Wrench : CheckCircle2;
              return (
                <div key={t.id} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  {/* Icône statut */}
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <Icon size={18} style={{ color: s.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{t.titre}</div>
                      <StatutBadge statut={t.statut} />
                      {t.cout > 0 && (
                        <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#6366f1', fontSize: 14 }}>
                          {parseFloat(t.cout).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 6, lineHeight: 1.5 }}>{t.description}</div>
                    )}
                    <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
                      {t.bien_label && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Building2 size={11} /> {t.bien_label}
                        </span>
                      )}
                      {t.prestataire && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Wrench size={11} /> {t.prestataire}
                        </span>
                      )}
                      {t.date_debut && (
                        <span>Début : {new Date(t.date_debut).toLocaleDateString('fr-FR')}</span>
                      )}
                      {t.date_fin && (
                        <span style={{ color: t.statut !== 'termine' && new Date(t.date_fin) < new Date() ? '#ef4444' : 'var(--text-muted)' }}>
                          Fin : {new Date(t.date_fin).toLocaleDateString('fr-FR')}
                          {t.statut !== 'termine' && new Date(t.date_fin) < new Date() && ' ⚠️'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-ghost btn-icon" title="Modifier" onClick={() => setModal(t)}>
                      <Pencil size={14} />
                    </button>
                    <button className="btn btn-ghost btn-icon" title="Supprimer" onClick={() => handleDelete(t.id, t.titre)}>
                      <Trash2 size={14} style={{ color: '#ef4444' }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {modal && (
          <TravauxModal
            item={modal === 'new' ? null : modal}
            biens={biens}
            onSave={handleSave}
            onClose={() => setModal(null)}
          />
        )}
      </div>
    </>
  );
}
