import React, { useState, useEffect } from 'react';
import { Key, CheckCircle2, AlertCircle, Loader2, Shield, ChevronRight, Mail, ExternalLink } from 'lucide-react';

export default function Activation({ onActivated }) {
  const [key, setKey]           = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState(null); // { plan, expires, email }
  const [dots, setDots]         = useState('');

  // Animation "..." pendant le chargement
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400);
    return () => clearInterval(t);
  }, [loading]);

  const handleActivate = async () => {
    const trimmed = key.trim();
    if (!trimmed) { setError('Merci de saisir votre clé de licence.'); return; }
    setLoading(true);
    setError('');

    const result = await window.api.license.activate(trimmed);

    setLoading(false);
    if (result.success) {
      setSuccess(result);
      setTimeout(() => onActivated(result), 1800);
    } else {
      setError(result.error || 'Clé incorrecte ou déjà utilisée.');
    }
  };

  const planLabel = (plan) => {
    const plans = { standard: 'Standard', pro: 'Pro', lifetime: 'Lifetime', dev: 'Dev' };
    return plans[plan] || plan;
  };

  const planColor = (plan) => {
    const colors = { standard: '#3b82f6', pro: '#8b5cf6', lifetime: '#10b981', dev: '#f59e0b' };
    return colors[plan] || '#3b82f6';
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(135deg, #0f172a 0%, #1a1f35 50%, #0f172a 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'inherit'
    }}>

      {/* Fond décoratif */}
      <div style={{
        position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none'
      }}>
        <div style={{
          position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)',
          width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
          borderRadius: '50%'
        }} />
        <div style={{
          position: 'absolute', bottom: '-10%', right: '-10%',
          width: 400, height: 400,
          background: 'radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%)',
          borderRadius: '50%'
        }} />
      </div>

      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 40, position: 'relative' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 64, height: 64, borderRadius: 20, marginBottom: 16,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          boxShadow: '0 0 0 8px rgba(99,102,241,0.12), 0 20px 40px rgba(0,0,0,0.4)'
        }}>
          <span style={{ color: 'white', fontWeight: 900, fontSize: 24, letterSpacing: '-1px' }}>Oï</span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>Oïko</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
          Votre actif, en clair.
        </div>
      </div>

      {/* Carte principale */}
      <div style={{
        width: '100%', maxWidth: 460,
        background: 'rgba(30,41,59,0.9)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: 32,
        boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(12px)',
        position: 'relative'
      }}>

        {/* En-tête carte */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))',
            border: '1px solid rgba(99,102,241,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Key size={18} style={{ color: '#818cf8' }} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>Activation du logiciel</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              Entrez votre clé de licence pour continuer
            </div>
          </div>
        </div>

        {/* État succès */}
        {success ? (
          <div style={{
            textAlign: 'center', padding: '24px 0',
            animation: 'fadeIn 0.4s ease'
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
              background: 'rgba(16,185,129,0.15)',
              border: '2px solid rgba(16,185,129,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <CheckCircle2 size={28} style={{ color: '#10b981' }} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'white', marginBottom: 8 }}>
              Licence activée !
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 14px', borderRadius: 20,
              background: `${planColor(success.plan)}22`,
              border: `1px solid ${planColor(success.plan)}44`,
              color: planColor(success.plan), fontSize: 12, fontWeight: 700,
              marginBottom: 8
            }}>
              Plan {planLabel(success.plan)}
            </div>
            {success.email && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                {success.email}
              </div>
            )}
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 16 }}>
              Chargement en cours…
            </div>
          </div>
        ) : (
          <>
            {/* Champ clé de licence */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block', fontSize: 12, fontWeight: 600,
                color: 'rgba(255,255,255,0.5)', marginBottom: 8,
                textTransform: 'uppercase', letterSpacing: '0.06em'
              }}>
                Clé de licence
              </label>
              <input
                value={key}
                onChange={e => { setKey(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && !loading && handleActivate()}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                disabled={loading}
                autoFocus
                style={{
                  width: '100%',
                  background: 'rgba(15,23,42,0.8)',
                  border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 10, padding: '12px 14px',
                  color: 'white', fontSize: 13,
                  fontFamily: 'ui-monospace, monospace',
                  letterSpacing: '0.05em',
                  outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 150ms ease'
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.6)'}
                onBlur={e => e.target.style.borderColor = error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}
              />
            </div>

            {/* Message d'erreur */}
            {error && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '10px 14px', borderRadius: 10, marginBottom: 16,
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.25)'
              }}>
                <AlertCircle size={15} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 13, color: '#fca5a5', lineHeight: 1.4 }}>{error}</span>
              </div>
            )}

            {/* Bouton activer */}
            <button
              onClick={handleActivate}
              disabled={loading || !key.trim()}
              style={{
                width: '100%', padding: '13px 0',
                borderRadius: 12, border: 'none',
                background: loading || !key.trim()
                  ? 'rgba(99,102,241,0.3)'
                  : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: 'white', fontSize: 14, fontWeight: 700,
                cursor: loading || !key.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 200ms ease',
                boxShadow: loading || !key.trim() ? 'none' : '0 4px 20px rgba(99,102,241,0.35)'
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Vérification en cours{dots}
                </>
              ) : (
                <>
                  <Shield size={16} />
                  Activer Oïko
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </>
        )}
      </div>

      {/* Liens bas de page */}
      {!success && (
        <div style={{
          marginTop: 24, display: 'flex', gap: 24,
          fontSize: 12, color: 'rgba(255,255,255,0.3)'
        }}>
          <button
            onClick={() => window.api.shell.openExternal('https://oiko.app/acheter')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.35)', fontSize: 12,
              display: 'flex', alignItems: 'center', gap: 4,
              transition: 'color 150ms'
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
          >
            <ExternalLink size={11} /> Acheter une licence
          </button>
          <button
            onClick={() => window.api.shell.openExternal('mailto:support@oiko.app')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.35)', fontSize: 12,
              display: 'flex', alignItems: 'center', gap: 4,
              transition: 'color 150ms'
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
          >
            <Mail size={11} /> support@oiko.app
          </button>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
