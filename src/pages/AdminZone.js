import React, { useState, useEffect, useRef } from 'react';
import Modal from '../components/Modal';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../components/ConfirmDialog';
import {
  ShieldAlert, Mail, Send, KeyRound, AlertCircle, CheckCircle2,
  Building2, Users, CircleDollarSign, FileSpreadsheet, Bell, Bot,
  Trash2, Lock, RefreshCw, Edit, Power
} from 'lucide-react';

const STEPS = {
  CHECK: 'check',           // chargement initial
  INIT_EMAIL: 'init_email', // première fois : config email
  REQUEST: 'request',       // demande code 2FA
  VERIFY: 'verify',         // saisie code 2FA
  ZONE: 'zone'              // zone admin déverrouillée
};

export default function AdminZone({ isOpen, onClose }) {
  const { addNotification } = useApp();
  const [step, setStep] = useState(STEPS.CHECK);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(STEPS.CHECK);
      loadStatus();
    }
  }, [isOpen]);

  const loadStatus = async () => {
    setLoading(true);
    const s = await window.api.admin.getStatus();
    setStatus(s);
    if (!s.smtpConfigured) {
      setStep(STEPS.CHECK);
    } else if (!s.initialized) {
      setStep(STEPS.INIT_EMAIL);
    } else {
      setStep(STEPS.REQUEST);
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={true} onClose={onClose} title="Zone d'administration" size="lg">
      {loading || !status ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div className="spinner spinner-lg" style={{ margin: '0 auto' }} />
        </div>
      ) : !status.smtpConfigured ? (
        <SmtpRequired />
      ) : step === STEPS.INIT_EMAIL ? (
        <InitEmailStep
          defaultEmail={status.expediteur}
          onDone={loadStatus}
        />
      ) : step === STEPS.REQUEST ? (
        <RequestCodeStep
          maskedEmail={status.recoveryEmail}
          locked={status.lockedOut}
          lockoutSec={status.lockoutRemainingSec}
          onCodeSent={() => setStep(STEPS.VERIFY)}
        />
      ) : step === STEPS.VERIFY ? (
        <VerifyCodeStep
          maskedEmail={status.recoveryEmail}
          onSuccess={() => setStep(STEPS.ZONE)}
          onResend={() => setStep(STEPS.REQUEST)}
        />
      ) : step === STEPS.ZONE ? (
        <AdminPanel
          maskedEmail={status.recoveryEmail}
          onAction={(msg) => addNotification({ type: 'success', titre: 'Zone admin', message: msg })}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}

// ============================================
// Étape : SMTP non configuré
// ============================================
function SmtpRequired() {
  return (
    <div style={{ padding: 20, textAlign: 'center' }}>
      <div style={{
        width: 64, height: 64, margin: '0 auto 16px',
        borderRadius: 16, background: 'rgba(245, 158, 11, 0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <AlertCircle size={32} style={{ color: '#f59e0b' }} />
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>SMTP non configuré</h3>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        Pour utiliser la zone d'administration, vous devez d'abord configurer votre serveur SMTP dans <strong>Paramètres → Configuration Email</strong>.
        <br /><br />
        Le code de sécurité 2FA sera envoyé via cette configuration.
      </p>
    </div>
  );
}

// ============================================
// Étape : première configuration de l'email de récupération
// ============================================
function InitEmailStep({ defaultEmail, onDone }) {
  const [email, setEmail] = useState(defaultEmail || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!email.includes('@')) {
      setError('Email invalide');
      return;
    }
    setSubmitting(true);
    const result = await window.api.admin.initRecoveryEmail(email);
    setSubmitting(false);
    if (result.success) onDone();
    else setError(result.error);
  };

  return (
    <div style={{ padding: '8px 4px' }}>
      <div style={{
        padding: 14, marginBottom: 16,
        background: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        borderRadius: 12, fontSize: 13, lineHeight: 1.5
      }}>
        <strong>🛡️ Première configuration</strong><br />
        Définissez l'email qui recevra les codes de sécurité pour accéder à la zone d'administration. Cet email pourra être modifié plus tard, mais nécessitera la confirmation par code 2FA.
      </div>

      <div className="form-group">
        <label className="form-label">Email de récupération</label>
        <input
          type="email"
          className="form-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@exemple.fr"
          autoFocus
        />
      </div>

      {error && (
        <div style={{
          padding: 10, marginBottom: 12, fontSize: 12,
          background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
          borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6
        }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <button
        className="btn btn-primary w-full"
        onClick={handleSubmit}
        disabled={submitting || !email}
        style={{ width: '100%' }}
      >
        {submitting ? <div className="spinner" /> : <><CheckCircle2 size={14} /> Configurer</>}
      </button>
    </div>
  );
}

// ============================================
// Étape : demande d'envoi du code 2FA
// ============================================
function RequestCodeStep({ maskedEmail, locked, lockoutSec, onCodeSent }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [remainingLock, setRemainingLock] = useState(lockoutSec);

  useEffect(() => {
    if (!locked) return;
    const interval = setInterval(() => {
      setRemainingLock(prev => {
        if (prev <= 1) { clearInterval(interval); window.location.reload(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [locked]);

  const handleSend = async () => {
    setSending(true);
    setError('');
    const result = await window.api.admin.requestAccessCode();
    setSending(false);
    if (result.success) onCodeSent();
    else setError(result.error);
  };

  if (locked) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, margin: '0 auto 16px',
          borderRadius: 16, background: 'rgba(239, 68, 68, 0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Lock size={32} style={{ color: '#ef4444' }} />
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Accès verrouillé</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Trop de tentatives échouées. Réessayez dans :
        </p>
        <div style={{
          fontSize: 32, fontWeight: 800, marginTop: 12,
          fontFamily: 'var(--font-mono)', color: '#ef4444'
        }}>
          {Math.floor(remainingLock / 60)}:{String(remainingLock % 60).padStart(2, '0')}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 4px' }}>
      <div style={{
        padding: 16, marginBottom: 20,
        background: 'rgba(245, 158, 11, 0.08)',
        border: '1px solid rgba(245, 158, 11, 0.2)',
        borderRadius: 12, display: 'flex', gap: 12, alignItems: 'flex-start'
      }}>
        <ShieldAlert size={20} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          <strong>Authentification à 2 facteurs</strong><br />
          Un code de sécurité à 6 chiffres va être envoyé à votre email de récupération. Ce code sera valide 5 minutes et utilisable une seule fois.
        </div>
      </div>

      <div style={{
        padding: 14,
        background: 'var(--bg-tertiary)',
        borderRadius: 12, marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 12
      }}>
        <Mail size={18} style={{ color: 'var(--accent-blue)' }} />
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>EMAIL DE RÉCUPÉRATION</div>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{maskedEmail}</div>
        </div>
      </div>

      {error && (
        <div style={{
          padding: 10, marginBottom: 12, fontSize: 12,
          background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
          borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6
        }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <button
        className="btn btn-primary"
        onClick={handleSend}
        disabled={sending}
        style={{ width: '100%' }}
      >
        {sending ? <><div className="spinner" /> Envoi en cours...</> : <><Send size={14} /> Envoyer le code</>}
      </button>
    </div>
  );
}

// ============================================
// Étape : saisie et vérification du code
// ============================================
function VerifyCodeStep({ maskedEmail, onSuccess, onResend }) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [remainingSec, setRemainingSec] = useState(300);
  const inputRefs = useRef([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
    const interval = setInterval(() => {
      setRemainingSec(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleChange = (i, val) => {
    const digit = val.replace(/[^0-9]/g, '').slice(0, 1);
    const newCode = [...code];
    newCode[i] = digit;
    setCode(newCode);
    setError('');
    if (digit && i < 5) inputRefs.current[i + 1]?.focus();

    if (newCode.every(c => c.length === 1)) {
      handleVerify(newCode.join(''));
    }
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(''));
      handleVerify(pasted);
    }
  };

  const handleVerify = async (fullCode) => {
    setVerifying(true);
    setError('');
    const result = await window.api.admin.verifyAccessCode(fullCode);
    setVerifying(false);
    if (result.success) onSuccess();
    else {
      setError(result.error);
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  };

  return (
    <div style={{ padding: '8px 4px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          width: 56, height: 56, margin: '0 auto 12px',
          borderRadius: 14, background: 'rgba(59, 130, 246, 0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <KeyRound size={28} style={{ color: 'var(--accent-blue)' }} />
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Code envoyé</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Saisissez le code à 6 chiffres reçu sur<br />
          <strong style={{ color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>{maskedEmail}</strong>
        </p>
      </div>

      <div
        style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}
        onPaste={handlePaste}
      >
        {code.map((digit, i) => (
          <input
            key={i}
            ref={el => inputRefs.current[i] = el}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={verifying}
            style={{
              width: 48, height: 56,
              fontSize: 24, fontWeight: 700,
              textAlign: 'center',
              border: '2px solid ' + (error ? '#ef4444' : 'var(--border-color)'),
              borderRadius: 10,
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
              transition: 'all 150ms'
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--accent-blue)'}
            onBlur={(e) => e.target.style.borderColor = error ? '#ef4444' : 'var(--border-color)'}
          />
        ))}
      </div>

      {error && (
        <div style={{
          padding: 10, marginBottom: 12, fontSize: 12,
          background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
          borderRadius: 8, textAlign: 'center'
        }}>
          {error}
        </div>
      )}

      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        {remainingSec > 0 ? (
          <>Code valide encore <strong>{Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, '0')}</strong></>
        ) : (
          <strong style={{ color: '#ef4444' }}>Code expiré</strong>
        )}
      </div>

      <button
        className="btn btn-ghost"
        onClick={onResend}
        style={{ width: '100%' }}
      >
        <RefreshCw size={14} /> Renvoyer un nouveau code
      </button>
    </div>
  );
}

// ============================================
// Panneau admin déverrouillé
// ============================================
function AdminPanel({ maskedEmail, onAction, onClose }) {
  const { confirm } = useConfirm();
  const [counts, setCounts] = useState(null);
  const [selected, setSelected] = useState([]);
  const [withBackup, setWithBackup] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [showFactoryReset, setShowFactoryReset] = useState(false);

  useEffect(() => {
    window.api.admin.getCounts().then(setCounts);
  }, []);

  const categories = [
    { id: 'biens', label: 'Biens immobiliers', icon: Building2, color: '#3b82f6', desc: 'Tous les biens enregistrés (et leurs codes chiffrés)' },
    { id: 'locataires', label: 'Locataires', icon: Users, color: '#8b5cf6', desc: 'Toutes les fiches locataires' },
    { id: 'loyers', label: 'Loyers', icon: CircleDollarSign, color: '#10b981', desc: 'Historique de tous les loyers' },
    { id: 'factures_excel', label: 'Fichiers Excel', icon: FileSpreadsheet, color: '#f59e0b', desc: 'Fichiers en base + .xlsx locaux' },
    { id: 'notifications', label: 'Notifications', icon: Bell, color: '#06b6d4', desc: 'Toutes les notifications' },
    { id: 'messages_ia', label: 'Historique IA', icon: Bot, color: '#ec4899', desc: 'Conversations avec l\'assistant Gemini' }
  ];

  const toggle = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleDelete = async () => {
    if (selected.length === 0) return;

    const summary = selected.map(id => {
      const cat = categories.find(c => c.id === id);
      const count = counts?.[id] || 0;
      return `• ${cat.label} : ${count} élément(s)`;
    }).join('\n');

    const ok = await confirm({
      type: 'danger',
      title: 'Suppression définitive',
      message: `Vous êtes sur le point de supprimer DÉFINITIVEMENT :\n\n${summary}\n\n${withBackup ? '✅ Une sauvegarde sera créée automatiquement avant.' : '⚠️ Aucune sauvegarde ne sera effectuée.'}\n\nCette action est irréversible.`,
      confirmText: 'Supprimer définitivement',
      cancelText: 'Annuler'
    });
    if (!ok) return;

    setDeleting(true);
    const result = await window.api.admin.deleteCategories(selected, withBackup);
    setDeleting(false);

    if (result.success) {
      const total = Object.values(result.deleted).reduce((s, n) => s + n, 0);
      onAction(`${total} élément(s) supprimé(s)${withBackup ? ' (sauvegarde créée)' : ''}`);
      onClose();
    } else {
      alert('Erreur : ' + result.error);
    }
  };

  if (showChangeEmail) {
    return <ChangeEmailFlow currentMasked={maskedEmail} onDone={() => setShowChangeEmail(false)} onCancel={() => setShowChangeEmail(false)} />;
  }

  if (showFactoryReset) {
    return <FactoryResetFlow onCancel={() => setShowFactoryReset(false)} />;
  }

  return (
    <div style={{ padding: '8px 4px' }}>
      <div style={{
        padding: 12, marginBottom: 16,
        background: 'rgba(16, 185, 129, 0.08)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10
      }}>
        <CheckCircle2 size={18} style={{ color: '#10b981' }} />
        <div style={{ fontSize: 13, flex: 1 }}>
          <strong>Authentifié</strong> via {maskedEmail}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowChangeEmail(true)}
          title="Changer l'email de récupération"
        >
          <Edit size={12} /> Changer
        </button>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Suppression sélective</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
        Cochez les catégories à supprimer définitivement.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {categories.map(cat => {
          const Icon = cat.icon;
          const count = counts?.[cat.id] ?? '...';
          const isSelected = selected.includes(cat.id);
          return (
            <div
              key={cat.id}
              onClick={() => toggle(cat.id)}
              style={{
                padding: 12,
                background: isSelected ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-tertiary)',
                border: '1px solid ' + (isSelected ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-color)'),
                borderRadius: 10,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12,
                transition: 'all 150ms'
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(cat.id)}
                onClick={(e) => e.stopPropagation()}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: cat.color + '20', color: cat.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}>
                <Icon size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{cat.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cat.desc}</div>
              </div>
              <div style={{
                padding: '4px 10px', borderRadius: 12,
                background: 'var(--bg-card)', fontSize: 12, fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                color: count > 0 ? cat.color : 'var(--text-muted)'
              }}>
                {count}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        padding: 12, marginBottom: 14,
        background: 'var(--bg-tertiary)',
        borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Sauvegarder avant suppression</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Créer un backup automatique pour pouvoir restaurer si besoin
          </div>
        </div>
        <div className={`toggle ${withBackup ? 'active' : ''}`} onClick={() => setWithBackup(!withBackup)} />
      </div>

      <button
        className="btn btn-danger"
        onClick={handleDelete}
        disabled={selected.length === 0 || deleting}
        style={{ width: '100%' }}
      >
        {deleting
          ? <><div className="spinner" /> Suppression en cours...</>
          : <><Trash2 size={14} /> Supprimer {selected.length > 0 ? `(${selected.length} catégorie${selected.length > 1 ? 's' : ''})` : ''}</>
        }
      </button>

      {/* Séparateur + bouton réinitialisation d'usine */}
      <div style={{
        margin: '24px 0 16px',
        borderTop: '1px dashed var(--border-color)',
        position: 'relative',
        textAlign: 'center'
      }}>
        <span style={{
          position: 'relative', top: -8,
          background: 'var(--bg-card)',
          padding: '0 12px',
          fontSize: 10, fontWeight: 700,
          color: 'var(--text-muted)',
          letterSpacing: '0.1em'
        }}>
          ZONE TRÈS DANGEREUSE
        </span>
      </div>

      <div style={{
        padding: 14,
        background: 'rgba(239, 68, 68, 0.06)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderRadius: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Power size={18} style={{ color: '#ef4444' }} />
          <div style={{ fontSize: 13, fontWeight: 700 }}>Réinitialisation d'usine</div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
          Remet l'application dans son état initial : suppression de <strong>toutes</strong> les données, <strong>tous</strong> les paramètres (clé Gemini, SMTP, email de récupération...), et tous les fichiers locaux. Une sauvegarde finale est créée par défaut.
        </div>
        <button
          className="btn btn-danger"
          onClick={() => setShowFactoryReset(true)}
          style={{ width: '100%' }}
        >
          <Power size={14} /> Réinitialisation d'usine
        </button>
      </div>
    </div>
  );
}

// ============================================
// Sous-flow : changement d'email de récupération
// ============================================
function ChangeEmailFlow({ currentMasked, onDone, onCancel }) {
  const [phase, setPhase] = useState('request'); // request, verify_and_change
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRequestCode = async () => {
    if (!newEmail.includes('@')) { setError('Email invalide'); return; }
    setLoading(true);
    setError('');
    const result = await window.api.admin.requestEmailChangeCode();
    setLoading(false);
    if (result.success) setPhase('verify_and_change');
    else setError(result.error);
  };

  const handleConfirm = async () => {
    if (code.length !== 6) { setError('Code à 6 chiffres requis'); return; }
    setLoading(true);
    const result = await window.api.admin.changeRecoveryEmail(code, newEmail);
    setLoading(false);
    if (result.success) {
      alert('Email de récupération modifié avec succès. La zone va se recharger.');
      window.location.reload();
    } else setError(result.error);
  };

  return (
    <div style={{ padding: '8px 4px' }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
        Changer l'email de récupération
      </h3>

      <div style={{
        padding: 12, marginBottom: 14,
        background: 'rgba(245, 158, 11, 0.08)',
        border: '1px solid rgba(245, 158, 11, 0.2)',
        borderRadius: 10, fontSize: 12
      }}>
        Pour confirmer ce changement, un code 2FA sera envoyé sur l'<strong>ancien</strong> email ({currentMasked}).
      </div>

      <div className="form-group">
        <label className="form-label">Nouvel email</label>
        <input
          type="email"
          className="form-input"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="nouvel.email@exemple.fr"
          disabled={phase !== 'request'}
        />
      </div>

      {phase === 'verify_and_change' && (
        <div className="form-group">
          <label className="form-label">Code reçu sur l'ancien email</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            className="form-input"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="123456"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 18, letterSpacing: '0.3em', textAlign: 'center' }}
            autoFocus
          />
        </div>
      )}

      {error && (
        <div style={{
          padding: 10, marginBottom: 12, fontSize: 12,
          background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
          borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6
        }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary" onClick={onCancel} style={{ flex: 1 }}>Annuler</button>
        {phase === 'request' ? (
          <button className="btn btn-primary" onClick={handleRequestCode} disabled={loading || !newEmail} style={{ flex: 2 }}>
            {loading ? <div className="spinner" /> : <><Send size={14} /> Envoyer code de confirmation</>}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={handleConfirm} disabled={loading || code.length !== 6} style={{ flex: 2 }}>
            {loading ? <div className="spinner" /> : <><CheckCircle2 size={14} /> Confirmer le changement</>}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================
// Flow : réinitialisation d'usine
// ============================================
function FactoryResetFlow({ onCancel }) {
  const [confirmText, setConfirmText] = useState('');
  const [keepBackups, setKeepBackups] = useState(true);
  const [finalBackup, setFinalBackup] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');

  const REQUIRED_TEXT = 'REINITIALISER';
  const canConfirm = confirmText === REQUIRED_TEXT;

  const handleReset = async () => {
    if (!canConfirm) return;
    setResetting(true);
    setError('');

    const result = await window.api.admin.factoryReset({ keepBackups, finalBackup });

    if (result.success) {
      // Petit délai pour laisser le temps de finir l'écriture en DB
      setTimeout(() => {
        alert(
          'Réinitialisation terminée.' +
          (result.finalBackupPath ? `\n\nUne sauvegarde finale a été créée :\n${result.finalBackupPath}` : '') +
          '\n\nL\'application va se recharger.'
        );
        window.location.reload();
      }, 500);
    } else {
      setResetting(false);
      setError(result.error);
    }
  };

  return (
    <div style={{ padding: '8px 4px' }}>
      <div style={{
        textAlign: 'center', marginBottom: 20,
        padding: '16px 8px',
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderRadius: 12
      }}>
        <div style={{
          width: 56, height: 56, margin: '0 auto 12px',
          borderRadius: 14, background: 'rgba(239, 68, 68, 0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Power size={28} style={{ color: '#ef4444' }} />
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#ef4444' }}>
          Réinitialisation d'usine
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 400, margin: '0 auto' }}>
          Cette action va effacer <strong>TOUTES</strong> les données et paramètres :
        </p>
      </div>

      <div style={{
        background: 'var(--bg-tertiary)',
        borderRadius: 10,
        padding: 14,
        marginBottom: 16,
        fontSize: 12, lineHeight: 1.8
      }}>
        <div style={{ marginBottom: 6 }}>📦 <strong>Données effacées :</strong></div>
        <div style={{ paddingLeft: 16, color: 'var(--text-secondary)' }}>
          Biens • Locataires • Loyers • Fichiers Excel • Notifications • Historique IA
        </div>
        <div style={{ marginTop: 10, marginBottom: 6 }}>⚙️ <strong>Paramètres effacés :</strong></div>
        <div style={{ paddingLeft: 16, color: 'var(--text-secondary)' }}>
          Clé Gemini • Configuration SMTP • Emails • Thème • Email de récupération admin
        </div>
        <div style={{ marginTop: 10, marginBottom: 6 }}>📁 <strong>Fichiers locaux supprimés :</strong></div>
        <div style={{ paddingLeft: 16, color: 'var(--text-secondary)' }}>
          Tous les .xlsx générés
        </div>
      </div>

      {/* Options */}
      <div style={{
        padding: 12, marginBottom: 10,
        background: 'var(--bg-tertiary)', borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Créer une sauvegarde finale</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Recommandé : permet de restaurer si vous changez d'avis
          </div>
        </div>
        <div className={`toggle ${finalBackup ? 'active' : ''}`} onClick={() => setFinalBackup(!finalBackup)} />
      </div>

      <div style={{
        padding: 12, marginBottom: 16,
        background: 'var(--bg-tertiary)', borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Conserver les anciennes sauvegardes</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Désactiver pour aussi supprimer tous les ZIP de backup
          </div>
        </div>
        <div className={`toggle ${keepBackups ? 'active' : ''}`} onClick={() => setKeepBackups(!keepBackups)} />
      </div>

      {/* Mot de validation */}
      <div className="form-group">
        <label className="form-label" style={{ color: '#ef4444' }}>
          Tapez "{REQUIRED_TEXT}" en majuscules pour confirmer
        </label>
        <input
          type="text"
          className="form-input"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={REQUIRED_TEXT}
          style={{
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em',
            textAlign: 'center',
            fontSize: 14,
            fontWeight: 700,
            borderColor: canConfirm ? '#10b981' : 'var(--border-color)'
          }}
          autoFocus
          disabled={resetting}
        />
      </div>

      {error && (
        <div style={{
          padding: 10, marginBottom: 12, fontSize: 12,
          background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
          borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6
        }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={resetting}
          style={{ flex: 1 }}
        >
          Annuler
        </button>
        <button
          className="btn btn-danger"
          onClick={handleReset}
          disabled={!canConfirm || resetting}
          style={{ flex: 2 }}
        >
          {resetting
            ? <><div className="spinner" /> Réinitialisation...</>
            : <><Power size={14} /> Tout réinitialiser</>
          }
        </button>
      </div>
    </div>
  );
}