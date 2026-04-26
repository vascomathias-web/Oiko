import React, { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import {
    Sparkles, User, Mail, Bot, HardDrive, Shield, Check,
    ArrowRight, ArrowLeft, X, ExternalLink, FolderOpen,
    Eye, EyeOff, AlertCircle, CheckCircle2
} from 'lucide-react';

const SMTP_PRESETS = [
    { name: "Gmail", host: "smtp.gmail.com", port: "587", secure: "false" },
    { name: 'Outlook', host: 'smtp.office365.com', port: '587', secure: 'false' },
    { name: 'Yahoo', host: 'smtp.mail.yahoo.com', port: '587', secure: 'false' },
    { name: 'Orange', host: 'smtp.orange.fr', port: '465', secure: 'true' },
    { name: 'SFR', host: 'smtp.sfr.fr', port: '465', secure: 'true' },
    { name: 'OVH', host: 'ssl0.ovh.net', port: '465', secure: 'true' },
    { name: 'Infomaniak', host: 'mail.infomaniak.com', port: '587', secure: 'false' }
];

export default function WelcomeModal({ onclose }) {
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

        await window.api.parametres.set('first_launch_done', 'true');

        // 🔄 Recharge les paramètres dans tout React (header, settings, etc.)
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

    const isWizardValid = async () => {

    }

    const handleSkipAll = async () => {
        if (!isWizardValid) return;

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
            canSkip: true
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

    //Bouton Suivant
    const handleNext = () => {

        if (isLast) {
            handleFinish();
        } else {
            setStep(prev => prev + 1);
        }
    };

    //Bouton précédent
    const handlePrev = () => {
        setStep(prev => Math.max(0, prev - 1));
    };

    //Bouton Passer cette étape
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
                <div style={{
                    minHeight: 450,
                    padding: '32px 32px 16px',
                    overflow: 'scroll'
                }}>
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
                        style={{
                            background: current.color,
                            borderColor: current.color
                        }}
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
                Toutes les étapes sont <strong>modifiables</strong> plus tard dans les Paramètres.
            </p>
        </div>
    );
}

// ============================================
// SLIDE 2 : Backup
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

  return (
    <SlideLayout
      icon={HardDrive}
      color="#10b981"
      title="Sauvegardes automatiques"
      subtitle="Protégez vos données contre les pertes accidentelles"
    >

      <div style={{
        padding: 14, marginBottom: 16,
        background: 'rgba(16, 185, 129, 0.08)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        borderRadius: 10, fontSize: 12.5, lineHeight: 1.6
      }}>
        <strong>💡 Astuce</strong> : choisissez un dossier synchronisé avec{' '}
        <strong>OneDrive, Dropbox ou Google Drive</strong> pour bénéficier d'une copie cloud automatique.
      </div>

      <div className="form-group">
        <div>
            <label className="form-label">Dossier de sauvegarde</label>
            
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
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
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          Une sauvegarde sera créée automatiquement à chaque fermeture de l'application (1× par jour).
        </div>
      </div>
    </SlideLayout>
  );
}