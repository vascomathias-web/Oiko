import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import {
  Building2, Users, Plus, Edit, Trash2, Home, MapPin,
  Ruler, Wallet, Lock, Mail, Phone, Calendar as CalIcon,
  Check, X as XIcon, Eye, EyeOff, Search
} from 'lucide-react';

// Input numérique qui ne laisse JAMAIS passer de valeur négative
function NumberInput({ value, onChange, step = '0.01', placeholder, className = 'form-input', ...props }) {
  const handleChange = (e) => {
    let v = e.target.value;
    if (v === '' || v === '-') {
      onChange('');
      return;
    }
    const num = parseFloat(v);
    if (isNaN(num) || num < 0) {
      onChange('0');
      return;
    }
    onChange(v);
  };

  const handleKeyDown = (e) => {
    if (e.key === '-' || e.key === 'Subtract') {
      e.preventDefault();
    }
    if (e.key === 'ArrowDown') {
      const current = parseFloat(value) || 0;
      if (current <= 0) e.preventDefault();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text');
    if (parseFloat(pasted) < 0) {
      e.preventDefault();
    }
  };

  const handleWheel = (e) => {
    const current = parseFloat(value) || 0;
    if (current <= 0 && e.deltaY > 0) {
      e.preventDefault();
    }
    e.target.blur();
  };

  return (
    <input
      type="number"
      step={step}
      min="0"
      className={className}
      value={value === undefined || value === null ? '' : value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onWheel={handleWheel}
      placeholder={placeholder}
      {...props}
    />
  );
}

export default function Biens() {
  const [biens, setBiens] = useState([]);
  const [locataires, setLocataires] = useState([]);
  const [showBienModal, setShowBienModal] = useState(false);
  const [showLocModal, setShowLocModal] = useState(false);
  const [editingBien, setEditingBien] = useState(null);
  const [editingLoc, setEditingLoc] = useState(null);
  const [tab, setTab] = useState('biens');
  const [searchQuery, setSearchQuery] = useState('');

  // Reset la recherche en changeant d'onglet
  const handleTabChange = (newTab) => {
    setTab(newTab);
    setSearchQuery('');
  };

  // Filtrage intelligent (insensible aux accents et à la casse)
  const normalize = (str) => (str || '').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = normalize(searchQuery.trim());

  const filteredBiens = !q ? biens : biens.filter(b =>
    normalize(b.adresse).includes(q) ||
    normalize(b.type).includes(q) ||
    normalize(b.code_immeuble_decrypted).includes(q) ||
    String(b.loyer_total).includes(q) ||
    String(b.surface).includes(q)
  );

  const filteredLocataires = !q ? locataires : locataires.filter(l =>
    normalize(l.nom).includes(q) ||
    normalize(l.prenom).includes(q) ||
    normalize(l.email).includes(q) ||
    normalize(l.telephone).includes(q) ||
    normalize(l.bien_adresse).includes(q)
  );

  const load = useCallback(async () => {
    const [b, l] = await Promise.all([
      window.api.biens.getAll(),
      window.api.locataires.getAll()
    ]);
    setBiens(b);
    setLocataires(l);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeader
        title="Biens & Locataires"
        subtitle={`${biens.length} biens • ${locataires.length} locataires`}
        onRefresh={load}
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => { setEditingBien(null); setShowBienModal(true); }}>
              <Plus size={16} /> Ajouter Bien
            </button>
            <button className="btn btn-primary" onClick={() => { setEditingLoc(null); setShowLocModal(true); }}>
              <Plus size={16} /> Ajouter Locataire
            </button>
          </>
        }
      />

      <div className="page-container">
        {/* Barre supérieure : tabs + recherche */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 20,
          flexWrap: 'wrap'
        }}>
          {/* Tabs */}
          <div style={{
            display: 'flex',
            gap: 6,
            padding: 4,
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            width: 'fit-content'
          }}>
            <button
              className={tab === 'biens' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              onClick={() => handleTabChange('biens')}
            >
              <Building2 size={14} /> Biens ({biens.length})
            </button>
            <button
              className={tab === 'locataires' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              onClick={() => handleTabChange('locataires')}
            >
              <Users size={14} /> Locataires ({locataires.length})
            </button>
          </div>

          {/* Barre de recherche */}
          <div style={{
            position: 'relative',
            flex: 1,
            minWidth: 280,
            maxWidth: 480
          }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none'
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tab === 'biens'
                ? 'Rechercher par adresse, type, code...'
                : 'Rechercher par nom, email, téléphone...'}
              className="form-input"
              style={{ paddingLeft: 40, paddingRight: searchQuery ? 40 : 14 }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 26,
                  height: 26,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                  borderRadius: 6,
                  background: 'transparent',
                  transition: 'background 150ms'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                title="Effacer la recherche"
              >
                <XIcon size={14} />
              </button>
            )}
          </div>

          {/* Indicateur de résultats */}
          {q && (
            <div style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              fontWeight: 500
            }}>
              {tab === 'biens'
                ? `${filteredBiens.length} / ${biens.length} biens`
                : `${filteredLocataires.length} / ${locataires.length} locataires`}
            </div>
          )}
        </div>

        {tab === 'biens' ? (
          <BiensGrid
            biens={filteredBiens}
            searchQuery={q}
            onEdit={(b) => { setEditingBien(b); setShowBienModal(true); }}
            reload={load}
          />
        ) : (
          <LocatairesGrid
            locataires={filteredLocataires}
            searchQuery={q}
            biens={biens}
            onEdit={(l) => { setEditingLoc(l); setShowLocModal(true); }}
            reload={load}
          />
        )}
      </div>

      {showBienModal && (
        <BienForm
          bien={editingBien}
          onClose={() => setShowBienModal(false)}
          onSaved={() => { setShowBienModal(false); load(); }}
        />
      )}

      {showLocModal && (
        <LocataireForm
          locataire={editingLoc}
          biens={biens}
          onClose={() => setShowLocModal(false)}
          onSaved={() => { setShowLocModal(false); load(); }}
        />
      )}
    </>
  );
}

function BiensGrid({ biens, searchQuery, onEdit, reload }) {
  const { confirm } = useConfirm();
  const handleDelete = async (id) => {
    const bien = biens.find(b => b.id === id);
    const ok = await confirm({
      type: 'danger',
      title: 'Supprimer ce bien',
      message: `Êtes-vous sûr de vouloir supprimer "${bien?.adresse || 'ce bien'}" ?\n\nCette action est irréversible.`,
      confirmText: 'Supprimer',
      cancelText: 'Annuler'
    });
    if (!ok) return;
    await window.api.biens.delete(id);
    await reload();
  };

  if (biens.length === 0) return (
    <div className="card">
      <div className="empty-state">
        <div className="empty-state-icon">
          {searchQuery ? <Search size={28} /> : <Building2 size={28} />}
        </div>
        <div className="empty-state-title">
          {searchQuery ? 'Aucun bien trouvé' : 'Aucun bien enregistré'}
        </div>
        <div className="empty-state-text">
          {searchQuery
            ? `Aucun résultat pour "${searchQuery}"`
            : 'Cliquez sur "Ajouter Bien" pour commencer'}
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid grid-3">
      {biens.map(b => (
        <div key={b.id} className="card" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: b.type === 'maison' ? 'var(--gradient-green)' : 'var(--gradient-blue)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white'
            }}>
              {b.type === 'maison' ? <Home size={22} /> : <Building2 size={22} />}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onEdit(b)}><Edit size={13} /></button>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(b.id)}>
                <Trash2 size={13} style={{ color: '#ef4444' }} />
              </button>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>
            {b.type === 'maison' ? 'Maison' : 'Appartement'}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'start', gap: 6 }}>
            <MapPin size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--text-muted)' }} />
            {b.adresse}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
            <div>
              <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Loyer</div>
              <div style={{ fontWeight: 700, color: '#10b981' }}>{b.loyer_total} €</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Surface</div>
              <div style={{ fontWeight: 600 }}>{b.surface} m²</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Caution</div>
              <div style={{ fontWeight: 600 }}>{b.caution} €</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Lock size={10} /> Code
              </div>
              <CodeReveal code={b.code_immeuble_decrypted} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LocatairesGrid({ locataires, searchQuery, biens, onEdit, reload }) {
  const { confirm } = useConfirm();
  const handleDelete = async (id) => {
    const loc = locataires.find(l => l.id === id);
    const nom = loc ? `${loc.prenom} ${loc.nom}` : 'ce locataire';
    const ok = await confirm({
      type: 'danger',
      title: 'Supprimer ce locataire',
      message: `Êtes-vous sûr de vouloir supprimer "${nom}" ?\n\nLes loyers associés seront également supprimés.`,
      confirmText: 'Supprimer',
      cancelText: 'Annuler'
    });
    if (!ok) return;
    await window.api.locataires.delete(id);
    await reload();
  };

  if (locataires.length === 0) return (
    <div className="card">
      <div className="empty-state">
        <div className="empty-state-icon">
          {searchQuery ? <Search size={28} /> : <Users size={28} />}
        </div>
        <div className="empty-state-title">
          {searchQuery ? 'Aucun locataire trouvé' : 'Aucun locataire enregistré'}
        </div>
        <div className="empty-state-text">
          {searchQuery
            ? `Aucun résultat pour "${searchQuery}"`
            : 'Cliquez sur "Ajouter Locataire" pour commencer'}
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid grid-2">
      {locataires.map(l => (
        <div key={l.id} className="card">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'var(--gradient-purple)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 700, fontSize: 16
              }}>
                {(l.prenom?.[0] || '') + (l.nom?.[0] || '')}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{l.prenom} {l.nom}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.bien_adresse || 'Aucun bien assigné'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onEdit(l)}><Edit size={13} /></button>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(l.id)}>
                <Trash2 size={13} style={{ color: '#ef4444' }} />
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12, marginBottom: 12 }}>
            <InfoRow icon={<CalIcon size={12} />} label="Entrée" value={l.date_entree || '—'} />
            <InfoRow icon={<CalIcon size={12} />} label="Réception loyer" value={l.date_reception_loyer || '—'} />
            <InfoRow icon={<Phone size={12} />} label="Tél" value={l.telephone || '—'} />
            <InfoRow icon={<Mail size={12} />} label="Email" value={l.email || '—'} />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className={`badge ${l.caution_payee ? 'badge-success' : 'badge-warning'}`}>
              {l.caution_payee ? <Check size={10} /> : <XIcon size={10} />}
              Caution {l.caution_payee ? 'payée' : 'à payer'}
            </span>
            {l.parking === 1 && <span className="badge badge-info">Parking</span>}
            {l.aide_apl > 0 && <span className="badge badge-info">APL {l.aide_apl} €</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <div>
      <div style={{ color: 'var(--text-muted)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon} {label}
      </div>
      <div style={{ fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function BienForm({ bien, onClose, onSaved }) {
  const [form, setForm] = useState({
    type: 'appartement',
    adresse: '',
    loyer_total: '',
    surface: '',
    caution: '',
    code_immeuble: '',
    ...(bien ? { ...bien, code_immeuble: bien.code_immeuble_decrypted } : {})
  });

  const handleSubmit = async () => {
    if (!form.adresse || !form.loyer_total || !form.code_immeuble) {
      alert('Veuillez remplir tous les champs obligatoires (adresse, loyer, code d\'identification)');
      return;
    }
    const data = {
      type: form.type,
      adresse: form.adresse,
      loyer_total: parseFloat(form.loyer_total) || 0,
      surface: parseFloat(form.surface) || 0,
      caution: parseFloat(form.caution) || 0,
      code_immeuble: form.code_immeuble
    };
    if (bien) await window.api.biens.update(bien.id, data);
    else await window.api.biens.add(data);
    onSaved();
  };


  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={bien ? 'Modifier le bien' : 'Ajouter un bien'}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            {bien ? 'Enregistrer' : 'Créer'}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label">Type de bien *</label>
        <select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="appartement">Appartement</option>
          <option value="maison">Maison</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Adresse complète *</label>
        <input className="form-input" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} placeholder="12 rue des Lilas, 75011 Paris" />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Loyer total (€) *</label>
          <NumberInput
            step="0.01"
            value={form.loyer_total}
            onChange={(v) => setForm({ ...form, loyer_total: v })}
            placeholder="750"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Surface (m²)</label>
          <NumberInput
            step="0.1"
            value={form.surface}
            onChange={(v) => setForm({ ...form, surface: v })}
            placeholder="45"
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Caution (€)</label>
          <NumberInput
            step="0.01"
            value={form.caution}
            onChange={(v) => setForm({ ...form, caution: v })}
            placeholder="650"
          />
        </div>
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Lock size={10} /> N° identification unique *
          </label>
          <input
            className="form-input"
            value={form.code_immeuble || ''}
            onChange={(e) => setForm({ ...form, code_immeuble: e.target.value })}
            placeholder="Ex: 101, A-203..."
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Lock size={10} /> Le numéro d'identification est chiffré (AES-256)
      </div>
    </Modal>
  );
}

function LocataireForm({ locataire, biens, onClose, onSaved }) {
  const [form, setForm] = useState({
    nom: '', prenom: '', parking: false,
    date_entree: '', bien_id: '', caution_payee: false,
    date_reception_loyer: '', telephone: '', email: '',
    aide_apl: 0,
    ...(locataire || {})
  });
  const [allLocataires, setAllLocataires] = useState([]);

  // Récupère la liste des locataires existants pour savoir quels biens sont déjà pris
  useEffect(() => {
    window.api.locataires.getAll().then(setAllLocataires);
  }, []);

  // IDs des biens déjà assignés à un autre locataire
  const biensOccupesIds = new Set(
    allLocataires
      .filter(l => l.bien_id != null && l.id !== (locataire?.id))
      .map(l => l.bien_id)
  );

  // Biens disponibles : ceux non-occupés + celui actuellement assigné (en édition)
  const biensDisponibles = biens.filter(b =>
    !biensOccupesIds.has(b.id) || b.id === locataire?.bien_id
  );

  const handleSubmit = async () => {
    if (!form.nom || !form.prenom) {
      alert('Nom et prénom sont obligatoires');
      return;
    }
    const data = {
      nom: form.nom,
      prenom: form.prenom,
      parking: form.parking,
      date_entree: form.date_entree,
      bien_id: form.bien_id ? parseInt(form.bien_id) : null,
      caution_payee: form.caution_payee,
      date_reception_loyer: form.date_reception_loyer,
      telephone: form.telephone,
      email: form.email,
      aide_apl: parseFloat(form.aide_apl) || 0
    };
    if (locataire) await window.api.locataires.update(locataire.id, data);
    else await window.api.locataires.add(data);
    onSaved();
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={locataire ? 'Modifier le locataire' : 'Ajouter un locataire'}
      size="lg"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            {locataire ? 'Enregistrer' : 'Créer'}
          </button>
        </>
      }
    >
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Prénom *</label>
          <input className="form-input" value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} placeholder="Pierre" />
        </div>
        <div className="form-group">
          <label className="form-label">Nom *</label>
          <input className="form-input" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Lefèvre" />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">
          Bien assigné
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 8, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
            ({biensDisponibles.length} disponible{biensDisponibles.length > 1 ? 's' : ''} sur {biens.length})
          </span>
        </label>
        <select
          className="form-select"
          value={form.bien_id || ''}
          onChange={(e) => setForm({ ...form, bien_id: e.target.value })}
        >
          <option value="">— Aucun —</option>
          {biensDisponibles.map(b => (
            <option key={b.id} value={b.id}>
              {b.adresse} ({b.type})
            </option>
          ))}
        </select>
        {biensDisponibles.length === 0 && biens.length > 0 && (
          <div style={{
            fontSize: 11,
            color: 'var(--accent-orange)',
            marginTop: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            <XIcon size={12} />
            Tous vos biens sont déjà attribués. Créez un nouveau bien ou désattribuez-en un.
          </div>
        )}
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Date d'entrée</label>
          <input type="date" className="form-input" value={form.date_entree || ''} onChange={(e) => setForm({ ...form, date_entree: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Date réception loyer</label>
          <input type="date" className="form-input" value={form.date_reception_loyer || ''} onChange={(e) => setForm({ ...form, date_reception_loyer: e.target.value })} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Téléphone</label>
          <input className="form-input" value={form.telephone || ''} onChange={(e) => setForm({ ...form, telephone: e.target.value })} placeholder="06 12 34 56 78" />
        </div>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input type="email" className="form-input" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="exemple@email.com" />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Aide APL / AL mensuelle (€)</label>
        <NumberInput
          step="0.01"
          value={form.aide_apl || 0}
          onChange={(v) => setForm({ ...form, aide_apl: v })}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: 14, background: 'var(--bg-tertiary)', borderRadius: 12 }}>
        <label className="form-checkbox">
          <input type="checkbox" checked={form.parking === 1 || form.parking === true} onChange={(e) => setForm({ ...form, parking: e.target.checked })} />
          <span className="form-checkbox-label">Parking inclus</span>
        </label>
        <label className="form-checkbox">
          <input type="checkbox" checked={form.caution_payee === 1 || form.caution_payee === true} onChange={(e) => setForm({ ...form, caution_payee: e.target.checked })} />
          <span className="form-checkbox-label">Caution déjà payée</span>
        </label>
      </div>
    </Modal>
  );
}
function CodeReveal({ code }) {
  const [revealed, setRevealed] = useState(false);

  // Masque le code (garde les 2 premiers et 2 derniers caractères)
  const masked = code && code.length > 4
    ? code.slice(0, 2) + '•'.repeat(Math.max(code.length - 4, 3)) + code.slice(-2)
    : '•'.repeat(6);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        letterSpacing: revealed ? 'normal' : '0.05em',
        transition: 'letter-spacing 150ms',
        userSelect: revealed ? 'text' : 'none'
      }}>
        {revealed ? code : masked}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setRevealed(!revealed);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 22,
          height: 22,
          borderRadius: 6,
          background: 'transparent',
          color: revealed ? 'var(--accent-blue)' : 'var(--text-muted)',
          transition: 'all 150ms',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        title={revealed ? 'Masquer le code' : 'Afficher le code'}
      >
        {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
    </div>
  );
}