import React, { useState, useEffect, useRef, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../components/ConfirmDialog';
import ReactMarkdown from 'react-markdown';
import {
  Send, Bot, User, Sparkles, Trash2, AlertCircle,
  Plus, MessageSquare, Edit3, Search, X, Check, Database
} from 'lucide-react';

const SUGGESTIONS = [
  "Combien de loyers sont en retard ce mois-ci ?",
  "Quel est le revenu net de mon portfolio cette année ?",
  "Quels travaux sont actuellement en cours ?",
  "Comment déclarer mes revenus locatifs (formulaire 2044) ?",
  "Quelle est la différence entre LMNP et LMP ?",
  "Comment calculer mon taux de rentabilité ?"
];

export default function AssistantIA() {
  const { parametres } = useApp();
  const { confirm } = useConfirm();
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const loadConversations = useCallback(async () => {
    const list = await window.api.ia.getConversations();
    setConversations(list);
    return list;
  }, []);

  const loadMessages = useCallback(async (convId) => {
    if (!convId) {
      setMessages([]);
      return;
    }
    const msgs = await window.api.ia.getMessages(convId);
    setMessages(msgs);
  }, []);

  // Au démarrage : charge les conversations, démarre une nouvelle session
  useEffect(() => {
    loadConversations();
    setActiveConvId(null); // Nouvelle session = aucune conversation active
    setMessages([]);
  }, [loadConversations]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeConvId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const handleSend = async (text) => {
    const message = (text || input).trim();
    if (!message || isThinking) return;

    setInput('');
    const userMsg = { role: 'user', contenu: message, created_at: new Date().toISOString() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsThinking(true);

    const result = await window.api.ia.chat({
      message,
      history: messages,
      conversationId: activeConvId
    });
    setIsThinking(false);

    if (result.success) {
      setMessages([...newMessages, {
        role: 'assistant',
        contenu: result.response,
        created_at: new Date().toISOString()
      }]);
      // Si nouvelle conversation, on la sélectionne
      if (!activeConvId && result.conversationId) {
        setActiveConvId(result.conversationId);
      }
      await loadConversations();
    } else {
      setMessages([...newMessages, {
        role: 'assistant',
        contenu: `⚠️ ${result.error}`,
        created_at: new Date().toISOString()
      }]);
    }

    inputRef.current?.focus();
  };

  const handleNewConversation = () => {
    setActiveConvId(null);
    setMessages([]);
    setInput('');
    inputRef.current?.focus();
  };

  const handleSelectConversation = async (convId) => {
    setActiveConvId(convId);
    await loadMessages(convId);
  };

  const handleDeleteConversation = async (conv, e) => {
    e?.stopPropagation();
    const ok = await confirm({
      type: 'danger',
      title: 'Supprimer cette conversation',
      message: `"${conv.title}" sera définitivement supprimée.`,
      confirmText: 'Supprimer',
      cancelText: 'Annuler'
    });
    if (!ok) return;
    await window.api.ia.deleteConversation(conv.id);
    if (activeConvId === conv.id) {
      setActiveConvId(null);
      setMessages([]);
    }
    await loadConversations();
  };

  const handleClearAll = async () => {
    const ok = await confirm({
      type: 'danger',
      title: 'Effacer tout l\'historique',
      message: 'Toutes vos conversations avec l\'IA seront définitivement supprimées.',
      confirmText: 'Tout effacer',
      cancelText: 'Annuler'
    });
    if (!ok) return;
    await window.api.ia.clearAllConversations();
    setActiveConvId(null);
    setMessages([]);
    await loadConversations();
  };

  const keyConfigured = parametres.gemini_api_key && parametres.gemini_api_key.length > 10;

  // Filtre + groupement des conversations par date
  const filteredConvs = conversations.filter(c =>
    !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const grouped = groupByDate(filteredConvs);

  return (
    <>
      <PageHeader
        title="Assistant IA"
        subtitle="Gemini • Comptabilité et fonctionnement du logiciel"
        actions={
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 'var(--radius-full)',
              background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
              fontSize: 12, color: '#10b981', fontWeight: 600
            }}>
              <Database size={12} />
              Données connectées
            </div>
            {conversations.length > 0 && (
              <button className="btn btn-ghost" onClick={handleClearAll}>
                <Trash2 size={14} /> Tout effacer
              </button>
            )}
          </>
        }
      />

      <div className="page-container" style={{ padding: '20px 32px', overflow: 'hidden' }}>
        <div className="ia-layout">
          {/* Sidebar conversations */}
          <aside className="ia-sidebar">
            <button
              className="btn btn-primary"
              onClick={handleNewConversation}
              style={{ width: '100%', marginBottom: 12 }}
            >
              <Plus size={14} /> Nouvelle conversation
            </button>

            {conversations.length > 0 && (
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <Search
                  size={13}
                  style={{
                    position: 'absolute', left: 10, top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)', pointerEvents: 'none'
                  }}
                />
                <input
                  type="text"
                  className="form-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher..."
                  style={{ paddingLeft: 32, paddingRight: searchQuery ? 32 : 10, fontSize: 12, padding: '7px 10px 7px 32px' }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute', right: 6, top: '50%',
                      transform: 'translateY(-50%)',
                      width: 22, height: 22,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--text-muted)', borderRadius: 4
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}

            <div className="ia-conv-list">
              {conversations.length === 0 ? (
                <div style={{
                  padding: 20, textAlign: 'center',
                  color: 'var(--text-muted)', fontSize: 12
                }}>
                  <MessageSquare size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <div>Aucune conversation</div>
                </div>
              ) : Object.entries(grouped).map(([groupName, convs]) => (
                <div key={groupName} style={{ marginBottom: 14 }}>
                  <div className="ia-group-label">{groupName}</div>
                  {convs.map(conv => (
                    <ConversationItem
                      key={conv.id}
                      conv={conv}
                      isActive={activeConvId === conv.id}
                      isRenaming={renamingId === conv.id}
                      onSelect={() => handleSelectConversation(conv.id)}
                      onDelete={(e) => handleDeleteConversation(conv, e)}
                      onStartRename={() => setRenamingId(conv.id)}
                      onSaveRename={async (newTitle) => {
                        if (newTitle && newTitle !== conv.title) {
                          await window.api.ia.renameConversation(conv.id, newTitle);
                          await loadConversations();
                        }
                        setRenamingId(null);
                      }}
                      onCancelRename={() => setRenamingId(null)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </aside>

          {/* Zone de chat principale */}
          <div className="ia-main">
            {!keyConfigured && (
              <div style={{
                padding: '12px 18px',
                background: 'rgba(245, 158, 11, 0.1)',
                borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 13
              }}>
                <AlertCircle size={16} style={{ color: '#f59e0b' }} />
                <span>Clé API Gemini non configurée. Rendez-vous dans <strong>Paramètres</strong> pour l'ajouter.</span>
              </div>
            )}

            <div className="chat-messages" ref={scrollRef}>
              {messages.length === 0 && !isThinking && (
                <div style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  flex: 1, textAlign: 'center', padding: 40
                }}>
                  <div style={{
                    width: 80, height: 80, borderRadius: '50%',
                    background: 'var(--gradient-purple)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 20,
                    boxShadow: '0 8px 24px rgba(139, 92, 246, 0.4)'
                  }}>
                    <Sparkles size={36} color="white" />
                  </div>
                  <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.02em' }}>
                    {activeConvId ? 'Conversation vide' : 'Nouvelle conversation'}
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 480 }}>
                    Posez vos questions sur la comptabilité immobilière, la fiscalité, ou votre portfolio.
                    L'IA a accès à vos données réelles (biens, loyers, travaux).
                  </p>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`chat-message ${m.role === 'user' ? 'user' : 'ia'}`}>
                  <div className={`chat-avatar ${m.role === 'user' ? 'user' : 'ia'}`}>
                    {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                  </div>
                  <div className="chat-bubble markdown-content">
                    {m.role === 'assistant' ? (
                      <ReactMarkdown>{m.contenu}</ReactMarkdown>
                    ) : (
                      m.contenu
                    )}
                  </div>
                </div>
              ))}

              {isThinking && (
                <div className="chat-message ia">
                  <div className="chat-avatar ia"><Bot size={16} /></div>
                  <div className="chat-bubble">
                    <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
                      <Dot delay={0} /><Dot delay={0.2} /><Dot delay={0.4} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {messages.length === 0 && !activeConvId && (
              <div className="chat-suggestions">
                {SUGGESTIONS.map((s, i) => (
                  <div key={i} className="chat-chip" onClick={() => handleSend(s)}>{s}</div>
                ))}
              </div>
            )}

            <div className="chat-input-container">
              <input
                ref={inputRef}
                className="chat-input"
                placeholder="Posez votre question..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                disabled={isThinking || !keyConfigured}
              />
              <button
                className="btn btn-primary btn-icon"
                onClick={() => handleSend()}
                disabled={!input.trim() || isThinking || !keyConfigured}
                style={{ width: 44, height: 44, borderRadius: '50%' }}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </>
  );
}

function ConversationItem({ conv, isActive, isRenaming, onSelect, onDelete, onStartRename, onSaveRename, onCancelRename }) {
  const [editValue, setEditValue] = useState(conv.title);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isRenaming) {
      setEditValue(conv.title);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isRenaming, conv.title]);

  if (isRenaming) {
    return (
      <div className="ia-conv-item active" style={{ padding: 6 }}>
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveRename(editValue.trim());
            if (e.key === 'Escape') onCancelRename();
          }}
          onBlur={() => onSaveRename(editValue.trim())}
          style={{
            flex: 1,
            padding: '4px 8px',
            background: 'var(--bg-input)',
            border: '1px solid var(--accent-blue)',
            borderRadius: 6,
            color: 'var(--text-primary)',
            fontSize: 12,
            outline: 'none'
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`ia-conv-item ${isActive ? 'active' : ''}`}
      onClick={onSelect}
    >
      <MessageSquare size={13} style={{ flexShrink: 0, opacity: 0.6 }} />
      <div className="ia-conv-title">{conv.title}</div>
      <div className="ia-conv-actions">
        <button
          className="ia-conv-btn"
          onClick={(e) => { e.stopPropagation(); onStartRename(); }}
          title="Renommer"
        >
          <Edit3 size={11} />
        </button>
        <button
          className="ia-conv-btn"
          onClick={onDelete}
          title="Supprimer"
        >
          <Trash2 size={11} style={{ color: '#ef4444' }} />
        </button>
      </div>
    </div>
  );
}

function Dot({ delay }) {
  return (
    <div style={{
      width: 7, height: 7, borderRadius: '50%',
      background: 'var(--text-muted)',
      animation: `bounce 1.2s infinite`,
      animationDelay: `${delay}s`
    }} />
  );
}

function groupByDate(convs) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const week = new Date(today);
  week.setDate(week.getDate() - 7);
  const month = new Date(today);
  month.setDate(month.getDate() - 30);

  const groups = {
    "Aujourd'hui": [],
    "Hier": [],
    "7 derniers jours": [],
    "30 derniers jours": [],
    "Plus ancien": []
  };

  convs.forEach(c => {
    const date = new Date(c.updated_at);
    if (date >= today) groups["Aujourd'hui"].push(c);
    else if (date >= yesterday) groups["Hier"].push(c);
    else if (date >= week) groups["7 derniers jours"].push(c);
    else if (date >= month) groups["30 derniers jours"].push(c);
    else groups["Plus ancien"].push(c);
  });

  // Filtre les groupes vides
  return Object.fromEntries(Object.entries(groups).filter(([_, list]) => list.length > 0));
}