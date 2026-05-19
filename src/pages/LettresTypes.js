import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import { FileText, Download, ChevronRight, AlertTriangle, Home, RefreshCw, Pencil, FileSignature } from 'lucide-react';
import { useApp } from '../context/AppContext';

const TEMPLATES = [
  {
    id: 'mise_en_demeure',
    label: 'Mise en demeure',
    icon: AlertTriangle,
    color: '#ef4444',
    bg: '#fef2f2',
    desc: 'Demande officielle de paiement des loyers impayés',
    fields: ['locataire', 'montant', 'detail']
  },
  {
    id: 'conge_pour_vente',
    label: 'Congé pour vente',
    icon: Home,
    color: '#3b82f6',
    bg: '#eff6ff',
    desc: 'Notification au locataire de la mise en vente du bien',
    fields: ['locataire', 'date_conge', 'prix']
  },
  {
    id: 'conge_pour_reprise',
    label: 'Congé pour reprise',
    icon: Home,
    color: '#8b5cf6',
    bg: '#f5f3ff',
    desc: 'Reprise du logement pour usage personnel ou familial',
    fields: ['locataire', 'date_conge', 'beneficiaire']
  },
  {
    id: 'avenant_bail',
    label: 'Avenant au bail',
    icon: FileSignature,
    color: '#10b981',
    bg: '#f0fdf4',
    desc: 'Modification du loyer suite à révision IRL ou accord',
    fields: ['locataire', 'nouveau_loyer', 'date_effet', 'motif']
  },
  {
    id: 'courrier_libre',
    label: 'Courrier libre',
    icon: Pencil,
    color: '#f59e0b',
    bg: '#fffbeb',
    desc: 'Rédigez votre propre courrier avec en-tête officiel',
    fields: ['locataire', 'titre_libre', 'corps_libre']
  }
];

const FIELD_CONFIG = {
  locataire:       { label: 'Nom du locataire', placeholder: 'M. Dupont Jean', type: 'text' },
  montant:         { label: 'Montant dû (€)', placeholder: '1 650,00', type: 'text' },
  detail:          { label: 'Détail (optionnel)', placeholder: 'loyers de janvier et février 2026', type: 'text' },
  date_conge:      { label: 'Date de prise d\'effet du congé', placeholder: 'DD/MM/YYYY', type: 'date' },
  prix:            { label: 'Prix de vente proposé (€, optionnel)', placeholder: '180 000', type: 'text' },
  beneficiaire:    { label: 'Bénéficiaire de la reprise', placeholder: 'usage personnel du propriétaire', type: 'text' },
  nouveau_loyer:   { label: 'Nouveau loyer HC (€)', placeholder: '520,00', type: 'text' },
  date_effet:      { label: 'Date d\'effet', placeholder: 'DD/MM/YYYY', type: 'date' },
  motif:           { label: 'Référence IRL (optionnel)', placeholder: 'IRL T3 2025 — indice 144,38', type: 'text' },
  titre_libre:     { label: 'Objet du courrier', placeholder: 'Demande de travaux', type: 'text' },
  corps_libre:     { label: 'Corps du courrier', placeholder: 'Madame, Monsieur,\n\nJe me permets de vous contacter...', type: 'textarea' }
};

export default function LettresTypes({ showHeader = true }) {
  const { addNotification } = useApp();
  const [selected, setSelected] = useState(null);
  const [locataires, setLocataires] = useState([]);
  const [biens, setBiens] = useState([]);
  const [selectedLocId, setSelectedLocId] = useState('');
  const [vars, setVars] = useState({});
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    Promise.all([window.api.locataires.getAll(), window.api.biens.getAll()])
      .then(([l, b]) => { setLocataires(l); setBiens(b); });
  }, []);

  const handleSelectLocataire = (locId) => {
    setSelectedLocId(locId);
    if (!locId) { setVars({}); return; }
    const loc = locataires.find(l => String(l.id) === String(locId));
    if (!loc) return;
    const bien = biens.find(b => b.id === loc.bien_id);
    const adresse = bien ? [bien.adresse, bien.code_postal, bien.ville].filter(Boolean).join(', ') : '';
    setVars(v => ({
      ...v,
      locataire: `${loc.prenom} ${loc.nom}`,
      adresse,
    }));
  };

  const handleGenerate = async () => {
    if (!selected) return;
    setGenerating(true);
    setMsg(null);
    const proprietaire = await window.api.parametres.getAll().then(p => p.user_name || p.email_expediteur || 'Le Propriétaire');
    const res = await window.api.lettres.generate(selected.id, { ...vars, proprietaire });
    setGenerating(false);
    if (res.success) {
      addNotification({ type: 'success', titre: 'Lettre générée', message: `${selected.label} téléchargée` });
      setMsg({ type: 'success', text: 'Lettre générée et ouverte avec succès.' });
    } else if (!res.canceled) {
      setMsg({ type: 'error', text: res.error || 'Erreur lors de la génération.' });
    }
  };

  const setVar = (key, val) => setVars(v => ({ ...v, [key]: val }));

  return (
    <>
      {showHeader && (
        <PageHeader
          title="Lettres types"
          subtitle="Modèles de courriers officiels prêts à l'emploi"
        />
      )}
      <div className="page-container">
        {/* Grille de sélection */}
        {!selected ? (
          <>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14 }}>
              Sélectionnez un modèle de courrier — les variables sont pré-remplies depuis vos données locataires.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {TEMPLATES.map(tpl => {
                const Icon = tpl.icon;
                return (
                  <div
                    key={tpl.id}
                    className="card"
                    onClick={() => { setSelected(tpl); setVars({}); setSelectedLocId(''); setMsg(null); }}
                    style={{ cursor: 'pointer', padding: 20, borderTop: `3px solid ${tpl.color}`, transition: 'all 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 10, background: tpl.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={20} style={{ color: tpl.color }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{tpl.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{tpl.desc}</div>
                      </div>
                      <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* Formulaire du modèle sélectionné */
          <div style={{ maxWidth: 640 }}>
            <button
              onClick={() => { setSelected(null); setMsg(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', marginBottom: 20, fontSize: 13, cursor: 'pointer', background: 'none' }}
            >
              ← Retour aux modèles
            </button>

            <div className="card" style={{ padding: 24, borderTop: `3px solid ${selected.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: selected.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <selected.icon size={22} style={{ color: selected.color }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{selected.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{selected.desc}</div>
                </div>
              </div>

              {msg && (
                <div style={{
                  background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${msg.type === 'success' ? '#86efac' : '#fca5a5'}`,
                  color: msg.type === 'success' ? '#16a34a' : '#dc2626',
                  borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13
                }}>
                  {msg.text}
                </div>
              )}

              {/* Sélection du locataire */}
              <div className="form-group">
                <label className="form-label">Locataire (pré-remplissage automatique)</label>
                <select className="form-select" value={selectedLocId} onChange={e => handleSelectLocataire(e.target.value)}>
                  <option value="">-- Choisir un locataire --</option>
                  {locataires.map(l => (
                    <option key={l.id} value={l.id}>{l.prenom} {l.nom} — {l.bien_adresse || ''}</option>
                  ))}
                </select>
              </div>

              {/* Champs spécifiques au modèle */}
              {selected.fields.map(field => {
                const cfg = FIELD_CONFIG[field];
                if (!cfg) return null;
                return (
                  <div key={field} className="form-group">
                    <label className="form-label">{cfg.label}</label>
                    {cfg.type === 'textarea' ? (
                      <textarea
                        className="form-input"
                        rows={5}
                        placeholder={cfg.placeholder}
                        value={vars[field] || ''}
                        onChange={e => setVar(field, e.target.value)}
                        style={{ resize: 'vertical', fontFamily: 'inherit' }}
                      />
                    ) : (
                      <input
                        className="form-input"
                        type={cfg.type}
                        placeholder={cfg.placeholder}
                        value={vars[field] || ''}
                        onChange={e => setVar(field, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={handleGenerate}
                  disabled={generating}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  {generating
                    ? <><div className="spinner" style={{ width: 15, height: 15 }} /> Génération…</>
                    : <><Download size={15} /> Générer le PDF</>}
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, textAlign: 'center' }}>
                Le document s'ouvre automatiquement après génération. Pensez à l'imprimer en recommandé.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
