import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle2, X } from 'lucide-react';

// ============================================
// Contexte global pour les dialogs
// ============================================
const ConfirmContext = createContext(null);

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
};

// ============================================
// Provider à mettre à la racine de l'app
// ============================================
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setDialog({
        title: options.title || 'Confirmer',
        message: options.message || '',
        type: options.type || 'warning', // warning, danger, info, success
        confirmText: options.confirmText || 'Confirmer',
        cancelText: options.cancelText || 'Annuler',
        onResolve: resolve
      });
    });
  }, []);

  const handleConfirm = () => {
    if (dialog) {
      dialog.onResolve(true);
      setDialog(null);
    }
  };

  const handleCancel = () => {
    if (dialog) {
      dialog.onResolve(false);
      setDialog(null);
    }
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {dialog && (
        <ConfirmDialog
          {...dialog}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ConfirmContext.Provider>
  );
}

// ============================================
// Le dialog lui-même
// ============================================
function ConfirmDialog({ title, message, type, confirmText, cancelText, onConfirm, onCancel }) {
  // Gestion clavier : Escape = annuler, Enter = confirmer
  React.useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onConfirm, onCancel]);

  const typeConfig = {
    warning: {
      icon: AlertTriangle,
      color: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.12)',
      btnClass: 'btn-primary'
    },
    danger: {
      icon: AlertCircle,
      color: '#ef4444',
      bgColor: 'rgba(239, 68, 68, 0.12)',
      btnClass: 'btn-danger'
    },
    info: {
      icon: Info,
      color: '#3b82f6',
      bgColor: 'rgba(59, 130, 246, 0.12)',
      btnClass: 'btn-primary'
    },
    success: {
      icon: CheckCircle2,
      color: '#10b981',
      bgColor: 'rgba(16, 185, 129, 0.12)',
      btnClass: 'btn-success'
    }
  };

  const config = typeConfig[type] || typeConfig.warning;
  const Icon = config.icon;

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      style={{ zIndex: 2000 }}
    >
      <div
        className="modal"
        style={{ maxWidth: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header avec icône colorée */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 16,
          paddingBottom: 16,
          borderBottom: '1px solid var(--border-color)'
        }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: config.bgColor,
            color: config.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Icon size={22} />
          </div>
          <h2 style={{
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--text-primary)',
            flex: 1,
            margin: 0
          }}>
            {title}
          </h2>
          <button
            className="modal-close"
            onClick={onCancel}
          >
            <X size={18} />
          </button>
        </div>

        {/* Message */}
        <div style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
          marginBottom: 4,
          whiteSpace: 'pre-wrap'
        }}>
          {message}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className={`btn ${config.btnClass}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}