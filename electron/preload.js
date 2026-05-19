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
    delete: (id) => ipcRenderer.invoke('locataires:delete', id),
    definitiveDelete: (id) => ipcRenderer.invoke('locataires:definitiveDelete', id),
    getHistorique: (bienId) => ipcRenderer.invoke('locataires:getHistorique', bienId),
    addHistorique: (bienId, data) => ipcRenderer.invoke('locataires:addHistorique', bienId, data)
  },
  // Photos par locataire
  photos: {
    getByLocataire: (locataireId) => ipcRenderer.invoke('photos:getByLocataire', locataireId),
    pick: () => ipcRenderer.invoke('photos:pick'),
    add: (locataireId, filePath, originalName) => ipcRenderer.invoke('photos:add', locataireId, filePath, originalName),
    delete: (id) => ipcRenderer.invoke('photos:delete', id),
    open: (id) => ipcRenderer.invoke('photos:open', id),
    getDataUrl: (id) => ipcRenderer.invoke('photos:getDataUrl', id)
  },
  // Loyers
  loyers: {
    getAll: () => ipcRenderer.invoke('loyers:getAll'),
    generate: () => ipcRenderer.invoke('loyers:generate'),
    updateStatut: (id, statut) => ipcRenderer.invoke('loyers:updateStatut', id, statut),
    getStatutMois: () => ipcRenderer.invoke('loyers:getStatutMois'),
    sendReminder: (loyerId) => ipcRenderer.invoke('loyers:sendReminder', loyerId),
    sendQuittance: (loyerId) => ipcRenderer.invoke('loyers:sendQuittance', loyerId),
    downloadQuittance: (loyerId) => ipcRenderer.invoke('loyers:downloadQuittance', loyerId),
    downloadAllQuittances: (ids) => ipcRenderer.invoke('loyers:downloadAllQuittances', ids),
    downloadAvis: (loyerId) => ipcRenderer.invoke('loyers:downloadAvis', loyerId),
    sendAvis: (loyerId) => ipcRenderer.invoke('loyers:sendAvis', loyerId),
    scorePaiement: (locataireId) => ipcRenderer.invoke('loyers:scorePaiement', locataireId),
    applyIRL: (data) => ipcRenderer.invoke('loyers:applyIRL', data),
    relanceAuto: (opts) => ipcRenderer.invoke('loyers:relanceAuto', opts)
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
  // Documents locataires
  documents: {
    getByLocataire: (locataireId) => ipcRenderer.invoke('documents:getByLocataire', locataireId),
    getCounts: () => ipcRenderer.invoke('documents:getCounts'),
    pick: () => ipcRenderer.invoke('documents:pick'),
    add: (locataireId, categorie) => ipcRenderer.invoke('documents:add', locataireId, categorie),
    addFromPath: (locataireId, categorie, filePath, originalName) => ipcRenderer.invoke('documents:addFromPath', locataireId, categorie, filePath, originalName),
    delete: (id) => ipcRenderer.invoke('documents:delete', id),
    open: (id) => ipcRenderer.invoke('documents:open', id),
    getData: (id) => ipcRenderer.invoke('documents:getData', id),
    setExpiration: (id, date) => ipcRenderer.invoke('documents:setExpiration', id, date)
  },
  // IA
  ia: {
    analyzeFiles: (files) => ipcRenderer.invoke('ia:analyzeFiles', files),
    rapprochementLoyers: (transactions) => ipcRenderer.invoke('ia:rapprochementLoyers', transactions),
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
  // Impôt
  impot: {
    getStats: (annee) => ipcRenderer.invoke('impot:getStats', annee),
    getCharges: (annee) => ipcRenderer.invoke('impot:getCharges', annee),
    addCharge: (data) => ipcRenderer.invoke('impot:addCharge', data),
    updateCharge: (id, data) => ipcRenderer.invoke('impot:updateCharge', id, data),
    deleteCharge: (id) => ipcRenderer.invoke('impot:deleteCharge', id),
    fiscal2044: (annee) => ipcRenderer.invoke('impot:fiscal2044', annee),
    exportFiscal2044PDF: (annee) => ipcRenderer.invoke('impot:exportFiscal2044PDF', annee)
  },
  // Paramètres
  parametres: {
    getAll: () => ipcRenderer.invoke('parametres:getAll'),
    set: (cle, valeur) => ipcRenderer.invoke('parametres:set', cle, valeur)
  },
  // Travaux
  travaux: {
    getAll: () => ipcRenderer.invoke('travaux:getAll'),
    add: (data) => ipcRenderer.invoke('travaux:add', data),
    update: (id, data) => ipcRenderer.invoke('travaux:update', id, data),
    delete: (id) => ipcRenderer.invoke('travaux:delete', id)
  },
  // Charges locatives
  charges: {
    getAll: (filters) => ipcRenderer.invoke('charges:getAll', filters),
    add: (data) => ipcRenderer.invoke('charges:add', data),
    update: (id, data) => ipcRenderer.invoke('charges:update', id, data),
    delete: (id) => ipcRenderer.invoke('charges:delete', id)
  },
  // Calendrier
  calendrier: {
    getEvents: (annee, mois) => ipcRenderer.invoke('calendrier:getEvents', annee, mois)
  },
  // Export
  export: {
    comptable: (annee) => ipcRenderer.invoke('export:comptable', annee)
  },
  // Bail
  bail: {
    generate: (locataireId) => ipcRenderer.invoke('bail:generate', locataireId)
  },
  // Dashboard
  dashboard: {
    getStats: () => ipcRenderer.invoke('dashboard:getStats'),
    evolution: () => ipcRenderer.invoke('dashboard:evolution'),
    evolutionAnnuelle: () => ipcRenderer.invoke('dashboard:evolutionAnnuelle'),
    stats: () => ipcRenderer.invoke('dashboard:getStats'),
    soldeParBien: (annee) => ipcRenderer.invoke('dashboard:soldeParBien', annee),
    evolutionParAnnee: (annee) => ipcRenderer.invoke('dashboard:evolutionParAnnee', annee),
    previsionnel: (annee) => ipcRenderer.invoke('dashboard:previsionnel', annee),
    parBien: (annee) => ipcRenderer.invoke('dashboard:parBien', annee)
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
  // Import CSV bancaire
  csv: {
    import: () => ipcRenderer.invoke('csv:import')
  },
  // Alertes configurables
  alertes: {
    checkAll: () => ipcRenderer.invoke('alertes:checkAll')
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
  // Licence
  license: {
    check:      ()    => ipcRenderer.invoke('license:check'),
    activate:   (key) => ipcRenderer.invoke('license:activate', key),
    deactivate: ()    => ipcRenderer.invoke('license:deactivate'),
    getInfo:    ()    => ipcRenderer.invoke('license:getInfo')
  },
  // Mises à jour auto
  updater: {
    checkNow: ()   => ipcRenderer.invoke('updater:checkNow'),
    install:  ()   => ipcRenderer.invoke('updater:install'),
    onStatus: (cb) => ipcRenderer.on('update-status', (_, data) => cb(data))
  },
  // Lettres types
  lettres: {
    generate: (template, vars) => ipcRenderer.invoke('lettres:generate', { template, vars })
  },
  // État des lieux
  edl: {
    getAll: () => ipcRenderer.invoke('edl:getAll'),
    add: (data) => ipcRenderer.invoke('edl:add', data),
    update: (id, data) => ipcRenderer.invoke('edl:update', id, data),
    delete: (id) => ipcRenderer.invoke('edl:delete', id),
    generatePDF: (id) => ipcRenderer.invoke('edl:generatePDF', id)
  },
  // Multi-clients
  clients: {
    list: () => ipcRenderer.invoke('clients:list'),
    getCurrent: () => ipcRenderer.invoke('clients:getCurrent'),
    create: (data) => ipcRenderer.invoke('clients:create', data),
    select: (id) => ipcRenderer.invoke('clients:select', id),
    rename: (id, nom) => ipcRenderer.invoke('clients:rename', id, nom),
    updateColor: (id, couleur) => ipcRenderer.invoke('clients:updateColor', id, couleur),
    delete: (id) => ipcRenderer.invoke('clients:delete', id),
    listTrash: () => ipcRenderer.invoke('clients:listTrash'),
    restore: (id) => ipcRenderer.invoke('clients:restore', id),
    permanentDelete: (id) => ipcRenderer.invoke('clients:permanentDelete', id)
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