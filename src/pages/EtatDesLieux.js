import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import {
  Plus, FileText, Trash2, Download, ClipboardList,
  LogIn, LogOut, GitCompare, CheckCircle2, AlertTriangle,
  Calendar, Home, User, ChevronRight, X
} from 'lucide-react';
import { useApp } from '../context/AppContext';

/* ── Constantes ── */
const PIECES_DEFAULT = [
  'Entrée / Hall', 'Séjour / Salon', 'Cuisine', 'Salle de bain',
  'WC', 'Chambre 1', 'Chambre 2', 'Chambre 3',
  'Couloir', 'Cave / Cellier', 'Parking / Garage', 'Balcon / Terrasse'
];

const ETATS = [
  { value: 'bon',      label: 'Bon état',       color: '#10b981', bg: 'rgba(16,185,129,0.1)',  dot: '#10b981' },
  { value: 'passable', label: 'État passable',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', dot: '#f59e0b' },
  { value: 'mauvais',  label: 'Mauvais état',    color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  dot: '#ef4444' }
];

const ETAT_MAP = Object.fromEntries(ETATS.map(e => [e.value, e]));
const ETAT_RANK = { bon: 0, passable: 1, mauvais: 2 };

/* ── Badge état ── */
function EtatBadge({ etat, small }) {
  const cfg = ETAT_MAP[etat] || ETATS[0];
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      borderRadius: 6, padding: small ? '1px 6px' : '2px 8px',
      fontSize: small ? 10 : 11, fontWeight: 700, whiteSpace: 'nowrap'
    }}>
      {cfg.label}
    </span>
  );
}

/* ════════════════════════════════════════════
   MODAL CRÉATION / ÉDITION
════════════════════════════════════════════ */
function EDLModal({ edl, defaultType, locataires, biens, onClose, onSaved }) {
  const [form, setForm] = useState({
    locataire_id: '',
    bien_id: '',
    type: defaultType || 'entree',
    date_edl: new Date().toISOString().slice(0, 10),
    observations: '',
    pieces: PIECES_DEFAULT.map(nom => ({ nom, etat: 'bon', observations: '' })),
    ...(edl ? {
      ...edl,
      pieces: typeof edl.pieces === 'string' ? JSON.parse(edl.pieces) : edl.pieces
    } : {})
  });
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('infos'); // 'infos' | 'pieces'

  const handleLocChange = (locId) => {
    const loc = locataires.find(l => String(l.id) === String(locId));
    setForm(f => ({ ...f, locataire_id: locId, bien_id: loc?.bien_id || f.bien_id }));
  };

  const updatePiece = (idx, key, val) => {
    setForm(f => {
      const pieces = [...f.pieces];
      pieces[idx] = { ...pieces[idx], [key]: val };
      return { ...f, pieces };
    });
  };

  const addPiece = () => setForm(f => ({
    ...f, pieces: [...f.pieces, { nom: '', etat: 'bon', observations: '' }]
  }));
  const removePiece = (idx) => setForm(f => ({
    ...f, pieces: f.pieces.filter((_, i) => i !== idx)
  }));

  const handleSubmit = async () => {
    if (!form.date_edl) { setError('La date est obligatoire.'); return; }
    const data = { ...form, locataire_id: form.locataire_id || null, bien_id: form.bien_id || null };
    if (edl) await window.api.edl.update(edl.id, data);
    else await window.api.edl.add(data);
    onSaved();
  };

  const isEntree = form.type === 'entree';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={edl ? "Modifier l'état des lieux" : "Nouvel état des lieux"}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            {edl ? 'Enregistrer' : 'Créer l\'EDL'}
          </button>
        </>
      }
    >
      {error && (
        <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--bg-tertiary)', borderRadius: 10, padding: 4 }}>
        {[
          { key: 'infos',  label: 'Informations' },
          { key: 'pieces', label: `Pièces (${form.pieces.length})` }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: activeTab === tab.key ? 'var(--bg-card)' : 'transparent',
              color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: activeTab === tab.key ? 'var(--shadow-sm)' : 'none',
              transition: 'all 150ms ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'infos' && (
        <>
          {/* Type selector */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              { v: 'entree', label: "Entrée", color: '#10b981', Icon: LogIn },
              { v: 'sortie', label: "Sortie", color: '#ef4444', Icon: LogOut }
            ].map(({ v, label, color, Icon }) => (
              <button
                key={v}
                onClick={() => setForm(f => ({ ...f, type: v }))}
                style={{
                  padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${form.type === v ? color : 'var(--border-color)'}`,
                  background: form.type === v ? `${color}14` : 'var(--bg-tertiary)',
                  display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13,
                  color: form.type === v ? color : 'var(--text-secondary)',
                  transition: 'all 150ms ease',
                }}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date de l'EDL</label>
              <input className="form-input" type="date" value={form.date_edl}
                onChange={e => setForm(f => ({ ...f, date_edl: e.target.value }))} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Locataire</label>
            <select className="form-select" value={form.locataire_id} onChange={e => handleLocChange(e.target.value)}>
              <option value="">— Choisir un locataire —</option>
              {locataires.map(l => (
                <option key={l.id} value={l.id}>{l.prenom} {l.nom}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Bien concerné</label>
            <select className="form-select" value={form.bien_id}
              onChange={e => setForm(f => ({ ...f, bien_id: e.target.value }))}>
              <option value="">— Choisir un bien —</option>
              {biens.map(b => (
                <option key={b.id} value={b.id}>{b.adresse_complete || b.adresse}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Observations générales</label>
            <textarea
              className="form-input"
              rows={3}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Remarques générales sur l'état du bien…"
              value={form.observations}
              onChange={e => setForm(f => ({ ...f, observations: e.target.value }))}
            />
          </div>
        </>
      )}

      {activeTab === 'pieces' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {form.pieces.length} pièce{form.pieces.length !== 1 ? 's' : ''} •{' '}
              {form.pieces.filter(p => p.etat === 'mauvais').length} en mauvais état
            </span>
            <button className="btn btn-ghost btn-sm" onClick={addPiece}>
              <Plus size={13} /> Ajouter
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto', paddingRight: 2 }}>
            {form.pieces.map((p, i) => (
              <div key={i} style={{
                background: 'var(--bg-tertiary)', borderRadius: 10, padding: 12,
                borderLeft: `3px solid ${ETAT_MAP[p.etat]?.dot || '#10b981'}`
              }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input
                    className="form-input"
                    style={{ flex: 1, fontSize: 13 }}
                    placeholder="Nom de la pièce"
                    value={p.nom}
                    onChange={e => updatePiece(i, 'nom', e.target.value)}
                  />
                  <select
                    className="form-select"
                    style={{ width: 145, fontSize: 13 }}
                    value={p.etat}
                    onChange={e => updatePiece(i, 'etat', e.target.value)}
                  >
                    {ETATS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                  <button
                    onClick={() => removePiece(i)}
                    style={{ color: '#ef4444', background: 'none', cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}
                  >
                    <X size={14} />
                  </button>
                </div>
                <input
                  className="form-input"
                  style={{ fontSize: 12 }}
                  placeholder="Observations sur cette pièce (optionnel)"
                  value={p.observations}
                  onChange={e => updatePiece(i, 'observations', e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ════════════════════════════════════════════
   CARD EDL
════════════════════════════════════════════ */
function EDLCard({ edl, onEdit, onDelete, onPDF, downloading, onCompare }) {
  const [hov, setHov] = useState(false);
  const pieces = typeof edl.pieces === 'string' ? JSON.parse(edl.pieces || '[]') : (edl.pieces || []);
  const nb = pieces.length;
  const mauvais  = pieces.filter(p => p.etat === 'mauvais').length;
  const passable = pieces.filter(p => p.etat === 'passable').length;
  const bons     = pieces.filter(p => p.etat === 'bon').length;
  const date = edl.date_edl ? new Date(edl.date_edl).toLocaleDateString('fr-FR') : '—';
  const adresse = [edl.bien_adresse, edl.code_postal, edl.ville].filter(Boolean).join(' ');

  const isEntree = edl.type === 'entree';
  const accentColor = isEntree ? '#10b981' : '#ef4444';

  return (
    <div
      className="card"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: 0, overflow: 'hidden', cursor: 'default',
        borderLeft: `4px solid ${accentColor}`,
        transition: 'box-shadow 180ms ease, transform 180ms ease',
        transform: hov ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hov ? 'var(--shadow-lg)' : 'var(--shadow-md)',
      }}
    >
      {/* Header de la carte */}
      <div style={{ padding: '14px 16px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Nom locataire */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <User size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {edl.loc_prenom} {edl.loc_nom || <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Sans locataire</span>}
              </span>
            </div>
            {/* Adresse */}
            {adresse && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Home size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {adresse}
                </span>
              </div>
            )}
            {/* Date */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{date}</span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 2, flexShrink: 0, marginLeft: 8 }}>
            {onCompare && (
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={onCompare}
                title="Comparer entrée / sortie"
                style={{ color: 'var(--accent-blue)' }}
              >
                <GitCompare size={13} />
              </button>
            )}
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onEdit} title="Modifier">
              <FileText size={13} />
            </button>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={onPDF}
              title="Télécharger PDF"
              disabled={downloading}
            >
              {downloading
                ? <div className="spinner" style={{ width: 12, height: 12 }} />
                : <Download size={13} />
              }
            </button>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onDelete} title="Supprimer"
              style={{ color: '#ef4444' }}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Barre de résumé pièces */}
      {nb > 0 && (
        <div style={{
          padding: '8px 16px 12px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          {/* Mini barre proportionnelle */}
          <div style={{ flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--bg-tertiary)', display: 'flex' }}>
            {bons     > 0 && <div style={{ width: `${(bons/nb)*100}%`,     background: '#10b981', transition: 'width 400ms ease' }} />}
            {passable > 0 && <div style={{ width: `${(passable/nb)*100}%`, background: '#f59e0b', transition: 'width 400ms ease' }} />}
            {mauvais  > 0 && <div style={{ width: `${(mauvais/nb)*100}%`,  background: '#ef4444', transition: 'width 400ms ease' }} />}
          </div>

          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {nb} pièce{nb > 1 ? 's' : ''}
          </span>

          {mauvais > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.1)', borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' }}>
              ⚠ {mauvais} mauvais
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   MODAL COMPARAISON
════════════════════════════════════════════ */
function EDLCompareModal({ entree, sortie, onClose }) {
  const piecesE = typeof entree.pieces === 'string' ? JSON.parse(entree.pieces || '[]') : (entree.pieces || []);
  const piecesS = typeof sortie.pieces === 'string' ? JSON.parse(sortie.pieces || '[]') : (sortie.pieces || []);
  const allNoms = [...new Set([...piecesE.map(p => p.nom), ...piecesS.map(p => p.nom)])];
  const getPiece = (list, nom) => list.find(p => p.nom === nom);
  const dateE = entree.date_edl ? new Date(entree.date_edl).toLocaleDateString('fr-FR') : '—';
  const dateS = sortie.date_edl ? new Date(sortie.date_edl).toLocaleDateString('fr-FR') : '—';

  const degrades = allNoms.filter(nom => {
    const e = getPiece(piecesE, nom);
    const s = getPiece(piecesS, nom);
    return e && s && (ETAT_RANK[s.etat] || 0) > (ETAT_RANK[e.etat] || 0);
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 20, width: '100%', maxWidth: 820, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.4)', border: '1px solid var(--border-color)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <GitCompare size={20} style={{ color: 'var(--accent-blue)' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Comparaison entrée / sortie</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
              {entree.loc_prenom} {entree.loc_nom} — {entree.bien_adresse || '—'}
            </div>
          </div>
          {degrades.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              <AlertTriangle size={14} />
              {degrades.length} dégradation{degrades.length > 1 ? 's' : ''}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.1)', color: '#10b981', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              <CheckCircle2 size={14} /> Aucune dégradation
            </div>
          )}
          <button onClick={onClose} style={{ background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 8, marginLeft: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* En-têtes colonnes */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '2px solid var(--border-color)', background: 'var(--bg-tertiary)', flexShrink: 0 }}>
          <div style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Pièce
          </div>
          <div style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <LogIn size={13} /> Entrée — {dateE}
          </div>
          <div style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <LogOut size={13} /> Sortie — {dateS}
          </div>
        </div>

        {/* Lignes pièces */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {allNoms.map(nom => {
            const e = getPiece(piecesE, nom);
            const s = getPiece(piecesS, nom);
            const degrade = e && s && (ETAT_RANK[s?.etat] || 0) > (ETAT_RANK[e?.etat] || 0);
            return (
              <div key={nom} style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                borderBottom: '1px solid var(--border-color)',
                background: degrade ? 'rgba(239,68,68,0.03)' : 'transparent',
              }}>
                <div style={{ padding: '11px 16px', fontSize: 13, fontWeight: degrade ? 700 : 500, color: degrade ? '#dc2626' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {degrade && <AlertTriangle size={13} style={{ flexShrink: 0 }} />}
                  {nom}
                </div>
                <div style={{ padding: '11px 16px', borderLeft: '1px solid var(--border-color)' }}>
                  {e
                    ? <><EtatBadge etat={e.etat} small />{e.observations && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{e.observations}</div>}</>
                    : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                  }
                </div>
                <div style={{ padding: '11px 16px', borderLeft: '1px solid var(--border-color)' }}>
                  {s
                    ? <><EtatBadge etat={s.etat} small />{s.observations && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{s.observations}</div>}</>
                    : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                  }
                </div>
              </div>
            );
          })}

          {/* Observations générales */}
          {(entree.observations || sortie.observations) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '2px solid var(--border-color)', background: 'var(--bg-tertiary)' }}>
              <div style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Observations</div>
              <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', borderLeft: '1px solid var(--border-color)' }}>
                {entree.observations || '—'}
              </div>
              <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', borderLeft: '1px solid var(--border-color)' }}>
                {sortie.observations || '—'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   PAGE PRINCIPALE
════════════════════════════════════════════ */
export default function EtatDesLieux({ showHeader = true }) {
  const { addNotification } = useApp();
  const { confirm } = useConfirm();
  const [edls, setEdls] = useState([]);
  const [locataires, setLocataires] = useState([]);
  const [biens, setBiens] = useState([]);
  const [modal, setModal] = useState(null);
  const [downloading, setDownloading] = useState(null);
  const [compareModal, setCompareModal] = useState(null);

  const load = useCallback(async () => {
    const [e, l, b] = await Promise.all([
      window.api.edl.getAll(),
      window.api.locataires.getAll(),
      window.api.biens.getAll()
    ]);
    setEdls(e || []);
    setLocataires(l || []);
    setBiens(b || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: "Supprimer l'état des lieux ?",
      message: 'Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      danger: true
    });
    if (!ok) return;
    await window.api.edl.delete(id);
    load();
  };

  const handlePDF = async (id) => {
    setDownloading(id);
    const res = await window.api.edl.generatePDF(id);
    setDownloading(null);
    if (!res.success && !res.canceled) {
      addNotification({ type: 'warning', titre: 'Erreur PDF', message: res.error });
    }
  };

  const entrees = edls.filter(e => e.type === 'entree');
  const sorties = edls.filter(e => e.type === 'sortie');

  // Dégradations détectées (comparaison paire entrée/sortie)
  const findMatch = (edl) => {
    const targetType = edl.type === 'entree' ? 'sortie' : 'entree';
    return edls.find(e => e.type === targetType && (
      (edl.locataire_id && e.locataire_id === edl.locataire_id) ||
      (edl.bien_id && e.bien_id === edl.bien_id)
    ));
  };

  const nbDegrades = (() => {
    let count = 0;
    entrees.forEach(ent => {
      const sor = findMatch(ent);
      if (!sor) return;
      const pE = typeof ent.pieces === 'string' ? JSON.parse(ent.pieces || '[]') : (ent.pieces || []);
      const pS = typeof sor.pieces === 'string' ? JSON.parse(sor.pieces || '[]') : (sor.pieces || []);
      pE.forEach(pe => {
        const ps = pS.find(p => p.nom === pe.nom);
        if (ps && (ETAT_RANK[ps.etat] || 0) > (ETAT_RANK[pe.etat] || 0)) count++;
      });
    });
    return count;
  })();

  return (
    <>
      {showHeader && (
        <PageHeader
          title="États des lieux"
          subtitle={`${edls.length} document${edls.length !== 1 ? 's' : ''}`}
          onRefresh={load}
          actions={
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm"
                onClick={() => setModal({ _new: true, type: 'sortie' })}>
                <LogOut size={14} /> Sortie
              </button>
              <button className="btn btn-primary btn-sm"
                onClick={() => setModal({ _new: true, type: 'entree' })}>
                <LogIn size={14} /> Entrée
              </button>
            </div>
          }
        />
      )}

      <div className="page-container">

        {/* ── Stats bar ── */}
        {edls.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'Total',       value: edls.length,    color: 'var(--accent-blue)',   bg: 'rgba(59,130,246,0.08)'   },
              { label: 'Entrées',     value: entrees.length, color: '#10b981',              bg: 'rgba(16,185,129,0.08)'   },
              { label: 'Sorties',     value: sorties.length, color: '#ef4444',              bg: 'rgba(239,68,68,0.08)'    },
              { label: 'Dégradations', value: nbDegrades,   color: '#f59e0b',              bg: 'rgba(245,158,11,0.08)',  hide: nbDegrades === 0 },
            ].filter(s => !s.hide).map(s => (
              <div key={s.label} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: s.bg, borderRadius: 10, padding: '8px 16px',
                border: `1px solid ${s.color}22`
              }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: s.color, letterSpacing: '-0.03em' }}>{s.value}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Contenu ── */}
        {edls.length === 0 ? (
          <div className="empty-state">
            <div style={{
              width: 64, height: 64, borderRadius: 16,
              background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
            }}>
              <ClipboardList size={28} style={{ color: 'white' }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Aucun état des lieux</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24, maxWidth: 360, textAlign: 'center', lineHeight: 1.6 }}>
              Créez votre premier état des lieux pour documenter l'état du logement à l'entrée et à la sortie du locataire.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={() => setModal({ _new: true, type: 'entree' })}>
                <LogIn size={15} /> EDL d'entrée
              </button>
              <button className="btn btn-secondary" onClick={() => setModal({ _new: true, type: 'sortie' })}>
                <LogOut size={15} /> EDL de sortie
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, alignItems: 'start' }}>

            {/* ── Entrées ── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <LogIn size={14} style={{ color: '#10b981' }} />
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Entrées</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', borderRadius: 10, padding: '1px 8px', fontWeight: 600 }}>
                    {entrees.length}
                  </span>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setModal({ _new: true, type: 'entree' })}>
                  <Plus size={13} /> Ajouter
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {entrees.map(e => {
                  const match = findMatch(e);
                  return (
                    <EDLCard
                      key={e.id} edl={e}
                      onEdit={() => setModal(e)}
                      onDelete={() => handleDelete(e.id)}
                      onPDF={() => handlePDF(e.id)}
                      downloading={downloading === e.id}
                      onCompare={match ? () => setCompareModal({ entree: e, sortie: match }) : null}
                    />
                  );
                })}
                {entrees.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 16px', textAlign: 'center', background: 'var(--bg-card)', borderRadius: 12, border: '1px dashed var(--border-strong)' }}>
                    Aucun EDL d'entrée
                  </div>
                )}
              </div>
            </div>

            {/* ── Sorties ── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <LogOut size={14} style={{ color: '#ef4444' }} />
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Sorties</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', borderRadius: 10, padding: '1px 8px', fontWeight: 600 }}>
                    {sorties.length}
                  </span>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setModal({ _new: true, type: 'sortie' })}>
                  <Plus size={13} /> Ajouter
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sorties.map(e => {
                  const match = findMatch(e);
                  return (
                    <EDLCard
                      key={e.id} edl={e}
                      onEdit={() => setModal(e)}
                      onDelete={() => handleDelete(e.id)}
                      onPDF={() => handlePDF(e.id)}
                      downloading={downloading === e.id}
                      onCompare={match ? () => setCompareModal({ entree: match, sortie: e }) : null}
                    />
                  );
                })}
                {sorties.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 16px', textAlign: 'center', background: 'var(--bg-card)', borderRadius: 12, border: '1px dashed var(--border-strong)' }}>
                    Aucun EDL de sortie
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal && (
        <EDLModal
          edl={(modal === 'new' || modal?._new) ? null : modal}
          defaultType={modal?._new ? modal.type : undefined}
          locataires={locataires}
          biens={biens}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
      {compareModal && (
        <EDLCompareModal
          entree={compareModal.entree}
          sortie={compareModal.sortie}
          onClose={() => setCompareModal(null)}
        />
      )}
    </>
  );
}
