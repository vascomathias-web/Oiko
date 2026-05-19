import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Building2, User, Home, X, ArrowRight, CircleDollarSign } from 'lucide-react';

const MOIS_LABELS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function GlobalSearch({ isOpen, onClose, onNavigate }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  // Focus automatique à l'ouverture
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Recherche dès que la query change
  const doSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const [biens, locataires, loyers] = await Promise.all([
        window.api.biens.getAll(),
        window.api.locataires ? window.api.locataires.getAll() : Promise.resolve([]),
        window.api.loyers.getAll()
      ]);

      const lower = q.toLowerCase();
      const found = [];

      // ── Biens ──
      (biens || []).forEach(b => {
        const adresse = [b.adresse, b.code_postal, b.ville].filter(Boolean).join(' ').toLowerCase();
        if (adresse.includes(lower)) {
          found.push({
            type: 'bien',
            id: b.id,
            label: b.adresse,
            sub: [b.code_postal, b.ville].filter(Boolean).join(' '),
            page: 'biens',
            icon: 'building'
          });
        }
      });

      // ── Locataires ──
      (locataires || []).forEach(l => {
        const fullName = `${l.prenom || ''} ${l.nom || ''}`.toLowerCase();
        const fullName2 = `${l.nom || ''} ${l.prenom || ''}`.toLowerCase();
        if (fullName.includes(lower) || fullName2.includes(lower)) {
          const bien = (biens || []).find(b => b.id === l.bien_id);
          found.push({
            type: 'locataire',
            id: l.id,
            label: `${l.prenom} ${l.nom}`,
            sub: bien ? bien.adresse : 'Sans bien assigné',
            page: 'biens',
            icon: 'user'
          });
        }
      });

      // ── Loyers (par locataire name) ──
      const loyersSeen = new Set();
      (loyers || []).forEach(l => {
        const nomComplet = `${l.prenom || ''} ${l.nom || ''}`.toLowerCase();
        const bien = (l.bien_adresse || '').toLowerCase();
        if ((nomComplet.includes(lower) || bien.includes(lower)) && l.statut !== 'paye') {
          const key = `${l.locataire_id}_${l.mois}_${l.annee}`;
          if (!loyersSeen.has(key)) {
            loyersSeen.add(key);
            found.push({
              type: 'loyer',
              id: l.id,
              label: `Loyer ${MOIS_LABELS[l.mois]} ${l.annee} — ${l.prenom} ${l.nom}`,
              sub: `${l.bien_adresse || ''} • ${l.montant} € • ${l.statut}`,
              page: 'loyer',
              icon: 'loyer',
              statut: l.statut
            });
          }
        }
      });

      setResults(found.slice(0, 12));
      setSelected(0);
    } catch (e) {
      console.error('GlobalSearch error:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 200);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  // Navigation clavier
  const handleKey = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(s => Math.min(s + 1, results.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(s => Math.max(s - 1, 0));
    }
    if (e.key === 'Enter' && results[selected]) {
      handleSelect(results[selected]);
    }
  };

  const handleSelect = (item) => {
    onNavigate(item.page);
    onClose();
  };

  // Scroll automatique sur l'élément sélectionné
  useEffect(() => {
    const el = listRef.current?.children[selected];
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!isOpen) return null;

  const STATUT_COLORS = {
    paye: '#10b981', en_attente: '#f59e0b', retard: '#ef4444', partiel: '#3b82f6'
  };
  const STATUT_LABELS = {
    paye: 'Payé', en_attente: 'En attente', retard: 'Retard', partiel: 'Partiel'
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 16,
          width: '100%', maxWidth: 600,
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Barre de recherche */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border-color)' }}>
          <Search size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Rechercher un bien, un locataire, un loyer…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: 15, color: 'var(--text-primary)',
              fontFamily: 'inherit'
            }}
          />
          {loading && <div className="spinner" style={{ width: 16, height: 16, flexShrink: 0 }} />}
          {query && !loading && (
            <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, lineHeight: 1 }}>
              <X size={15} />
            </button>
          )}
          <kbd style={{ fontSize: 11, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '2px 7px', color: 'var(--text-muted)', flexShrink: 0 }}>Esc</kbd>
        </div>

        {/* Résultats */}
        {results.length > 0 && (
          <div ref={listRef} style={{ maxHeight: 400, overflowY: 'auto' }}>
            {/* Groupes */}
            {['bien', 'locataire', 'loyer'].map(type => {
              const group = results.filter(r => r.type === type);
              if (group.length === 0) return null;
              const groupLabel = { bien: '🏠 Biens', locataire: '👤 Locataires', loyer: '💶 Loyers en attente' }[type];
              return (
                <div key={type}>
                  <div style={{ padding: '8px 18px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {groupLabel}
                  </div>
                  {group.map(item => {
                    const globalIdx = results.indexOf(item);
                    const isSelected = globalIdx === selected;
                    return (
                      <div
                        key={`${item.type}-${item.id}`}
                        onClick={() => handleSelect(item)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '10px 18px', cursor: 'pointer',
                          background: isSelected ? 'rgba(59,130,246,0.1)' : 'transparent',
                          borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent',
                          transition: 'all 0.1s'
                        }}
                        onMouseEnter={() => setSelected(globalIdx)}
                      >
                        {/* Icône */}
                        <div style={{
                          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: item.type === 'bien' ? 'rgba(59,130,246,0.12)' : item.type === 'locataire' ? 'rgba(139,92,246,0.12)' : 'rgba(16,185,129,0.12)'
                        }}>
                          {item.type === 'bien'      && <Building2 size={16} style={{ color: '#3b82f6' }} />}
                          {item.type === 'locataire' && <User       size={16} style={{ color: '#8b5cf6' }} />}
                          {item.type === 'loyer'     && <CircleDollarSign size={16} style={{ color: '#10b981' }} />}
                        </div>

                        {/* Texte */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.sub}
                          </div>
                        </div>

                        {/* Badge statut (loyers) */}
                        {item.type === 'loyer' && item.statut && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: `${STATUT_COLORS[item.statut]}20`,
                            color: STATUT_COLORS[item.statut],
                            border: `1px solid ${STATUT_COLORS[item.statut]}40`,
                            flexShrink: 0
                          }}>
                            {STATUT_LABELS[item.statut]}
                          </span>
                        )}

                        {/* Flèche */}
                        <ArrowRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, opacity: isSelected ? 1 : 0.3 }} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* État vide */}
        {query.length >= 2 && !loading && results.length === 0 && (
          <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Aucun résultat pour « <strong>{query}</strong> »
          </div>
        )}

        {/* Aide clavier */}
        <div style={{ padding: '8px 18px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)' }}>
          <span><kbd style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '1px 5px' }}>↑↓</kbd> Naviguer</span>
          <span><kbd style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '1px 5px' }}>↵</kbd> Ouvrir</span>
          <span><kbd style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '1px 5px' }}>Esc</kbd> Fermer</span>
          <span style={{ marginLeft: 'auto' }}>Ctrl+K pour ouvrir</span>
        </div>
      </div>
    </div>
  );
}
