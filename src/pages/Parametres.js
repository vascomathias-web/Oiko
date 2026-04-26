import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../components/ConfirmDialog';
import AdminZone from './AdminZone';
import {
  Moon, Sun, Mail, Volume2, Key, Save, Check, Eye, EyeOff,
  Settings as SettingsIcon, HardDrive, FolderOpen, Download,
  Upload, RotateCcw, Trash2, Clock, CheckCircle2, AlertCircle,
  Cloud, ShieldAlert
} from 'lucide-react';

export default function Parametres() {
  const { theme, updateTheme, parametres, updateParametre, loadParametres, addNotification } = useApp();
  const [form, setForm] = useState({});
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdminZone, setShowAdminZone] = useState(false);

  useEffect(() => {
    setForm(parametres);
  }, [parametres]);

  const handleSave = async () => {
    const keys = [
      'email_expediteur', 'email_comptable',
      'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_password',
      'gemini_api_key', 'user_name'
    ];
    await Promise.all(keys.map(k => updateParametre(k, form[k] || '')));
    await loadParametres();
    addNotification({ type: 'success', titre: 'Paramètres enregistrés', message: 'Vos paramètres ont été mis à jour' });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const toggleSonores = async () => {
    const newVal = parametres.notifications_sonores === 'true' ? 'false' : 'true';
    await updateParametre('notifications_sonores', newVal);
    await loadParametres();
  };

  const sonoresActif = parametres.notifications_sonores === 'true';

  return (
    <>
      <PageHeader title="Paramètres" subtitle="Configuration de GestImmo" />

      <div className="page-container">
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {/* Thème */}
          <div className="card mb-6">
            <div className="card-header">
              <div className="card-title">
                <div className="card-title-icon" style={{ background: 'var(--gradient-purple)' }}>
                  {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                </div>
                Apparence
              </div>
            </div>

            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Choisissez l'apparence de l'interface
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <ThemeOption
                active={theme === 'dark'}
                icon={<Moon size={20} />}
                label="Sombre"
                preview={{ bg: '#0f172a', card: '#1e293b', accent: '#3b82f6' }}
                onClick={() => updateTheme('dark')}
              />
              <ThemeOption
                active={theme === 'light'}
                icon={<Sun size={20} />}
                label="Clair"
                preview={{ bg: '#f5f7fa', card: '#ffffff', accent: '#3b82f6' }}
                onClick={() => updateTheme('light')}
              />
            </div>
          </div>

          {/* Profil utilisateur */}
          <div className="card mb-6">
            <div className="card-header">
              <div className="card-title">
                <div className="card-title-icon" style={{ background: 'var(--gradient-purple)' }}>
                  <SettingsIcon size={16} />
                </div>
                Profil utilisateur
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Nom affiché</label>
              <input
                className="form-input"
                value={form.user_name || ''}
                onChange={(e) => setForm({ ...form, user_name: e.target.value })}
                placeholder="Votre nom"
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Affiché en haut à droite de l'application
              </div>
            </div>
          </div>

          {/* Emails */}
          {/* Configuration Email SMTP */}
          <EmailConfigSection form={form} setForm={setForm} showPassword={showPassword} setShowPassword={setShowPassword} />

          {/* API Gemini */}
          <div className="card mb-6">
            <div className="card-header">
              <div className="card-title">
                <div className="card-title-icon" style={{ background: 'var(--gradient-orange)' }}>
                  <Key size={16} />
                </div>
                Intelligence Artificielle (Gemini)
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Clé API Google Gemini</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type={showKey ? 'text' : 'password'}
                  value={form.gemini_api_key || ''}
                  onChange={(e) => setForm({ ...form, gemini_api_key: e.target.value })}
                  placeholder="AIzaSy..."
                  style={{ paddingRight: 44, fontFamily: 'var(--font-mono)' }}
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  style={{
                    position: 'absolute', right: 10, top: '50%',
                    transform: 'translateY(-50%)', color: 'var(--text-muted)'
                  }}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Obtenez votre clé sur{' '}
                <span
                  onClick={() => window.api.shell.openExternal('https://aistudio.google.com/apikey')}
                  style={{ color: 'var(--accent-blue)', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  aistudio.google.com/apikey
                </span>
              </div>
            </div>
          </div>

          {/* Notifications sonores */}
          <div className="card mb-6">
            <div className="card-header">
              <div className="card-title">
                <div className="card-title-icon" style={{ background: 'var(--gradient-green)' }}>
                  <Volume2 size={16} />
                </div>
                Notifications
              </div>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: 14, background: 'var(--bg-tertiary)', borderRadius: 12
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Notifications sonores</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Activer un son lors de la réception d'une notification
                </div>
              </div>
              <div className={`toggle ${sonoresActif ? 'active' : ''}`} onClick={toggleSonores} />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'var(--bg-tertiary)', borderRadius: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Notifications Windows</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Afficher les alertes (loyers en retard, erreurs) dans la zone de notification Windows
                  </div>
                </div>
                <div className={`toggle ${form.notifications_systeme !== 'false' ? 'active' : ''}`}
                     onClick={() => setForm({ ...form, notifications_systeme: form.notifications_systeme === 'false' ? 'true' : 'false' })} />
              </div>
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'var(--bg-tertiary)', borderRadius: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Réduire dans la zone de notification</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Quand vous fermez la fenêtre, l'app continue de tourner en arrière-plan (icône en bas à droite)
                  </div>
                </div>
                <div className={`toggle ${form.minimize_to_tray !== 'false' ? 'active' : ''}`}
                     onClick={() => setForm({ ...form, minimize_to_tray: form.minimize_to_tray === 'false' ? 'true' : 'false' })} />
              </div>
            </div>
          </div>

          {/* Sauvegarde / Backup */}
          <BackupSection />

          {/* Zone dangereuse */}
          <div className="card mb-6" style={{
            border: '1px solid rgba(239, 68, 68, 0.25)',
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.04), rgba(239, 68, 68, 0.01))'
          }}>
            <div className="card-header">
              <div className="card-title">
                <div className="card-title-icon" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                  <ShieldAlert size={16} />
                </div>
                Zone dangereuse
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>
              Cette zone permet de supprimer définitivement des catégories de données. L'accès est protégé par une <strong>authentification à 2 facteurs par email</strong> pour éviter les manipulations accidentelles ou non-autorisées.
            </div>
            <button
              className="btn btn-danger"
              onClick={() => setShowAdminZone(true)}
              style={{ width: '100%' }}
            >
              <ShieldAlert size={14} /> Accéder à la gestion avancée
            </button>
          </div>

          {/* Bouton enregistrer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn btn-primary" onClick={handleSave} style={{ minWidth: 140 }}>
              {saved ? <><Check size={16} /> Enregistré</> : <><Save size={16} /> Enregistrer</>}
            </button>
          </div>

          {/* Info app */}
          <div style={{
            marginTop: 32, padding: 20,
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            textAlign: 'center'
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'var(--gradient-blue)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <SettingsIcon size={22} color="white" />
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>GestImmo</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Version 1.0.0 • Comptabilité immobilière assistée par IA
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Base de données locale chiffrée • AES-256 pour les données sensibles
            </div>
          </div>
        </div>
      </div>

      <AdminZone isOpen={showAdminZone} onClose={() => setShowAdminZone(false)} />
    </>
  );
}

function BackupSection() {
  const { parametres, updateParametre, loadParametres, addNotification } = useApp();
  const [status, setStatus] = useState(null);
  const [backups, setBackups] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showBackupsModal, setShowBackupsModal] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(null);
  const { confirm } = useConfirm();

  const loadStatus = useCallback(async () => {
    const s = await window.api.backup.getStatus();
    setStatus(s);
    if (s.configured) {
      const r = await window.api.backup.list();
      if (r.success) setBackups(r.backups);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus, parametres.backup_folder]);

  const handleSelectFolder = async () => {
    const folder = await window.api.backup.selectFolder();
    if (folder) {
      await updateParametre('backup_folder', folder);
      await loadParametres();
      await loadStatus();
      addNotification({ type: 'success', titre: 'Dossier de sauvegarde configuré', message: folder });
    }
  };

  const handleToggleAuto = async () => {
    const newVal = parametres.backup_auto === 'true' ? 'false' : 'true';
    await updateParametre('backup_auto', newVal);
    await loadParametres();
    await loadStatus();
  };

  const handleCreateBackup = async () => {
    if (!status?.configured) {
      alert('Configurez d\'abord un dossier de sauvegarde');
      return;
    }
    setIsCreating(true);
    const result = await window.api.backup.create();
    setIsCreating(false);

    if (result.success) {
      addNotification({
        type: 'success',
        titre: 'Sauvegarde créée',
        message: `${result.name} (${formatSize(result.size)})`
      });
      await loadStatus();
    } else {
      addNotification({ type: 'danger', titre: 'Erreur sauvegarde', message: result.error });
      alert('Erreur : ' + result.error);
    }
  };

  const handleRestoreFromList = async (backup) => {
    setConfirmRestore(backup);
  };

  const executeRestore = async () => {
    if (!confirmRestore) return;
    setIsRestoring(true);
    const result = await window.api.backup.restore(confirmRestore.path);
    setIsRestoring(false);
    setConfirmRestore(null);

    if (result.success) {
      alert('Sauvegarde restaurée avec succès !\nL\'application va se recharger.');
      window.location.reload();
    } else {
      alert('Erreur de restauration : ' + result.error);
    }
  };

  const handleRestoreFromFile = async () => {
    const ok = await confirm({
      type: 'danger',
      title: 'Restaurer depuis un fichier',
      message: 'Restaurer va écraser toutes vos données actuelles avec celles du fichier de sauvegarde.\n\nCette action est irréversible.',
      confirmText: 'Restaurer',
      cancelText: 'Annuler'
    });
    if (!ok) return;
    setIsRestoring(true);
    const result = await window.api.backup.restoreFromFile();
    setIsRestoring(false);

    if (result.success) {
      alert('Sauvegarde restaurée avec succès !\nL\'application va se recharger.');
      window.location.reload();
    } else if (!result.canceled) {
      alert('Erreur : ' + result.error);
    }
  };

  const handleDeleteBackup = async (backup) => {
    const ok = await confirm({
      type: 'danger',
      title: 'Supprimer cette sauvegarde',
      message: `La sauvegarde "${backup.name}" sera définitivement supprimée.`,
      confirmText: 'Supprimer',
      cancelText: 'Annuler'
    });
    if (!ok) return;
    await window.api.backup.delete(backup.path);
    await loadStatus();
  };

  const handleOpenFolder = async () => {
    await window.api.backup.openFolder();
  };

  const autoActif = parametres.backup_auto === 'true';

  return (
    <>
      <div className="card mb-6">
        <div className="card-header">
          <div className="card-title">
            <div className="card-title-icon" style={{ background: 'linear-gradient(135deg, #0ea5e9, #06b6d4)' }}>
              <Cloud size={16} />
            </div>
            Sauvegarde automatique
          </div>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Sauvegardez vos données dans un dossier local. Astuce : utilisez un dossier Dropbox, Google Drive ou OneDrive pour une sauvegarde cloud automatique.
        </div>

        {/* Dossier de backup */}
        <div className="form-group">
          <label className="form-label">Dossier de sauvegarde</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              value={parametres.backup_folder || ''}
              readOnly
              placeholder="Aucun dossier sélectionné"
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
            <button className="btn btn-secondary" onClick={handleSelectFolder}>
              <FolderOpen size={14} /> Parcourir
            </button>
            {status?.configured && (
              <button className="btn btn-ghost btn-icon" onClick={handleOpenFolder} title="Ouvrir le dossier">
                <FolderOpen size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Backup auto toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 14, background: 'var(--bg-tertiary)', borderRadius: 12, marginBottom: 14
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Sauvegarde automatique quotidienne</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Une sauvegarde est créée automatiquement à la fermeture du logiciel (1 fois par jour max)
            </div>
          </div>
          <div className={`toggle ${autoActif ? 'active' : ''}`} onClick={handleToggleAuto} />
        </div>

        {/* Statut */}
        {status?.configured && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16
          }}>
            <StatusItem
              icon={<HardDrive size={16} />}
              label="Sauvegardes"
              value={status.backupCount}
              color="#3b82f6"
            />
            <StatusItem
              icon={<Cloud size={16} />}
              label="Taille totale"
              value={formatSize(status.totalSize)}
              color="#10b981"
            />
            <StatusItem
              icon={<Clock size={16} />}
              label="Dernière"
              value={status.lastDate ? formatRelative(status.lastDate) : 'Jamais'}
              color="#f59e0b"
            />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={handleCreateBackup}
            disabled={!status?.configured || isCreating}
          >
            {isCreating ? <><div className="spinner" /> Sauvegarde en cours...</> : <><Download size={14} /> Sauvegarder maintenant</>}
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => setShowBackupsModal(true)}
            disabled={!status?.configured || backups.length === 0}
          >
            <HardDrive size={14} /> Voir les sauvegardes ({backups.length})
          </button>

          <button
            className="btn btn-ghost"
            onClick={handleRestoreFromFile}
            disabled={isRestoring}
          >
            <Upload size={14} /> Restaurer depuis un fichier
          </button>
        </div>

        {!status?.configured && (
          <div style={{
            marginTop: 14, padding: 12,
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 12
          }}>
            <AlertCircle size={16} style={{ color: '#f59e0b' }} />
            Configurez un dossier de sauvegarde pour activer le backup.
          </div>
        )}
      </div>

      {/* Modal liste des backups */}
      <Modal
        isOpen={showBackupsModal}
        onClose={() => setShowBackupsModal(false)}
        title={`Sauvegardes disponibles (${backups.length})`}
        size="lg"
      >
        {backups.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><HardDrive size={28} /></div>
            <div className="empty-state-title">Aucune sauvegarde</div>
            <div className="empty-state-text">Cliquez sur "Sauvegarder maintenant" pour en créer une</div>
          </div>
        ) : (
          <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
            {backups.map((b, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: 14, marginBottom: 8,
                background: 'var(--bg-tertiary)',
                borderRadius: 12
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: 'rgba(59, 130, 246, 0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#3b82f6', flexShrink: 0
                }}>
                  <HardDrive size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                    {b.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {new Date(b.created_at).toLocaleString('fr-FR')} • {formatSize(b.size)}
                  </div>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleRestoreFromList(b)}
                  disabled={isRestoring}
                >
                  <RotateCcw size={12} /> Restaurer
                </button>
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={() => handleDeleteBackup(b)}
                >
                  <Trash2 size={13} style={{ color: '#ef4444' }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Modal confirmation restauration */}
      {confirmRestore && (
        <Modal
          isOpen={true}
          onClose={() => setConfirmRestore(null)}
          title="Confirmer la restauration"
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmRestore(null)}>Annuler</button>
              <button className="btn btn-danger" onClick={executeRestore} disabled={isRestoring}>
                {isRestoring ? <><div className="spinner" /> Restauration...</> : <><RotateCcw size={14} /> Confirmer</>}
              </button>
            </>
          }
        >
          <div style={{
            padding: 16,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 12,
            marginBottom: 14,
            display: 'flex', gap: 12, alignItems: 'flex-start'
          }}>
            <AlertCircle size={20} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 13 }}>
              <strong>Attention :</strong> Cette action va <strong>écraser toutes vos données actuelles</strong> avec celles de la sauvegarde. Cette action est irréversible.
            </div>
          </div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Vous êtes sur le point de restaurer :
          </div>
          <div style={{
            padding: 12,
            background: 'var(--bg-tertiary)',
            borderRadius: 10,
            fontFamily: 'var(--font-mono)',
            fontSize: 12
          }}>
            {confirmRestore.name}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-display)' }}>
              Créé le {new Date(confirmRestore.created_at).toLocaleString('fr-FR')}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function StatusItem({ icon, label, value, color }) {
  return (
    <div style={{
      padding: 12,
      background: 'var(--bg-tertiary)',
      borderRadius: 10,
      display: 'flex', alignItems: 'center', gap: 10
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: color + '20', color,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{value}</div>
      </div>
    </div>
  );
}

function formatSize(bytes) {
  if (!bytes) return '0 o';
  const k = 1024;
  const sizes = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatRelative(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = (now - date) / 1000;
  if (diff < 60) return 'À l\'instant';
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)} j`;
  return date.toLocaleDateString('fr-FR');
}

function ThemeOption({ active, icon, label, preview, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: 16,
        borderRadius: 'var(--radius-lg)',
        border: '2px solid ' + (active ? 'var(--accent-blue)' : 'var(--border-color)'),
        cursor: 'pointer',
        transition: 'all 150ms',
        background: active ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-card)'
      }}
    >
      <div style={{
        height: 70,
        background: preview.bg,
        borderRadius: 10,
        marginBottom: 10,
        padding: 8,
        display: 'flex',
        gap: 6,
        border: '1px solid ' + (active ? 'var(--accent-blue)' : 'var(--border-color)')
      }}>
        <div style={{ width: 20, background: preview.card, borderRadius: 4 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ height: 10, background: preview.card, borderRadius: 2 }} />
          <div style={{ display: 'flex', gap: 4 }}>
            <div style={{ flex: 1, height: 18, background: preview.accent, borderRadius: 3 }} />
            <div style={{ flex: 1, height: 18, background: preview.card, borderRadius: 3 }} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon}
          <span style={{ fontWeight: 600 }}>{label}</span>
        </div>
        {active && <Check size={16} style={{ color: 'var(--accent-blue)' }} />}
      </div>
    </div>
  );
}

// ============================================
// Section Configuration Email + SMTP
// ============================================
function EmailConfigSection({ form, setForm, showPassword, setShowPassword }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Raccourcis de configuration pour les fournisseurs courants
  const presets = [
    { name: 'Gmail', host: 'smtp.gmail.com', port: '587', secure: false, help: 'Nécessite un mot de passe d\'application' },
    { name: 'Outlook', host: 'smtp.office365.com', port: '587', secure: false, help: 'Avec votre email Outlook/Hotmail' },
    { name: 'Yahoo', host: 'smtp.mail.yahoo.com', port: '587', secure: false, help: 'Mot de passe d\'application requis' },
    { name: 'Orange', host: 'smtp.orange.fr', port: '465', secure: true, help: 'Port SSL 465' },
    { name: 'SFR', host: 'smtp.sfr.fr', port: '465', secure: true, help: 'Port SSL 465' },
    { name: 'OVH', host: 'ssl0.ovh.net', port: '465', secure: true, help: 'Pour les emails OVH Pro' },
    { name: 'Infomaniak', host: 'mail.infomaniak.com', port: '587', secure: false, help: 'Port STARTTLS 587' }
  ];

  const applyPreset = (preset) => {
    setForm({
      ...form,
      smtp_host: preset.host,
      smtp_port: preset.port,
      smtp_secure: String(preset.secure)
    });
  };

  const handleTest = async () => {
    // Sauvegarde d'abord les paramètres actuels en DB pour que le test les utilise
    const keys = ['email_expediteur', 'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_password'];
    await Promise.all(keys.map(k => window.api.parametres.set(k, form[k] || '')));

    setTesting(true);
    setTestResult(null);
    const result = await window.api.smtp.test();
    setTesting(false);
    setTestResult(result);
  };

  return (
    <div className="card mb-6">
      <div className="card-header">
        <div className="card-title">
          <div className="card-title-icon"><Mail size={16} /></div>
          Configuration Email
        </div>
      </div>

      {/* Email expéditeur et destinataire */}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Email expéditeur</label>
          <input
            className="form-input"
            type="email"
            value={form.email_expediteur || ''}
            onChange={(e) => setForm({ ...form, email_expediteur: e.target.value })}
            placeholder="vous@exemple.fr"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Email du comptable</label>
          <input
            className="form-input"
            type="email"
            value={form.email_comptable || ''}
            onChange={(e) => setForm({ ...form, email_comptable: e.target.value })}
            placeholder="comptable@exemple.fr"
          />
        </div>
      </div>

      {/* Préréglages rapides */}
      <div className="form-group">
        <label className="form-label">Configuration rapide</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {presets.map(p => (
            <button
              key={p.name}
              onClick={() => applyPreset(p)}
              className="btn btn-ghost btn-sm"
              style={{
                border: '1px solid var(--border-color)',
                background: form.smtp_host === p.host ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                color: form.smtp_host === p.host ? 'var(--accent-blue)' : 'var(--text-secondary)'
              }}
              title={p.help}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          Cliquez sur votre fournisseur pour pré-remplir les champs SMTP
        </div>
      </div>

      {/* SMTP détaillé */}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Serveur SMTP</label>
          <input
            className="form-input"
            value={form.smtp_host || ''}
            onChange={(e) => setForm({ ...form, smtp_host: e.target.value })}
            placeholder="smtp.gmail.com"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Port</label>
          <input
            className="form-input"
            type="number"
            value={form.smtp_port || ''}
            onChange={(e) => setForm({ ...form, smtp_port: e.target.value })}
            placeholder="587"
          />
        </div>
      </div>

      {/* SSL/TLS */}
      <div className="form-group">
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 12, background: 'var(--bg-tertiary)', borderRadius: 10
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Connexion SSL/TLS</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Activer pour le port 465 (SSL implicite), désactiver pour 587 (STARTTLS)
            </div>
          </div>
          <div
            className={`toggle ${form.smtp_secure === 'true' ? 'active' : ''}`}
            onClick={() => setForm({ ...form, smtp_secure: form.smtp_secure === 'true' ? 'false' : 'true' })}
          />
        </div>
      </div>

      {/* Mot de passe */}
      <div className="form-group">
        <label className="form-label">Mot de passe d'application</label>
        <div style={{ position: 'relative' }}>
          <input
            className="form-input"
            type={showPassword ? 'text' : 'password'}
            value={form.smtp_password || ''}
            onChange={(e) => setForm({ ...form, smtp_password: e.target.value })}
            placeholder="••••••••••••••••"
            style={{ paddingRight: 44, fontFamily: 'var(--font-mono)' }}
          />
          <button
            onClick={() => setShowPassword(!showPassword)}
            style={{
              position: 'absolute', right: 10, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--text-muted)'
            }}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
          💡 <strong>Gmail / Yahoo</strong> : générez un <em>mot de passe d'application</em> dans les paramètres de sécurité de votre compte (la 2FA doit être activée).
        </div>
      </div>

      {/* Bouton test */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        <button
          className="btn btn-secondary"
          onClick={handleTest}
          disabled={testing || !form.smtp_host || !form.email_expediteur || !form.smtp_password}
        >
          {testing ? <><div className="spinner" /> Test en cours...</> : <><CheckCircle2 size={14} /> Tester la connexion</>}
        </button>

        {testResult && (
          <div style={{
            padding: '8px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: 12,
            fontWeight: 600,
            background: testResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: testResult.success ? '#10b981' : '#ef4444',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            maxWidth: 500
          }}>
            {testResult.success
              ? <><CheckCircle2 size={14} /> Connexion SMTP réussie !</>
              : <><AlertCircle size={14} /> {testResult.error}</>
            }
          </div>
        )}
      </div>
    </div>
  );
}