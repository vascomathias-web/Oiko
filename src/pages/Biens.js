import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import LocataireDashboard from './LocataireDashboard';
import {
  Building2, Users, Plus, Edit, Trash2, Home, MapPin,
  Lock, Mail, Phone, Calendar as CalIcon,
  Check, X as XIcon, Eye, EyeOff, Search,
  FileText, Shield, AlertTriangle, ShieldCheck, ClipboardList,
  Upload, ExternalLink, FolderOpen, File, ZoomIn, ZoomOut,
  ChevronLeft, ChevronRight, CalendarClock, LayoutDashboard,
  Image, History, ChevronDown, ChevronUp, Archive, Trash
} from 'lucide-react';

// Input numérique positif uniquement (type text pour éviter les bugs React/browser)
function NumberInput({ value, onChange, placeholder, className = 'form-input', ...props }) {
  const handleChange = (e) => {
    const v = e.target.value;
    // Autorise : vide, chiffres, un seul point décimal
    if (v === '' || /^\d*\.?\d*$/.test(v)) {
      onChange(v);
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      value={value === undefined || value === null ? '' : value}
      onChange={handleChange}
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

  const sortByAdresse = (a, b) =>
    (a.adresse_complete || a.adresse || '').localeCompare(
      (b.adresse_complete || b.adresse || ''), 'fr', { numeric: true, sensitivity: 'base' }
    );

  const filteredBiens = (!q ? biens : biens.filter(b =>
    normalize(b.adresse_complete || b.adresse).includes(q) ||
    normalize(b.type).includes(q) ||
    normalize(b.code_immeuble_decrypted).includes(q) ||
    String(b.loyer_total).includes(q) ||
    String(b.surface).includes(q)
  )).slice().sort(sortByAdresse);

  const filteredLocataires = (!q ? locataires : locataires.filter(l =>
    normalize(l.nom).includes(q) ||
    normalize(l.prenom).includes(q) ||
    normalize(l.email).includes(q) ||
    normalize(l.telephone).includes(q) ||
    normalize(l.bien_adresse).includes(q)
  )).slice().sort((a, b) =>
    (a.bien_adresse || '').localeCompare(b.bien_adresse || '', 'fr', { numeric: true, sensitivity: 'base' })
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

  // Stats calculées
  const occupiedBienIds = new Set(locataires.map(l => l.bien_id).filter(Boolean));
  const biensOccupes = biens.filter(b => occupiedBienIds.has(b.id)).length;
  const biensVacants = biens.length - biensOccupes;
  const loyerMensuelTotal = biens.reduce((s, b) => s + (parseFloat(b.loyer_total) || 0), 0);

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
        {/* Stats summary */}
        {biens.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 18px', borderRadius: 'var(--radius-full)',
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              fontSize: 13, fontWeight: 600, minWidth: 100
            }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Building2 size={15} style={{ color: '#6366f1' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, lineHeight: 1 }}>Total</div>
                <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2, color: 'var(--text-primary)' }}>{biens.length}</div>
              </div>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 18px', borderRadius: 'var(--radius-full)',
              background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
              fontSize: 13, fontWeight: 600, minWidth: 100
            }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={15} style={{ color: '#10b981' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#10b981', fontWeight: 500, lineHeight: 1 }}>Occupés</div>
                <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2, color: '#10b981' }}>{biensOccupes}</div>
              </div>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 18px', borderRadius: 'var(--radius-full)',
              background: biensVacants > 0 ? 'rgba(245,158,11,0.06)' : 'var(--bg-card)',
              border: `1px solid ${biensVacants > 0 ? 'rgba(245,158,11,0.25)' : 'var(--border-color)'}`,
              fontSize: 13, fontWeight: 600, minWidth: 100
            }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: biensVacants > 0 ? 'rgba(245,158,11,0.12)' : 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Home size={15} style={{ color: biensVacants > 0 ? '#f59e0b' : 'var(--text-muted)' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: biensVacants > 0 ? '#f59e0b' : 'var(--text-muted)', fontWeight: 500, lineHeight: 1 }}>Vacants</div>
                <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2, color: biensVacants > 0 ? '#f59e0b' : 'var(--text-secondary)' }}>{biensVacants}</div>
              </div>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 18px', borderRadius: 'var(--radius-full)',
              background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
              fontSize: 13, fontWeight: 600
            }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#10b981' }}>€</span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, lineHeight: 1 }}>Loyer mensuel</div>
                <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2, color: '#10b981' }}>
                  {loyerMensuelTotal.toLocaleString('fr-FR')} €
                </div>
              </div>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 18px', borderRadius: 'var(--radius-full)',
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              fontSize: 13, fontWeight: 600
            }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(99,102,241,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#6366f1' }}>12×</span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, lineHeight: 1 }}>Revenu annuel</div>
                <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2, color: 'var(--text-primary)' }}>
                  {(loyerMensuelTotal * 12).toLocaleString('fr-FR')} €
                </div>
              </div>
            </div>
          </div>
        )}

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
  const [historiqueBienId, setHistoriqueBienId] = useState(null);
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
    <>
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
              <button className="btn btn-ghost btn-icon btn-sm" title="Historique locataires" onClick={() => setHistoriqueBienId(b.id)}>
                <History size={13} />
              </button>
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
            {b.adresse_complete || b.adresse}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
            <div>
              <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Loyer HC</div>
              <div style={{ fontWeight: 600 }}>{b.loyer_hors_charge ?? b.loyer_total} €</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Charges</div>
              <div style={{ fontWeight: 600 }}>{b.charges_mensuelles ?? 0} €</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Loyer total</div>
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

    {historiqueBienId && (
      <HistoriqueModal
        bienId={historiqueBienId}
        bienAdresse={biens.find(b => b.id === historiqueBienId)?.adresse_complete || ''}
        onClose={() => setHistoriqueBienId(null)}
      />
    )}
    </>
  );
}

function LocatairesGrid({ locataires, searchQuery, biens, onEdit, reload }) {
  const { confirm } = useConfirm();
  const [docCounts, setDocCounts] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [expandedPhotosId, setExpandedPhotosId] = useState(null);
  const [loyerStatuts, setLoyerStatuts] = useState({});
  const [dashboardLoc, setDashboardLoc] = useState(null);

  useEffect(() => {
    window.api.documents.getCounts().then(rows => {
      const map = {};
      rows.forEach(r => { map[r.locataire_id] = r.count; });
      setDocCounts(map);
    });
    window.api.loyers.getStatutMois().then(rows => {
      const map = {};
      rows.forEach(r => { map[r.locataire_id] = r.statut; });
      setLoyerStatuts(map);
    });
  }, [locataires]);

  const handleDelete = async (id) => {
    const loc = locataires.find(l => l.id === id);
    const nom = loc ? `${loc.prenom} ${loc.nom}` : 'ce locataire';
    const ok = await confirm({
      type: 'warning',
      title: 'Archiver ce locataire',
      message: `Archiver "${nom}" ?\n\nLe locataire sera déplacé dans l'historique du bien avec ses dates et loyers. Vous pourrez le retrouver via l'icône Historique du bien.`,
      confirmText: 'Archiver',
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
    <>
    <div className="grid grid-2">
      {locataires.map(l => {
        const nbDocs = docCounts[l.id] || 0;
        const isExpanded = expandedId === l.id;
        const loyerStatut = loyerStatuts[l.id] || null;
        const avatarBg = loyerStatut === 'paye'    ? 'linear-gradient(135deg,#16a34a,#22c55e)'
          : loyerStatut === 'retard'               ? 'linear-gradient(135deg,#dc2626,#ef4444)'
          : loyerStatut === 'en_attente'           ? 'linear-gradient(135deg,#b45309,#f59e0b)'
          : loyerStatut === 'partiel'              ? 'linear-gradient(135deg,#0369a1,#38bdf8)'
          : 'var(--gradient-purple)';
        const avatarTitle = loyerStatut === 'paye'       ? 'Loyer payé'
          : loyerStatut === 'retard'                     ? 'Loyer en retard'
          : loyerStatut === 'en_attente'                 ? 'Loyer en attente'
          : loyerStatut === 'partiel'                    ? 'Loyer partiel'
          : 'Aucun loyer ce mois';

        return (
          <div key={l.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Contenu principal de la carte */}
            <div style={{ padding: '18px 18px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div title={avatarTitle} style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: avatarBg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontWeight: 700, fontSize: 16,
                    transition: 'background 0.3s',
                    boxShadow: loyerStatut === 'retard' ? '0 0 0 3px rgba(239,68,68,0.3)' : loyerStatut === 'paye' ? '0 0 0 3px rgba(34,197,94,0.25)' : 'none'
                  }}>
                    {(l.prenom?.[0] || '') + (l.nom?.[0] || '')}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{l.prenom} {l.nom}</div>
                    {l.prenom2 && l.nom2 && (
                      <div style={{ fontSize: 12, color: 'var(--accent-blue)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Users size={10} /> & {l.prenom2} {l.nom2}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.bien_adresse || 'Aucun bien assigné'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-icon btn-sm" title="Tableau de bord" onClick={() => setDashboardLoc(l)}>
                      <LayoutDashboard size={13} />
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" title="Générer le bail PDF" onClick={async () => {
                      const r = await window.api.bail.generate(l.id);
                      if (!r.success && !r.canceled) alert(r.error);
                    }}><FileText size={13} /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onEdit(l)}><Edit size={13} /></button>
                    <button
                      className="btn btn-sm"
                      onClick={() => handleDelete(l.id)}
                      title="Archiver ce locataire"
                      style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.22)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.12)'}
                    >
                      <Archive size={12} /> Archiver
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12, marginBottom: 12 }}>
                <InfoRow icon={<CalIcon size={12} />} label="Entrée" value={l.date_entree || '—'} />
                <InfoRow icon={<CalIcon size={12} />} label="Réception loyer" value={l.date_reception_loyer ? `Le ${l.date_reception_loyer} du mois` : '—'} />
                {l.date_fin_bail && <InfoRow icon={<CalIcon size={12} />} label="Fin de bail" value={new Date(l.date_fin_bail).toLocaleDateString('fr-FR')} />}
                <InfoRow icon={<Phone size={12} />} label="Tél" value={l.telephone || '—'} />
                <InfoRow icon={<Mail size={12} />} label="Email" value={l.email || '—'} />
              </div>

              {(() => {
                if (!l.date_fin_bail) return null;
                const jours = Math.ceil((new Date(l.date_fin_bail) - new Date()) / (1000*60*60*24));
                if (jours < 0) return <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, marginBottom: 8 }}>🔴 Bail expiré depuis {Math.abs(jours)} jour(s)</div>;
                if (jours <= 60) return <div style={{ background: '#fef9c3', color: '#ca8a04', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, marginBottom: 8 }}>⚠️ Fin de bail dans {jours} jour(s)</div>;
                return null;
              })()}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className={`badge ${l.caution_payee ? 'badge-success' : 'badge-warning'}`}>
                  {l.caution_payee ? <Check size={10} /> : <XIcon size={10} />}
                  Caution {l.caution_payee ? 'payée' : 'à payer'}
                </span>
                {l.parking === 1 && <span className="badge badge-info">Parking</span>}
                {l.aide_apl > 0 && <span className="badge badge-info">APL {l.aide_apl} €</span>}
              </div>
            </div>

            {/* Score de paiement 12 mois */}
            <PaymentScore locataireId={l.id} />

            {/* Boutons documents + photos */}
            <div style={{ display: 'flex', borderTop: '1px solid var(--border-color)' }}>
              <button
                onClick={() => { setExpandedId(isExpanded ? null : l.id); setExpandedPhotosId(null); }}
                style={{
                  flex: 1, padding: '9px 14px',
                  display: 'flex', alignItems: 'center', gap: 7,
                  background: isExpanded ? 'rgba(59,130,246,0.08)' : 'var(--bg-tertiary)',
                  borderRight: '1px solid var(--border-color)',
                  color: isExpanded ? 'var(--accent-blue)' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 150ms'
                }}
              >
                <FolderOpen size={13} />
                Documents
                {nbDocs > 0
                  ? <span style={{ background: 'var(--accent-blue)', color: 'white', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, marginLeft: 2 }}>{nbDocs}</span>
                  : <span style={{ color: 'var(--text-muted)', fontSize: 11, fontStyle: 'italic' }}>aucun</span>
                }
                <span style={{ marginLeft: 'auto', fontSize: 14 }}>{isExpanded ? '▲' : '▼'}</span>
              </button>
              <button
                onClick={() => { setExpandedPhotosId(expandedPhotosId === l.id ? null : l.id); setExpandedId(null); }}
                style={{
                  flex: 1, padding: '9px 14px',
                  display: 'flex', alignItems: 'center', gap: 7,
                  background: expandedPhotosId === l.id ? 'rgba(6,182,212,0.08)' : 'var(--bg-tertiary)',
                  color: expandedPhotosId === l.id ? '#06b6d4' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 150ms'
                }}
              >
                <Image size={13} />
                Photos
                <span style={{ marginLeft: 'auto', fontSize: 14 }}>{expandedPhotosId === l.id ? '▲' : '▼'}</span>
              </button>
            </div>

            {/* Panneau documents dépliable */}
            {isExpanded && (
              <CardDocumentsPanel
                locataireId={l.id}
                onCountChange={(count) => setDocCounts(prev => ({ ...prev, [l.id]: count }))}
              />
            )}

            {/* Panneau photos dépliable */}
            {expandedPhotosId === l.id && (
              <CardPhotosPanel locataireId={l.id} locataireNom={`${l.prenom} ${l.nom}`} />
            )}
          </div>
        );
      })}
    </div>
    {dashboardLoc && (
      <LocataireDashboard locataire={dashboardLoc} onClose={() => setDashboardLoc(null)} />
    )}
    </>
  );
}

function PaymentScore({ locataireId }) {
  const [score, setScore] = useState(null);

  useEffect(() => {
    window.api.loyers.scorePaiement(locataireId).then(rows => setScore(rows || []));
  }, [locataireId]);

  if (!score || score.length === 0) return null;

  const MOIS_COURTS = ['J','F','M','A','M','J','J','A','S','O','N','D'];
  const sorted = [...score].reverse(); // chronologique

  const dotColor = (statut) => {
    if (statut === 'paye') return '#10b981';
    if (statut === 'retard') return '#ef4444';
    if (statut === 'partiel') return '#f59e0b';
    return '#d1d5db';
  };
  const dotTitle = (s, mois, annee) => {
    const label = { paye: 'Payé', retard: 'En retard', partiel: 'Partiel', en_attente: 'En attente' }[s] || s;
    return `${MOIS_COURTS[mois-1]} ${annee} — ${label}`;
  };

  return (
    <div style={{ padding: '6px 18px 10px', borderTop: '1px solid var(--border-color)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Historique paiements (12 mois)
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {sorted.map((m, i) => (
          <div
            key={i}
            title={dotTitle(m.statut, m.mois, m.annee)}
            style={{
              width: 16, height: 16, borderRadius: '50%',
              background: dotColor(m.statut),
              flexShrink: 0, cursor: 'default',
              boxShadow: '0 0 0 2px rgba(0,0,0,0.08)'
            }}
          />
        ))}
        <div style={{ marginLeft: 6, display: 'flex', gap: 10, fontSize: 10, color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />Payé</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />Retard</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />Partiel</span>
        </div>
      </div>
    </div>
  );
}

const EXPIRATION_CATEGORIES = ['assurance', 'visale'];

function CardDocumentsPanel({ locataireId, onCountChange }) {
  const [docs, setDocs] = useState([]);
  const [picking, setPicking] = useState(null);
  const [pdfPreview, setPdfPreview] = useState(null); // { id, nom }
  const [expirationEdit, setExpirationEdit] = useState(null); // doc.id en cours d'édition

  const load = async () => {
    const result = await window.api.documents.getByLocataire(locataireId);
    const list = result || [];
    setDocs(list);
    onCountChange(list.length);
  };

  useEffect(() => { load(); }, [locataireId]);

  const handleAdd = async (categorie) => {
    setPicking(categorie);
    try {
      const picked = await window.api.documents.pick();
      if (picked) {
        await window.api.documents.addFromPath(locataireId, categorie, picked.filePath, picked.originalName);
        await load();
      }
    } catch (err) { console.error(err); }
    setPicking(null);
  };

  const handleDelete = async (id) => {
    await window.api.documents.delete(id);
    await load();
  };

  const handleOpen = async (id) => {
    await window.api.documents.open(id);
  };

  const handleSetExpiration = async (id, date) => {
    await window.api.documents.setExpiration(id, date);
    setExpirationEdit(null);
    await load();
  };

  const isPdf = (nom) => (nom || '').toLowerCase().endsWith('.pdf');

  const getExpirationBadge = (doc) => {
    if (!doc.date_expiration) return null;
    const today = new Date();
    const exp = new Date(doc.date_expiration);
    const diff = Math.floor((exp - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { label: 'Expiré', bg: '#fee2e2', color: '#dc2626' };
    if (diff <= 30) return { label: `Expire dans ${diff}j`, bg: '#fef9c3', color: '#ca8a04' };
    return { label: `Expire ${exp.toLocaleDateString('fr-FR')}`, bg: '#dcfce7', color: '#16a34a' };
  };

  return (
    <div style={{ padding: '12px 16px', background: 'var(--bg-card)' }}>
      {pdfPreview && (
        <PDFViewerModal
          docId={pdfPreview.id}
          nom={pdfPreview.nom}
          onClose={() => setPdfPreview(null)}
        />
      )}

      {DOCUMENT_CATEGORIES.map(({ id, label, Icon, color }) => {
        const catDocs = docs.filter(d => d.categorie === id);
        const hasExpiration = EXPIRATION_CATEGORIES.includes(id);
        return (
          <div key={id} style={{ marginBottom: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
              background: 'var(--bg-tertiary)',
              borderRadius: catDocs.length > 0 ? '8px 8px 0 0' : 8,
              border: '1px solid var(--border-color)',
              borderBottom: catDocs.length > 0 ? 'none' : '1px solid var(--border-color)'
            }}>
              <Icon size={13} style={{ color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{label}</span>
              {catDocs.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, background: color + '22', color, padding: '1px 6px', borderRadius: 8 }}>{catDocs.length}</span>
              )}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleAdd(id)}
                disabled={!!picking}
                style={{ fontSize: 11, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                {picking === id ? <div className="spinner" style={{ width: 10, height: 10 }} /> : <Upload size={11} />}
                Ajouter
              </button>
            </div>

            {catDocs.map((doc, i) => {
              const badge = getExpirationBadge(doc);
              const isLast = i === catDocs.length - 1;
              return (
                <div key={doc.id}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px',
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                    borderTop: 'none', borderRadius: (isLast && expirationEdit !== doc.id) ? '0 0 8px 8px' : 0
                  }}>
                    <File size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.nom_original}>
                      {doc.nom_original}
                    </span>
                    {badge && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color, padding: '1px 7px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                        {badge.label}
                      </span>
                    )}
                    {hasExpiration && (
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setExpirationEdit(expirationEdit === doc.id ? null : doc.id)} title="Date d'expiration">
                        <CalendarClock size={11} style={{ color: badge ? badge.color : 'var(--text-muted)' }} />
                      </button>
                    )}
                    {isPdf(doc.nom_original) && (
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setPdfPreview({ id: doc.id, nom: doc.nom_original })} title="Aperçu PDF">
                        <Eye size={11} />
                      </button>
                    )}
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleOpen(doc.id)} title="Ouvrir">
                      <ExternalLink size={11} />
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(doc.id)} title="Supprimer">
                      <Trash2 size={11} style={{ color: '#ef4444' }} />
                    </button>
                  </div>
                  {expirationEdit === doc.id && (
                    <ExpirationEditor
                      current={doc.date_expiration}
                      isLast={isLast}
                      onSave={(date) => handleSetExpiration(doc.id, date)}
                      onCancel={() => setExpirationEdit(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function ExpirationEditor({ current, isLast, onSave, onCancel }) {
  const [date, setDate] = useState(current || '');
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
      background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.3)',
      borderTop: 'none', borderRadius: isLast ? '0 0 8px 8px' : 0
    }}>
      <CalendarClock size={12} color="#3b82f6" />
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>Date d'expiration :</span>
      <input
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
        className="form-input"
        style={{ fontSize: 11, padding: '3px 8px', flex: 1, maxWidth: 160 }}
      />
      <button className="btn btn-primary btn-sm" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => onSave(date)}>
        <Check size={11} /> OK
      </button>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={onCancel}><XIcon size={11} /></button>
    </div>
  );
}

function PDFViewerModal({ docId, nom, onClose }) {
  const [pdfComponents, setPdfComponents] = useState(null);
  const [pdfData, setPdfData] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        const reactPdf = await import('react-pdf');
        reactPdf.pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', window.location.href).toString();
        setPdfComponents({ Document: reactPdf.Document, Page: reactPdf.Page });
        const result = await window.api.documents.getData(docId);
        if (result.success) {
          const binary = atob(result.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          setPdfData({ data: bytes });
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };
    init();
  }, [docId]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', flexDirection: 'column', alignItems: 'center'
    }}>
      {/* Barre de contrôle */}
      <div style={{
        width: '100%', padding: '10px 20px',
        background: '#1e293b', color: 'white',
        display: 'flex', alignItems: 'center', gap: 12
      }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nom}</span>
        {numPages && (
          <>
            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'white' }} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={16} /></button>
            <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{page} / {numPages}</span>
            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'white' }} onClick={() => setPage(p => Math.min(numPages, p + 1))} disabled={page >= numPages}><ChevronRight size={16} /></button>
            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'white' }} onClick={() => setScale(s => Math.max(0.5, s - 0.2))}><ZoomOut size={16} /></button>
            <span style={{ fontSize: 12 }}>{Math.round(scale * 100)} %</span>
            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'white' }} onClick={() => setScale(s => Math.min(2.5, s + 0.2))}><ZoomIn size={16} /></button>
          </>
        )}
        <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'white' }} onClick={onClose}><XIcon size={18} /></button>
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: 20, width: '100%' }}>
        {loading && <div style={{ color: 'white', marginTop: 60 }}><div className="spinner spinner-lg" /></div>}
        {error && <div style={{ color: '#f87171', marginTop: 60 }}>Erreur : {error}</div>}
        {!loading && !error && pdfComponents && pdfData && (
          <pdfComponents.Document
            file={pdfData}
            onLoadSuccess={({ numPages }) => { setNumPages(numPages); }}
            loading={<div style={{ color: 'white' }}><div className="spinner" /></div>}
          >
            <pdfComponents.Page
              pageNumber={page}
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          </pdfComponents.Document>
        )}
      </div>
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
    complement_adresse: '',
    code_postal: '',
    ville: '',
    loyer_hors_charge: '',
    charges_mensuelles: '',
    surface: '',
    caution: '',
    code_immeuble: '',
    num_identification_impot: '',
    num_identification_impot_parking: '',
    ...(bien ? { ...bien, code_immeuble: bien.code_immeuble_decrypted } : {})
  });
  const [formError, setFormError] = useState('');

  const handleSubmit = async () => {
    if (!form.adresse || !form.ville || !form.loyer_hors_charge || !form.code_immeuble) {
      setFormError('Veuillez remplir les champs obligatoires : adresse, ville, loyer hors charge et code d\'identification.');
      return;
    }
    setFormError('');
    const data = {
      type: form.type,
      adresse: form.adresse,
      complement_adresse: form.complement_adresse || '',
      code_postal: form.code_postal || '',
      ville: form.ville || '',
      loyer_hors_charge: parseFloat(form.loyer_hors_charge) || 0,
      charges_mensuelles: parseFloat(form.charges_mensuelles) || 0,
      surface: parseFloat(form.surface) || 0,
      caution: parseFloat(form.caution) || 0,
      code_immeuble: form.code_immeuble,
      num_identification_impot: form.num_identification_impot || '',
      num_identification_impot_parking: form.num_identification_impot_parking || ''
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
      {formError && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          {formError}
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Type de bien *</label>
        <select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="appartement">Appartement</option>
          <option value="maison">Maison</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Adresse *</label>
        <input className="form-input" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} placeholder="12 rue des Lilas" />
      </div>
      <div className="form-group">
        <label className="form-label">Complément d'adresse</label>
        <input className="form-input" value={form.complement_adresse || ''} onChange={(e) => setForm({ ...form, complement_adresse: e.target.value })} placeholder="Apt 3, Bât B, RDC..." />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Code postal *</label>
          <input className="form-input" value={form.code_postal || ''} onChange={(e) => setForm({ ...form, code_postal: e.target.value })} placeholder="75011" maxLength={10} />
        </div>
        <div className="form-group">
          <label className="form-label">Ville *</label>
          <input className="form-input" value={form.ville || ''} onChange={(e) => setForm({ ...form, ville: e.target.value })} placeholder="Paris" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Loyer hors charge (€) *</label>
          <NumberInput
            step="0.01"
            value={form.loyer_hors_charge}
            onChange={(v) => setForm({ ...form, loyer_hors_charge: v })}
            placeholder="700"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Charge (€)</label>
          <NumberInput
            step="0.01"
            value={form.charges_mensuelles}
            onChange={(v) => setForm({ ...form, charges_mensuelles: v })}
            placeholder="50"
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Loyer total (€)</label>
          <input
            className="form-input"
            readOnly
            value={((parseFloat(form.loyer_hors_charge) || 0) + (parseFloat(form.charges_mensuelles) || 0)).toFixed(2)}
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'default' }}
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
            <Lock size={10} /> N° identification comptable *
          </label>
          <input
            className="form-input"
            value={form.code_immeuble || ''}
            onChange={(e) => setForm({ ...form, code_immeuble: e.target.value })}
            placeholder="Ex: 101, A-203..."
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </div>
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Lock size={10} /> N° identification Impôt (Logement)
          </label>
          <input
            className="form-input"
            value={form.num_identification_impot || ''}
            onChange={(e) => setForm({ ...form, num_identification_impot: e.target.value })}
            placeholder="Ex: 12345678..."
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </div>
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Lock size={10} /> N° identification Impôt (Parking)
          </label>
          <input
            className="form-input"
            value={form.num_identification_impot_parking || ''}
            onChange={(e) => setForm({ ...form, num_identification_impot_parking: e.target.value })}
            placeholder="Ex: 12345678..."
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Lock size={10} /> Les numéros d'identification sont chiffrés (AES-256)
      </div>
    </Modal>
  );
}

const DOCUMENT_CATEGORIES = [
  { id: 'bail',       label: 'Contrat de bail',          Icon: FileText,      color: '#3b82f6' },
  { id: 'etat_lieux', label: "État des lieux d'entrée",  Icon: ClipboardList, color: '#8b5cf6' },
  { id: 'assurance',  label: 'Assurance locataire',       Icon: Shield,        color: '#10b981' },
  { id: 'visale',     label: 'Visale',                    Icon: ShieldCheck,   color: '#f59e0b' },
  { id: 'sinistre',   label: 'Sinistre / Judiciaire',     Icon: AlertTriangle, color: '#ef4444' },
];

function LocataireForm({ locataire, biens, onClose, onSaved }) {
  const [activeTab, setActiveTab] = useState('infos');
  const [form, setForm] = useState({
    nom: '', prenom: '', prenom2: '', nom2: '', parking: false,
    date_entree: '', date_fin_bail: '', bien_id: '', caution_payee: false,
    date_reception_loyer: '', telephone: '', email: '',
    aide_apl: 0,
    ...(locataire || {})
  });
  const [showColocataire, setShowColocataire] = useState(
    !!(locataire?.prenom2 || locataire?.nom2)
  );
  const [allLocataires, setAllLocataires] = useState([]);
  const [pendingDocs, setPendingDocs] = useState([]);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    window.api.locataires.getAll().then(setAllLocataires);
  }, []);

  const biensOccupesIds = new Set(
    allLocataires
      .filter(l => l.bien_id != null && l.id !== (locataire?.id))
      .map(l => l.bien_id)
  );

  const biensDisponibles = biens.filter(b =>
    !biensOccupesIds.has(b.id) || b.id === locataire?.bien_id
  );

  const handleSubmit = async () => {
    if (!form.nom || !form.prenom) {
      setFormError('Le nom et le prénom sont obligatoires.');
      return;
    }
    setFormError('');
    const data = {
      nom: form.nom, prenom: form.prenom,
      prenom2: showColocataire ? (form.prenom2 || '') : '',
      nom2: showColocataire ? (form.nom2 || '') : '',
      parking: form.parking,
      date_entree: form.date_entree, date_fin_bail: form.date_fin_bail || null,
      bien_id: form.bien_id ? parseInt(form.bien_id) : null,
      caution_payee: form.caution_payee,
      date_reception_loyer: form.date_reception_loyer,
      telephone: form.telephone, email: form.email,
      aide_apl: parseFloat(form.aide_apl) || 0
    };

    let locataireId;
    if (locataire) {
      await window.api.locataires.update(locataire.id, data);
      locataireId = locataire.id;
    } else {
      const result = await window.api.locataires.add(data);
      locataireId = result.id;
    }

    for (const doc of pendingDocs) {
      await window.api.documents.addFromPath(locataireId, doc.categorie, doc.filePath, doc.originalName);
    }

    onSaved();
  };

  const totalPending = pendingDocs.length;

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
      {formError && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          {formError}
        </div>
      )}

      {/* Onglets */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20,
        borderBottom: '2px solid var(--border-color)',
        paddingBottom: 0
      }}>
        <button
          onClick={() => setActiveTab('infos')}
          style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: activeTab === 'infos' ? 'var(--accent-blue)' : 'var(--text-muted)',
            borderBottom: activeTab === 'infos' ? '2px solid var(--accent-blue)' : '2px solid transparent',
            marginBottom: -2, display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          <Users size={14} /> Informations
        </button>
        <button
          onClick={() => setActiveTab('documents')}
          style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: activeTab === 'documents' ? 'var(--accent-blue)' : 'var(--text-muted)',
            borderBottom: activeTab === 'documents' ? '2px solid var(--accent-blue)' : '2px solid transparent',
            marginBottom: -2, display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          <FolderOpen size={14} /> Documents
          {totalPending > 0 && (
            <span style={{
              background: '#f59e0b', color: 'white',
              fontSize: 10, fontWeight: 700,
              padding: '1px 6px', borderRadius: 10
            }}>{totalPending}</span>
          )}
        </button>
      </div>

      {/* Onglet Informations */}
      {activeTab === 'infos' && (
        <>
          {/* Locataire principal */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="form-row" style={{ flex: 1, margin: 0 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Prénom *</label>
                <input className="form-input" value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} placeholder="Pierre" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nom *</label>
                <input className="form-input" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Lefèvre" />
              </div>
            </div>
            {!showColocataire && (
              <button
                type="button"
                onClick={() => setShowColocataire(true)}
                title="Ajouter un co-locataire (bail à deux)"
                style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0, marginTop: 18,
                  background: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.3)',
                  color: 'var(--accent-blue)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, fontWeight: 700, lineHeight: 1
                }}
              >+</button>
            )}
          </div>

          {/* Co-locataire */}
          {showColocataire && (
            <div style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Co-locataire (2ème personne)
                </div>
                <button
                  type="button"
                  onClick={() => { setShowColocataire(false); setForm(f => ({ ...f, prenom2: '', nom2: '' })); }}
                  title="Retirer le co-locataire"
                  style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 16, fontWeight: 700, lineHeight: 1
                  }}
                >−</button>
              </div>
              <div className="form-row" style={{ margin: 0 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Prénom</label>
                  <input className="form-input" value={form.prenom2 || ''} onChange={(e) => setForm({ ...form, prenom2: e.target.value })} placeholder="Marie" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Nom</label>
                  <input className="form-input" value={form.nom2 || ''} onChange={(e) => setForm({ ...form, nom2: e.target.value })} placeholder="Lefèvre" />
                </div>
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">
              Bien assigné
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 8, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
                ({biensDisponibles.length} disponible{biensDisponibles.length > 1 ? 's' : ''} sur {biens.length})
              </span>
            </label>
            <select className="form-select" value={form.bien_id || ''} onChange={(e) => setForm({ ...form, bien_id: e.target.value })}>
              <option value="">— Aucun —</option>
              {biensDisponibles.map(b => (
                <option key={b.id} value={b.id}>{b.adresse_complete || b.adresse} ({b.type})</option>
              ))}
            </select>
            {biensDisponibles.length === 0 && biens.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--accent-orange)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <XIcon size={12} /> Tous vos biens sont déjà attribués.
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date d'entrée</label>
              <input type="date" className="form-input" value={form.date_entree || ''} onChange={(e) => setForm({ ...form, date_entree: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Fin de bail</label>
              <input type="date" className="form-input" value={form.date_fin_bail || ''} onChange={(e) => setForm({ ...form, date_fin_bail: e.target.value })} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Réception loyer — jour du mois</label>
              <select
                className="form-select"
                value={form.date_reception_loyer || ''}
                onChange={(e) => setForm({ ...form, date_reception_loyer: e.target.value })}
              >
                <option value="">— Non défini —</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                  <option key={day} value={String(day)}>
                    Le {day} de chaque mois
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" />
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
            <NumberInput step="0.01" value={form.aide_apl || 0} onChange={(v) => setForm({ ...form, aide_apl: v })} />
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
        </>
      )}

      {/* Onglet Documents */}
      {activeTab === 'documents' && (
        <DocumentsSection
          locataireId={locataire?.id || null}
          pendingDocs={pendingDocs}
          setPendingDocs={setPendingDocs}
        />
      )}
    </Modal>
  );
}
function DocumentsSection({ locataireId, pendingDocs, setPendingDocs }) {
  const [savedDocs, setSavedDocs] = useState([]);
  const [picking, setPicking] = useState(null);

  const loadSavedDocs = async () => {
    if (!locataireId) return;
    const result = await window.api.documents.getByLocataire(locataireId);
    setSavedDocs(result || []);
  };

  useEffect(() => { loadSavedDocs(); }, [locataireId]);

  const handleAdd = async (categorie) => {
    setPicking(categorie);
    try {
      const picked = await window.api.documents.pick();
      if (!picked) { setPicking(null); return; }

      if (locataireId) {
        // Mode édition : sauvegarde immédiate
        await window.api.documents.addFromPath(locataireId, categorie, picked.filePath, picked.originalName);
        await loadSavedDocs();
      } else {
        // Mode création : mise en attente
        setPendingDocs(prev => [...prev, {
          tempId: Date.now() + Math.random(),
          categorie,
          filePath: picked.filePath,
          originalName: picked.originalName
        }]);
      }
    } catch (err) {
      console.error('Erreur ajout document:', err);
    }
    setPicking(null);
  };

  const handleDeleteSaved = async (id) => {
    await window.api.documents.delete(id);
    await loadSavedDocs();
  };

  const handleDeletePending = (tempId) => {
    setPendingDocs(prev => prev.filter(d => d.tempId !== tempId));
  };

  const handleOpen = async (id) => {
    await window.api.documents.open(id);
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.07em', color: 'var(--text-muted)',
        marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8
      }}>
        <FolderOpen size={13} />
        Documents & Pièces jointes
        {!locataireId && (
          <span style={{
            fontSize: 10, fontWeight: 600, fontStyle: 'italic',
            textTransform: 'none', letterSpacing: 0,
            color: 'var(--accent-orange)'
          }}>
            — sauvegardés à la création
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {DOCUMENT_CATEGORIES.map(({ id, label, Icon, color }) => {
          const saved = savedDocs.filter(d => d.categorie === id);
          const pending = (pendingDocs || []).filter(d => d.categorie === id);
          const total = saved.length + pending.length;
          const isPickingThis = picking === id;

          return (
            <div key={id} style={{ border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden' }}>
              {/* En-tête */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', background: 'var(--bg-tertiary)',
                borderBottom: total > 0 ? '1px solid var(--border-color)' : 'none'
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: color + '20', color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <Icon size={15} />
                </div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{label}</div>
                {total > 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    background: color + '20', color,
                    padding: '2px 8px', borderRadius: 10
                  }}>
                    {total}
                  </span>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleAdd(id)}
                  disabled={!!picking}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                >
                  {isPickingThis
                    ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Chargement…</>
                    : <><Upload size={13} /> Ajouter</>}
                </button>
              </div>

              {/* Fichiers sauvegardés */}
              {saved.map(doc => (
                <div key={doc.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px', background: 'var(--bg-card)',
                  borderBottom: '1px solid var(--border-color)'
                }}>
                  <File size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <span style={{
                    flex: 1, fontSize: 12, fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }} title={doc.nom_original}>{doc.nom_original}</span>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleOpen(doc.id)} title="Ouvrir">
                    <ExternalLink size={12} />
                  </button>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDeleteSaved(doc.id)} title="Supprimer">
                    <Trash2 size={12} style={{ color: '#ef4444' }} />
                  </button>
                </div>
              ))}

              {/* Fichiers en attente (mode création) */}
              {pending.map(doc => (
                <div key={doc.tempId} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px',
                  background: 'rgba(245,158,11,0.05)',
                  borderBottom: '1px solid var(--border-color)'
                }}>
                  <File size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
                  <span style={{
                    flex: 1, fontSize: 12, fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: 'var(--text-secondary)'
                  }} title={doc.originalName}>{doc.originalName}</span>
                  <span style={{ fontSize: 10, color: '#f59e0b', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                    en attente
                  </span>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDeletePending(doc.tempId)} title="Retirer">
                    <XIcon size={12} style={{ color: '#ef4444' }} />
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
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

// ─── Panneau photos dans la carte locataire ───────────────────────────────────
function CardPhotosPanel({ locataireId, locataireNom }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);

  const loadPhotos = async () => {
    setLoading(true);
    const list = await window.api.photos.getByLocataire(locataireId);
    const withUrls = await Promise.all(list.map(async p => ({
      ...p,
      dataUrl: await window.api.photos.getDataUrl(p.id)
    })));
    setPhotos(withUrls);
    setLoading(false);
  };

  useEffect(() => { loadPhotos(); }, [locataireId]);

  const handleAdd = async () => {
    setUploading(true);
    const files = await window.api.photos.pick();
    if (files && files.length) {
      for (const f of files) {
        await window.api.photos.add(locataireId, f.filePath, f.originalName);
      }
      await loadPhotos();
    }
    setUploading(false);
  };

  const handleDelete = async (photo) => {
    await window.api.photos.delete(photo.id);
    if (preview?.id === photo.id) setPreview(null);
    await loadPhotos();
  };

  return (
    <div style={{ padding: '12px 16px', background: 'var(--bg-card)', borderTop: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
          {loading ? '...' : `${photos.length} photo${photos.length !== 1 ? 's' : ''}`}
        </span>
        <button className="btn btn-sm" onClick={handleAdd} disabled={uploading}
          style={{ background: 'rgba(6,182,212,0.12)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.25)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(6,182,212,0.22)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(6,182,212,0.12)'}
        >
          {uploading ? <div className="spinner" style={{ width: 10, height: 10 }} /> : <Plus size={12} />}
          Ajouter
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : photos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 12 }}>
          <Image size={22} style={{ margin: '0 auto 6px', display: 'block', opacity: 0.4 }} />
          Aucune photo — état des lieux, travaux...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          {photos.map(p => (
            <div key={p.id} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-tertiary)', aspectRatio: '4/3', cursor: 'pointer' }}
              onClick={() => setPreview(p)}>
              {p.dataUrl
                ? <img src={p.dataUrl} alt={p.nom_original} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Image size={24} style={{ color: 'var(--text-muted)' }} /></div>
              }
              <button
                onClick={e => { e.stopPropagation(); handleDelete(p); }}
                style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(239,68,68,0.85)', border: 'none', borderRadius: 4, width: 20, height: 20, cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Trash2 size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Preview plein écran */}
      {preview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setPreview(null)}>
          <button style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: '8px 14px', color: 'white', cursor: 'pointer', fontSize: 14 }}
            onClick={() => setPreview(null)}>✕ Fermer</button>
          <button style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(239,68,68,0.7)', border: 'none', borderRadius: 8, padding: '8px 14px', color: 'white', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={e => { e.stopPropagation(); handleDelete(preview); }}>
            <Trash2 size={13} /> Supprimer
          </button>
          <img src={preview.dataUrl} alt={preview.nom_original}
            style={{ maxWidth: '90vw', maxHeight: '88vh', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}
            onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

// ─── Modal Historique locataires ──────────────────────────────────────────────
function HistoriqueModal({ bienId, bienAdresse, onClose }) {
  const [historique, setHistorique] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ nom: '', prenom: '', date_entree: '', date_sortie: '', email: '', telephone: '' });
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);
  const { confirm } = useConfirm();

  const loadHistorique = () => {
    setLoading(true);
    window.api.locataires.getHistorique(bienId).then(data => {
      setHistorique(data);
      setLoading(false);
    });
  };

  useEffect(() => { loadHistorique(); }, [bienId]);

  const handleAddHistorique = async () => {
    if (!addForm.nom.trim() || !addForm.prenom.trim()) {
      setAddError('Nom et prénom obligatoires.');
      return;
    }
    setSaving(true);
    await window.api.locataires.addHistorique(bienId, addForm);
    setSaving(false);
    setAddForm({ nom: '', prenom: '', date_entree: '', date_sortie: '', email: '', telephone: '' });
    setAddError('');
    setShowAddForm(false);
    loadHistorique();
  };

  const handleDefinitiveDelete = async (loc) => {
    const ok = await confirm({
      type: 'danger',
      title: 'Supprimer définitivement',
      message: `Supprimer définitivement "${loc.prenom} ${loc.nom}" et tous ses loyers ?\n\nCette action est irréversible.`,
      confirmText: 'Supprimer définitivement',
      cancelText: 'Annuler'
    });
    if (!ok) return;
    await window.api.locataires.definitiveDelete(loc.id);
    setHistorique(h => h.filter(l => l.id !== loc.id));
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
  const formatMoney = (v) => Number(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0 });

  return (
    <Modal isOpen={true} onClose={onClose} title={`Historique — ${bienAdresse}`} size="lg">

      {/* Bouton + formulaire ajout ancien locataire */}
      <div style={{ marginBottom: 20 }}>
        {!showAddForm ? (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddForm(true)}>
            <Plus size={14} /> Ajouter un ancien locataire
          </button>
        ) : (
          <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: 16, border: '1px solid var(--border-color)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: 'var(--text-primary)' }}>
              Nouvel ancien locataire
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Prénom *</label>
                <input className="form-input" value={addForm.prenom} onChange={e => setAddForm(f => ({ ...f, prenom: e.target.value }))} placeholder="Jean" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Nom *</label>
                <input className="form-input" value={addForm.nom} onChange={e => setAddForm(f => ({ ...f, nom: e.target.value }))} placeholder="DUPONT" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Date d'entrée</label>
                <input className="form-input" type="date" value={addForm.date_entree} onChange={e => setAddForm(f => ({ ...f, date_entree: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Date de sortie</label>
                <input className="form-input" type="date" value={addForm.date_sortie} onChange={e => setAddForm(f => ({ ...f, date_sortie: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="jean@email.com" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Téléphone</label>
                <input className="form-input" value={addForm.telephone} onChange={e => setAddForm(f => ({ ...f, telephone: e.target.value }))} placeholder="06 00 00 00 00" />
              </div>
            </div>
            {addError && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>{addError}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={handleAddHistorique} disabled={saving}>
                {saving ? <div className="spinner" style={{ width: 12, height: 12 }} /> : <Check size={14} />}
                Enregistrer
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddForm(false); setAddError(''); }}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div className="spinner spinner-lg" style={{ margin: '0 auto' }} />
        </div>
      ) : historique.length === 0 ? (
        <div className="empty-state" style={{ padding: '40px 0' }}>
          <div className="empty-state-icon"><History size={28} /></div>
          <div className="empty-state-title">Aucun ancien locataire</div>
          <div className="empty-state-text">Les locataires archivés apparaîtront ici</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {historique.map(loc => (
            <div key={loc.id} style={{
              background: 'var(--bg-tertiary)',
              borderRadius: 12, padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 14
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                background: 'var(--gradient-purple)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 700, fontSize: 15
              }}>
                {(loc.prenom?.[0] || '') + (loc.nom?.[0] || '')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{loc.prenom} {loc.nom}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {loc.email && <span style={{ marginRight: 10 }}>✉ {loc.email}</span>}
                  {loc.telephone && <span>📞 {loc.telephone}</span>}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 20px', flexShrink: 0, textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Entrée</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{formatDate(loc.date_entree)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Sortie</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{formatDate(loc.date_sortie)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Loyers encaissés</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>{formatMoney(loc.total_loyers_encaisses)} €</div>
                </div>
              </div>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                title="Supprimer définitivement"
                onClick={() => handleDefinitiveDelete(loc)}
                style={{ flexShrink: 0 }}
              >
                <Trash size={13} style={{ color: '#ef4444' }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}