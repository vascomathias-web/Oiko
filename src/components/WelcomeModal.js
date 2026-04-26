import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Sparkles, User, Mail, Bot, HardDrive, Shield, Check,
  ArrowRight, ArrowLeft, X, ExternalLink, FolderOpen,
  Eye, EyeOff, AlertCircle, CheckCircle2
} from 'lucide-react';

const SMTP_PRESETS = [
  { name: 'Gmail', host: 'smtp.gmail.com', port: '587', secure: 'false' },
  { name: 'Outlook', host: 'smtp.office365.com', port: '587', secure: 'false' },
  { name: 'Yahoo', host: 'smtp.mail.yahoo.com', port: '587', secure: 'false' },
  { name: 'Orange', host: 'smtp.orange.fr', port: '465', secure: 'true' },
  { name: 'SFR', host: 'smtp.sfr.fr', port: '465', secure: 'true' },
  { name: 'OVH', host: 'ssl0.ovh.net', port: '465', secure: 'true' },
  { name: 'Infomaniak', host: 'mail.infomaniak.com', port: '587', secure: 'false' }
];

export default function WelcomeModal({ onClose }) {
  const { addNotification, loadParametres } = useApp();
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    user_name: '',
    user_email: '',
    email_expediteur: '',
    email_comptable: '',
    smtp_host: '',
    smtp_port: '587',
    smtp_secure: 'false',
    smtp_password: '',
    gemini_api_key: '',
    backup_folder: '',
    backup_choice: '',
    recovery_email: ''
  });

  const updateData = (field, value) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  // Sauvegarde toutes les données collectées + marque le premier lancement comme terminé
  const handleFinish = async () => {
    const keysToSave = [
      'user_name', 'user_email',
      'email_expediteur', 'email_comptable',
      'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_password',
      'gemini_api_key', 'backup_folder', 'recovery_email'
    ];

    for (const key of keysToSave) {
      if (data[key] && data[key].trim() !== '') {
        await window.api.parametres.set(key, data[key]);
      }
    }

    // Applique le choix backup (activé ou désactivé explicitement)
    if (data.backup_choice === 'enabled') {
      await window.api.parametres.set('backup_auto', 'true');
    } else if (data.backup_choice === 'disabled') {
      await window.api.parametres.set('backup_auto', 'false');
    }

    await window.api.parametres.set('first_launch_done', 'true');

    // Recharge les paramètres dans tout React (header, settings, etc.)
    if (loadParametres) {
      await loadParametres();
    }

    addNotification({
      type: 'success',
      titre: 'Configuration terminée',
      message: `Bienvenue ${data.user_name || 'dans GestImmo'} ! Tout est prêt.`
    });

    onClose();
  };

  const handleSkipAll = async () => {
    await window.api.parametres.set('first_launch_done', 'true');
    if (loadParametres) {
      await loadParametres();
    }
    onClose();
  };

  // Définition des slides
  const slides = [
    {
      component: <WelcomeSlide />,
      color: '#3b82f6',
      canSkip: false
    },
    {
      component: (
        <ProfileSlide data={data} updateData={updateData} />
      ),
      color: '#8b5cf6',
      canSkip: true
    },
    {
      component: (
        <SmtpSlide data={data} updateData={updateData} />
      ),
      color: '#f59e0b',
      canSkip: true
    },
    {
      component: (
        <GeminiSlide data={data} updateData={updateData} />
      ),
      color: '#06b6d4',
      canSkip: true
    },
    {
      component: (
        <BackupSlide data={data} updateData={updateData} />
      ),
      color: '#10b981',
      canSkip: false
    },
    {
      component: (
        <RecoverySlide data={data} updateData={updateData} />
      ),
      color: '#ef4444',
      canSkip: true
    },
    {
      component: <FinishSlide data={data} />,
      color: '#10b981',
      canSkip: false
    }
  ];

  const current = slides[step];
  const isLast = step === slides.length - 1;
  const isFirst = step === 0;

  const handleNext = () => {
    // Validation étape 5 (Backup) : obligatoire de faire un choix conscient
    if (step === 4) {
      const hasChoice = data.backup_choice === 'enabled' || data.backup_choice === 'disabled';
      if (!hasChoice) {
        return; // Bouton disabled empêchera normalement d'arriver ici, mais double-sécurité
      }
      if (data.backup_choice === 'enabled' && !data.backup_folder) {
        return; // Le dossier est obligatoire si backup activé
      }
    }

    if (isLast) {
      handleFinish();
    } else {
      setStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    setStep(prev => Math.max(0, prev - 1));
  };

  const handleSkip = () => {
    setStep(prev => Math.min(slides.length - 1, prev + 1));
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 3000 }}>
      <div className="modal" style={{
        maxWidth: 620,
        minHeight: 600,
        padding: 0,
        overflow: 'hidden',
        background: 'var(--bg-card)'
      }}>
        {/* Header coloré */}
        <div style={{
          background: `linear-gradient(135deg, ${current.color}, ${current.color}dd)`,
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: 'white'
        }}>
          <Sparkles size={18} />
          <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>
            Configuration GestImmo
          </div>
          <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600 }}>
            Étape {step + 1} / {slides.length}
          </div>
          <button
            onClick={handleSkipAll}
            style={{
              width: 26, height: 26,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255, 255, 255, 0.2)',
              borderRadius: 6, color: 'white',
              border: 'none', cursor: 'pointer'
            }}
            title="Passer toute la configuration"
          >
            <X size={14} />
          </button>
        </div>

        {/* Contenu de la slide */}
        <div style={{ minHeight: 450, padding: '32px 32px 16px' }}>
          {current.component}
        </div>

        {/* Indicateurs (dots) */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 6,
          padding: '0 32px 12px'
        }}>
          {slides.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? 24 : 8,
                height: 8,
                borderRadius: 4,
                background: i === step ? current.color : 'var(--border-color)',
                transition: 'all 200ms'
              }}
            />
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px 22px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderTop: '1px solid var(--border-color)'
        }}>
          {!isFirst && (
            <button
              className="btn btn-ghost"
              onClick={handlePrev}
              disabled={isFirst}
              style={{ opacity: isFirst ? 0.3 : 1 }}
            >
              <ArrowLeft size={14} /> Précédent
            </button>
          )}

          <div style={{ flex: 1 }} />

          {current.canSkip && !isLast && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleSkip}
              style={{ color: 'var(--text-muted)' }}
            >
              Passer cette étape
            </button>
          )}

          <button
            className="btn btn-primary"
            onClick={handleNext}
            disabled={
              step === 4 && (
                !data.backup_choice ||
                (data.backup_choice === 'enabled' && !data.backup_folder)
              )
            }
            style={{
              background: current.color,
              borderColor: current.color,
              opacity: (
                step === 4 && (
                  !data.backup_choice ||
                  (data.backup_choice === 'enabled' && !data.backup_folder)
                )
              ) ? 0.5 : 1,
              cursor: (
                step === 4 && (
                  !data.backup_choice ||
                  (data.backup_choice === 'enabled' && !data.backup_folder)
                )
              ) ? 'not-allowed' : 'pointer'
            }}
            title={
              step === 4 && !data.backup_choice
                ? 'Veuillez choisir une option pour continuer'
                : step === 4 && data.backup_choice === 'enabled' && !data.backup_folder
                  ? 'Veuillez choisir un dossier de sauvegarde'
                  : ''
            }
          >
            {isLast
              ? <><Check size={14} /> Commencer à utiliser GestImmo</>
              : <>Suivant <ArrowRight size={14} /></>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SLIDE 1 : Bienvenue
// ============================================
function WelcomeSlide() {
  return (
    <div style={{ textAlign: 'center', padding: '20px 10px' }}>
      <div style={{
        width: 100, height: 100, margin: '0 auto 24px',
        borderRadius: 24,
        background: 'linear-gradient(135deg, #38bdf8, #2563eb)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 12px 32px rgba(59, 130, 246, 0.4)'
      }}>
        <Sparkles size={50} color="white" />
      </div>
      <h2 style={{
        fontSize: 26, fontWeight: 800,
        marginBottom: 10, letterSpacing: '-0.02em'
      }}>
        Bienvenue dans GestImmo !
      </h2>
      <p style={{
        fontSize: 14, color: 'var(--text-secondary)',
        lineHeight: 1.6, maxWidth: 460, margin: '0 auto'
      }}>
        Avant de commencer, prenons quelques minutes pour configurer votre application.
        <br /><br />
        Toutes les étapes sont <strong>optionnelles</strong> et modifiables plus tard dans les Paramètres.
      </p>
    </div>
  );
}

// ============================================
// SLIDE 2 : Profil
// ============================================
function ProfileSlide({ data, updateData }) {
  return (
    <SlideLayout
      icon={User}
      color="#8b5cf6"
      title="Votre profil"
      subtitle="Comment souhaitez-vous être appelé ?"
    >
      <div className="form-group">
        <label className="form-label">Nom complet</label>
        <input
          type="text"
          className="form-input"
          value={data.user_name}
          onChange={(e) => updateData('user_name', e.target.value)}
          placeholder="Jean Dupont"
          autoFocus
        />
      </div>

      <div className="form-group">
        <label className="form-label">Adresse email</label>
        <input
          type="email"
          className="form-input"
          value={data.user_email}
          onChange={(e) => updateData('user_email', e.target.value)}
          placeholder="vous@exemple.fr"
        />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          Cette adresse sera utilisée par défaut pour l'envoi d'emails et la zone d'administration.
        </div>
      </div>
    </SlideLayout>
  );
}

// ============================================
// SLIDE 3 : SMTP
// ============================================
function SmtpSlide({ data, updateData }) {
  const [showPassword, setShowPassword] = useState(false);

  const applyPreset = (preset) => {
    updateData('smtp_host', preset.host);
    updateData('smtp_port', preset.port);
    updateData('smtp_secure', preset.secure);
    if (!data.email_expediteur && data.user_email) {
      updateData('email_expediteur', data.user_email);
    }
  };

  return (
    <SlideLayout
      icon={Mail}
      color="#f59e0b"
      title="Configuration email"
      subtitle="Pour envoyer vos fichiers Excel directement à votre comptable"
    >
      <div style={{
        padding: 12, marginBottom: 14,
        background: 'rgba(245, 158, 11, 0.08)',
        border: '1px solid rgba(245, 158, 11, 0.2)',
        borderRadius: 8, fontSize: 12, lineHeight: 1.5
      }}>
        💡 <strong>Gmail</strong> : générez un <em>mot de passe d'application</em> sur{' '}
        <strong>myaccount.google.com/apppasswords</strong> (2FA requise).
      </div>

      <div className="form-group">
        <label className="form-label">Choisissez votre fournisseur</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SMTP_PRESETS.map(p => (
            <button
              key={p.name}
              onClick={() => applyPreset(p)}
              className="btn btn-ghost btn-sm"
              style={{
                border: '1px solid var(--border-color)',
                background: data.smtp_host === p.host ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                color: data.smtp_host === p.host ? '#f59e0b' : 'var(--text-secondary)'
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Email expéditeur</label>
          <input
            type="email"
            className="form-input"
            value={data.email_expediteur}
            onChange={(e) => updateData('email_expediteur', e.target.value)}
            placeholder="vous@gmail.com"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Email comptable</label>
          <input
            type="email"
            className="form-input"
            value={data.email_comptable}
            onChange={(e) => updateData('email_comptable', e.target.value)}
            placeholder="comptable@exemple.fr"
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Mot de passe d'application</label>
        <div style={{ position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            className="form-input"
            value={data.smtp_password}
            onChange={(e) => updateData('smtp_password', e.target.value)}
            placeholder="••••••••••••••••"
            style={{ paddingRight: 40, fontFamily: 'var(--font-mono)' }}
          />
          <button
            onClick={() => setShowPassword(!showPassword)}
            style={{
              position: 'absolute', right: 10, top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              background: 'transparent', border: 'none', cursor: 'pointer'
            }}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
    </SlideLayout>
  );
}

// ============================================
// SLIDE 4 : Gemini
// ============================================
function GeminiSlide({ data, updateData }) {
  const [showKey, setShowKey] = useState(false);

  const openGeminiPage = () => {
    window.api?.shell?.openExternal?.('https://aistudio.google.com/app/apikey');
  };

  return (
    <SlideLayout
      icon={Bot}
      color="#06b6d4"
      title="Assistant IA Gemini"
      subtitle="Pour analyser vos factures et obtenir de l'aide intelligente"
    >
      <div style={{
        padding: 14, marginBottom: 16,
        background: 'rgba(6, 182, 212, 0.08)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
        borderRadius: 10, fontSize: 12.5, lineHeight: 1.6
      }}>
        <strong>L'IA Gemini permet de :</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li>Analyser automatiquement vos factures (PDF/image)</li>
          <li>Répondre à vos questions sur la fiscalité immobilière</li>
          <li>Vous guider dans l'utilisation du logiciel</li>
        </ul>
      </div>

      <button
        className="btn btn-secondary"
        onClick={openGeminiPage}
        style={{ width: '100%', marginBottom: 14 }}
      >
        <ExternalLink size={14} /> Obtenir une clé API gratuite
      </button>

      <div className="form-group">
        <label className="form-label">Clé API Gemini</label>
        <div style={{ position: 'relative' }}>
          <input
            type={showKey ? 'text' : 'password'}
            className="form-input"
            value={data.gemini_api_key}
            onChange={(e) => updateData('gemini_api_key', e.target.value)}
            placeholder="AIzaSy..."
            style={{ paddingRight: 40, fontFamily: 'var(--font-mono)', fontSize: 12 }}
          />
          <button
            onClick={() => setShowKey(!showKey)}
            style={{
              position: 'absolute', right: 10, top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              background: 'transparent', border: 'none', cursor: 'pointer'
            }}
          >
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          La clé est stockée localement et chiffrée.
        </div>
      </div>
    </SlideLayout>
  );
}

// ============================================
// SLIDE 5 : Backup (OBLIGATOIRE - choix conscient)
// ============================================
function BackupSlide({ data, updateData }) {
  const [picking, setPicking] = useState(false);

  const pickFolder = async () => {
    setPicking(true);
    try {
      const result = await window.api.backup?.pickFolder?.();
      if (result?.success && result?.path) {
        updateData('backup_folder', result.path);
      }
    } catch (err) {
      console.error('Erreur sélection dossier:', err);
    }
    setPicking(false);
  };

  const selectChoice = (choice) => {
    updateData('backup_choice', choice);
    // Si désactivé, on efface le chemin éventuellement déjà saisi
    if (choice === 'disabled') {
      updateData('backup_folder', '');
    }
  };

  return (
    <SlideLayout
      icon={HardDrive}
      color="#10b981"
      title="Sauvegardes automatiques"
      subtitle="Choix obligatoire — vos données en dépendent"
    >
      <div style={{
        padding: 12, marginBottom: 18,
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderRadius: 8, fontSize: 12, lineHeight: 1.5
      }}>
        ⚠️ <strong>Cette étape est obligatoire.</strong> GestImmo stocke des données financières importantes (loyers, factures, locataires). Un choix conscient protège vos informations.
      </div>

      {/* 2 grandes cards de choix */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {/* Card OUI */}
        <button
          onClick={() => selectChoice('enabled')}
          style={{
            padding: '20px 16px',
            background: data.backup_choice === 'enabled' ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-tertiary)',
            border: data.backup_choice === 'enabled' ? '2px solid #10b981' : '2px solid var(--border-color)',
            borderRadius: 12,
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 150ms'
          }}
        >
          <CheckCircle2
            size={28}
            style={{
              color: data.backup_choice === 'enabled' ? '#10b981' : 'var(--text-muted)',
              marginBottom: 8
            }}
          />
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            Activer les sauvegardes
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Recommandé — protection automatique
          </div>
        </button>

        {/* Card NON */}
        <button
          onClick={() => selectChoice('disabled')}
          style={{
            padding: '20px 16px',
            background: data.backup_choice === 'disabled' ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-tertiary)',
            border: data.backup_choice === 'disabled' ? '2px solid #ef4444' : '2px solid var(--border-color)',
            borderRadius: 12,
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 150ms'
          }}
        >
          <AlertCircle
            size={28}
            style={{
              color: data.backup_choice === 'disabled' ? '#ef4444' : 'var(--text-muted)',
              marginBottom: 8
            }}
          />
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            Désactiver
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Risqué — aucune protection
          </div>
        </button>
      </div>

      {/* Si OUI : sélecteur de dossier obligatoire */}
      {data.backup_choice === 'enabled' && (
        <div style={{
          padding: 14,
          background: 'rgba(16, 185, 129, 0.05)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: 10
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
            📁 Où stocker vos sauvegardes ?
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              className="form-input"
              value={data.backup_folder}
              onChange={(e) => updateData('backup_folder', e.target.value)}
              placeholder="C:\Users\...\Backups\GestImmo"
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
            <button
              className="btn btn-secondary"
              onClick={pickFolder}
              disabled={picking}
            >
              {picking ? <div className="spinner" /> : <FolderOpen size={14} />}
              {picking ? '' : 'Parcourir'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            💡 Astuce : un dossier dans OneDrive, Dropbox ou Google Drive vous donne une copie cloud automatique.
          </div>
        </div>
      )}

      {/* Si NON : avertissement fort */}
      {data.backup_choice === 'disabled' && (
        <div style={{
          padding: 14,
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: 10
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#ef4444' }}>
            ⚠️ Vous avez désactivé les sauvegardes
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Sans sauvegarde automatique :
            <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
              <li>Perte définitive des données en cas de panne du PC</li>
              <li>Impossible de revenir en arrière après une erreur de manipulation</li>
              <li>Aucune restauration possible en cas de suppression accidentelle</li>
            </ul>
            <div style={{ marginTop: 8, fontSize: 11, fontStyle: 'italic' }}>
              Vous pouvez réactiver les sauvegardes à tout moment dans <strong>Paramètres → Sauvegarde</strong>.
            </div>
          </div>
        </div>
      )}
    </SlideLayout>
  );
}

// ============================================
// SLIDE 6 : Email récupération admin
// ============================================
function RecoverySlide({ data, updateData }) {
  // Pré-remplit avec l'email expéditeur si disponible
  useEffect(() => {
    if (!data.recovery_email && data.email_expediteur) {
      updateData('recovery_email', data.email_expediteur);
    }
  }, [data.email_expediteur]);

  return (
    <SlideLayout
      icon={Shield}
      color="#ef4444"
      title="Email de récupération admin"
      subtitle="Pour accéder à la zone de gestion avancée"
    >
      <div style={{
        padding: 14, marginBottom: 16,
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderRadius: 10, fontSize: 12.5, lineHeight: 1.6
      }}>
        <strong>🛡️ Sécurité 2FA</strong>
        <p style={{ margin: '6px 0 0' }}>
          La zone d'administration (réinitialisation, suppression de données...) est protégée par un code 2FA envoyé à cette adresse. Choisissez un email auquel vous avez toujours accès.
        </p>
      </div>

      <div className="form-group">
        <label className="form-label">Email de récupération</label>
        <input
          type="email"
          className="form-input"
          value={data.recovery_email}
          onChange={(e) => updateData('recovery_email', e.target.value)}
          placeholder="vous@exemple.fr"
        />
      </div>
    </SlideLayout>
  );
}

// ============================================
// SLIDE 7 : Finalisation
// ============================================
function FinishSlide({ data }) {
  const backupLabel = data.backup_choice === 'enabled'
    ? 'Sauvegardes activées'
    : data.backup_choice === 'disabled'
      ? 'Sauvegardes désactivées (choix assumé)'
      : 'Sauvegardes non configurées';
  const backupFilled = data.backup_choice === 'enabled'
    ? !!data.backup_folder
    : data.backup_choice === 'disabled';

  const checks = [
    { label: 'Profil utilisateur', filled: !!data.user_name },
    { label: 'Configuration SMTP', filled: !!(data.smtp_host && data.smtp_password) },
    { label: 'Clé API Gemini', filled: !!data.gemini_api_key },
    { label: backupLabel, filled: backupFilled },
    { label: 'Email de récupération admin', filled: !!data.recovery_email }
  ];

  const filledCount = checks.filter(c => c.filled).length;

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: 80, height: 80, margin: '0 auto 16px',
        borderRadius: 20,
        background: 'linear-gradient(135deg, #10b981, #059669)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 24px rgba(16, 185, 129, 0.4)'
      }}>
        <CheckCircle2 size={40} color="white" />
      </div>

      <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
        {data.user_name ? `Bienvenue ${data.user_name} !` : 'Configuration terminée !'}
      </h2>

      <p style={{
        fontSize: 13, color: 'var(--text-secondary)',
        marginBottom: 22, maxWidth: 440, margin: '0 auto 22px'
      }}>
        {filledCount === checks.length
          ? 'Tout est configuré, vous êtes prêt à utiliser GestImmo à 100% !'
          : `${filledCount} / ${checks.length} étapes configurées. Vous pourrez compléter le reste plus tard dans les Paramètres.`}
      </p>

      {/* Récap */}
      <div style={{
        background: 'var(--bg-tertiary)',
        borderRadius: 12,
        padding: 16,
        textAlign: 'left',
        maxWidth: 380,
        margin: '0 auto'
      }}>
        {checks.map((check, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '6px 0',
              fontSize: 13,
              color: check.filled ? 'var(--text-primary)' : 'var(--text-muted)'
            }}
          >
            {check.filled
              ? <CheckCircle2 size={16} style={{ color: '#10b981', flexShrink: 0 }} />
              : <div style={{
                width: 16, height: 16, borderRadius: '50%',
                border: '2px solid var(--border-color)', flexShrink: 0
              }} />
            }
            <span style={{ textDecoration: check.filled ? 'none' : 'none' }}>
              {check.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// LAYOUT commun pour les slides de formulaire
// ============================================
function SlideLayout({ icon: Icon, color, title, subtitle, children }) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        marginBottom: 20
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: color + '20', color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0
        }}>
          <Icon size={24} />
        </div>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{title}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {subtitle}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}