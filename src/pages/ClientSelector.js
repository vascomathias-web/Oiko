import React, { useState, useEffect } from 'react';
import { Plus, Check, Pencil, Trash2, X, LogIn, RotateCcw, AlertTriangle, Trash } from 'lucide-react';
import OikoLogo from '../components/OikoLogo';

const COULEURS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b',
  '#ef4444', '#06b6d4', '#ec4899', '#64748b'
];

function initiales(nom) {
  return nom.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

// Confirmation inline — pas besoin de context/provider
function ConfirmModal({ title, message, danger, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
    }}>
      <div style={{
        background: '#1e293b', border: '1px solid #334155',
        borderRadius: 16, padding: 28, maxWidth: 400, width: '100%',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)'
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: danger ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <AlertTriangle size={20} style={{ color: danger ? '#ef4444' : '#3b82f6' }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: 'white', fontSize: 15, marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{message}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ background: '#334155', color: '#94a3b8', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            style={{
              background: danger ? '#ef4444' : '#3b82f6', color: 'white',
              borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 700
            }}
          >
            {danger ? 'Supprimer' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClientSelector({ onClientSelected }) {
  const [clients, setClients] = useState([]);
  const [trash, setTrash] = useState([]);
  const [showTrash, setShowTrash] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [nom, setNom] = useState('');
  const [couleur, setCouleur] = useState(COULEURS[0]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editNom, setEditNom] = useState('');
  const [editCouleur, setEditCouleur] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null); // { title, message, danger, onConfirm }

  const loadAll = async () => {
    const [c, t] = await Promise.all([
      window.api.clients.list(),
      window.api.clients.listTrash()
    ]);
    setClients(c);
    setTrash(t || []);
  };

  useEffect(() => { loadAll(); }, []);

  const askConfirm = (opts) => new Promise(resolve => {
    setConfirm({
      ...opts,
      onConfirm: () => { setConfirm(null); resolve(true); },
      onCancel:  () => { setConfirm(null); resolve(false); }
    });
  });

  const handleCreate = async () => {
    if (!nom.trim()) { setError('Le nom est obligatoire.'); return; }
    setLoading(true);
    setError('');
    const c = await window.api.clients.create({ nom: nom.trim(), couleur });
    const res = await window.api.clients.select(c.id);
    if (res.success) {
      onClientSelected(res.client);
    } else {
      setError(res.error || 'Erreur lors de la création.');
      setLoading(false);
    }
  };

  const handleSelect = async (id) => {
    setSelecting(id);
    const res = await window.api.clients.select(id);
    if (res.success) {
      onClientSelected(res.client);
    } else {
      setSelecting(null);
    }
  };

  const handleRename = async (id) => {
    if (!editNom.trim()) return;
    const ok = await askConfirm({
      title: 'Renommer le portefeuille',
      message: `Renommer en "${editNom.trim()}" ?`,
      danger: false
    });
    if (!ok) return;
    await window.api.clients.rename(id, editNom.trim());
    await window.api.clients.updateColor(id, editCouleur);
    await loadAll();
    setEditingId(null);
  };

  const handleDelete = async (id, nomClient) => {
    if (clients.length <= 1) { setError('Impossible de supprimer le seul portefeuille.'); return; }
    const ok = await askConfirm({
      title: 'Mettre à la corbeille',
      message: `Le portefeuille "${nomClient}" sera déplacé dans la corbeille. Vous pourrez le restaurer à tout moment.`,
      danger: true
    });
    if (!ok) return;
    const res = await window.api.clients.delete(id);
    if (res.success) {
      await loadAll();
    } else {
      setError(res.error || 'Erreur.');
    }
  };

  const handleRestore = async (id, nomClient) => {
    const ok = await askConfirm({
      title: 'Restaurer ce portefeuille',
      message: `"${nomClient}" sera restauré et de nouveau accessible.`,
      danger: false
    });
    if (!ok) return;
    const res = await window.api.clients.restore(id);
    if (res.success) await loadAll();
    else setError(res.error || 'Erreur.');
  };

  const handlePermanentDelete = async (id, nomClient) => {
    const ok = await askConfirm({
      title: 'Suppression définitive',
      message: `"${nomClient}" et toutes ses données seront supprimés définitivement. Cette action est irréversible.`,
      danger: true
    });
    if (!ok) return;
    const ok2 = await askConfirm({
      title: 'Confirmer la suppression définitive',
      message: `Êtes-vous absolument certain ? Toutes les données (loyers, biens, documents…) seront perdues.`,
      danger: true
    });
    if (!ok2) return;
    const res = await window.api.clients.permanentDelete(id);
    if (res.success) await loadAll();
    else setError(res.error || 'Erreur.');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24, overflowY: 'auto'
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <OikoLogo width={240} onDark showSlogan sloganColor="rgba(255,255,255,0.45)" />
        </div>
        <p style={{ color: '#64748b', marginTop: 8, fontSize: 14 }}>Sélectionnez un portefeuille client</p>
      </div>

      {/* Carte principale */}
      <div style={{
        background: '#1e293b', border: '1px solid #334155',
        borderRadius: 20, padding: 28, width: '100%', maxWidth: 520,
        boxShadow: '0 24px 60px rgba(0,0,0,0.4)'
      }}>
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626',
            borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            {error}
            <button onClick={() => setError('')} style={{ background: 'none', cursor: 'pointer', color: '#dc2626' }}><X size={14} /></button>
          </div>
        )}

        {/* Liste des clients actifs */}
        {clients.length > 0 && (
          <div style={{ marginBottom: showForm ? 20 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Mes portefeuilles
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {clients.map(c => (
                <div key={c.id}>
                  {editingId === c.id ? (
                    <div style={{ background: '#0f172a', borderRadius: 12, padding: 14, border: '1px solid #3b82f6' }}>
                      <input
                        autoFocus
                        style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: 'white', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 14, boxSizing: 'border-box' }}
                        value={editNom}
                        onChange={e => setEditNom(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') setEditingId(null); }}
                      />
                      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                        {COULEURS.map(col => (
                          <button key={col} onClick={() => setEditCouleur(col)} style={{
                            width: 24, height: 24, borderRadius: '50%', background: col,
                            border: editCouleur === col ? '3px solid white' : '2px solid transparent', cursor: 'pointer'
                          }} />
                        ))}
                      </div>
                      {/* Aperçu */}
                      {editNom.trim() && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0f172a', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: editCouleur, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 12 }}>
                            {initiales(editNom)}
                          </div>
                          <span style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>{editNom.trim()}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleRename(c.id)} style={{ flex: 1, background: '#3b82f6', color: 'white', borderRadius: 8, padding: '7px 0', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <Check size={14} /> Enregistrer
                        </button>
                        <button onClick={() => setEditingId(null)} style={{ background: '#334155', color: '#94a3b8', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: '#0f172a',
                      border: `1px solid ${selecting === c.id ? c.couleur : '#334155'}`,
                      borderRadius: 12, padding: '12px 14px',
                      transition: 'all 0.15s', cursor: 'pointer',
                      opacity: selecting && selecting !== c.id ? 0.5 : 1
                    }}
                      onClick={() => !selecting && handleSelect(c.id)}
                      onMouseEnter={e => { if (!selecting) e.currentTarget.style.borderColor = c.couleur; }}
                      onMouseLeave={e => { if (!selecting) e.currentTarget.style.borderColor = selecting === c.id ? c.couleur : '#334155'; }}
                    >
                      <div style={{
                        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                        background: c.couleur, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 15
                      }}>
                        {c.initiales}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: 'white', fontSize: 15 }}>{c.nom}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                          Créé le {new Date(c.createdAt).toLocaleDateString('fr-FR')}
                        </div>
                      </div>
                      {selecting === c.id ? (
                        <div className="spinner" style={{ width: 18, height: 18, borderColor: c.couleur, borderTopColor: 'transparent' }} />
                      ) : (
                        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => { setEditingId(c.id); setEditNom(c.nom); setEditCouleur(c.couleur); }}
                            style={{ padding: '5px', borderRadius: 7, background: '#1e293b', color: '#94a3b8', cursor: 'pointer' }}
                            title="Renommer / recolorer"
                          >
                            <Pencil size={13} />
                          </button>
                          {clients.length > 1 && (
                            <button
                              onClick={() => handleDelete(c.id, c.nom)}
                              style={{ padding: '5px', borderRadius: 7, background: '#1e293b', color: '#ef4444', cursor: 'pointer' }}
                              title="Mettre à la corbeille"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', color: '#64748b', paddingLeft: 4 }}>
                            <LogIn size={15} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Séparateur */}
        <div style={{ borderTop: '1px solid #334155', margin: '20px 0' }} />

        {/* Formulaire nouveau client */}
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 12,
              border: '2px dashed #334155', color: '#64748b',
              background: 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.15s'
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.color = '#3b82f6'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#334155'; e.currentTarget.style.color = '#64748b'; }}
          >
            <Plus size={16} /> Nouveau portefeuille client
          </button>
        ) : (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 12 }}>Nouveau client</div>
            <input
              autoFocus
              placeholder="Nom (ex: SCI DUPONT, Cabinet Martin…)"
              value={nom}
              onChange={e => setNom(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowForm(false); }}
              style={{
                width: '100%', background: '#0f172a', border: '1px solid #334155',
                color: 'white', borderRadius: 10, padding: '10px 14px',
                fontSize: 14, marginBottom: 12, boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {COULEURS.map(col => (
                <button key={col} onClick={() => setCouleur(col)} style={{
                  width: 28, height: 28, borderRadius: '50%', background: col,
                  border: couleur === col ? '3px solid white' : '2px solid transparent',
                  cursor: 'pointer', boxShadow: couleur === col ? `0 0 0 2px ${col}` : 'none',
                  transition: 'all 0.15s'
                }} />
              ))}
            </div>
            {nom.trim() && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0f172a', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 13 }}>
                  {initiales(nom)}
                </div>
                <span style={{ color: 'white', fontWeight: 600 }}>{nom.trim()}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleCreate}
                disabled={loading || !nom.trim()}
                style={{
                  flex: 1, background: couleur, color: 'white', borderRadius: 10,
                  padding: '11px 0', fontWeight: 700, fontSize: 14, cursor: loading ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  opacity: !nom.trim() ? 0.5 : 1
                }}
              >
                {loading ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Création…</> : <><Plus size={15} /> Créer & ouvrir</>}
              </button>
              <button
                onClick={() => { setShowForm(false); setNom(''); setError(''); }}
                style={{ background: '#334155', color: '#94a3b8', borderRadius: 10, padding: '11px 16px', cursor: 'pointer', fontWeight: 600 }}
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Corbeille */}
        {trash.length > 0 && (
          <>
            <div style={{ borderTop: '1px solid #334155', margin: '20px 0' }} />
            <button
              onClick={() => setShowTrash(v => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                background: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                padding: '4px 0', justifyContent: 'center'
              }}
            >
              <Trash size={13} />
              Corbeille ({trash.length} portefeuille{trash.length > 1 ? 's' : ''})
              <span style={{ fontSize: 14 }}>{showTrash ? '▲' : '▼'}</span>
            </button>

            {showTrash && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {trash.map(c => (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: 12, padding: '10px 14px', opacity: 0.8
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: c.couleur, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 13,
                      filter: 'grayscale(0.4)'
                    }}>
                      {c.initiales}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#94a3b8', fontSize: 13 }}>{c.nom}</div>
                      <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>
                        Supprimé le {new Date(c.deletedAt).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => handleRestore(c.id, c.nom)}
                        style={{ padding: '5px 8px', borderRadius: 7, background: '#1e293b', color: '#10b981', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                        title="Restaurer"
                      >
                        <RotateCcw size={11} /> Restaurer
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(c.id, c.nom)}
                        style={{ padding: '5px', borderRadius: 7, background: '#1e293b', color: '#ef4444', cursor: 'pointer' }}
                        title="Supprimer définitivement"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 10, color: '#475569', textAlign: 'center', marginTop: 4 }}>
                  Les données sont conservées jusqu'à suppression définitive
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <p style={{ color: '#334155', fontSize: 11, marginTop: 24, textAlign: 'center' }}>
        Chaque portefeuille est isolé — aucune donnée n'est partagée entre clients
      </p>

      {/* Modal de confirmation */}
      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          danger={confirm.danger}
          onConfirm={confirm.onConfirm}
          onCancel={confirm.onCancel}
        />
      )}
    </div>
  );
}
