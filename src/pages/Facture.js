import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../components/ConfirmDialog';
import {
  Upload, FileSpreadsheet, Plus, Edit, Trash2, Mail,
  Download, Sparkles, FileText, Image as ImageIcon, Save,
  Calendar, ExternalLink, RefreshCw, AlertCircle
} from 'lucide-react';

const MOIS = [
  { v: 1, l: 'Janvier' }, { v: 2, l: 'Février' }, { v: 3, l: 'Mars' },
  { v: 4, l: 'Avril' }, { v: 5, l: 'Mai' }, { v: 6, l: 'Juin' },
  { v: 7, l: 'Juillet' }, { v: 8, l: 'Août' }, { v: 9, l: 'Septembre' },
  { v: 10, l: 'Octobre' }, { v: 11, l: 'Novembre' }, { v: 12, l: 'Décembre' }
];

export default function Facture() {
  const { addNotification } = useApp();
  const [files, setFiles] = useState([]);
  const [importedFiles, setImportedFiles] = useState([]);
  const [filterMois, setFilterMois] = useState('');
  const [filterAnnee, setFilterAnnee] = useState(new Date().getFullYear());
  const [selectedIds, setSelectedIds] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editingFile, setEditingFile] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
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
      setImportedFiles(imported);
      addNotification({ type: 'info', titre: 'Fichiers importés', message: `${imported.length} fichier(s) prêt(s) pour analyse IA` });
    }
  };

  const handleAnalyze = async () => {
    if (importedFiles.length === 0) return;
    setIsAnalyzing(true);
    const result = await window.api.ia.analyzeFiles(importedFiles);
    setIsAnalyzing(false);

    if (result.success) {
      // Crée un nouveau fichier Excel avec les transactions analysées
      const now = new Date();
      await window.api.excel.create({
        nom: `Facture_IA_${now.getMonth() + 1}_${now.getFullYear()}`,
        mois: now.getMonth() + 1,
        annee: now.getFullYear(),
        type: 'mensuel',
        donnees: result.transactions
      });
      setImportedFiles([]);
      addNotification({ type: 'success', titre: 'Analyse IA terminée', message: `${result.transactions.length} transactions extraites` });
      await load();
    } else {
      addNotification({ type: 'danger', titre: 'Erreur analyse IA', message: result.error });
      alert('Erreur : ' + result.error);
    }
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
      addNotification({
        type: 'success',
        titre: 'Récap annuel créé',
        message: `${result.rowCount} transactions agrégées automatiquement`
      });
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

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleExport = async (id) => {
    const path = await window.api.excel.export(id);
    if (path) addNotification({ type: 'success', titre: 'Export réussi', message: `Fichier enregistré : ${path}` });
  };

  return (
    <>
      <PageHeader
        title="Factures & Relevés"
        subtitle="Import, analyse IA et gestion des fichiers Excel"
        onRefresh={load}
        actions={
          <>
            <button
              className="btn btn-success"
              onClick={() => setShowSendModal(true)}
              disabled={files.length === 0}
            >
              <Mail size={16} /> Envoyer au comptable
            </button>
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} /> Créer Excel
            </button>
          </>
        }
      />

      <div className="page-container">
        {/* Zone d'import */}
        <div className="card mb-6">
          <div className="card-header">
            <div className="card-title">
              <div className="card-title-icon"><Upload size={18} /></div>
              Importer factures / relevés
            </div>
          </div>

          <div className="drop-zone" onClick={handleImport}>
            <div className="drop-zone-icon"><Upload size={28} /></div>
            <div className="drop-zone-title">Cliquer pour importer des fichiers</div>
            <div className="drop-zone-subtitle">PDF, PNG, JPG uniquement</div>
          </div>

          {importedFiles.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                {importedFiles.length} fichier(s) prêt(s) :
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                {importedFiles.map((f, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)', fontSize: 12
                  }}>
                    {f.type === 'pdf' ? <FileText size={14} /> : <ImageIcon size={14} />}
                    {f.name}
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" onClick={handleAnalyze} disabled={isAnalyzing}>
                {isAnalyzing ? <><div className="spinner" /> Analyse en cours...</> : <><Sparkles size={16} /> Analyser avec IA Gemini</>}
              </button>
            </div>
          )}
        </div>

        {/* Filtres */}
        <div className="card mb-6" style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <Calendar size={18} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Filtrer :</span>
            <select className="form-select" style={{ maxWidth: 180 }} value={filterMois} onChange={(e) => setFilterMois(e.target.value)}>
              <option value="">Tous les mois</option>
              {MOIS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
            <select className="form-select" style={{ maxWidth: 140 }} value={filterAnnee} onChange={(e) => setFilterAnnee(e.target.value)}>
              {[2024, 2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
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
                    <div className="empty-state-text">Importez des factures ou créez un fichier vide</div>
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
                  <td>{MOIS.find(m => m.v === f.mois)?.l} {f.annee}</td>
                  <td><span className="badge badge-info">{f.type}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(f.created_at).toLocaleDateString('fr-FR')}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(f.updated_at).toLocaleDateString('fr-FR')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-primary btn-pill btn-sm" onClick={() => setEditingFile(f)}>
                        <Edit size={12} /> Modifier
                      </button>
                      {/* Slot régénérer (toujours présent, visible seulement si annuel) */}
                      <div style={{ width: 36 }}>
                        {f.type === 'annuel' && (
                          <button
                            className="btn btn-ghost btn-icon"
                            onClick={async () => {
                              const res = await window.api.excel.regenerateAnnual(f.id);
                              if (res.success) {
                                addNotification({
                                  type: 'success',
                                  titre: 'Récap annuel régénéré',
                                  message: `${res.rowCount} transactions agrégées`
                                });
                                await load();
                              } else {
                                alert(res.error);
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
                          if (!res.success) alert(res.error);
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
      </div>

      {/* Modal création */}
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
            <select className="form-select" value={newFileData.mois} onChange={(e) => setNewFileData({ ...newFileData, mois: parseInt(e.target.value) })}>
              {MOIS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Année</label>
            <select className="form-select" value={newFileData.annee} onChange={(e) => setNewFileData({ ...newFileData, annee: parseInt(e.target.value) })}>
              {[2024, 2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Type</label>
          <select className="form-select" value={newFileData.type} onChange={(e) => setNewFileData({ ...newFileData, type: e.target.value })}>
            <option value="mensuel">Mensuel</option>
            <option value="annuel">Annuel</option>
          </select>
        </div>
      </Modal>

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
            addNotification({
              type: 'success',
              titre: 'Email envoyé au comptable',
              message: `${count} fichier(s) envoyé(s) en pièces jointes`
            });
          }}
        />
      )}
    </>
  );
}

function ExcelEditor({ file, onClose, onSaved }) {
  const [rows, setRows] = useState([]);
  const [biens, setBiens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localPath, setLocalPath] = useState('');

  useEffect(() => {
    // Charge les données depuis le fichier .xlsx LOCAL (source de vérité pour édition)
    const load = async () => {
      setLoading(true);
      const data = await window.api.excel.getData(file.id);
      if (data) {
        setRows(data.donnees || []);
        setLocalPath(data.local_path || '');
      }
      const b = await window.api.biens.getAll();
      setBiens(b);
      setLoading(false);
    };
    load();
  }, [file.id]);

  const updateCell = (idx, field, val) => {
    const updated = [...rows];
    updated[idx] = { ...updated[idx], [field]: val };

    // Recalcul solde progressif
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
    // update réécrit le .xlsx local puis synchronise la DB depuis ce fichier
    await window.api.excel.update(file.id, rows);
    setSaving(false);
    onSaved();
  };

  const openInExcel = async () => {
    // Sauvegarde d'abord les modifs en cours
    await window.api.excel.update(file.id, rows);
    const res = await window.api.excel.openLocal(file.id);
    if (!res.success) alert(res.error);
  };

  const syncFromExcel = async () => {
    const res = await window.api.excel.syncFromLocal(file.id);
    if (res.success) {
      // Recharge les données
      const data = await window.api.excel.getData(file.id);
      if (data) setRows(data.donnees || []);
      alert(`Synchronisé : ${res.rowCount} lignes depuis le fichier local`);
    } else {
      alert(res.error);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Édition : ${file.nom}`}
      size="xl"
      footer={
        <>
          <button className="btn btn-ghost" onClick={openInExcel} title="Ouvre le .xlsx dans Excel/LibreOffice">
            <ExternalLink size={14} /> Ouvrir dans Excel
          </button>
          <button className="btn btn-ghost" onClick={syncFromExcel} title="Recharger depuis le fichier local (si modifié dans Excel)">
            <RefreshCw size={14} /> Resynchroniser
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-success" onClick={save} disabled={saving}>
            {saving ? <><div className="spinner" /> Enregistrement...</> : <><Save size={14} /> Enregistrer</>}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {rows.length} lignes • <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{localPath}</span>
            </div>
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
                    Aucune ligne. Cliquez sur "Ajouter ligne"
                  </td></tr>
                ) : rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <input className="editable-cell" value={r.date || ''} onChange={(e) => updateCell(i, 'date', e.target.value)} placeholder="JJ/MM/AAAA" />
                    </td>
                    <td>
                      <input className="editable-cell" value={r.code_immeuble || ''} onChange={(e) => updateCell(i, 'code_immeuble', e.target.value)} placeholder="Code" />
                    </td>
                    <td>
                      <input className="editable-cell" value={r.libelle || ''} onChange={(e) => updateCell(i, 'libelle', e.target.value)} placeholder="Libellé" />
                    </td>
                    <td>
                      <input className="editable-cell" type="number" step="0.01" value={r.debit || ''} onChange={(e) => updateCell(i, 'debit', e.target.value)} placeholder="0.00" />
                    </td>
                    <td>
                      <input className="editable-cell" type="number" step="0.01" value={r.credit || ''} onChange={(e) => updateCell(i, 'credit', e.target.value)} placeholder="0.00" />
                    </td>
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

// ============================================
// Modal : envoi des fichiers au comptable
// ============================================
function SendToAccountantModal({ onClose, onSent }) {
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
      setCustomSubject(`Fichiers comptables - ${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`);
      setCustomBody(`Bonjour,\n\nVeuillez trouver en pièces jointes les fichiers comptables.\n\nCordialement`);
      setSmtpConfigured(!!(params.smtp_host && params.email_expediteur && params.smtp_password));
      setLoading(false);
    };
    init();
  }, []);

  // Filtrage
  const filteredFiles = allFiles.filter(f => {
    if (filterMonth && f.mois !== parseInt(filterMonth)) return false;
    if (filterYear && f.annee !== parseInt(filterYear)) return false;
    return true;
  });

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selected.length === filteredFiles.length) {
      setSelected([]);
    } else {
      setSelected(filteredFiles.map(f => f.id));
    }
  };

  // Raccourcis rapides
  const selectThisMonth = () => {
    const now = new Date();
    const ids = allFiles
      .filter(f => f.mois === now.getMonth() + 1 && f.annee === now.getFullYear())
      .map(f => f.id);
    setSelected(ids);
  };

  const selectThisYear = () => {
    const y = new Date().getFullYear();
    const ids = allFiles.filter(f => f.annee === y).map(f => f.id);
    setSelected(ids);
  };

  const handleSend = async () => {
    if (!comptableEmail) {
      alert('Veuillez renseigner l\'email du comptable');
      return;
    }
    if (selected.length === 0) {
      alert('Sélectionnez au moins un fichier');
      return;
    }

    // Si email modifié, on le sauvegarde en paramètres
    const currentParams = await window.api.parametres.getAll();
    if (currentParams.email_comptable !== comptableEmail) {
      await window.api.parametres.set('email_comptable', comptableEmail);
    }

    setSending(true);
    const result = await window.api.excel.sendToAccountant({
      ids: selected,
      subject: customSubject,
      body: customBody,
      customEmail: comptableEmail
    });
    setSending(false);

    if (result.success) {
      onSent(result.fileCount);
    } else {
      alert(result.error);
    }
  };

  const totalSize = selected.length;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Envoyer au comptable"
      size="lg"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button
            className="btn btn-success"
            onClick={handleSend}
            disabled={sending || selected.length === 0 || !comptableEmail || !smtpConfigured || !smtpConfigured}
          >
            {sending
              ? <><div className="spinner" /> Envoi en cours...</>
              : <><Mail size={14} /> Envoyer ({totalSize})</>
            }
          </button>
        </>
      }
    >
      {/* Avertissement SMTP non configuré */}
      {!smtpConfigured && !loading && (
        <div style={{
          padding: 12,
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 16,
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          fontSize: 12
        }}>
          <AlertCircle size={16} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>SMTP non configuré.</strong> Pour envoyer des emails automatiquement, allez dans <strong>Paramètres → Configuration Email</strong> pour ajouter votre serveur SMTP, votre email et votre mot de passe d'application.
          </div>
        </div>
      )}

      {/* Destinataire */}
      <div className="form-group">
        <label className="form-label">Destinataire</label>
        <input
          type="email"
          className="form-input"
          value={comptableEmail}
          onChange={(e) => setComptableEmail(e.target.value)}
          placeholder="comptable@exemple.fr"
        />
      </div>

      {/* Sujet */}
      <div className="form-group">
        <label className="form-label">Sujet</label>
        <input
          className="form-input"
          value={customSubject}
          onChange={(e) => setCustomSubject(e.target.value)}
          placeholder="Fichiers comptables..."
        />
      </div>

      {/* Message */}
      <div className="form-group">
        <label className="form-label">Message</label>
        <textarea
          className="form-textarea"
          value={customBody}
          onChange={(e) => setCustomBody(e.target.value)}
          rows={4}
          placeholder="Votre message..."
        />
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Filtrer :</span>
        <select
          className="form-select"
          style={{ maxWidth: 150, padding: '6px 10px', fontSize: 12 }}
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
        >
          <option value="">Tous les mois</option>
          {MOIS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
        </select>
        <select
          className="form-select"
          style={{ maxWidth: 110, padding: '6px 10px', fontSize: 12 }}
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
        >
          {[2024, 2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <div style={{ flex: 1 }} />

        {/* Raccourcis */}
        <button className="btn btn-ghost btn-sm" onClick={selectThisMonth}>
          Ce mois-ci
        </button>
        <button className="btn btn-ghost btn-sm" onClick={selectThisYear}>
          Cette année
        </button>
      </div>

      {/* Liste */}
      <div style={{
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        maxHeight: '40vh',
        overflow: 'auto'
      }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : filteredFiles.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Aucun fichier trouvé pour ces filtres
          </div>
        ) : (
          <>
            {/* Checkbox "tout sélectionner" */}
            <div
              onClick={toggleSelectAll}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderBottom: '1px solid var(--border-color)',
                background: 'var(--bg-tertiary)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600
              }}
            >
              <input
                type="checkbox"
                checked={selected.length === filteredFiles.length && filteredFiles.length > 0}
                onChange={toggleSelectAll}
                style={{ cursor: 'pointer' }}
                onClick={(e) => e.stopPropagation()}
              />
              {selected.length === filteredFiles.length && filteredFiles.length > 0
                ? 'Tout désélectionner'
                : `Tout sélectionner (${filteredFiles.length})`}
            </div>

            {filteredFiles.map(f => {
              const isSelected = selected.includes(f.id);
              return (
                <div
                  key={f.id}
                  onClick={() => toggleSelect(f.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                    transition: 'background 150ms'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--bg-card-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(f.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ cursor: 'pointer' }}
                  />
                  <FileSpreadsheet size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {f.nom}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {f.mois ? `${MOIS.find(m => m.v === f.mois)?.l} ${f.annee}` : `Récap ${f.annee}`}
                      {' • '}
                      {new Date(f.updated_at).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                  <span className={`badge ${f.type === 'annuel' ? 'badge-info' : 'badge-neutral'}`}>
                    {f.type}
                  </span>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Récap */}
      <div style={{
        marginTop: 14,
        padding: 14,
        background: selected.length > 0 ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-tertiary)',
        border: '1px solid ' + (selected.length > 0 ? 'rgba(16, 185, 129, 0.2)' : 'var(--border-color)'),
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 13
      }}>
        <Mail size={16} style={{ color: selected.length > 0 ? '#10b981' : 'var(--text-muted)' }} />
        <div style={{ flex: 1 }}>
          {selected.length === 0 ? (
            <span style={{ color: 'var(--text-muted)' }}>Aucun fichier sélectionné</span>
          ) : (
            <>
              <strong>{selected.length} fichier{selected.length > 1 ? 's' : ''}</strong> prêt{selected.length > 1 ? 's' : ''} à envoyer à{' '}
              <strong style={{ color: 'var(--accent-blue)' }}>{comptableEmail || '...'}</strong>
            </>
          )}
        </div>
      </div>

      <div style={{
        marginTop: 10,
        padding: 10,
        background: 'rgba(16, 185, 129, 0.05)',
        border: '1px solid rgba(16, 185, 129, 0.15)',
        borderRadius: 8,
        fontSize: 11,
        color: 'var(--text-secondary)',
        lineHeight: 1.5
      }}>
        <strong>📧 Envoi direct :</strong> L'email sera envoyé automatiquement via SMTP avec les fichiers Excel en pièces jointes. Aucune action supplémentaire de votre part.
      </div>
    </Modal>
  );
}