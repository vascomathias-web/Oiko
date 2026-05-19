import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../components/ConfirmDialog';
import LettresTypes from './LettresTypes';
import EtatDesLieux from './EtatDesLieux';
import {
  Upload, FileSpreadsheet, Plus, Edit, Trash2, Mail,
  Download, Sparkles, FileText, Image as ImageIcon, Save,
  Calendar, ExternalLink, RefreshCw, AlertCircle, X, CheckCircle2,
  Link2, Table2, Zap
} from 'lucide-react';

const MOIS = [
  { v: 1, l: 'Janvier' }, { v: 2, l: 'Février' }, { v: 3, l: 'Mars' },
  { v: 4, l: 'Avril' }, { v: 5, l: 'Mai' }, { v: 6, l: 'Juin' },
  { v: 7, l: 'Juillet' }, { v: 8, l: 'Août' }, { v: 9, l: 'Septembre' },
  { v: 10, l: 'Octobre' }, { v: 11, l: 'Novembre' }, { v: 12, l: 'Décembre' }
];

const YEARS = [2024, 2025, 2026, 2027];

const DOC_TABS = [
  { id: 'releves', label: 'Relevés & Excel' },
  { id: 'lettres', label: 'Lettres types' },
  { id: 'edl',     label: 'État des lieux' }
];

export default function Facture() {
  const { addNotification } = useApp();
  const [docTab, setDocTab] = useState('releves');
  const [files, setFiles] = useState([]);
  const [importedFiles, setImportedFiles] = useState([]);
  const [filterMois, setFilterMois] = useState('');
  const [filterAnnee, setFilterAnnee] = useState(new Date().getFullYear());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editingFile, setEditingFile] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewTransactions, setPreviewTransactions] = useState([]);
  const [newFileData, setNewFileData] = useState({
    mois: new Date().getMonth() + 1,
    annee: new Date().getFullYear(),
    type: 'mensuel'
  });
  const { confirm } = useConfirm();

  const load = useCallback(async () => {
    const filters = {};
    if (filterMois) filters.mois = parseInt(filterMois);
    if (filterAnnee) filters.annee = parseInt(filterAnnee);
    const data = await window.api.excel.getAll(filters);
    setFiles(data);
  }, [filterMois, filterAnnee]);

  useEffect(() => { load(); }, [load]);

  const handleImport = async () => {
    const imported = await window.api.files.import();
    if (imported.length > 0) {
      setImportedFiles(prev => {
        // Évite les doublons par nom
        const existing = new Set(prev.map(f => f.path));
        const news = imported.filter(f => !existing.has(f.path));
        return [...prev, ...news];
      });
    }
  };

  const removeImportedFile = (path) => {
    setImportedFiles(prev => prev.filter(f => f.path !== path));
  };

  const handleAnalyze = async () => {
    if (importedFiles.length === 0) return;
    setIsAnalyzing(true);
    const result = await window.api.ia.analyzeFiles(importedFiles);
    setIsAnalyzing(false);

    if (result.success) {
      if (result.transactions.length === 0) {
        addNotification({ type: 'warning', titre: 'Aucune transaction détectée', message: "L'IA n'a pas trouvé de transactions dans ces fichiers." });
        return;
      }
      setPreviewTransactions(result.transactions);
      setShowPreview(true);
    } else {
      addNotification({ type: 'danger', titre: 'Erreur analyse IA', message: result.error });
    }
  };

  const handlePreviewSave = async ({ transactions, targetFileId, mois, annee, confirmedLoyerIds = [] }) => {
    if (targetFileId) {
      // Injecter dans un fichier existant
      const existing = await window.api.excel.getData(targetFileId);
      const merged = [...(existing?.donnees || []), ...transactions];
      // Recalcul solde
      let solde = 0;
      merged.forEach(r => {
        solde += (parseFloat(r.credit) || 0) - (parseFloat(r.debit) || 0);
        r.solde = Math.round(solde * 100) / 100;
      });
      await window.api.excel.update(targetFileId, merged);
      addNotification({ type: 'success', titre: 'Transactions ajoutées', message: `${transactions.length} ligne(s) ajoutée(s) au fichier existant` });
    } else {
      // Créer un nouveau fichier
      const moisLabel = MOIS.find(m => m.v === mois)?.l || mois;
      await window.api.excel.create({
        nom: `Facture_IA_${moisLabel}_${annee}`,
        mois,
        annee,
        type: 'mensuel',
        donnees: transactions
      });
      addNotification({ type: 'success', titre: 'Fichier Excel créé', message: `${transactions.length} transactions enregistrées` });
    }
    // Marquer les loyers confirmés comme payés
    if (confirmedLoyerIds.length > 0) {
      for (const loyerId of confirmedLoyerIds) {
        await window.api.loyers.updateStatut(loyerId, 'paye');
      }
      addNotification({ type: 'success', titre: 'Loyers synchronisés', message: `${confirmedLoyerIds.length} loyer(s) marqué(s) comme payé(s) ✓` });
    }
    setImportedFiles([]);
    setShowPreview(false);
    setPreviewTransactions([]);
    await load();
  };

  const handleCreateEmpty = async () => {
    const isAnnuel = newFileData.type === 'annuel';
    const result = await window.api.excel.create({
      nom: isAnnuel
        ? `Recap_Annuel_${newFileData.annee}`
        : `Facture_${MOIS.find(m => m.v === newFileData.mois)?.l}_${newFileData.annee}`,
      mois: isAnnuel ? null : newFileData.mois,
      annee: newFileData.annee,
      type: newFileData.type,
      donnees: []
    });

    if (isAnnuel && result?.rowCount > 0) {
      addNotification({ type: 'success', titre: 'Récap annuel créé', message: `${result.rowCount} transactions agrégées` });
    }
    setShowCreateModal(false);
    await load();
  };

  const handleDelete = async (id) => {
    const file = files.find(f => f.id === id);
    const ok = await confirm({
      type: 'danger',
      title: 'Supprimer ce fichier Excel',
      message: `Le fichier "${file?.nom || 'sélectionné'}" sera définitivement supprimé.`,
      confirmText: 'Supprimer',
      cancelText: 'Annuler'
    });
    if (!ok) return;
    await window.api.excel.delete(id);
    await load();
  };

  const handleExport = async (id) => {
    const path = await window.api.excel.export(id);
    if (path) addNotification({ type: 'success', titre: 'Export réussi', message: `Fichier enregistré : ${path}` });
  };

  const handleImportCSV = async () => {
    const file = await window.api.csv.import();
    if (!file || !file.content) return;
    const transactions = parseCSVBancaire(file.content, file.name);
    if (transactions.length === 0) {
      addNotification({ type: 'warning', titre: 'CSV non reconnu', message: 'Aucune transaction détectée. Vérifiez le format (CSV bancaire français attendu).' });
      return;
    }
    setPreviewTransactions(transactions);
    setShowPreview(true);
  };

  // ── Mode express : import CSV → rapprochement → MAJ loyers sans modal ──
  const [autoProcessing, setAutoProcessing] = useState(false);

  const handleAutoProcess = async () => {
    const file = await window.api.csv.import();
    if (!file || !file.content) return;

    const transactions = parseCSVBancaire(file.content, file.name);
    if (transactions.length === 0) {
      addNotification({ type: 'warning', titre: 'CSV non reconnu', message: 'Aucune transaction détectée. Vérifiez le format (CSV bancaire français attendu).' });
      return;
    }

    setAutoProcessing(true);

    // 1. Rapprochement automatique
    const rapprochement = await window.api.ia.rapprochementLoyers(transactions);
    const matches = rapprochement?.matches || [];
    const hauteConfiance = matches.filter(m => m.confidence === 'haute');
    const autresMatches  = matches.filter(m => m.confidence !== 'haute');

    // 2. Sauvegarde automatique dans un fichier Excel
    const now = new Date();
    const mois = now.getMonth() + 1;
    const annee = now.getFullYear();
    const moisLabel = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][mois - 1];

    let solde = 0;
    const rows = transactions.map(r => {
      solde += (parseFloat(r.credit) || 0) - (parseFloat(r.debit) || 0);
      return { ...r, solde: Math.round(solde * 100) / 100 };
    });

    await window.api.excel.create({
      nom: `Relevé_Auto_${moisLabel}_${annee}`,
      mois, annee, type: 'mensuel', donnees: rows
    });

    // 3. Mise à jour automatique des loyers haute confiance
    let loyersMaj = 0;
    for (const m of hauteConfiance) {
      await window.api.loyers.updateStatut(m.loyer.id, 'paye');
      loyersMaj++;
    }

    setAutoProcessing(false);
    await load();

    // 4. Notification récapitulative
    if (loyersMaj > 0) {
      addNotification({
        type: 'success',
        titre: '✅ Traitement automatique terminé',
        message: `${transactions.length} transactions enregistrées • ${loyersMaj} loyer(s) marqué(s) Payé automatiquement`
      });
    } else {
      addNotification({
        type: 'info',
        titre: 'Relevé enregistré',
        message: `${transactions.length} transactions importées. Aucune correspondance loyer certaine détectée.`
      });
    }

    // 5. Si des matches moyens/faibles → ouvrir la modal pour validation manuelle
    if (autresMatches.length > 0) {
      setPreviewTransactions(transactions);
      setShowPreview(true);
      addNotification({
        type: 'warning',
        titre: `${autresMatches.length} correspondance(s) à vérifier`,
        message: 'Des loyers ont été détectés avec une confiance moyenne ou faible — vérifiez dans l\'aperçu.'
      });
    }
  };

  const tabSubtitle = {
    releves: 'Import, analyse IA et gestion des fichiers Excel',
    lettres: 'Modèles de courriers officiels prêts à l\'emploi',
    edl: 'Entrées et sorties — état des lieux'
  }[docTab];

  return (
    <>
      <PageHeader
        title="Documents & Relevés"
        subtitle={tabSubtitle}
        onRefresh={docTab === 'releves' ? load : undefined}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
              {DOC_TABS.map(t => (
                <button
                  key={t.id}
                  className={docTab === t.id ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                  onClick={() => setDocTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {docTab === 'releves' && (
              <>
                <button
                  className="btn btn-success"
                  onClick={handleAutoProcess}
                  disabled={autoProcessing}
                  title="Importe le CSV, met à jour les loyers payés et enregistre le relevé — en un clic"
                >
                  {autoProcessing
                    ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Traitement…</>
                    : <><Zap size={15} /> Import auto</>}
                </button>
                <button className="btn btn-ghost" onClick={() => setShowSendModal(true)} disabled={files.length === 0}>
                  <Mail size={16} /> Envoyer au comptable
                </button>
                <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                  <Plus size={16} /> Créer Excel
                </button>
              </>
            )}
          </div>
        }
      />

      {docTab === 'lettres' && <LettresTypes showHeader={false} />}
      {docTab === 'edl' && <EtatDesLieux showHeader={false} />}
      {docTab === 'releves' && <div className="page-container">
        {/* Zone d'import IA */}
        <div className="card mb-6">
          <div className="card-header">
            <div className="card-title">
              <div className="card-title-icon"><Sparkles size={18} /></div>
              Importer un relevé bancaire
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* Légende des modes */}
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Zap size={11} style={{ color: '#10b981' }} />
                  <strong style={{ color: 'var(--text-secondary)' }}>Import auto</strong> = CSV → loyers mis à jour en 1 clic
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Table2 size={11} style={{ color: '#10b981' }} />
                  <strong style={{ color: 'var(--text-secondary)' }}>CSV manuel</strong> = vérification avant validation
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Sparkles size={11} style={{ color: '#8b5cf6' }} />
                  <strong style={{ color: 'var(--text-secondary)' }}>PDF/Image</strong> = analyse IA + vérification
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {/* ① Import auto : CSV → loyers en 1 clic */}
            <div
              className="drop-zone"
              style={{ flex: 1, minWidth: 200, borderColor: 'rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.05)', cursor: autoProcessing ? 'wait' : 'pointer', position: 'relative', overflow: 'hidden' }}
              onClick={!autoProcessing ? handleAutoProcess : undefined}
            >
              {autoProcessing && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(16,185,129,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                  <div className="spinner" style={{ width: 28, height: 28, borderColor: '#10b981', borderTopColor: 'transparent' }} />
                </div>
              )}
              <div className="drop-zone-icon" style={{ color: '#10b981' }}><Zap size={28} /></div>
              <div className="drop-zone-title" style={{ color: '#10b981', fontWeight: 800 }}>Import auto</div>
              <div className="drop-zone-subtitle">CSV bancaire → loyers mis à jour automatiquement</div>
              <div style={{ marginTop: 8, fontSize: 10, fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.12)', padding: '3px 10px', borderRadius: 20, display: 'inline-block' }}>
                RECOMMANDÉ
              </div>
            </div>

            {/* Séparateur */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
              <div style={{ width: 1, flex: 1, background: 'var(--border-color)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, padding: '8px 0' }}>OU</span>
              <div style={{ width: 1, flex: 1, background: 'var(--border-color)' }} />
            </div>

            {/* ② Import CSV avec aperçu */}
            <div
              className="drop-zone"
              style={{ flex: 1, minWidth: 180, borderColor: 'rgba(59,130,246,0.25)', background: 'rgba(59,130,246,0.02)', cursor: 'pointer' }}
              onClick={handleImportCSV}
            >
              <div className="drop-zone-icon" style={{ color: '#3b82f6' }}><Table2 size={28} /></div>
              <div className="drop-zone-title" style={{ color: '#3b82f6' }}>CSV + vérification</div>
              <div className="drop-zone-subtitle">BNP, CA, SG, LBP, CIC, LCL…</div>
            </div>

            {/* Séparateur */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
              <div style={{ width: 1, flex: 1, background: 'var(--border-color)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, padding: '8px 0' }}>OU</span>
              <div style={{ width: 1, flex: 1, background: 'var(--border-color)' }} />
            </div>

            {/* ③ Import image/PDF → IA */}
            <div className="drop-zone" style={{ flex: 2, minWidth: 220 }} onClick={handleImport}>
              <div className="drop-zone-icon"><Upload size={28} /></div>
              <div className="drop-zone-title">PDF ou Image</div>
              <div className="drop-zone-subtitle">Analyse IA Gemini — PDF, PNG, JPG</div>
            </div>
          </div>

          {importedFiles.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                {importedFiles.length} fichier(s) en attente d'analyse :
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {importedFiles.map((f, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 12px', background: 'var(--bg-tertiary)',
                    borderRadius: 8, fontSize: 12, border: '1px solid var(--border)'
                  }}>
                    {f.type === 'pdf' ? <FileText size={13} style={{ color: '#3b82f6' }} /> : <ImageIcon size={13} style={{ color: '#8b5cf6' }} />}
                    <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <button
                      onClick={() => removeImportedFile(f.path)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0, lineHeight: 1 }}
                      title="Retirer ce fichier"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button className="btn btn-primary" onClick={handleAnalyze} disabled={isAnalyzing}>
                  {isAnalyzing
                    ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Analyse en cours…</>
                    : <><Sparkles size={15} /> Analyser avec l'IA Gemini</>}
                </button>
                {isAnalyzing && (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Extraction des transactions… cela peut prendre quelques secondes.
                  </span>
                )}
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setImportedFiles([])}>
                  Tout retirer
                </button>
              </div>

              {/* Explication du fonctionnement */}
              <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text-primary)' }}>Comment ça fonctionne :</strong> L'IA lit chaque document, extrait les transactions (date, libellé, débit/crédit) et vous propose un <strong>aperçu à valider</strong> avant d'enregistrer. Vous pourrez corriger les lignes et choisir d'injecter dans un fichier existant ou d'en créer un nouveau.
              </div>
            </div>
          )}
        </div>

        {/* Filtres */}
        <div className="card mb-6" style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <Calendar size={18} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Filtrer :</span>
            <select className="form-select" style={{ maxWidth: 180 }} value={filterMois} onChange={e => setFilterMois(e.target.value)}>
              <option value="">Tous les mois</option>
              {MOIS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
            <select className="form-select" style={{ maxWidth: 140 }} value={filterAnnee} onChange={e => setFilterAnnee(e.target.value)}>
              {YEARS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
              {files.length} fichier{files.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Liste fichiers Excel */}
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Nom du fichier</th>
                <th>Période</th>
                <th>Type</th>
                <th>Créé le</th>
                <th>Modifié le</th>
                <th style={{ width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 ? (
                <tr><td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-state-icon"><FileSpreadsheet size={28} /></div>
                    <div className="empty-state-title">Aucun fichier Excel</div>
                    <div className="empty-state-text">Importez des relevés pour analyse IA, ou créez un fichier vide</div>
                  </div>
                </td></tr>
              ) : files.map(f => (
                <tr key={f.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FileSpreadsheet size={18} style={{ color: '#10b981' }} />
                      <span style={{ fontWeight: 500 }}>{f.nom}</span>
                    </div>
                  </td>
                  <td>{MOIS.find(m => m.v === f.mois)?.l || '—'} {f.annee}</td>
                  <td><span className="badge badge-info">{f.type}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(f.created_at).toLocaleDateString('fr-FR')}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(f.updated_at).toLocaleDateString('fr-FR')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-primary btn-pill btn-sm" onClick={() => setEditingFile(f)}>
                        <Edit size={12} /> Modifier
                      </button>
                      <div style={{ width: 36 }}>
                        {f.type === 'annuel' && (
                          <button
                            className="btn btn-ghost btn-icon"
                            onClick={async () => {
                              const res = await window.api.excel.regenerateAnnual(f.id);
                              if (res.success) {
                                addNotification({ type: 'success', titre: 'Récap annuel régénéré', message: `${res.rowCount} transactions agrégées` });
                                await load();
                              } else {
                                addNotification({ type: 'danger', titre: 'Erreur', message: res.error });
                              }
                            }}
                            title="Régénérer depuis les données actuelles"
                          >
                            <RefreshCw size={14} style={{ color: '#3b82f6' }} />
                          </button>
                        )}
                      </div>
                      <button
                        className="btn btn-ghost btn-icon"
                        onClick={async () => {
                          const res = await window.api.excel.openLocal(f.id);
                          if (!res.success) addNotification({ type: 'danger', titre: 'Erreur', message: res.error });
                        }}
                        title="Ouvrir dans Excel"
                      >
                        <ExternalLink size={14} />
                      </button>
                      <button className="btn btn-ghost btn-icon" onClick={() => handleExport(f.id)} title="Exporter .xlsx">
                        <Download size={14} />
                      </button>
                      <button className="btn btn-ghost btn-icon" onClick={() => handleDelete(f.id)} title="Supprimer">
                        <Trash2 size={14} style={{ color: '#ef4444' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}

      {docTab === 'releves' && <>
      {/* Modal création */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Créer un fichier Excel"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Annuler</button>
            <button className="btn btn-primary" onClick={handleCreateEmpty}>Créer</button>
          </>
        }
      >
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Mois</label>
            <select className="form-select" value={newFileData.mois} onChange={e => setNewFileData({ ...newFileData, mois: parseInt(e.target.value) })}>
              {MOIS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Année</label>
            <select className="form-select" value={newFileData.annee} onChange={e => setNewFileData({ ...newFileData, annee: parseInt(e.target.value) })}>
              {YEARS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Type</label>
          <select className="form-select" value={newFileData.type} onChange={e => setNewFileData({ ...newFileData, type: e.target.value })}>
            <option value="mensuel">Mensuel</option>
            <option value="annuel">Annuel (agrège toutes les données)</option>
          </select>
        </div>
      </Modal>

      {/* Modal aperçu IA */}
      {showPreview && (
        <IAPreviewModal
          transactions={previewTransactions}
          existingFiles={files.filter(f => f.type === 'mensuel')}
          onSave={handlePreviewSave}
          onClose={() => { setShowPreview(false); setPreviewTransactions([]); }}
        />
      )}

      {/* Modal édition Excel */}
      {editingFile && (
        <ExcelEditor
          file={editingFile}
          onClose={() => setEditingFile(null)}
          onSaved={() => { setEditingFile(null); load(); }}
        />
      )}

      {/* Modal envoi au comptable */}
      {showSendModal && (
        <SendToAccountantModal
          onClose={() => setShowSendModal(false)}
          onSent={(count) => {
            setShowSendModal(false);
            addNotification({ type: 'success', titre: 'Email envoyé au comptable', message: `${count} fichier(s) envoyé(s)` });
          }}
        />
      )}
      </>}
    </>
  );
}

// ============================================================
// Modal aperçu & validation des transactions extraites par l'IA
// ============================================================
const CONFIDENCE_COLORS = {
  haute:   { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.30)', text: '#10b981', label: 'Haute' },
  moyenne: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.30)', text: '#f59e0b', label: 'Moyenne' },
  faible:  { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  text: '#ef4444', label: 'Faible' }
};

function IAPreviewModal({ transactions: initial, existingFiles, onSave, onClose }) {
  const [rows, setRows] = useState(() => initial.map((r, i) => ({ ...r, _id: i })));
  const [mode, setMode] = useState('nouveau'); // 'nouveau' | 'existant'
  const [targetFileId, setTargetFileId] = useState('');
  const [mois, setMois] = useState(new Date().getMonth() + 1);
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [saving, setSaving] = useState(false);

  // Rapprochement loyers
  const [loyerMatches, setLoyerMatches] = useState([]);
  const [confirmedLoyerIds, setConfirmedLoyerIds] = useState(new Set());
  const [loadingRapprochement, setLoadingRapprochement] = useState(false);

  useEffect(() => {
    const fetchRapprochement = async () => {
      if (rows.length === 0) return;
      setLoadingRapprochement(true);
      const result = await window.api.ia.rapprochementLoyers(rows);
      setLoadingRapprochement(false);
      if (result.success && result.matches.length > 0) {
        setLoyerMatches(result.matches);
        // Pré-confirmer automatiquement les correspondances de haute confiance
        const autoConfirm = new Set(
          result.matches.filter(m => m.confidence === 'haute').map(m => m.loyer.id)
        );
        setConfirmedLoyerIds(autoConfirm);
      }
    };
    fetchRapprochement();
  }, []); // eslint-disable-line

  const toggleConfirm = (loyerId) => {
    setConfirmedLoyerIds(prev => {
      const next = new Set(prev);
      if (next.has(loyerId)) next.delete(loyerId);
      else next.add(loyerId);
      return next;
    });
  };

  const updateRow = (id, field, val) => {
    setRows(prev => {
      const updated = prev.map(r => r._id === id ? { ...r, [field]: val } : r);
      let solde = 0;
      updated.forEach(r => {
        solde += (parseFloat(r.credit) || 0) - (parseFloat(r.debit) || 0);
        r.solde = Math.round(solde * 100) / 100;
      });
      return updated;
    });
  };

  const deleteRow = (id) => {
    setRows(prev => {
      const updated = prev.filter(r => r._id !== id);
      let solde = 0;
      updated.forEach(r => {
        solde += (parseFloat(r.credit) || 0) - (parseFloat(r.debit) || 0);
        r.solde = Math.round(solde * 100) / 100;
      });
      return updated;
    });
  };

  const addRow = () => {
    const newId = Math.max(0, ...rows.map(r => r._id)) + 1;
    setRows(prev => [...prev, { _id: newId, date: '', code_immeuble: '', libelle: '', debit: 0, credit: 0, solde: 0 }]);
  };

  const handleSave = async () => {
    setSaving(true);
    const clean = rows.map(({ _id, ...r }) => r);
    await onSave({
      transactions: clean,
      targetFileId: mode === 'existant' && targetFileId ? parseInt(targetFileId) : null,
      mois,
      annee,
      confirmedLoyerIds: [...confirmedLoyerIds]
    });
    setSaving(false);
  };

  const totalCredit = rows.reduce((s, r) => s + (parseFloat(r.credit) || 0), 0);
  const totalDebit = rows.reduce((s, r) => s + (parseFloat(r.debit) || 0), 0);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Aperçu des transactions extraites par l'IA"
      size="xl"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-success" onClick={handleSave} disabled={saving || rows.length === 0}>
            {saving
              ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Enregistrement…</>
              : <><Save size={14} /> Enregistrer {rows.length} transaction{rows.length !== 1 ? 's' : ''}</>}
          </button>
        </>
      }
    >
      {/* Bandeau résumé */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Crédit total : </span>
          <strong style={{ color: '#10b981' }}>{totalCredit.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</strong>
        </div>
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Débit total : </span>
          <strong style={{ color: '#ef4444' }}>{totalDebit.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</strong>
        </div>
        <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Lignes : </span>
          <strong>{rows.length}</strong>
        </div>
      </div>

      {/* ── Rapprochement Loyers ── */}
      <div style={{
        background: 'var(--bg-tertiary)', borderRadius: 10,
        border: '1px solid var(--border-color)', marginBottom: 16, overflow: 'hidden'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderBottom: loadingRapprochement || loyerMatches.length > 0 ? '1px solid var(--border-color)' : 'none',
          background: 'rgba(139,92,246,0.06)'
        }}>
          <Link2 size={15} style={{ color: '#8b5cf6' }} />
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
            Rapprochement automatique des loyers
          </span>
          {loadingRapprochement && (
            <div className="spinner" style={{ width: 13, height: 13, marginLeft: 4 }} />
          )}
          {!loadingRapprochement && loyerMatches.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>
              Aucune correspondance détectée avec les loyers en attente
            </span>
          )}
          {!loadingRapprochement && loyerMatches.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4 }}>
              {loyerMatches.length} correspondance{loyerMatches.length > 1 ? 's' : ''} trouvée{loyerMatches.length > 1 ? 's' : ''} —{' '}
              <strong style={{ color: '#8b5cf6' }}>{confirmedLoyerIds.size} confirmée{confirmedLoyerIds.size > 1 ? 's' : ''}</strong>
            </span>
          )}
        </div>

        {!loadingRapprochement && loyerMatches.length > 0 && (
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
              Cochez les correspondances à valider — les loyers cochés seront marqués <strong>Payé</strong> lors de l'enregistrement.
            </div>
            {loyerMatches.map((match, i) => {
              const cc = CONFIDENCE_COLORS[match.confidence] || CONFIDENCE_COLORS.faible;
              const isConfirmed = confirmedLoyerIds.has(match.loyer.id);
              return (
                <label
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${isConfirmed ? cc.border : 'var(--border-color)'}`,
                    background: isConfirmed ? cc.bg : 'transparent',
                    transition: 'all 0.15s'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isConfirmed}
                    onChange={() => toggleConfirm(match.loyer.id)}
                    style={{ cursor: 'pointer', width: 15, height: 15, flexShrink: 0 }}
                  />
                  {/* Transaction → Loyer */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>
                        {match.transaction_credit.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € crédit
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        « {match.transaction_libelle} »
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#8b5cf6' }}>
                        Loyer {match.loyer.mois_label} {match.loyer.annee}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {match.loyer.locataire_nom}
                      </span>
                      {match.loyer.bien_adresse && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          — {match.loyer.bien_adresse}
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: 3, fontSize: 11, color: 'var(--text-muted)' }}>
                      Loyer attendu : <strong>{parseFloat(match.loyer.montant).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</strong>
                      {Math.abs(match.transaction_credit - parseFloat(match.loyer.montant)) > 0.01 && (
                        <span style={{ color: '#f59e0b', marginLeft: 6 }}>
                          (écart : {(match.transaction_credit - parseFloat(match.loyer.montant)).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €)
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Badge confiance */}
                  <div style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    background: cc.bg, border: `1px solid ${cc.border}`, color: cc.text,
                    flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.5px'
                  }}>
                    {cc.label}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Options d'enregistrement */}
      <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Où enregistrer ces transactions ?</div>
        <div style={{ display: 'flex', gap: 12, marginBottom: mode === 'existant' ? 10 : 0, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input type="radio" checked={mode === 'nouveau'} onChange={() => setMode('nouveau')} />
            Créer un nouveau fichier Excel
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input type="radio" checked={mode === 'existant'} onChange={() => setMode('existant')} disabled={existingFiles.length === 0} />
            Ajouter à un fichier existant
            {existingFiles.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>(aucun disponible)</span>}
          </label>
        </div>

        {mode === 'nouveau' && (
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Mois</label>
              <select className="form-input" style={{ fontSize: 13, padding: '6px 10px' }} value={mois} onChange={e => setMois(parseInt(e.target.value))}>
                {MOIS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Année</label>
              <select className="form-input" style={{ fontSize: 13, padding: '6px 10px' }} value={annee} onChange={e => setAnnee(parseInt(e.target.value))}>
                {YEARS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
        )}

        {mode === 'existant' && (
          <select className="form-input" style={{ marginTop: 10, fontSize: 13 }} value={targetFileId} onChange={e => setTargetFileId(e.target.value)}>
            <option value="">— Choisir un fichier —</option>
            {existingFiles.map(f => (
              <option key={f.id} value={f.id}>
                {f.nom} ({MOIS.find(m => m.v === f.mois)?.l} {f.annee})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Info */}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
        Vérifiez et corrigez les transactions ci-dessous avant d'enregistrer. Vous pouvez modifier chaque cellule, supprimer des lignes incorrectes ou en ajouter manuellement.
      </div>

      {/* Tableau éditable */}
      <div style={{ maxHeight: '42vh', overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 10 }}>
        <table className="table" style={{ fontSize: 12.5 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
            <tr>
              <th>Date</th>
              <th>Code Immeuble</th>
              <th>Libellé</th>
              <th>Débit</th>
              <th>Crédit</th>
              <th>Solde</th>
              <th style={{ width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                Toutes les lignes ont été supprimées.
              </td></tr>
            ) : rows.map(r => (
              <tr key={r._id}>
                <td><input className="editable-cell" value={r.date || ''} onChange={e => updateRow(r._id, 'date', e.target.value)} placeholder="JJ/MM/AAAA" /></td>
                <td><input className="editable-cell" value={r.code_immeuble || ''} onChange={e => updateRow(r._id, 'code_immeuble', e.target.value)} placeholder="Code" /></td>
                <td><input className="editable-cell" value={r.libelle || ''} onChange={e => updateRow(r._id, 'libelle', e.target.value)} placeholder="Libellé" /></td>
                <td><input className="editable-cell" type="number" step="0.01" value={r.debit || ''} onChange={e => updateRow(r._id, 'debit', e.target.value)} placeholder="0.00" /></td>
                <td><input className="editable-cell" type="number" step="0.01" value={r.credit || ''} onChange={e => updateRow(r._id, 'credit', e.target.value)} placeholder="0.00" /></td>
                <td style={{ fontWeight: 600, color: (r.solde || 0) >= 0 ? '#10b981' : '#ef4444' }}>
                  {(r.solde || 0).toFixed(2)} €
                </td>
                <td>
                  <button className="btn btn-ghost btn-icon" onClick={() => deleteRow(r._id)} title="Supprimer cette ligne">
                    <Trash2 size={13} style={{ color: '#ef4444' }} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={addRow}>
        <Plus size={13} /> Ajouter une ligne
      </button>
    </Modal>
  );
}

// ============================================================
// Éditeur Excel inline
// ============================================================
function ExcelEditor({ file, onClose, onSaved }) {
  const { addNotification } = useApp();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localPath, setLocalPath] = useState('');
  const [msg, setMsg] = useState(null); // { type: 'success'|'error', text }

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await window.api.excel.getData(file.id);
      if (data) {
        setRows(data.donnees || []);
        setLocalPath(data.local_path || '');
      }
      setLoading(false);
    };
    load();
  }, [file.id]);

  const updateCell = (idx, field, val) => {
    const updated = [...rows];
    updated[idx] = { ...updated[idx], [field]: val };
    let solde = 0;
    updated.forEach(r => {
      solde += (parseFloat(r.credit) || 0) - (parseFloat(r.debit) || 0);
      r.solde = Math.round(solde * 100) / 100;
    });
    setRows(updated);
  };

  const addRow = () => {
    setRows([...rows, { date: '', code_immeuble: '', libelle: '', debit: 0, credit: 0, solde: 0 }]);
  };

  const deleteRow = (idx) => {
    const updated = rows.filter((_, i) => i !== idx);
    let solde = 0;
    updated.forEach(r => {
      solde += (parseFloat(r.credit) || 0) - (parseFloat(r.debit) || 0);
      r.solde = Math.round(solde * 100) / 100;
    });
    setRows(updated);
  };

  const save = async () => {
    setSaving(true);
    await window.api.excel.update(file.id, rows);
    setSaving(false);
    onSaved();
  };

  const openInExcel = async () => {
    await window.api.excel.update(file.id, rows);
    const res = await window.api.excel.openLocal(file.id);
    if (!res.success) setMsg({ type: 'error', text: res.error });
  };

  const syncFromExcel = async () => {
    const res = await window.api.excel.syncFromLocal(file.id);
    if (res.success) {
      const data = await window.api.excel.getData(file.id);
      if (data) setRows(data.donnees || []);
      setMsg({ type: 'success', text: `Synchronisé : ${res.rowCount} lignes depuis le fichier local` });
    } else {
      setMsg({ type: 'error', text: res.error });
    }
  };

  const totalCredit = rows.reduce((s, r) => s + (parseFloat(r.credit) || 0), 0);
  const totalDebit = rows.reduce((s, r) => s + (parseFloat(r.debit) || 0), 0);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Édition : ${file.nom}`}
      size="xl"
      footer={
        <>
          <button className="btn btn-ghost" onClick={openInExcel} title="Ouvrir dans Excel/LibreOffice">
            <ExternalLink size={14} /> Ouvrir dans Excel
          </button>
          <button className="btn btn-ghost" onClick={syncFromExcel} title="Recharger depuis le fichier modifié dans Excel">
            <RefreshCw size={14} /> Resynchroniser
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-success" onClick={save} disabled={saving}>
            {saving ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Enregistrement…</> : <><Save size={14} /> Enregistrer</>}
          </button>
        </>
      }
    >
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div className="spinner spinner-lg" style={{ margin: '0 auto' }} />
        </div>
      ) : (
        <>
          {/* Message inline */}
          {msg && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13,
              background: msg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${msg.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: msg.type === 'success' ? '#10b981' : '#ef4444'
            }}>
              {msg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {msg.text}
              <button onClick={() => setMsg(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', opacity: .6 }}><X size={12} /></button>
            </div>
          )}

          {/* Résumé */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
              {rows.length} ligne{rows.length !== 1 ? 's' : ''}
              {' • '}Crédit : <strong style={{ color: '#10b981' }}>{totalCredit.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</strong>
              {' • '}Débit : <strong style={{ color: '#ef4444' }}>{totalDebit.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</strong>
            </span>
            <button className="btn btn-primary btn-sm" onClick={addRow}>
              <Plus size={14} /> Ajouter ligne
            </button>
          </div>

          <div style={{ maxHeight: '55vh', overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 12 }}>
            <table className="table" style={{ fontSize: 12.5 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                <tr>
                  <th>Date</th>
                  <th>Code Immeuble</th>
                  <th>Libellé</th>
                  <th>Débit</th>
                  <th>Crédit</th>
                  <th>Solde</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    Aucune ligne. Cliquez sur "Ajouter ligne".
                  </td></tr>
                ) : rows.map((r, i) => (
                  <tr key={i}>
                    <td><input className="editable-cell" value={r.date || ''} onChange={e => updateCell(i, 'date', e.target.value)} placeholder="JJ/MM/AAAA" /></td>
                    <td><input className="editable-cell" value={r.code_immeuble || ''} onChange={e => updateCell(i, 'code_immeuble', e.target.value)} placeholder="Code" /></td>
                    <td><input className="editable-cell" value={r.libelle || ''} onChange={e => updateCell(i, 'libelle', e.target.value)} placeholder="Libellé" /></td>
                    <td><input className="editable-cell" type="number" step="0.01" value={r.debit || ''} onChange={e => updateCell(i, 'debit', e.target.value)} placeholder="0.00" /></td>
                    <td><input className="editable-cell" type="number" step="0.01" value={r.credit || ''} onChange={e => updateCell(i, 'credit', e.target.value)} placeholder="0.00" /></td>
                    <td style={{ fontWeight: 600, color: (r.solde || 0) >= 0 ? '#10b981' : '#ef4444' }}>
                      {(r.solde || 0).toFixed(2)} €
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-icon" onClick={() => deleteRow(i)}>
                        <Trash2 size={13} style={{ color: '#ef4444' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

// ============================================================
// Modal envoi au comptable
// ============================================================
function SendToAccountantModal({ onClose, onSent }) {
  const { addNotification } = useApp();
  const [allFiles, setAllFiles] = useState([]);
  const [selected, setSelected] = useState([]);
  const [comptableEmail, setComptableEmail] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [smtpConfigured, setSmtpConfigured] = useState(true);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const [files, params] = await Promise.all([
        window.api.excel.getAll({}),
        window.api.parametres.getAll()
      ]);
      setAllFiles(files || []);
      setComptableEmail(params.email_comptable || '');
      setCustomSubject(`Fichiers comptables — ${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`);
      setCustomBody(`Bonjour,\n\nVeuillez trouver en pièces jointes les fichiers comptables.\n\nCordialement`);
      setSmtpConfigured(!!(params.smtp_host && params.email_expediteur && params.smtp_password));
      setLoading(false);
    };
    init();
  }, []);

  const filteredFiles = allFiles.filter(f => {
    if (filterMonth && f.mois !== parseInt(filterMonth)) return false;
    if (filterYear && f.annee !== parseInt(filterYear)) return false;
    return true;
  });

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const toggleSelectAll = () => setSelected(selected.length === filteredFiles.length ? [] : filteredFiles.map(f => f.id));
  const selectThisMonth = () => {
    const now = new Date();
    setSelected(allFiles.filter(f => f.mois === now.getMonth() + 1 && f.annee === now.getFullYear()).map(f => f.id));
  };
  const selectThisYear = () => setSelected(allFiles.filter(f => f.annee === new Date().getFullYear()).map(f => f.id));

  const handleSend = async () => {
    if (!comptableEmail || selected.length === 0) return;
    const currentParams = await window.api.parametres.getAll();
    if (currentParams.email_comptable !== comptableEmail) {
      await window.api.parametres.set('email_comptable', comptableEmail);
    }
    setSending(true);
    const result = await window.api.excel.sendToAccountant({ ids: selected, subject: customSubject, body: customBody, customEmail: comptableEmail });
    setSending(false);
    if (result.success) {
      onSent(result.fileCount);
    } else {
      addNotification({ type: 'danger', titre: "Échec d'envoi", message: result.error });
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Envoyer au comptable"
      size="lg"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-success" onClick={handleSend} disabled={sending || selected.length === 0 || !comptableEmail || !smtpConfigured}>
            {sending ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Envoi…</> : <><Mail size={14} /> Envoyer ({selected.length})</>}
          </button>
        </>
      }
    >
      {!smtpConfigured && !loading && (
        <div style={{ padding: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12 }}>
          <AlertCircle size={16} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
          <div><strong>SMTP non configuré.</strong> Allez dans <strong>Paramètres → Configuration Email</strong>.</div>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Destinataire</label>
        <input type="email" className="form-input" value={comptableEmail} onChange={e => setComptableEmail(e.target.value)} placeholder="comptable@exemple.fr" />
      </div>
      <div className="form-group">
        <label className="form-label">Sujet</label>
        <input className="form-input" value={customSubject} onChange={e => setCustomSubject(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Message</label>
        <textarea className="form-textarea" value={customBody} onChange={e => setCustomBody(e.target.value)} rows={3} />
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <select className="form-select" style={{ maxWidth: 150, padding: '6px 10px', fontSize: 12 }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
          <option value="">Tous les mois</option>
          {MOIS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth: 110, padding: '6px 10px', fontSize: 12 }} value={filterYear} onChange={e => setFilterYear(e.target.value)}>
          {YEARS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={selectThisMonth}>Ce mois</button>
        <button className="btn btn-ghost btn-sm" onClick={selectThisYear}>Cette année</button>
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, maxHeight: '38vh', overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : filteredFiles.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Aucun fichier trouvé</div>
        ) : (
          <>
            <div onClick={toggleSelectAll} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              <input type="checkbox" checked={selected.length === filteredFiles.length && filteredFiles.length > 0} onChange={toggleSelectAll} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer' }} />
              {selected.length === filteredFiles.length && filteredFiles.length > 0 ? 'Tout désélectionner' : `Tout sélectionner (${filteredFiles.length})`}
            </div>
            {filteredFiles.map(f => {
              const isSel = selected.includes(f.id);
              return (
                <div key={f.id} onClick={() => toggleSelect(f.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', background: isSel ? 'rgba(59,130,246,0.08)' : 'transparent' }}>
                  <input type="checkbox" checked={isSel} onChange={() => toggleSelect(f.id)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer' }} />
                  <FileSpreadsheet size={16} style={{ color: '#10b981', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nom}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {f.mois ? `${MOIS.find(m => m.v === f.mois)?.l} ${f.annee}` : `Récap ${f.annee}`} • {new Date(f.updated_at).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                  <span className={`badge ${f.type === 'annuel' ? 'badge-info' : 'badge-neutral'}`}>{f.type}</span>
                </div>
              );
            })}
          </>
        )}
      </div>

      <div style={{ marginTop: 12, padding: '10px 14px', background: selected.length > 0 ? 'rgba(16,185,129,0.08)' : 'var(--bg-tertiary)', border: '1px solid ' + (selected.length > 0 ? 'rgba(16,185,129,0.2)' : 'var(--border-color)'), borderRadius: 8, fontSize: 13 }}>
        {selected.length === 0
          ? <span style={{ color: 'var(--text-muted)' }}>Aucun fichier sélectionné</span>
          : <><strong>{selected.length} fichier{selected.length > 1 ? 's' : ''}</strong> prêt{selected.length > 1 ? 's' : ''} à envoyer à <strong style={{ color: 'var(--accent-blue)' }}>{comptableEmail || '…'}</strong></>}
      </div>
    </Modal>
  );
}

// ============================================================
// Parseur CSV bancaire multi-formats (banques françaises)
// ============================================================
function parseCSVBancaire(content, filename = '') {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];

  // ── Détection du séparateur ──────────────────────────────
  const sep = detectSeparator(lines);

  // ── Chercher la ligne d'en-tête ──────────────────────────
  let headerIdx = -1;
  let headerRow = null;
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const cells = splitCSVLine(lines[i], sep).map(c => c.toLowerCase().trim());
    if (cells.some(c =>
      c.includes('date') || c.includes('libellé') || c.includes('libelle') ||
      c.includes('montant') || c.includes('débit') || c.includes('debit') ||
      c.includes('crédit') || c.includes('credit') || c.includes('opération')
    )) {
      headerIdx = i;
      headerRow = cells;
      break;
    }
  }
  if (headerIdx === -1 || !headerRow) return [];

  // ── Mappage des colonnes ──────────────────────────────────
  const colIdx = {
    date:    findCol(headerRow, ['date', 'date op', "date de l'opération", 'date valeur', 'date opé', 'date ope']),
    libelle: findCol(headerRow, ['libellé', 'libelle', 'opération', 'operation', 'désignation', 'designation', 'description']),
    debit:   findCol(headerRow, ['débit', 'debit', 'débit euros', 'debit euros', 'sortie', 'retrait']),
    credit:  findCol(headerRow, ['crédit', 'credit', 'crédit euros', 'credit euros', 'entrée', 'versement']),
    montant: findCol(headerRow, ['montant', 'amount', 'valeur']),
    solde:   findCol(headerRow, ['solde', 'balance']),
  };

  if (colIdx.date === -1 || colIdx.libelle === -1) return [];

  const hasSeparateAmounts = colIdx.debit !== -1 && colIdx.credit !== -1;
  const hasMontant = colIdx.montant !== -1;

  // ── Lecture des lignes de données ────────────────────────
  const transactions = [];
  let runningBalance = 0;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith(';') || raw.split(sep).every(c => !c.trim())) continue;

    const cells = splitCSVLine(raw, sep);
    if (cells.length < 2) continue;

    const dateRaw = (cells[colIdx.date] || '').trim();
    const libelle = (cells[colIdx.libelle] || '').trim();
    if (!dateRaw || !libelle) continue;

    // Normalisation date → DD/MM/YYYY
    const date = normalizeDate(dateRaw);
    if (!date) continue;

    let debit = 0, credit = 0;

    if (hasSeparateAmounts) {
      debit  = parseAmount(cells[colIdx.debit]  || '');
      credit = parseAmount(cells[colIdx.credit] || '');
    } else if (hasMontant) {
      const val = parseSignedAmount(cells[colIdx.montant] || '');
      if (val < 0) debit = Math.abs(val);
      else credit = val;
    }

    // Solde fourni ou calculé
    let solde = 0;
    if (colIdx.solde !== -1 && cells[colIdx.solde]) {
      solde = parseSignedAmount(cells[colIdx.solde]);
    } else {
      runningBalance += credit - debit;
      solde = Math.round(runningBalance * 100) / 100;
    }

    transactions.push({
      date,
      code_immeuble: '',
      libelle,
      debit: debit || 0,
      credit: credit || 0,
      solde
    });
  }

  return transactions;
}

function detectSeparator(lines) {
  const candidates = [';', ',', '\t', '|'];
  const counts = candidates.map(s => ({
    sep: s,
    n: (lines[0] || '').split(s).length + ((lines[1] || '').split(s).length)
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].sep;
}

function splitCSVLine(line, sep) {
  // Gère les guillemets
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === sep && !inQ) { result.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  result.push(cur.trim());
  return result;
}

function findCol(headers, variants) {
  for (const v of variants) {
    const idx = headers.findIndex(h => h.replace(/[""«»]/g, '').trim() === v);
    if (idx !== -1) return idx;
  }
  // Recherche partielle
  for (const v of variants) {
    const idx = headers.findIndex(h => h.includes(v));
    if (idx !== -1) return idx;
  }
  return -1;
}

function normalizeDate(s) {
  // DD/MM/YYYY ou DD-MM-YYYY → DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${m[1].padStart(2,'0')}/${m[2].padStart(2,'0')}/${y}`;
  }
  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return null;
}

function parseAmount(s) {
  if (!s) return 0;
  const cleaned = s.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

function parseSignedAmount(s) {
  if (!s) return 0;
  const neg = s.includes('-') || s.trim().startsWith('(');
  const abs = parseAmount(s);
  return neg ? -abs : abs;
}
