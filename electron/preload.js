const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Biens
  biens: {
    getAll: () => ipcRenderer.invoke('biens:getAll'),
    add: (data) => ipcRenderer.invoke('biens:add', data),
    update: (id, data) => ipcRenderer.invoke('biens:update', id, data),
    delete: (id) => ipcRenderer.invoke('biens:delete', id)
  },
  // Locataires
  locataires: {
    getAll: () => ipcRenderer.invoke('locataires:getAll'),
    add: (data) => ipcRenderer.invoke('locataires:add', data),
    update: (id, data) => ipcRenderer.invoke('locataires:update', id, data),
    delete: (id) => ipcRenderer.invoke('locataires:delete', id)
  },
  // Loyers
  loyers: {
    getAll: () => ipcRenderer.invoke('loyers:getAll'),
    generate: () => ipcRenderer.invoke('loyers:generate'),
    updateStatut: (id, statut) => ipcRenderer.invoke('loyers:updateStatut', id, statut)
  },
  // Excel
  excel: {
    getAll: (filters) => ipcRenderer.invoke('excel:getAll', filters),
    getData: (id) => ipcRenderer.invoke('excel:getData', id),
    create: (data) => ipcRenderer.invoke('excel:create', data),
    update: (id, donnees) => ipcRenderer.invoke('excel:update', id, donnees),
    delete: (id) => ipcRenderer.invoke('excel:delete', id),
    export: (id) => ipcRenderer.invoke('excel:export', id),
    openLocal: (id) => ipcRenderer.invoke('excel:openLocal', id),
    syncFromLocal: (id) => ipcRenderer.invoke('excel:syncFromLocal', id),
    sendToAccountant: (payload) => ipcRenderer.invoke('excel:sendToAccountant', payload),
    regenerateAnnual: (id) => ipcRenderer.invoke('excel:regenerateAnnual', id)
  },
  smtp: {
    test: () => ipcRenderer.invoke('smtp:test')
  },
  // Fichiers
  files: {
    import: () => ipcRenderer.invoke('files:import')
  },
  // IA
  ia: {
    analyzeFiles: (files) => ipcRenderer.invoke('ia:analyzeFiles', files),
    chat: (payload) => ipcRenderer.invoke('ia:chat', payload),
    getConversations: () => ipcRenderer.invoke('ia:getConversations'),
    getMessages: (conversationId) => ipcRenderer.invoke('ia:getMessages', conversationId),
    createConversation: () => ipcRenderer.invoke('ia:createConversation'),
    renameConversation: (id, title) => ipcRenderer.invoke('ia:renameConversation', id, title),
    deleteConversation: (id) => ipcRenderer.invoke('ia:deleteConversation', id),
    clearAllConversations: () => ipcRenderer.invoke('ia:clearAllConversations')
  },
  // Notifications
  notifications: {
    getAll: () => ipcRenderer.invoke('notifications:getAll'),
    add: (data) => ipcRenderer.invoke('notifications:add', data),
    markRead: (id) => ipcRenderer.invoke('notifications:markRead', id),
    deleteAll: () => ipcRenderer.invoke('notifications:deleteAll')
  },
  // Paramètres
  parametres: {
    getAll: () => ipcRenderer.invoke('parametres:getAll'),
    set: (cle, valeur) => ipcRenderer.invoke('parametres:set', cle, valeur)
  },
  // Dashboard
  dashboard: {
    getStats: () => ipcRenderer.invoke('dashboard:getStats'),
    evolution: () => ipcRenderer.invoke('dashboard:evolution'),
    evolutionAnnuelle: () => ipcRenderer.invoke('dashboard:evolutionAnnuelle'),
    stats: () => ipcRenderer.invoke('dashboard:getStats')
  },
  // Backup
  backup: {
    selectFolder: () => ipcRenderer.invoke('backup:selectFolder'),
    create: () => ipcRenderer.invoke('backup:create'),
    list: () => ipcRenderer.invoke('backup:list'),
    restore: (zipPath) => ipcRenderer.invoke('backup:restore', zipPath),
    restoreFromFile: () => ipcRenderer.invoke('backup:restoreFromFile'),
    delete: (zipPath) => ipcRenderer.invoke('backup:delete', zipPath),
    openFolder: () => ipcRenderer.invoke('backup:openFolder'),
    getStatus: () => ipcRenderer.invoke('backup:getStatus'),
    pickFolder: () => ipcRenderer.invoke('backup:pickFolder')
  },
  // Shell (liens externes)
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  },
  // App info
  app: {
    getInfo: () => ipcRenderer.invoke('app:getInfo'),
    getGuideData: () => ipcRenderer.invoke('app:getGuideData'),
    downloadGuide: () => ipcRenderer.invoke('app:downloadGuide')
  },
  // Admin (zone dangereuse)
  admin: {
    getStatus: () => ipcRenderer.invoke('admin:getStatus'),
    initRecoveryEmail: (email) => ipcRenderer.invoke('admin:initRecoveryEmail', email),
    requestAccessCode: () => ipcRenderer.invoke('admin:requestAccessCode'),
    verifyAccessCode: (code) => ipcRenderer.invoke('admin:verifyAccessCode', code),
    requestEmailChangeCode: () => ipcRenderer.invoke('admin:requestEmailChangeCode'),
    changeRecoveryEmail: (code, newEmail) => ipcRenderer.invoke('admin:changeRecoveryEmail', code, newEmail),
    getCounts: () => ipcRenderer.invoke('admin:getCounts'),
    deleteCategories: (categories, withBackup) => ipcRenderer.invoke('admin:deleteCategories', categories, withBackup),
    factoryReset: (options) => ipcRenderer.invoke('admin:factoryReset', options)
  },
});

// Écoute les événements depuis main.js (ex: navigation depuis le tray)
contextBridge.exposeInMainWorld('events', {
  onNavigate: (callback) => {
    ipcRenderer.on('navigate-to', (event, page) => callback(page));
  }
});