process.on('uncaughtException', (err) => {
  try {
    require('fs').appendFileSync(
      require('path').join(require('os').homedir(), 'oiko-crash.log'),
      `[${new Date().toISOString()}] ${err.stack}\n`
    );
  } catch (_) { }
  console.error('CRASH:', err);
});

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, Notification, nativeImage } = require('electron');
const { setupUpdater }    = require('./updater');
const { checkLicenseStatus, activateLicense, deactivateLicense, getLicenseInfo } = require('./license');

// Définit l'identifiant Windows de l'app pour les notifications et la barre des tâches
// Sans ça, Windows affiche "electron.app.Electron" en mode dev
if (process.platform === 'win32') {
  app.setAppUserModelId('Oïko');
}

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const archiver = require('archiver');
const extract = require('extract-zip');
const Database = require('better-sqlite3');
const ExcelJS = require('exceljs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const isDev = !app.isPackaged;
let mainWindow;
let tray = null;
let isQuitting = false;
let notificationCheckInterval = null;
let backupCheckInterval = null;
let db;
let currentClient = null;

// ====== GESTION MULTI-CLIENTS ======
function getClientsFile() {
  return path.join(app.getPath('userData'), 'clients.json');
}

function loadClients() {
  const file = getClientsFile();
  if (!fs.existsSync(file)) return { clients: [], lastClientId: null };
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return { clients: [], lastClientId: null }; }
}

function saveClients(data) {
  fs.writeFileSync(getClientsFile(), JSON.stringify(data, null, 2), 'utf8');
}

function getClientDir(clientId) {
  const dir = path.join(app.getPath('userData'), 'clients', clientId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureClientsMigration() {
  const data = loadClients();
  if (data.clients.length > 0) return;
  // Premier lancement : migration de la DB existante vers le premier client
  const existingDb = path.join(app.getPath('userData'), 'oiko.db');
  const id = 'client_' + Date.now();
  const dir = getClientDir(id);
  const dbPath = path.join(dir, 'oiko.db');
  if (fs.existsSync(existingDb)) {
    fs.copyFileSync(existingDb, dbPath);
  }
  const first = { id, nom: 'SCI VASCO', couleur: '#3b82f6', initiales: 'SV', dbPath, createdAt: new Date().toISOString() };
  saveClients({ clients: [first], lastClientId: id });
}

// ====== STOCKAGE LOCAL FICHIERS EXCEL ======
function getExcelFolder() {
  const base = currentClient
    ? path.join(app.getPath('userData'), 'clients', currentClient.id, 'excel_files')
    : path.join(app.getPath('userData'), 'excel_files');
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
  return base;
}

function getExcelFilePath(id) {
  return path.join(getExcelFolder(), `facture_${id}.xlsx`);
}

// Écrit un .xlsx à partir de données JSON (avec colonnes EXACTES du cahier des charges)
async function writeXlsxFromData(filePath, nom, donnees) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Oïko';
  workbook.created = new Date();
  const ws = workbook.addWorksheet(nom.substring(0, 30) || 'Facture');

  ws.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Code Immeuble', key: 'code_immeuble', width: 18 },
    { header: 'Libellé', key: 'libelle', width: 35 },
    { header: 'Débit', key: 'debit', width: 12 },
    { header: 'Crédit', key: 'credit', width: 12 },
    { header: 'Solde', key: 'solde', width: 12 }
  ];

  // En-tête stylé
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.height = 22;

  (donnees || []).forEach(row => {
    ws.addRow({
      date: row.date || '',
      code_immeuble: row.code_immeuble || '',
      libelle: row.libelle || '',
      debit: parseFloat(row.debit) || 0,
      credit: parseFloat(row.credit) || 0,
      solde: parseFloat(row.solde) || 0
    });
  });

  // Format monétaire
  ['D', 'E', 'F'].forEach(col => {
    ws.getColumn(col).numFmt = '#,##0.00 "€"';
  });

  await workbook.xlsx.writeFile(filePath);
}

// ====== HELPER : RETRY AVEC BACKOFF POUR GEMINI ======
// Les erreurs 503 (surcharge), 429 (rate limit) et réseau sont réessayées automatiquement
async function callGeminiWithRetry(fn, options = {}) {
  const { maxRetries = 3, initialDelay = 1500, fallbackModel = null, genAI = null } = options;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err.message || '';
      const isRetryable =
        msg.includes('503') ||
        msg.includes('overloaded') ||
        msg.includes('high demand') ||
        msg.includes('429') ||
        msg.includes('Service Unavailable') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT');

      if (!isRetryable || attempt === maxRetries) break;

      // Dernier essai → bascule sur le modèle de secours si fourni
      if (attempt === maxRetries - 1 && fallbackModel && genAI) {
        console.log(`Gemini surchargé, bascule sur ${fallbackModel}`);
        const model = genAI.getGenerativeModel({ model: fallbackModel });
        try {
          return await fn(model);
        } catch (fbErr) {
          lastError = fbErr;
        }
      }

      // Backoff exponentiel : 1.5s, 3s, 6s
      const delay = initialDelay * Math.pow(2, attempt);
      console.log(`Tentative ${attempt + 1}/${maxRetries + 1} échouée, nouvelle tentative dans ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// Lit un .xlsx et retourne les données en JSON
async function readXlsxToData(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const ws = workbook.worksheets[0];
  if (!ws) return [];

  const rows = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // skip header
    rows.push({
      date: String(row.getCell(1).value || ''),
      code_immeuble: String(row.getCell(2).value || ''),
      libelle: String(row.getCell(3).value || ''),
      debit: parseFloat(row.getCell(4).value) || 0,
      credit: parseFloat(row.getCell(5).value) || 0,
      solde: parseFloat(row.getCell(6).value) || 0
    });
  });

  // Recalcul du solde progressif (sécurité au cas où édité à la main)
  let solde = 0;
  rows.forEach(r => {
    solde += r.credit - r.debit;
    r.solde = Math.round(solde * 100) / 100;
  });

  return rows;
}

// ====== CHIFFREMENT ======
const ENCRYPTION_KEY = crypto.scryptSync('oiko-secret-key-2026', 'salt', 32);
const IV_LENGTH = 16;

function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  if (!text || !text.includes(':')) return text || '';
  try {
    const [ivHex, encryptedText] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return '';
  }
}

// ====== BASE DE DONNÉES ======
function initDatabase(dbPath) {
  if (!dbPath) dbPath = currentClient?.dbPath || path.join(app.getPath('userData'), 'oiko.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS photos_bien (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bien_id INTEGER NOT NULL,
      nom_original TEXT NOT NULL,
      nom_fichier TEXT NOT NULL,
      chemin TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bien_id) REFERENCES biens(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS photos_locataire (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      locataire_id INTEGER NOT NULL,
      nom_original TEXT NOT NULL,
      nom_fichier TEXT NOT NULL,
      chemin TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (locataire_id) REFERENCES locataires(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS biens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      adresse TEXT NOT NULL,
      loyer_total REAL NOT NULL,
      surface REAL NOT NULL,
      caution REAL NOT NULL,
      code_immeuble TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS locataires (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      parking INTEGER DEFAULT 0,
      date_entree TEXT,
      bien_id INTEGER,
      caution_payee INTEGER DEFAULT 0,
      date_reception_loyer TEXT,
      telephone TEXT,
      email TEXT,
      aide_apl REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bien_id) REFERENCES biens(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS loyers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      locataire_id INTEGER,
      mois INTEGER,
      annee INTEGER,
      montant REAL,
      aide REAL DEFAULT 0,
      statut TEXT DEFAULT 'en_attente',
      date_paiement TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (locataire_id) REFERENCES locataires(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS factures_excel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      mois INTEGER,
      annee INTEGER,
      type TEXT DEFAULT 'mensuel',
      donnees TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      titre TEXT NOT NULL,
      message TEXT,
      lu INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS parametres (
      cle TEXT PRIMARY KEY,
      valeur TEXT
    );

    CREATE TABLE IF NOT EXISTS messages_ia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      contenu TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ia_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'Nouvelle conversation',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_otp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      purpose TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER DEFAULT 0,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS documents_locataire (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      locataire_id INTEGER NOT NULL,
      categorie TEXT NOT NULL,
      nom_original TEXT NOT NULL,
      nom_fichier TEXT NOT NULL,
      chemin TEXT NOT NULL,
      date_ajout DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (locataire_id) REFERENCES locataires(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS charges_fiscales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      annee INTEGER NOT NULL,
      categorie TEXT NOT NULL,
      libelle TEXT NOT NULL,
      montant REAL NOT NULL,
      bien_id INTEGER,
      date_charge TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bien_id) REFERENCES biens(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS travaux (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bien_id INTEGER,
      titre TEXT NOT NULL,
      description TEXT,
      prestataire TEXT,
      cout REAL DEFAULT 0,
      date_debut TEXT,
      date_fin TEXT,
      statut TEXT DEFAULT 'prevu',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bien_id) REFERENCES biens(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS charges_locatives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bien_id INTEGER,
      locataire_id INTEGER,
      categorie TEXT NOT NULL,
      libelle TEXT NOT NULL,
      montant REAL NOT NULL,
      date_charge TEXT,
      facture INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bien_id) REFERENCES biens(id) ON DELETE SET NULL,
      FOREIGN KEY (locataire_id) REFERENCES locataires(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS etat_des_lieux (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      locataire_id INTEGER,
      bien_id INTEGER,
      type TEXT NOT NULL,
      date_edl TEXT NOT NULL,
      pieces TEXT NOT NULL,
      observations TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (locataire_id) REFERENCES locataires(id) ON DELETE SET NULL,
      FOREIGN KEY (bien_id) REFERENCES biens(id) ON DELETE SET NULL
    );
  `);

  // Migration : date_expiration sur les documents locataires
  const docCols = db.prepare("PRAGMA table_info(documents_locataire)").all().map(c => c.name);
  if (!docCols.includes('date_expiration')) {
    db.exec("ALTER TABLE documents_locataire ADD COLUMN date_expiration TEXT DEFAULT NULL");
  }

  // Migration : adresse décomposée en 4 champs dans biens
  const biensCols = db.prepare("PRAGMA table_info(biens)").all().map(c => c.name);
  if (!biensCols.includes('complement_adresse')) {
    db.exec("ALTER TABLE biens ADD COLUMN complement_adresse TEXT DEFAULT ''");
  }
  if (!biensCols.includes('code_postal')) {
    db.exec("ALTER TABLE biens ADD COLUMN code_postal TEXT DEFAULT ''");
  }
  if (!biensCols.includes('ville')) {
    db.exec("ALTER TABLE biens ADD COLUMN ville TEXT DEFAULT ''");
  }
  // Migration : loyer hors charge + charges mensuelles
  if (!biensCols.includes('loyer_hors_charge')) {
    db.exec("ALTER TABLE biens ADD COLUMN loyer_hors_charge REAL DEFAULT 0");
    // Initialise loyer_hors_charge = loyer_total pour les biens existants
    db.exec("UPDATE biens SET loyer_hors_charge = loyer_total WHERE loyer_hors_charge = 0");
  }
  if (!biensCols.includes('charges_mensuelles')) {
    db.exec("ALTER TABLE biens ADD COLUMN charges_mensuelles REAL DEFAULT 0");
  }
  if (!biensCols.includes('num_identification_impot')) {
    db.exec("ALTER TABLE biens ADD COLUMN num_identification_impot TEXT DEFAULT ''");
  }
  if (!biensCols.includes('num_identification_impot_parking')) {
    db.exec("ALTER TABLE biens ADD COLUMN num_identification_impot_parking TEXT DEFAULT ''");
  }

  // Migration : actif + date_sortie sur les locataires (archivage)
  const locColsCheck = db.prepare("PRAGMA table_info(locataires)").all().map(c => c.name);
  if (!locColsCheck.includes('actif')) {
    db.exec("ALTER TABLE locataires ADD COLUMN actif INTEGER DEFAULT 1");
    db.exec("UPDATE locataires SET actif=1 WHERE actif IS NULL");
  }
  if (!locColsCheck.includes('date_sortie')) {
    db.exec("ALTER TABLE locataires ADD COLUMN date_sortie TEXT DEFAULT NULL");
  }
  if (!locColsCheck.includes('prenom2')) {
    db.exec("ALTER TABLE locataires ADD COLUMN prenom2 TEXT DEFAULT ''");
  }
  if (!locColsCheck.includes('nom2')) {
    db.exec("ALTER TABLE locataires ADD COLUMN nom2 TEXT DEFAULT ''");
  }

  // Migration : date_fin_bail sur les locataires
  const locCols = db.prepare("PRAGMA table_info(locataires)").all().map(c => c.name);
  if (!locCols.includes('date_fin_bail')) {
    db.exec("ALTER TABLE locataires ADD COLUMN date_fin_bail TEXT DEFAULT NULL");
  }

  // Migration : ajout de conversation_id dans messages_ia si la colonne n'existe pas
  const columns = db.prepare("PRAGMA table_info(messages_ia)").all();
  const hasConvId = columns.some(c => c.name === 'conversation_id');
  if (!hasConvId) {
    try {
      db.exec('ALTER TABLE messages_ia ADD COLUMN conversation_id INTEGER');
    } catch (err) {
      // Colonne déjà ajoutée par CREATE TABLE plus haut, on ignore
    }
  }

  // Migration : si des messages existent sans conversation_id, on les regroupe en une conversation "Anciens messages"
  const orphans = db.prepare('SELECT COUNT(*) as c FROM messages_ia WHERE conversation_id IS NULL').get();
  if (orphans.c > 0) {
    const result = db.prepare('INSERT INTO ia_conversations (title) VALUES (?)').run('Anciens messages');
    db.prepare('UPDATE messages_ia SET conversation_id=? WHERE conversation_id IS NULL').run(result.lastInsertRowid);
  }

  // Migration : numero_quittance sur loyers
  const loyersCols = db.prepare("PRAGMA table_info(loyers)").all().map(c => c.name);
  if (!loyersCols.includes('numero_quittance')) {
    db.exec("ALTER TABLE loyers ADD COLUMN numero_quittance TEXT DEFAULT NULL");
  }

  // Paramètres par défaut
  const defaults = [
    ['theme', 'light'],
    ['email_expediteur', ''],
    ['email_comptable', ''],
    ['smtp_host', ''],
    ['smtp_port', '587'],
    ['smtp_secure', 'false'],
    ['smtp_password', ''],
    ['notifications_sonores', 'true'],
    ['gemini_api_key', ''],
    ['backup_folder', ''],
    ['backup_auto', 'true'],
    ['backup_max_count', '30'],
    ['backup_last_date', ''],
    ['user_name', 'Utilisateur'],
    ['user_email', ''],
    ['recovery_email', ''],
    ['admin_lockout_until', '0'],
    ['first_launch_done', 'false'],
    ['notifications_systeme', 'true'],
    ['minimize_to_tray', 'true'],
    ['tray_notice_shown', 'false']
  ];

  const insertParam = db.prepare('INSERT OR IGNORE INTO parametres (cle, valeur) VALUES (?, ?)');
  defaults.forEach(([k, v]) => insertParam.run(k, v));
}

// ====== FENÊTRE PRINCIPALE ======
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0f172a',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1e3a8a',
      symbolColor: '#ffffff',
      height: 36
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Oïko',
    icon: path.join(__dirname, '..', 'build-resources', 'icon.ico'),
    show: false
  });

  // Intercepte la fermeture : on cache la fenêtre au lieu de quitter
  mainWindow.on('close', (event) => {
    if (isQuitting) return;

    // Respecte le paramètre : si l'utilisateur a désactivé le tray, on ferme vraiment
    if (getParam('minimize_to_tray') === 'false') {
      isQuitting = true;
      return;
    }

    event.preventDefault();
    mainWindow.hide();

    const hasShownTrayNotice = getParam('tray_notice_shown');
    if (hasShownTrayNotice !== 'true') {
      showSystemNotification(
        'Oïko continue en arrière-plan',
        'L\'application reste active dans la zone de notification. Clic-droit sur l\'icône pour quitter complètement.'
      );
      setParam('tray_notice_shown', 'true');
    }
  });

  // Quand on minimize sur Windows, certains préfèrent cacher la fenêtre
  // (commenté par défaut, décommente si tu veux)
  // mainWindow.on('minimize', (event) => {
  //   event.preventDefault();
  //   mainWindow.hide();
  // });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow.isVisible()) mainWindow.show();
  });

  // if (app.isPackaged) {
  //   mainWindow.loadFile(
  //     path.join(app.getAppPath(), 'build', 'index.html')
  //   );
  // } else {
  //   mainWindow.loadURL('http://localhost:3000');
  // }

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(app.getAppPath(), 'build', 'index.html'));
  } else {
    mainWindow.loadURL('http://localhost:3000');
  }

  mainWindow.setMenuBarVisibility(false);
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    try {
      ensureClientsMigration();
      const { clients, lastClientId } = loadClients();
      const client = clients.find(c => c.id === lastClientId) || clients[0];
      if (client) { currentClient = client; initDatabase(client.dbPath); }
    } catch (err) {
      console.error('initDatabase failed:', err);
      dialog.showErrorBox('Erreur base de données', err.message);
      app.quit();
      return;
    }

    // Initialise le tray et les vérifications périodiques
    createWindow();
    setupUpdater(mainWindow);
    createTray();
    startNotificationChecks();
    startBackupAutoCheck();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        mainWindow.show();
      }
    });

  });
}

app.on('window-all-closed', () => {
  // Sur Windows, on ne quitte PAS quand toutes les fenêtres sont fermées
  // car l'app continue de tourner via le tray
  if (process.platform === 'darwin') {
    app.quit();
  }
});

// Pattern safe pour backup async à la fermeture :
// - Au 1er before-quit, on empêche la fermeture et on lance le backup
// - Une fois le backup fini, on relance app.quit() (2ème passage, la fermeture se fait vraiment)
let backupOnQuitDone = false;

app.on('before-quit', async (event) => {
  if (backupOnQuitDone) {
    // 2ème passage : on nettoie et on laisse fermer
    if (notificationCheckInterval) clearInterval(notificationCheckInterval);
    if (backupCheckInterval) clearInterval(backupCheckInterval);
    return;
  }

  // 1er passage : on empêche la fermeture temporairement pour faire le backup
  if (shouldAutoBackup()) {
    event.preventDefault();
    isQuitting = true; // on est bien dans une logique de fermeture

    try {
      console.log('[backup auto] Backup avant fermeture...');
      await createBackup();
      rotateBackups();
      console.log('[backup auto] Backup terminé, fermeture...');
    } catch (err) {
      console.error('[backup auto] Échec avant fermeture :', err.message);
      // On continue la fermeture même si le backup échoue
    }

    backupOnQuitDone = true;
    app.quit(); // relance la fermeture, qui repassera par before-quit
  } else {
    // Pas de backup à faire, on nettoie directement
    isQuitting = true;
    if (notificationCheckInterval) clearInterval(notificationCheckInterval);
    if (backupCheckInterval) clearInterval(backupCheckInterval);
  }
});

// ====== IPC : BIENS ======
ipcMain.handle('biens:getAll', () => {
  const biens = db.prepare('SELECT * FROM biens ORDER BY created_at DESC').all();
  return biens.map(b => {
    const parts = [b.adresse, b.complement_adresse, b.code_postal, b.ville].filter(Boolean);
    return {
      ...b,
      code_immeuble_decrypted: decrypt(b.code_immeuble),
      num_identification_impot: b.num_identification_impot || '',
      num_identification_impot_parking: b.num_identification_impot_parking || '',
      adresse_complete: parts.join(', ')
    };
  });
});

ipcMain.handle('biens:add', (e, data) => {
  const loyerHC = Math.max(0, parseFloat(data.loyer_hors_charge) || 0);
  const charges = Math.max(0, parseFloat(data.charges_mensuelles) || 0);
  const loyer = loyerHC + charges;
  const surface = Math.max(0, parseFloat(data.surface) || 0);
  const caution = Math.max(0, parseFloat(data.caution) || 0);

  const stmt = db.prepare(`
    INSERT INTO biens (type, adresse, complement_adresse, code_postal, ville, loyer_hors_charge, charges_mensuelles, loyer_total, surface, caution, code_immeuble, num_identification_impot, num_identification_impot_parking)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    data.type, data.adresse || '', data.complement_adresse || '',
    data.code_postal || '', data.ville || '',
    loyerHC, charges, loyer, surface, caution, encrypt(data.code_immeuble),
    data.num_identification_impot || '', data.num_identification_impot_parking || ''
  );
  return { id: info.lastInsertRowid, ...data };
});

ipcMain.handle('biens:update', (e, id, data) => {
  const loyerHC = Math.max(0, parseFloat(data.loyer_hors_charge) || 0);
  const charges = Math.max(0, parseFloat(data.charges_mensuelles) || 0);
  const loyer = loyerHC + charges;
  const surface = Math.max(0, parseFloat(data.surface) || 0);
  const caution = Math.max(0, parseFloat(data.caution) || 0);

  const stmt = db.prepare(`
    UPDATE biens SET type=?, adresse=?, complement_adresse=?, code_postal=?, ville=?,
    loyer_hors_charge=?, charges_mensuelles=?, loyer_total=?, surface=?, caution=?, code_immeuble=?, num_identification_impot=?, num_identification_impot_parking=? WHERE id=?
  `);
  stmt.run(
    data.type, data.adresse || '', data.complement_adresse || '',
    data.code_postal || '', data.ville || '',
    loyerHC, charges, loyer, surface, caution, encrypt(data.code_immeuble),
    data.num_identification_impot || '', data.num_identification_impot_parking || '', id
  );
  return true;
});

ipcMain.handle('biens:delete', (e, id) => {
  db.prepare('DELETE FROM biens WHERE id=?').run(id);
  return true;
});

// ====== IPC : LOCATAIRES ======
ipcMain.handle('locataires:getAll', () => {
  const rows = db.prepare(`
    SELECT l.*, b.adresse as b_adresse, b.complement_adresse as b_complement,
           b.code_postal as b_cp, b.ville as b_ville,
           b.type as bien_type, b.loyer_total as bien_loyer
    FROM locataires l
    LEFT JOIN biens b ON l.bien_id = b.id
    WHERE l.actif=1
    ORDER BY l.created_at DESC
  `).all();
  return rows.map(r => {
    const parts = [r.b_adresse, r.b_complement, r.b_cp, r.b_ville].filter(Boolean);
    return { ...r, bien_adresse: parts.length ? parts.join(', ') : null };
  });
});

ipcMain.handle('locataires:getHistorique', (e, bienId) => {
  const rows = db.prepare(`
    SELECT l.*,
           b.adresse as b_adresse, b.complement_adresse as b_complement,
           b.code_postal as b_cp, b.ville as b_ville,
           COALESCE((
             SELECT SUM(ly.montant) FROM loyers ly WHERE ly.locataire_id = l.id
           ), 0) as total_loyers_encaisses,
           (SELECT MAX(ly.annee*100+ly.mois) FROM loyers ly WHERE ly.locataire_id = l.id) as derniere_periode
    FROM locataires l
    LEFT JOIN biens b ON l.bien_id = b.id
    WHERE l.bien_id=? AND l.actif=0
    ORDER BY l.date_sortie DESC
  `).all(bienId);
  return rows.map(r => {
    const parts = [r.b_adresse, r.b_complement, r.b_cp, r.b_ville].filter(Boolean);
    return { ...r, bien_adresse: parts.length ? parts.join(', ') : null };
  });
});

ipcMain.handle('locataires:add', (e, data) => {
  // Vérifie que le bien n'est pas déjà attribué (uniquement locataires actifs)
  if (data.bien_id) {
    const existing = db.prepare('SELECT id, nom, prenom FROM locataires WHERE bien_id=? AND actif=1').get(data.bien_id);
    if (existing) {
      return {
        error: `Ce bien est déjà attribué à ${existing.prenom} ${existing.nom}. Désassignez-le d'abord.`
      };
    }
  }

  // Force aide_apl ≥ 0
  const aideApl = Math.max(0, parseFloat(data.aide_apl) || 0);

  const stmt = db.prepare(`INSERT INTO locataires (nom, prenom, prenom2, nom2, parking, date_entree, date_fin_bail, bien_id, caution_payee, date_reception_loyer, telephone, email, aide_apl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(data.nom, data.prenom, data.prenom2 || '', data.nom2 || '', data.parking ? 1 : 0, data.date_entree, data.date_fin_bail || null, data.bien_id, data.caution_payee ? 1 : 0, data.date_reception_loyer, data.telephone, data.email, aideApl);
  return { id: info.lastInsertRowid };
});

ipcMain.handle('locataires:update', (e, id, data) => {
  if (data.bien_id) {
    const existing = db.prepare('SELECT id, nom, prenom FROM locataires WHERE bien_id=? AND id!=? AND actif=1').get(data.bien_id, id);
    if (existing) {
      return {
        error: `Ce bien est déjà attribué à ${existing.prenom} ${existing.nom}. Désassignez-le d'abord.`
      };
    }
  }

  const aideApl = Math.max(0, parseFloat(data.aide_apl) || 0);

  db.prepare(`UPDATE locataires SET nom=?, prenom=?, prenom2=?, nom2=?, parking=?, date_entree=?, date_fin_bail=?, bien_id=?, caution_payee=?, date_reception_loyer=?, telephone=?, email=?, aide_apl=? WHERE id=?`).run(
    data.nom, data.prenom, data.prenom2 || '', data.nom2 || '', data.parking ? 1 : 0, data.date_entree, data.date_fin_bail || null, data.bien_id, data.caution_payee ? 1 : 0, data.date_reception_loyer, data.telephone, data.email, aideApl, id
  );
  return true;
});

ipcMain.handle('locataires:delete', (e, id) => {
  // Archive le locataire au lieu de le supprimer définitivement
  const today = new Date().toISOString().split('T')[0];
  db.prepare('UPDATE locataires SET actif=0, date_sortie=? WHERE id=?').run(today, id);
  return true;
});

ipcMain.handle('locataires:definitiveDelete', (e, id) => {
  db.prepare('DELETE FROM locataires WHERE id=?').run(id);
  return true;
});

// Crée directement un locataire archivé (historique) sans passer par le statut actif
ipcMain.handle('locataires:addHistorique', (e, bienId, data) => {
  const stmt = db.prepare(`
    INSERT INTO locataires
      (nom, prenom, bien_id, date_entree, date_sortie, date_fin_bail, telephone, email, aide_apl, parking, actif)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);
  const info = stmt.run(
    data.nom, data.prenom, bienId,
    data.date_entree || null, data.date_sortie || null, data.date_fin_bail || null,
    data.telephone || '', data.email || '',
    Math.max(0, parseFloat(data.aide_apl) || 0),
    data.parking ? 1 : 0
  );
  return { id: info.lastInsertRowid };
});

// ====== IPC : DOCUMENTS LOCATAIRES ======
function getDocumentsFolder(locataireId) {
  const folder = path.join(app.getPath('userData'), 'documents_locataires', String(locataireId));
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  return folder;
}

ipcMain.handle('documents:getByLocataire', (e, locataireId) => {
  return db.prepare(
    'SELECT * FROM documents_locataire WHERE locataire_id=? ORDER BY categorie, date_ajout'
  ).all(locataireId);
});

// Ouvre le sélecteur de fichier et retourne le chemin sans sauvegarder (pour la création)
ipcMain.handle('documents:pick', async (e) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Sélectionner un document',
    properties: ['openFile'],
    filters: [
      { name: 'Documents & Images', extensions: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'heic', 'webp', 'gif'] },
      { name: 'Tous les fichiers', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  return { filePath: result.filePaths[0], originalName: path.basename(result.filePaths[0]) };
});

// Copie un fichier depuis un chemin existant et l'enregistre en base (utilisé après création du locataire)
ipcMain.handle('documents:addFromPath', (e, locataireId, categorie, filePath, originalName) => {
  const ext = path.extname(filePath);
  const nomFichier = `${Date.now()}${ext}`;
  const folder = getDocumentsFolder(locataireId);
  const destPath = path.join(folder, nomFichier);
  fs.copyFileSync(filePath, destPath);
  const info = db.prepare(
    'INSERT INTO documents_locataire (locataire_id, categorie, nom_original, nom_fichier, chemin) VALUES (?, ?, ?, ?, ?)'
  ).run(locataireId, categorie, originalName, nomFichier, destPath);
  return { id: info.lastInsertRowid };
});

// Ancienne méthode (ouvre dialog ET sauvegarde directement — mode édition rapide)
ipcMain.handle('documents:add', async (e, locataireId, categorie) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Sélectionner un document',
    properties: ['openFile'],
    filters: [
      { name: 'Documents & Images', extensions: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'heic', 'webp', 'gif'] },
      { name: 'Tous les fichiers', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;

  const sourcePath = result.filePaths[0];
  const nomOriginal = path.basename(sourcePath);
  const ext = path.extname(sourcePath);
  const nomFichier = `${Date.now()}${ext}`;
  const folder = getDocumentsFolder(locataireId);
  const destPath = path.join(folder, nomFichier);
  fs.copyFileSync(sourcePath, destPath);

  const info = db.prepare(
    'INSERT INTO documents_locataire (locataire_id, categorie, nom_original, nom_fichier, chemin) VALUES (?, ?, ?, ?, ?)'
  ).run(locataireId, categorie, nomOriginal, nomFichier, destPath);

  return { id: info.lastInsertRowid, locataire_id: locataireId, categorie, nom_original: nomOriginal, nom_fichier: nomFichier, chemin: destPath };
});

ipcMain.handle('documents:delete', (e, id) => {
  const doc = db.prepare('SELECT * FROM documents_locataire WHERE id=?').get(id);
  if (doc && fs.existsSync(doc.chemin)) {
    try { fs.unlinkSync(doc.chemin); } catch (_) {}
  }
  db.prepare('DELETE FROM documents_locataire WHERE id=?').run(id);
  return true;
});

ipcMain.handle('documents:open', async (e, id) => {
  const doc = db.prepare('SELECT * FROM documents_locataire WHERE id=?').get(id);
  if (!doc || !fs.existsSync(doc.chemin)) return { success: false, error: 'Fichier introuvable' };
  await shell.openPath(doc.chemin);
  return { success: true };
});

ipcMain.handle('documents:getCounts', () => {
  return db.prepare('SELECT locataire_id, COUNT(*) as count FROM documents_locataire GROUP BY locataire_id').all();
});

ipcMain.handle('documents:getData', (e, id) => {
  const doc = db.prepare('SELECT * FROM documents_locataire WHERE id=?').get(id);
  if (!doc || !fs.existsSync(doc.chemin)) return { success: false, error: 'Fichier introuvable' };
  const data = fs.readFileSync(doc.chemin);
  return { success: true, data: data.toString('base64'), nom: doc.nom_original };
});

ipcMain.handle('documents:setExpiration', (e, id, dateExpiration) => {
  db.prepare('UPDATE documents_locataire SET date_expiration=? WHERE id=?').run(dateExpiration || null, id);
  return true;
});

// ====== IPC : LOYERS ======
ipcMain.handle('loyers:getAll', () => {
  return db.prepare(`
    SELECT ly.*, l.nom, l.prenom, b.adresse as bien_adresse, b.type as bien_type
    FROM loyers ly
    LEFT JOIN locataires l ON ly.locataire_id = l.id
    LEFT JOIN biens b ON l.bien_id = b.id
    ORDER BY ly.annee DESC, ly.mois DESC
  `).all();
});

ipcMain.handle('loyers:getStatutMois', () => {
  // Retourne le statut du loyer le plus récent par locataire
  return db.prepare(`
    SELECT l1.locataire_id, l1.statut
    FROM loyers l1
    WHERE l1.rowid = (
      SELECT l2.rowid FROM loyers l2
      WHERE l2.locataire_id = l1.locataire_id
      ORDER BY l2.annee DESC, l2.mois DESC
      LIMIT 1
    )
  `).all();
});

ipcMain.handle('loyers:generate', () => {
  // Génère les loyers du mois courant pour tous les locataires
  const now = new Date();
  const mois = now.getMonth() + 1;
  const annee = now.getFullYear();
  const locataires = db.prepare(`
    SELECT l.*, b.loyer_total FROM locataires l
    LEFT JOIN biens b ON l.bien_id = b.id
    WHERE l.bien_id IS NOT NULL
  `).all();

  const insert = db.prepare(`INSERT INTO loyers (locataire_id, mois, annee, montant, aide, statut) VALUES (?, ?, ?, ?, ?, ?)`);
  const check = db.prepare(`SELECT id FROM loyers WHERE locataire_id=? AND mois=? AND annee=?`);

  locataires.forEach(loc => {
    const existing = check.get(loc.id, mois, annee);
    if (!existing) {
      insert.run(loc.id, mois, annee, loc.loyer_total || 0, loc.aide_apl || 0, 'en_attente');
    }
  });
  return true;
});

ipcMain.handle('loyers:updateStatut', (e, id, statut) => {
  const datePaiement = statut === 'paye' ? new Date().toISOString() : null;
  db.prepare('UPDATE loyers SET statut=?, date_paiement=? WHERE id=?').run(statut, datePaiement, id);
  return true;
});

// ====== IPC : FICHIERS EXCEL (double stockage : .xlsx local + DB) ======

// Liste depuis la DB (rapide, filtrable)
ipcMain.handle('excel:getAll', (e, filters = {}) => {
  let query = 'SELECT id, nom, mois, annee, type, created_at, updated_at FROM factures_excel';
  const conditions = [];
  const params = [];

  if (filters.mois) { conditions.push('mois=?'); params.push(filters.mois); }
  if (filters.annee) { conditions.push('annee=?'); params.push(filters.annee); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY annee DESC, mois DESC';

  const rows = db.prepare(query).all(...params);

  // Ajoute le chemin du fichier local et sa présence sur disque
  return rows.map(r => {
    const localPath = getExcelFilePath(r.id);
    return {
      ...r,
      local_path: localPath,
      file_exists: fs.existsSync(localPath)
    };
  });
});

// Récupère les données d'un fichier : LECTURE DEPUIS LE .xlsx LOCAL (source de vérité pour édition)
// Fallback DB si le fichier local n'existe pas
ipcMain.handle('excel:getData', async (e, id) => {
  const file = db.prepare('SELECT * FROM factures_excel WHERE id=?').get(id);
  if (!file) return null;

  const localPath = getExcelFilePath(id);

  if (fs.existsSync(localPath)) {
    // Source de vérité pour l'édition : le fichier local
    try {
      const donnees = await readXlsxToData(localPath);
      return { ...file, donnees, local_path: localPath };
    } catch (err) {
      console.error('Erreur lecture .xlsx local, fallback DB:', err);
    }
  }

  // Fallback : DB (et on recrée le fichier local)
  const donnees = JSON.parse(file.donnees || '[]');
  try {
    await writeXlsxFromData(localPath, file.nom, donnees);
  } catch (err) {
    console.error('Erreur écriture .xlsx:', err);
  }
  return { ...file, donnees, local_path: localPath };
});

// Création : INSERT DB puis génération du .xlsx local
// Pour un fichier annuel, agrège automatiquement TOUTES les données de l'année
ipcMain.handle('excel:create', async (e, data) => {
  const type = data.type || 'mensuel';
  let nom = data.nom;
  let donnees = data.donnees || [];

  // Si annuel et aucune donnée fournie, on agrège automatiquement
  if (type === 'annuel' && donnees.length === 0) {
    nom = nom || `Recap_Annuel_${data.annee}`;
    donnees = aggregateYearData(data.annee);
  } else {
    nom = nom || `Facture_${data.mois}_${data.annee}`;
  }

  const stmt = db.prepare(`INSERT INTO factures_excel (nom, mois, annee, type, donnees) VALUES (?, ?, ?, ?, ?)`);
  const info = stmt.run(nom, data.mois || null, data.annee, type, JSON.stringify(donnees));
  const id = info.lastInsertRowid;

  try {
    await writeXlsxFromData(getExcelFilePath(id), nom, donnees);
  } catch (err) {
    console.error('Erreur création .xlsx:', err);
  }

  return { id, rowCount: donnees.length };
});

// Agrège toutes les données financières d'une année donnée
// (loyers payés + transactions des factures mensuelles)
function aggregateYearData(annee) {
  const allRows = [];

  // 1. Récupère tous les loyers payés de l'année, avec code immeuble du bien
  const loyers = db.prepare(`
    SELECT ly.*, l.nom, l.prenom, b.code_immeuble, b.adresse
    FROM loyers ly
    LEFT JOIN locataires l ON ly.locataire_id = l.id
    LEFT JOIN biens b ON l.bien_id = b.id
    WHERE ly.annee = ? AND ly.statut = 'paye'
    ORDER BY ly.annee ASC, ly.mois ASC
  `).all(annee);

  const moisLabels = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  loyers.forEach(l => {
    const dateStr = `01/${String(l.mois).padStart(2, '0')}/${l.annee}`;
    const codeImmeuble = l.code_immeuble ? decrypt(l.code_immeuble) : '';
    const nomComplet = `${l.prenom || ''} ${l.nom || ''}`.trim();

    allRows.push({
      date: dateStr,
      code_immeuble: codeImmeuble,
      libelle: `Loyer ${moisLabels[l.mois - 1]} - ${nomComplet || 'locataire'}`,
      debit: 0,
      credit: parseFloat(l.montant) || 0,
      solde: 0 // recalculé plus bas
    });
  });

  // 2. Récupère toutes les transactions des fichiers mensuels de l'année
  const monthlyFiles = db.prepare(`
    SELECT donnees, mois FROM factures_excel
    WHERE annee = ? AND type = 'mensuel'
    ORDER BY mois ASC
  `).all(annee);

  monthlyFiles.forEach(file => {
    try {
      const rows = JSON.parse(file.donnees || '[]');
      rows.forEach(r => {
        allRows.push({
          date: r.date || `01/${String(file.mois).padStart(2, '0')}/${annee}`,
          code_immeuble: r.code_immeuble || '',
          libelle: r.libelle || '',
          debit: parseFloat(r.debit) || 0,
          credit: parseFloat(r.credit) || 0,
          solde: 0
        });
      });
    } catch (err) {
      console.error('Erreur parse donnees fichier mensuel:', err);
    }
  });

  // 3. Trie par date et recalcule le solde progressif
  allRows.sort((a, b) => {
    // Convertit JJ/MM/AAAA pour comparaison
    const parseDate = (str) => {
      const parts = String(str).split('/');
      if (parts.length !== 3) return 0;
      return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
    };
    return parseDate(a.date) - parseDate(b.date);
  });

  let solde = 0;
  allRows.forEach(r => {
    solde += (r.credit || 0) - (r.debit || 0);
    r.solde = Math.round(solde * 100) / 100;
  });

  return allRows;
}

// Régénère les données d'un fichier annuel à partir de l'état actuel de la DB
ipcMain.handle('excel:regenerateAnnual', async (e, id) => {
  const file = db.prepare('SELECT * FROM factures_excel WHERE id=?').get(id);
  if (!file) return { success: false, error: 'Fichier introuvable' };
  if (file.type !== 'annuel') return { success: false, error: 'Ce fichier n\'est pas un récap annuel' };

  try {
    const donnees = aggregateYearData(file.annee);
    const localPath = getExcelFilePath(id);

    // Réécrit le .xlsx local
    await writeXlsxFromData(localPath, file.nom, donnees);

    // Met à jour la DB
    db.prepare('UPDATE factures_excel SET donnees=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(JSON.stringify(donnees), id);

    return { success: true, rowCount: donnees.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Mise à jour : on écrit d'abord le .xlsx local, puis on synchronise la DB
// (le fichier local est la source de vérité pour l'édition)
ipcMain.handle('excel:update', async (e, id, donnees) => {
  const file = db.prepare('SELECT * FROM factures_excel WHERE id=?').get(id);
  if (!file) return false;

  const localPath = getExcelFilePath(id);

  // 1. Écrit le .xlsx local (source de vérité pour modification)
  try {
    await writeXlsxFromData(localPath, file.nom, donnees);
  } catch (err) {
    console.error('Erreur écriture .xlsx local:', err);
    return false;
  }

  // 2. Synchronise la DB depuis le fichier local (lecture complète → garantit cohérence)
  try {
    const reloaded = await readXlsxToData(localPath);
    db.prepare('UPDATE factures_excel SET donnees=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(JSON.stringify(reloaded), id);
  } catch (err) {
    // Fallback : synchronise avec les données fournies
    db.prepare('UPDATE factures_excel SET donnees=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(JSON.stringify(donnees), id);
  }

  return true;
});

// Suppression : DB + fichier local
ipcMain.handle('excel:delete', async (e, id) => {
  db.prepare('DELETE FROM factures_excel WHERE id=?').run(id);
  const localPath = getExcelFilePath(id);
  try {
    await fs.promises.access(localPath);
    await fs.promises.unlink(localPath);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Erreur suppr .xlsx:', err);
  }
  return true;
});

// Export : copie le fichier local vers l'emplacement choisi par l'utilisateur
ipcMain.handle('excel:export', async (e, id) => {
  const file = db.prepare('SELECT * FROM factures_excel WHERE id=?').get(id);
  if (!file) return null;

  const localPath = getExcelFilePath(id);

  // Si le fichier local n'existe pas (cas improbable), on le recrée depuis la DB
  if (!fs.existsSync(localPath)) {
    const donnees = JSON.parse(file.donnees || '[]');
    await writeXlsxFromData(localPath, file.nom, donnees);
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter le fichier Excel',
    defaultPath: `${file.nom}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  });

  if (result.canceled || !result.filePath) return null;

  // Copie simple du fichier local vers la destination
  fs.copyFileSync(localPath, result.filePath);
  return result.filePath;
});

// Ouvrir le fichier local dans Excel/LibreOffice (pour édition externe)
ipcMain.handle('excel:openLocal', async (e, id) => {
  const localPath = getExcelFilePath(id);
  if (!fs.existsSync(localPath)) {
    // Recrée le fichier depuis la DB si besoin
    const file = db.prepare('SELECT * FROM factures_excel WHERE id=?').get(id);
    if (!file) return { success: false, error: 'Fichier introuvable' };
    const donnees = JSON.parse(file.donnees || '[]');
    await writeXlsxFromData(localPath, file.nom, donnees);
  }
  await shell.openPath(localPath);
  return { success: true, path: localPath };
});

// Resynchronise la DB depuis le .xlsx local (utile si modifié dans Excel externe)
ipcMain.handle('excel:syncFromLocal', async (e, id) => {
  const localPath = getExcelFilePath(id);
  if (!fs.existsSync(localPath)) return { success: false, error: 'Fichier local introuvable' };

  try {
    const donnees = await readXlsxToData(localPath);
    db.prepare('UPDATE factures_excel SET donnees=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(JSON.stringify(donnees), id);
    return { success: true, rowCount: donnees.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Envoi au comptable via SMTP avec pièces jointes automatiques
ipcMain.handle('excel:sendToAccountant', async (e, payload) => {
  const { ids, subject, body, customEmail } = payload;

  // Récupère les paramètres SMTP
  const getParam = (cle) => db.prepare('SELECT valeur FROM parametres WHERE cle=?').get(cle)?.valeur || '';

  const smtpHost = getParam('smtp_host');
  const smtpPort = parseInt(getParam('smtp_port')) || 587;
  const smtpSecure = getParam('smtp_secure') === 'true';
  const smtpUser = getParam('email_expediteur');
  const smtpPass = getParam('smtp_password');
  const destinataire = customEmail || getParam('email_comptable');

  if (!smtpHost || !smtpUser || !smtpPass) {
    return {
      success: false,
      error: 'Configuration SMTP incomplète. Allez dans Paramètres > Configuration Email pour la compléter.'
    };
  }
  if (!destinataire) {
    return { success: false, error: 'Aucun destinataire spécifié.' };
  }

  // Récupère les fichiers Excel à envoyer
  const files = ids
    .map(id => {
      const f = db.prepare('SELECT * FROM factures_excel WHERE id=?').get(id);
      if (!f) return null;
      return { ...f, local_path: getExcelFilePath(id) };
    })
    .filter(Boolean);

  if (files.length === 0) {
    return { success: false, error: 'Aucun fichier sélectionné.' };
  }

  // Vérifie que tous les fichiers existent
  const missingFiles = files.filter(f => !fs.existsSync(f.local_path));
  if (missingFiles.length > 0) {
    return {
      success: false,
      error: `Fichiers locaux manquants : ${missingFiles.map(f => f.nom).join(', ')}`
    };
  }

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure, // true pour 465, false pour autres ports
      auth: { user: smtpUser, pass: smtpPass }
    });

    const attachments = files.map(f => ({
      filename: `${f.nom}.xlsx`,
      path: f.local_path
    }));

    const info = await transporter.sendMail({
      from: smtpUser,
      to: destinataire,
      subject: subject || `Fichiers comptables - ${files.map(f => f.nom).join(', ')}`,
      text: body || `Bonjour,\n\nVeuillez trouver en pièces jointes les fichiers comptables suivants :\n${files.map(f => `- ${f.nom}`).join('\n')}\n\nCordialement`,
      attachments
    });

    return {
      success: true,
      fileCount: files.length,
      messageId: info.messageId,
      destinataire
    };
  } catch (err) {
    // Erreurs SMTP fréquentes avec messages compréhensibles
    let msg = err.message || String(err);
    if (msg.includes('Invalid login') || msg.includes('535')) {
      msg = 'Identifiants SMTP invalides. Pour Gmail, utilisez un "mot de passe d\'application", pas votre mot de passe habituel.';
    } else if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
      msg = 'Impossible de se connecter au serveur SMTP. Vérifiez le serveur et le port dans Paramètres.';
    } else if (msg.includes('ENOTFOUND')) {
      msg = 'Serveur SMTP introuvable. Vérifiez l\'adresse du serveur.';
    } else if (msg.includes('self signed') || msg.includes('certificate')) {
      msg = 'Problème de certificat SSL avec le serveur SMTP. Essayez un autre port (587 au lieu de 465 ou inversement).';
    }
    return { success: false, error: msg };
  }
});

// Teste la connexion SMTP sans envoyer de mail
ipcMain.handle('smtp:test', async () => {
  const getParam = (cle) => db.prepare('SELECT valeur FROM parametres WHERE cle=?').get(cle)?.valeur || '';

  const smtpHost = getParam('smtp_host');
  const smtpPort = parseInt(getParam('smtp_port')) || 587;
  const smtpSecure = getParam('smtp_secure') === 'true';
  const smtpUser = getParam('email_expediteur');
  const smtpPass = getParam('smtp_password');

  if (!smtpHost || !smtpUser || !smtpPass) {
    return { success: false, error: 'Paramètres SMTP incomplets' };
  }

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPass }
    });
    await transporter.verify();
    return { success: true };
  } catch (err) {
    let msg = err.message || String(err);
    if (msg.includes('Invalid login') || msg.includes('535')) {
      msg = 'Identifiants invalides. Pour Gmail, générez un mot de passe d\'application.';
    } else if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
      msg = 'Connexion refusée. Vérifiez serveur et port.';
    } else if (msg.includes('ENOTFOUND')) {
      msg = 'Serveur SMTP introuvable.';
    }
    return { success: false, error: msg };
  }
});

// ====== IPC : IMPORT FICHIERS & ANALYSE IA ======
ipcMain.handle('files:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importer des factures',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Factures', extensions: ['pdf', 'png', 'jpg', 'jpeg'] }]
  });

  if (result.canceled) return [];

  return result.filePaths.map(filePath => {
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return {
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
      type: ext.replace('.', '')
    };
  });
});

// ====== IPC : IMPORT CSV BANCAIRE ======
ipcMain.handle('csv:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importer un relevé bancaire CSV',
    properties: ['openFile'],
    filters: [{ name: 'Fichiers CSV', extensions: ['csv'] }]
  });
  if (result.canceled) return null;
  // Try UTF-8 first, fall back to latin1 (used by many French banks)
  let content;
  try {
    content = fs.readFileSync(result.filePaths[0], 'utf8');
    // Detect BOM and strip it
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  } catch {
    content = fs.readFileSync(result.filePaths[0], 'latin1');
  }
  return { content, name: path.basename(result.filePaths[0]) };
});

// Formatte les erreurs Gemini en messages compréhensibles pour l'utilisateur
function formatGeminiError(err) {
  const msg = err.message || String(err);
  if (msg.includes('503') || msg.includes('overloaded') || msg.includes('high demand')) {
    return 'Les serveurs Gemini sont actuellement surchargés. Merci de réessayer dans quelques minutes.';
  }
  if (msg.includes('429')) {
    return 'Limite de requêtes Gemini atteinte. Merci d\'attendre une minute avant de réessayer.';
  }
  if (msg.includes('API key') || msg.includes('401') || msg.includes('403')) {
    return 'Clé API Gemini invalide ou expirée. Vérifiez vos Paramètres.';
  }
  if (msg.includes('404') || msg.includes('not found')) {
    return 'Modèle Gemini introuvable. Il a peut-être été déprécié — contactez le support.';
  }
  if (msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('network')) {
    return 'Problème de connexion Internet. Vérifiez votre connexion et réessayez.';
  }
  return msg;
}

// ====== IPC : RAPPROCHEMENT IA ↔ LOYERS ======
ipcMain.handle('ia:rapprochementLoyers', (e, transactions) => {
  try {
    // Récupère tous les loyers non payés avec infos locataire et bien
    const unpaidLoyers = db.prepare(`
      SELECT ly.id, ly.locataire_id, ly.mois, ly.annee, ly.montant, ly.statut,
             l.nom, l.prenom, l.nom2, l.prenom2,
             b.adresse as bien_adresse, b.code_immeuble as bien_code
      FROM loyers ly
      LEFT JOIN locataires l ON ly.locataire_id = l.id
      LEFT JOIN biens b ON l.bien_id = b.id
      WHERE ly.statut IN ('en_attente', 'retard', 'partiel')
      ORDER BY ly.annee DESC, ly.mois DESC
    `).all();

    const matches = [];

    for (const tx of transactions) {
      const txCredit = parseFloat(tx.credit) || 0;
      if (txCredit <= 0) continue;

      const libelleLower = (tx.libelle || '').toLowerCase();

      // Parse date JJ/MM/AAAA
      let txMois = null, txAnnee = null;
      if (tx.date) {
        const parts = tx.date.split('/');
        if (parts.length === 3) {
          txMois = parseInt(parts[1]);
          txAnnee = parseInt(parts[2]);
        }
      }

      let bestMatch = null;
      let bestScore = 0;

      for (const loyer of unpaidLoyers) {
        let score = 0;
        const montant = parseFloat(loyer.montant) || 0;
        if (montant <= 0) continue;

        // Correspondance montant (priorité max : 50 pts)
        const diff = Math.abs(txCredit - montant);
        if (diff < 0.01) {
          score += 50;
        } else if (diff / montant < 0.05) {
          score += 30; // Tolérance 5 %
        } else if (diff / montant < 0.20) {
          score += 10; // Tolérance 20 %
        }

        // Correspondance nom/prénom dans libellé (30 pts)
        const nom = (loyer.nom || '').toLowerCase();
        const prenom = (loyer.prenom || '').toLowerCase();
        const nom2 = (loyer.nom2 || '').toLowerCase();
        const prenom2 = (loyer.prenom2 || '').toLowerCase();
        if (nom.length >= 3 && libelleLower.includes(nom)) score += 20;
        if (prenom.length >= 3 && libelleLower.includes(prenom)) score += 10;
        if (nom2.length >= 3 && libelleLower.includes(nom2)) score += 10;
        if (prenom2.length >= 3 && libelleLower.includes(prenom2)) score += 5;

        // Correspondance code immeuble (15 pts)
        const codeImm = (decrypt(loyer.bien_code || '') || '').toLowerCase();
        const txCode = (tx.code_immeuble || '').toLowerCase();
        if (codeImm.length >= 2 && txCode === codeImm) score += 15;
        else if (codeImm.length >= 2 && libelleLower.includes(codeImm)) score += 8;

        // Correspondance mois/année (10 pts)
        if (txMois && txAnnee) {
          if (loyer.mois === txMois && loyer.annee === txAnnee) score += 10;
          else if (loyer.annee === txAnnee) score += 3;
        }

        if (score > bestScore && score >= 30) {
          bestScore = score;
          bestMatch = loyer;
        }
      }

      if (bestMatch) {
        const MOIS_LABELS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
          'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        matches.push({
          tx_id: tx._id !== undefined ? tx._id : null,
          tx_index: transactions.indexOf(tx),
          transaction_libelle: tx.libelle,
          transaction_credit: txCredit,
          transaction_date: tx.date,
          loyer: {
            id: bestMatch.id,
            locataire_nom: `${bestMatch.prenom || ''} ${bestMatch.nom || ''}`.trim(),
            bien_adresse: bestMatch.bien_adresse,
            mois_label: MOIS_LABELS[bestMatch.mois] || bestMatch.mois,
            mois: bestMatch.mois,
            annee: bestMatch.annee,
            montant: bestMatch.montant,
            statut: bestMatch.statut
          },
          score: bestScore,
          confidence: bestScore >= 70 ? 'haute' : bestScore >= 50 ? 'moyenne' : 'faible'
        });
      }
    }

    return { success: true, matches };
  } catch (err) {
    console.error('Rapprochement erreur:', err);
    return { success: false, matches: [], error: err.message };
  }
});

ipcMain.handle('ia:analyzeFiles', async (e, files) => {
  const apiKey = db.prepare('SELECT valeur FROM parametres WHERE cle=?').get('gemini_api_key');
  if (!apiKey || !apiKey.valeur) {
    return { success: false, error: 'Clé API Gemini non configurée. Ajoutez-la dans Paramètres.' };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey.valeur);
    const defaultModel = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

    const biens = db.prepare('SELECT id, adresse, code_immeuble FROM biens').all();
    const codesList = biens.map(b => `${b.adresse} -> ${decrypt(b.code_immeuble)}`).join('\n');

    const results = [];
    for (const file of files) {
      const fileBuffer = fs.readFileSync(file.path);
      const base64 = fileBuffer.toString('base64');
      const mimeType = file.type === 'pdf' ? 'application/pdf' : `image/${file.type === 'jpg' ? 'jpeg' : file.type}`;

      const prompt = `Analyse cette facture/relevé et extrais les transactions au format JSON strict.
Codes immeubles disponibles :
${codesList}

Retourne UNIQUEMENT un JSON avec ce format exact :
{
  "transactions": [
    {"date": "JJ/MM/AAAA", "code_immeuble": "code ou vide", "libelle": "description", "debit": nombre ou 0, "credit": nombre ou 0}
  ]
}
Si c'est un débit, mets la valeur dans "debit" et 0 dans "credit". Inverse pour crédit.`;

      // Retry automatique avec fallback sur gemini-2.5-flash si surcharge
      const result = await callGeminiWithRetry(
        async (overrideModel) => (overrideModel || defaultModel).generateContent([
          { inlineData: { data: base64, mimeType } },
          prompt
        ]),
        { maxRetries: 3, fallbackModel: 'gemini-2.5-flash', genAI }
      );

      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          results.push(...(parsed.transactions || []));
        } catch (err) {
          console.error('Erreur parse JSON:', err);
        }
      }
    }

    // Calcul du solde progressif
    let solde = 0;
    const withSolde = results.map(r => {
      solde += (r.credit || 0) - (r.debit || 0);
      return { ...r, solde: Math.round(solde * 100) / 100 };
    });

    return { success: true, transactions: withSolde };
  } catch (err) {
    return { success: false, error: formatGeminiError(err) };
  }
});

// ====== IPC : ASSISTANT IA CHAT ======
ipcMain.handle('ia:chat', async (e, payload) => {
  const { message, history = [], conversationId } = payload;

  const apiKey = db.prepare('SELECT valeur FROM parametres WHERE cle=?').get('gemini_api_key');
  if (!apiKey || !apiKey.valeur) {
    return { success: false, error: 'Clé API Gemini non configurée dans Paramètres.' };
  }

  // Crée la conversation si pas fournie
  let convId = conversationId;
  if (!convId) {
    const r = db.prepare('INSERT INTO ia_conversations (title) VALUES (?)').run('Nouvelle conversation');
    convId = r.lastInsertRowid;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey.valeur);

    // ── Injection des données réelles ──────────────────────────────────
    let contextData = '';
    try {
      const now = new Date();
      const moisCourant = now.getMonth() + 1;
      const anneeCourante = now.getFullYear();

      // Biens
      const biens = db.prepare('SELECT adresse, type, loyer_total FROM biens').all();
      // Locataires actifs
      const locataires = db.prepare(`
        SELECT l.nom, l.prenom, b.adresse AS bien, l.loyer_montant
        FROM locataires l LEFT JOIN biens b ON b.id = l.bien_id
      `).all();
      // Loyers en retard ce mois-ci
      const loyersEnRetard = db.prepare(`
        SELECT l.mois, l.annee, l.montant, loc.nom, loc.prenom, b.adresse
        FROM loyers l
        LEFT JOIN locataires loc ON loc.id = l.locataire_id
        LEFT JOIN biens b ON b.id = l.bien_id
        WHERE l.statut IN ('en_attente','retard')
        AND l.annee = ? AND l.mois = ?
      `).all(anneeCourante, moisCourant);
      // Loyers impayés tous mois
      const totalImpayesRows = db.prepare(`
        SELECT COUNT(*) as n, SUM(montant) as total
        FROM loyers WHERE statut IN ('en_attente','retard')
      `).get();
      // Travaux en cours
      const travauxEnCours = db.prepare(`
        SELECT titre, statut, cout, bien_id FROM travaux WHERE statut != 'termine'
      `).all();
      // Revenus & dépenses de l'année courante
      const finances = db.prepare(`
        SELECT SUM(credit) as revenus, SUM(debit) as depenses
        FROM excel_transactions t
        JOIN excel_files f ON f.id = t.file_id
        WHERE f.annee = ?
      `).get(anneeCourante) || { revenus: 0, depenses: 0 };

      const fmt = (n) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

      contextData = `
=== DONNÉES RÉELLES DU PORTFOLIO OÏKO ===
Date du jour : ${now.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })}

BIENS (${biens.length}) :
${biens.map(b => `  • ${b.type} — ${b.adresse} — Loyer : ${b.loyer_total} €/mois`).join('\n') || '  Aucun bien enregistré'}

LOCATAIRES ACTIFS (${locataires.length}) :
${locataires.map(l => `  • ${l.nom} ${l.prenom} — ${l.bien || 'N/A'} — ${l.loyer_montant} €/mois`).join('\n') || '  Aucun locataire'}

LOYERS EN ATTENTE CE MOIS (${moisCourant}/${anneeCourante}) — ${loyersEnRetard.length} :
${loyersEnRetard.map(r => `  • ${r.nom} ${r.prenom} (${r.adresse || '?'}) — ${r.montant} € — statut: ${r.statut}`).join('\n') || '  Tous les loyers de ce mois sont à jour ✓'}

TOTAL IMPAYÉS (tous mois) : ${totalImpayesRows.n} loyer(s) — ${fmt(totalImpayesRows.total)} €

TRAVAUX EN COURS (${travauxEnCours.length}) :
${travauxEnCours.map(t => `  • ${t.titre} — ${t.statut} — ${t.cout ? t.cout + ' €' : 'coût N/A'}`).join('\n') || '  Aucun travaux en cours'}

FINANCES ${anneeCourante} :
  Revenus encaissés : ${fmt(finances.revenus)} €
  Dépenses : ${fmt(finances.depenses)} €
  Solde net : ${fmt((finances.revenus || 0) - (finances.depenses || 0))} €
==========================================`;
    } catch (_) {
      contextData = '';
    }

    const systemInstruction = `Tu es l'assistant IA de Oïko, un logiciel de comptabilité et gestion immobilière.
Tu réponds aux questions concernant :
- La comptabilité (factures, relevés, bilans, TVA, fiscalité immobilière)
- Le fonctionnement du logiciel Oïko (utilisation des pages, fonctionnalités)
- La gestion locative (loyers, baux, charges, APL)
- Les données réelles du portfolio de l'utilisateur (ci-dessous)

Si la question est hors sujet, refuse poliment et redirige vers les sujets autorisés.
Réponds en français, de manière claire et professionnelle. Utilise les données réelles quand c'est pertinent.
${contextData}`;

    const buildModel = (modelName) => genAI.getGenerativeModel({
      model: modelName,
      systemInstruction
    });

    const defaultModel = buildModel('gemini-flash-latest');
    const geminiHistory = history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.contenu }]
    }));

    const result = await callGeminiWithRetry(
      async (overrideModel) => {
        const modelToUse = overrideModel || defaultModel;
        const chat = modelToUse.startChat({ history: geminiHistory });
        return await chat.sendMessage(message);
      },
      { maxRetries: 3, fallbackModel: 'gemini-2.5-flash', genAI }
    );

    const response = result.response.text();

    // Sauvegarde dans la conversation
    db.prepare('INSERT INTO messages_ia (conversation_id, role, contenu) VALUES (?, ?, ?)').run(convId, 'user', message);
    db.prepare('INSERT INTO messages_ia (conversation_id, role, contenu) VALUES (?, ?, ?)').run(convId, 'assistant', response);

    // Met à jour le timestamp de la conversation
    db.prepare('UPDATE ia_conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(convId);

    // Si la conversation s'appelle encore "Nouvelle conversation", on la renomme avec le 1er message
    const conv = db.prepare('SELECT title FROM ia_conversations WHERE id=?').get(convId);
    if (conv && conv.title === 'Nouvelle conversation') {
      const autoTitle = message.trim().substring(0, 50) + (message.length > 50 ? '...' : '');
      db.prepare('UPDATE ia_conversations SET title=? WHERE id=?').run(autoTitle, convId);
    }

    return { success: true, response, conversationId: convId };
  } catch (err) {
    return { success: false, error: formatGeminiError(err) };
  }
});

// Liste toutes les conversations (avec compteur de messages)
ipcMain.handle('ia:getConversations', () => {
  return db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM messages_ia WHERE conversation_id = c.id) as message_count,
      (SELECT contenu FROM messages_ia WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) as last_message
    FROM ia_conversations c
    ORDER BY c.updated_at DESC
  `).all();
});

// Récupère les messages d'une conversation
ipcMain.handle('ia:getMessages', (e, conversationId) => {
  return db.prepare(`
    SELECT * FROM messages_ia
    WHERE conversation_id = ?
    ORDER BY id ASC
  `).all(conversationId);
});

// Crée une nouvelle conversation
ipcMain.handle('ia:createConversation', () => {
  const result = db.prepare('INSERT INTO ia_conversations (title) VALUES (?)').run('Nouvelle conversation');
  return { id: result.lastInsertRowid };
});

// Renomme une conversation
ipcMain.handle('ia:renameConversation', (e, id, newTitle) => {
  if (!newTitle || !newTitle.trim()) return { success: false };
  db.prepare('UPDATE ia_conversations SET title=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(newTitle.trim().substring(0, 100), id);
  return { success: true };
});

// Supprime une conversation
ipcMain.handle('ia:deleteConversation', (e, id) => {
  db.prepare('DELETE FROM messages_ia WHERE conversation_id=?').run(id);
  db.prepare('DELETE FROM ia_conversations WHERE id=?').run(id);
  return { success: true };
});

// Supprime toutes les conversations
ipcMain.handle('ia:clearAllConversations', () => {
  db.prepare('DELETE FROM messages_ia').run();
  db.prepare('DELETE FROM ia_conversations').run();
  return { success: true };
});

// ====== IPC : NOTIFICATIONS ======
ipcMain.handle('notifications:getAll', () => {
  return db.prepare('SELECT * FROM notifications ORDER BY created_at DESC').all();
});

ipcMain.handle('notifications:add', (e, data) => {
  const stmt = db.prepare(`INSERT INTO notifications (type, titre, message) VALUES (?, ?, ?)`);
  const info = stmt.run(data.type, data.titre, data.message);

  // Déclenche aussi une notification système Windows pour les warning/danger
  if (data.type === 'warning' || data.type === 'danger') {
    showSystemNotification(data.titre, data.message);
  }

  return { id: info.lastInsertRowid };
});

ipcMain.handle('notifications:markRead', (e, id) => {
  db.prepare('UPDATE notifications SET lu=1 WHERE id=?').run(id);
  return true;
});

ipcMain.handle('notifications:deleteAll', () => {
  db.prepare('DELETE FROM notifications').run();
  return true;
});

// ====== IPC : PARAMÈTRES ======
ipcMain.handle('parametres:getAll', () => {
  const rows = db.prepare('SELECT * FROM parametres').all();
  const params = {};
  rows.forEach(r => params[r.cle] = r.valeur);
  return params;
});

ipcMain.handle('parametres:set', (e, cle, valeur) => {
  db.prepare('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)').run(cle, valeur);
  return true;
});

// ====== SYSTÈME DE BACKUP ======

function getUserDataPath() {
  return app.getPath('userData');
}

function getDbPath() {
  return path.join(getUserDataPath(), 'oiko.db');
}

// Crée un backup ZIP horodaté dans le dossier configuré
async function createBackup(customFolder = null) {
  const backupFolder = customFolder || db.prepare('SELECT valeur FROM parametres WHERE cle=?').get('backup_folder')?.valeur;

  if (!backupFolder) {
    throw new Error('Aucun dossier de backup configuré');
  }

  if (!fs.existsSync(backupFolder)) {
    fs.mkdirSync(backupFolder, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const zipName = `oiko_backup_${timestamp}.zip`;
  const zipPath = path.join(backupFolder, zipName);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      // Met à jour la date du dernier backup
      db.prepare('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)')
        .run('backup_last_date', new Date().toISOString());

      resolve({
        path: zipPath,
        name: zipName,
        size: archive.pointer(),
        timestamp
      });
    });

    archive.on('error', (err) => reject(err));
    archive.pipe(output);

    // Ajoute la DB
    const dbPath = getDbPath();
    if (fs.existsSync(dbPath)) {
      archive.file(dbPath, { name: 'oiko.db' });
    }

    // Ajoute les fichiers Excel locaux
    const excelFolder = getExcelFolder();
    if (fs.existsSync(excelFolder)) {
      archive.directory(excelFolder, 'excel_files');
    }

    // Ajoute un fichier manifest
    const manifest = {
      version: '1.0',
      created_at: new Date().toISOString(),
      app: 'Oïko',
      contents: ['oiko.db', 'excel_files/']
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    archive.finalize();
  });
}

// Liste tous les backups dans le dossier configuré
function listBackups() {
  const backupFolder = db.prepare('SELECT valeur FROM parametres WHERE cle=?').get('backup_folder')?.valeur;
  if (!backupFolder || !fs.existsSync(backupFolder)) return [];

  const files = fs.readdirSync(backupFolder)
    .filter(f => f.startsWith('oiko_backup_') && f.endsWith('.zip'))
    .map(f => {
      const fullPath = path.join(backupFolder, f);
      const stats = fs.statSync(fullPath);
      return {
        name: f,
        path: fullPath,
        size: stats.size,
        created_at: stats.mtime.toISOString()
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return files;
}

// Rotation : garde uniquement les N derniers backups
function rotateBackups() {
  const maxCount = parseInt(db.prepare('SELECT valeur FROM parametres WHERE cle=?').get('backup_max_count')?.valeur || '30');
  const backups = listBackups();

  if (backups.length > maxCount) {
    const toDelete = backups.slice(maxCount);
    toDelete.forEach(b => {
      try { fs.unlinkSync(b.path); } catch (err) { console.error('Erreur suppr backup:', err); }
    });
    return toDelete.length;
  }
  return 0;
}

// Restaure depuis un backup ZIP
async function restoreBackup(zipPath) {
  if (!fs.existsSync(zipPath)) throw new Error('Fichier de backup introuvable');

  const userData = getUserDataPath();
  const tempExtract = path.join(userData, 'temp_restore');

  // Nettoie le dossier temporaire s'il existe
  if (fs.existsSync(tempExtract)) {
    fs.rmSync(tempExtract, { recursive: true, force: true });
  }
  fs.mkdirSync(tempExtract, { recursive: true });

  // Ferme la DB avant de la remplacer
  if (db) {
    db.close();
    db = null;
  }

  // Extrait le ZIP
  await extract(zipPath, { dir: tempExtract });

  // Vérifie la présence de la DB dans le backup
  const dbInBackup = path.join(tempExtract, 'oiko.db');
  if (!fs.existsSync(dbInBackup)) {
    // Réouvre la DB actuelle
    db = new Database(getDbPath());
    db.pragma('journal_mode = WAL');
    throw new Error('Backup invalide : oiko.db introuvable');
  }

  // Sauvegarde l'actuel avant d'écraser (sécurité)
  const currentDbPath = getDbPath();
  const safetyBackup = currentDbPath + '.before-restore';
  if (fs.existsSync(currentDbPath)) {
    fs.copyFileSync(currentDbPath, safetyBackup);
  }

  // Remplace la DB
  fs.copyFileSync(dbInBackup, currentDbPath);

  // Remplace les fichiers Excel
  const excelInBackup = path.join(tempExtract, 'excel_files');
  const excelFolder = getExcelFolder();
  if (fs.existsSync(excelInBackup)) {
    // Vide le dossier actuel
    fs.readdirSync(excelFolder).forEach(f => {
      try { fs.unlinkSync(path.join(excelFolder, f)); } catch { }
    });
    // Copie les nouveaux
    fs.readdirSync(excelInBackup).forEach(f => {
      fs.copyFileSync(path.join(excelInBackup, f), path.join(excelFolder, f));
    });
  }

  // Nettoyage
  fs.rmSync(tempExtract, { recursive: true, force: true });

  // Réouvre la DB
  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');

  return { success: true };
}

// Vérifie si un backup auto est nécessaire (1 fois par jour max)
function shouldAutoBackup() {
  const autoEnabled = db.prepare('SELECT valeur FROM parametres WHERE cle=?').get('backup_auto')?.valeur === 'true';
  if (!autoEnabled) return false;

  const folder = db.prepare('SELECT valeur FROM parametres WHERE cle=?').get('backup_folder')?.valeur;
  if (!folder) return false;

  const lastBackup = db.prepare('SELECT valeur FROM parametres WHERE cle=?').get('backup_last_date')?.valeur;
  if (!lastBackup) return true;

  const last = new Date(lastBackup);
  const now = new Date();
  const hoursDiff = (now - last) / (1000 * 60 * 60);
  return hoursDiff >= 24;
}

// Exécute un backup auto si les conditions sont remplies
async function performAutoBackupIfNeeded() {
  try {
    if (!shouldAutoBackup()) return false;

    console.log('[backup auto] Conditions remplies, création du backup...');
    const result = await createBackup();
    rotateBackups();
    console.log('[backup auto] Backup créé :', result.name);
    return true;
  } catch (err) {
    console.error('[backup auto] Échec :', err.message);
    return false;
  }
}

// Démarre la vérification périodique du backup auto (toutes les heures)
function startBackupAutoCheck() {
  // Vérification initiale 30 secondes après le démarrage (le temps que l'app se charge)
  setTimeout(() => performAutoBackupIfNeeded(), 30000);

  // Puis vérification toutes les heures
  backupCheckInterval = setInterval(() => {
    performAutoBackupIfNeeded();
  }, 60 * 60 * 1000); // 1 heure
}

// ====== IPC : BACKUP ======

ipcMain.handle('backup:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choisir le dossier de sauvegarde',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('backup:create', async () => {
  try {
    const result = await createBackup();
    rotateBackups();
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('backup:list', () => {
  try {
    return { success: true, backups: listBackups() };
  } catch (err) {
    return { success: false, error: err.message, backups: [] };
  }
});

ipcMain.handle('backup:restore', async (e, zipPath) => {
  try {
    await restoreBackup(zipPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('backup:restoreFromFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Sélectionner un fichier de sauvegarde',
    filters: [{ name: 'Sauvegarde Oïko', extensions: ['zip'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };

  try {
    await restoreBackup(result.filePaths[0]);
    return { success: true, path: result.filePaths[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('backup:delete', (e, zipPath) => {
  try {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('backup:openFolder', () => {
  const folder = db.prepare('SELECT valeur FROM parametres WHERE cle=?').get('backup_folder')?.valeur;
  if (folder && fs.existsSync(folder)) {
    shell.openPath(folder);
    return { success: true };
  }
  return { success: false, error: 'Dossier introuvable' };
});

ipcMain.handle('backup:getStatus', () => {
  const folder = db.prepare('SELECT valeur FROM parametres WHERE cle=?').get('backup_folder')?.valeur;
  const autoEnabled = db.prepare('SELECT valeur FROM parametres WHERE cle=?').get('backup_auto')?.valeur === 'true';
  const lastDate = db.prepare('SELECT valeur FROM parametres WHERE cle=?').get('backup_last_date')?.valeur;
  const backups = folder ? listBackups() : [];

  return {
    folder,
    autoEnabled,
    lastDate,
    configured: !!folder,
    backupCount: backups.length,
    totalSize: backups.reduce((s, b) => s + b.size, 0)
  };
});

ipcMain.handle('backup:pickFolder', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Choisir un dossier de sauvegarde',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths[0]) {
      return { success: false, canceled: true };
    }
    return { success: true, path: result.filePaths[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ====== IPC : ADMIN (zone dangereuse) ======

const OTP_VALIDITY_MS = 5 * 60 * 1000;       // 5 minutes
const MAX_OTP_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000;   // 5 minutes après 3 échecs

function getParam(cle) {
  return db.prepare('SELECT valeur FROM parametres WHERE cle=?').get(cle)?.valeur || '';
}

function setParam(cle, valeur) {
  db.prepare('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)').run(cle, valeur);
}

function isLockedOut() {
  const lockoutUntil = parseInt(getParam('admin_lockout_until')) || 0;
  return lockoutUntil > Date.now();
}

function getLockoutRemainingSec() {
  const lockoutUntil = parseInt(getParam('admin_lockout_until')) || 0;
  return Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
}

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendOTPEmail(toEmail, code, purpose) {
  const smtpHost = getParam('smtp_host');
  const smtpPort = parseInt(getParam('smtp_port')) || 587;
  const smtpSecure = getParam('smtp_secure') === 'true';
  const smtpUser = getParam('email_expediteur');
  const smtpPass = getParam('smtp_password');

  if (!smtpHost || !smtpUser || !smtpPass) {
    throw new Error('SMTP non configuré. Configurez d\'abord SMTP dans Paramètres → Configuration Email.');
  }

  const subjects = {
    admin_access: 'Oïko - Code d\'accès à la zone admin',
    change_email: 'Oïko - Confirmer le changement d\'email de récupération'
  };
  const bodies = {
    admin_access: `Bonjour,\n\nVoici votre code d'accès temporaire à la zone d'administration de Oïko :\n\n   ${code}\n\nCe code est valable 5 minutes et utilisable une seule fois.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message et changez votre mot de passe SMTP par sécurité.\n\nOïko`,
    change_email: `Bonjour,\n\nUne demande de modification de votre email de récupération a été effectuée. Pour confirmer cette opération, utilisez le code suivant :\n\n   ${code}\n\nCe code est valable 5 minutes et utilisable une seule fois.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\nOïko`
  };

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass }
  });

  await transporter.sendMail({
    from: smtpUser,
    to: toEmail,
    subject: subjects[purpose] || 'Code Oïko',
    text: bodies[purpose] || `Votre code : ${code}`
  });
}

// Initialisation : a-t-on déjà un email de récupération configuré ?
ipcMain.handle('admin:getStatus', () => {
  const recoveryEmail = getParam('recovery_email');
  const expediteur = getParam('email_expediteur');
  const smtpConfigured = !!(getParam('smtp_host') && expediteur && getParam('smtp_password'));
  return {
    initialized: !!recoveryEmail,
    recoveryEmail: recoveryEmail ? recoveryEmail.replace(/(.{2}).+(@.+)/, '$1***$2') : '',
    smtpConfigured,
    expediteur,
    lockedOut: isLockedOut(),
    lockoutRemainingSec: getLockoutRemainingSec()
  };
});

// Première fois : configurer l'email de récupération (pas de code requis)
ipcMain.handle('admin:initRecoveryEmail', (e, email) => {
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Email invalide' };
  }
  if (getParam('recovery_email')) {
    return { success: false, error: 'Email de récupération déjà configuré. Utilisez la fonction de changement.' };
  }
  setParam('recovery_email', email);
  return { success: true };
});

// Demande un code 2FA pour accéder à la zone admin
ipcMain.handle('admin:requestAccessCode', async () => {
  if (isLockedOut()) {
    return {
      success: false,
      error: `Trop de tentatives échouées. Réessayez dans ${getLockoutRemainingSec()} secondes.`
    };
  }

  const recoveryEmail = getParam('recovery_email');
  if (!recoveryEmail) {
    return { success: false, error: 'Aucun email de récupération configuré.' };
  }

  // Invalide les anciens codes du même type
  db.prepare('UPDATE admin_otp SET used=1 WHERE purpose=? AND used=0').run('admin_access');

  const code = generateOTP();
  const expiresAt = Date.now() + OTP_VALIDITY_MS;
  db.prepare('INSERT INTO admin_otp (code, purpose, expires_at) VALUES (?, ?, ?)')
    .run(code, 'admin_access', expiresAt);

  try {
    await sendOTPEmail(recoveryEmail, code, 'admin_access');
    return {
      success: true,
      maskedEmail: recoveryEmail.replace(/(.{2}).+(@.+)/, '$1***$2'),
      expiresInSec: Math.floor(OTP_VALIDITY_MS / 1000)
    };
  } catch (err) {
    return { success: false, error: 'Erreur d\'envoi du code : ' + err.message };
  }
});

// Vérifie le code 2FA pour l'accès admin
ipcMain.handle('admin:verifyAccessCode', (e, code) => {
  if (isLockedOut()) {
    return {
      success: false,
      error: `Trop de tentatives échouées. Réessayez dans ${getLockoutRemainingSec()} secondes.`
    };
  }

  const otp = db.prepare(`
    SELECT * FROM admin_otp
    WHERE purpose=? AND used=0 AND expires_at > ?
    ORDER BY id DESC LIMIT 1
  `).get('admin_access', Date.now());

  if (!otp) {
    return { success: false, error: 'Aucun code valide. Demandez un nouveau code.' };
  }

  // Incrémente les tentatives
  db.prepare('UPDATE admin_otp SET attempts=attempts+1 WHERE id=?').run(otp.id);

  if (otp.code !== String(code)) {
    const newAttempts = otp.attempts + 1;
    if (newAttempts >= MAX_OTP_ATTEMPTS) {
      // Verrouillage
      setParam('admin_lockout_until', String(Date.now() + LOCKOUT_DURATION_MS));
      db.prepare('UPDATE admin_otp SET used=1 WHERE id=?').run(otp.id);
      return {
        success: false,
        error: `Code incorrect. Verrouillage activé pour ${Math.floor(LOCKOUT_DURATION_MS / 60000)} minutes.`
      };
    }
    return {
      success: false,
      error: `Code incorrect. ${MAX_OTP_ATTEMPTS - newAttempts} tentative(s) restante(s).`
    };
  }

  // Code correct → consommer
  db.prepare('UPDATE admin_otp SET used=1 WHERE id=?').run(otp.id);
  return { success: true };
});

// Demande un code 2FA pour changer l'email de récupération
ipcMain.handle('admin:requestEmailChangeCode', async () => {
  const recoveryEmail = getParam('recovery_email');
  if (!recoveryEmail) {
    return { success: false, error: 'Aucun email de récupération configuré.' };
  }

  db.prepare('UPDATE admin_otp SET used=1 WHERE purpose=? AND used=0').run('change_email');

  const code = generateOTP();
  const expiresAt = Date.now() + OTP_VALIDITY_MS;
  db.prepare('INSERT INTO admin_otp (code, purpose, expires_at) VALUES (?, ?, ?)')
    .run(code, 'change_email', expiresAt);

  try {
    await sendOTPEmail(recoveryEmail, code, 'change_email');
    return {
      success: true,
      maskedEmail: recoveryEmail.replace(/(.{2}).+(@.+)/, '$1***$2'),
      expiresInSec: Math.floor(OTP_VALIDITY_MS / 1000)
    };
  } catch (err) {
    return { success: false, error: 'Erreur d\'envoi : ' + err.message };
  }
});

// Vérifie le code et change l'email
ipcMain.handle('admin:changeRecoveryEmail', (e, code, newEmail) => {
  if (!newEmail || !newEmail.includes('@')) {
    return { success: false, error: 'Email invalide' };
  }

  const otp = db.prepare(`
    SELECT * FROM admin_otp
    WHERE purpose=? AND used=0 AND expires_at > ?
    ORDER BY id DESC LIMIT 1
  `).get('change_email', Date.now());

  if (!otp) return { success: false, error: 'Aucun code valide.' };
  if (otp.code !== String(code)) {
    db.prepare('UPDATE admin_otp SET attempts=attempts+1 WHERE id=?').run(otp.id);
    return { success: false, error: 'Code incorrect.' };
  }

  db.prepare('UPDATE admin_otp SET used=1 WHERE id=?').run(otp.id);
  setParam('recovery_email', newEmail);
  return { success: true };
});

// Compte les éléments par catégorie
ipcMain.handle('admin:getCounts', () => {
  const counts = {
    biens: db.prepare('SELECT COUNT(*) as c FROM biens').get().c,
    locataires: db.prepare('SELECT COUNT(*) as c FROM locataires').get().c,
    loyers: db.prepare('SELECT COUNT(*) as c FROM loyers').get().c,
    factures_excel: db.prepare('SELECT COUNT(*) as c FROM factures_excel').get().c,
    notifications: db.prepare('SELECT COUNT(*) as c FROM notifications').get().c,
    messages_ia: db.prepare('SELECT COUNT(*) as c FROM messages_ia').get().c
  };

  // Compte les fichiers Excel locaux
  const excelFolder = getExcelFolder();
  let excelFiles = 0;
  if (fs.existsSync(excelFolder)) {
    excelFiles = fs.readdirSync(excelFolder).filter(f => f.endsWith('.xlsx')).length;
  }
  counts.excel_files_local = excelFiles;
  return counts;
});

// Supprime les catégories sélectionnées (avec backup auto avant)
ipcMain.handle('admin:deleteCategories', async (e, categories, withBackup = true) => {
  try {
    // Backup auto si demandé et configuré
    if (withBackup) {
      try {
        const folder = getParam('backup_folder');
        if (folder) {
          await createBackup();
          rotateBackups();
        }
      } catch (err) {
        console.error('Backup avant suppression échoué:', err);
        // On continue même si le backup échoue (l'utilisateur a confirmé)
      }
    }

    const deleted = {};

    // Suppression par catégorie
    if (categories.includes('loyers')) {
      const r = db.prepare('DELETE FROM loyers').run();
      deleted.loyers = r.changes;
    }
    if (categories.includes('locataires')) {
      const r = db.prepare('DELETE FROM locataires').run();
      deleted.locataires = r.changes;
    }
    if (categories.includes('biens')) {
      const r = db.prepare('DELETE FROM biens').run();
      deleted.biens = r.changes;
    }
    if (categories.includes('notifications')) {
      const r = db.prepare('DELETE FROM notifications').run();
      deleted.notifications = r.changes;
    }
    if (categories.includes('messages_ia')) {
      const r = db.prepare('DELETE FROM messages_ia').run();
      deleted.messages_ia = r.changes;
    }
    if (categories.includes('factures_excel')) {
      // Supprime aussi les fichiers .xlsx locaux
      const excelFolder = getExcelFolder();
      if (fs.existsSync(excelFolder)) {
        fs.readdirSync(excelFolder).forEach(f => {
          if (f.endsWith('.xlsx')) {
            try { fs.unlinkSync(path.join(excelFolder, f)); } catch { }
          }
        });
      }
      const r = db.prepare('DELETE FROM factures_excel').run();
      deleted.factures_excel = r.changes;
    }

    // Reset compteurs auto-increment
    if (Object.keys(deleted).length > 0) {
      const tables = Object.keys(deleted);
      tables.forEach(t => {
        db.prepare(`DELETE FROM sqlite_sequence WHERE name=?`).run(t);
      });
    }

    return { success: true, deleted };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Réinitialisation d'usine : efface tout (données + paramètres + fichiers locaux)
// Garde optionnellement les sauvegardes existantes
ipcMain.handle('admin:factoryReset', async (e, options = {}) => {
  const { keepBackups = true, finalBackup = true } = options;

  try {
    // 1. Sauvegarde finale (si configurée)
    let backupPath = null;
    if (finalBackup) {
      try {
        const folder = getParam('backup_folder');
        if (folder) {
          const result = await createBackup();
          backupPath = result?.path;
        }
      } catch (err) {
        console.error('Backup final échoué:', err);
        // On continue, l'utilisateur a confirmé
      }
    }

    // 2. Vide toutes les tables (sauf parametres qu'on traite après)
    const tables = ['loyers', 'locataires', 'biens', 'factures_excel', 'notifications', 'messages_ia', 'admin_otp'];
    tables.forEach(t => {
      try {
        db.prepare(`DELETE FROM ${t}`).run();
        db.prepare(`DELETE FROM sqlite_sequence WHERE name=?`).run(t);
      } catch (err) {
        console.error(`Erreur vidage table ${t}:`, err);
      }
    });

    // 3. Réinitialise les paramètres (vide tout puis remet les défauts)
    db.prepare('DELETE FROM parametres').run();
    const defaults = [
      ['theme', 'dark'],
      ['email_expediteur', ''],
      ['email_comptable', ''],
      ['smtp_host', ''],
      ['smtp_port', '587'],
      ['smtp_secure', 'false'],
      ['smtp_password', ''],
      ['notifications_sonores', 'true'],
      ['gemini_api_key', ''],
      ['backup_folder', ''],
      ['backup_auto', 'true'],
      ['backup_max_count', '30'],
      ['backup_last_date', ''],
      ['user_name', 'Utilisateur'],
      ['user_email', ''],
      ['recovery_email', ''],
      ['admin_lockout_until', '0']
    ];
    const insertParam = db.prepare('INSERT OR IGNORE INTO parametres (cle, valeur) VALUES (?, ?)');
    defaults.forEach(([k, v]) => insertParam.run(k, v));

    // 4. Supprime tous les fichiers Excel locaux
    const excelFolder = getExcelFolder();
    if (fs.existsSync(excelFolder)) {
      fs.readdirSync(excelFolder).forEach(f => {
        try { fs.unlinkSync(path.join(excelFolder, f)); } catch { }
      });
    }

    // 5. Optionnel : supprimer aussi les sauvegardes
    if (!keepBackups) {
      const backupFolder = getParam('backup_folder');
      if (backupFolder && fs.existsSync(backupFolder)) {
        fs.readdirSync(backupFolder)
          .filter(f => f.startsWith('oiko_backup_') && f.endsWith('.zip'))
          .forEach(f => {
            try { fs.unlinkSync(path.join(backupFolder, f)); } catch { }
          });
      }
    }

    return {
      success: true,
      finalBackupPath: backupPath
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ====== IPC : SHELL (liens externes) ======
ipcMain.handle('shell:openExternal', (e, url) => {
  // Sécurité : n'ouvre que http(s)
  if (typeof url === 'string' && /^https?:\/\//.test(url)) {
    shell.openExternal(url);
    return { success: true };
  }
  return { success: false, error: 'URL invalide' };
});

// ====== IPC : APP INFO ======
ipcMain.handle('app:getInfo', () => {
  return {
    name: 'Oïko',
    version: app.getVersion(),
    dbPath: getDbPath(),
    excelFolder: getExcelFolder(),
    userData: app.getPath('userData'),
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    platform: process.platform
  };
});

// Retourne le PDF du guide en base64 pour l'afficher dans l'app
ipcMain.handle('app:getGuideData', async () => {
  try {
    // En prod : process.resourcesPath/guide_utilisation.pdf (grâce à extraResources)
    // En dev : public/guide_utilisation.pdf
    const guidePath = app.isPackaged
      ? path.join(process.resourcesPath, 'guide_utilisation.pdf')
      : path.join(__dirname, '..', 'public', 'guide_utilisation.pdf');

    if (!fs.existsSync(guidePath)) {
      return { success: false, error: 'Fichier guide_utilisation.pdf introuvable' };
    }

    const data = fs.readFileSync(guidePath);
    return {
      success: true,
      data: data.toString('base64'),
      size: data.length
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Télécharge le guide vers le dossier choisi par l'utilisateur
ipcMain.handle('app:downloadGuide', async () => {
  try {
    const guidePath = app.isPackaged
      ? path.join(process.resourcesPath, 'guide_utilisation.pdf')
      : path.join(__dirname, '..', 'public', 'guide_utilisation.pdf');

    if (!fs.existsSync(guidePath)) {
      return { success: false, error: 'Fichier guide_utilisation.pdf introuvable' };
    }

    const result = await dialog.showSaveDialog({
      title: 'Enregistrer le guide d\'utilisation',
      defaultPath: 'Oïko_Guide_Utilisation.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });

    if (result.canceled) return { success: false, canceled: true };

    fs.copyFileSync(guidePath, result.filePath);
    return { success: true, path: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ====== IPC : IMPÔT ======
ipcMain.handle('impot:getStats', (e, annee) => {
  const loyers = db.prepare(`
    SELECT COALESCE(SUM(montant), 0) as total, COUNT(*) as nb
    FROM loyers WHERE annee=? AND statut='paye'
  `).get(annee);

  const charges = db.prepare(`
    SELECT COALESCE(SUM(montant), 0) as total
    FROM charges_fiscales WHERE annee=?
  `).get(annee);

  const chargesParCat = db.prepare(`
    SELECT categorie, COALESCE(SUM(montant), 0) as total
    FROM charges_fiscales WHERE annee=?
    GROUP BY categorie
  `).all(annee);

  const loyersDetail = db.prepare(`
    SELECT ly.montant, ly.mois,
           l.nom, l.prenom,
           b.adresse as b_adresse, b.complement_adresse as b_complement,
           b.code_postal as b_cp, b.ville as b_ville
    FROM loyers ly
    JOIN locataires l ON ly.locataire_id = l.id
    LEFT JOIN biens b ON l.bien_id = b.id
    WHERE ly.annee=? AND ly.statut='paye'
    ORDER BY ly.mois
  `).all(annee).map(r => {
    const parts = [r.b_adresse, r.b_complement, r.b_cp, r.b_ville].filter(Boolean);
    return { ...r, adresse_complete: parts.join(', ') };
  });

  return {
    loyersTotal: loyers.total,
    loyersNb: loyers.nb,
    chargesTotal: charges.total,
    chargesParCat,
    loyers_detail: loyersDetail
  };
});

ipcMain.handle('impot:getCharges', (e, annee) => {
  return db.prepare(`
    SELECT cf.*, b.adresse as b_adresse, b.complement_adresse as b_complement,
           b.code_postal as b_cp, b.ville as b_ville
    FROM charges_fiscales cf
    LEFT JOIN biens b ON cf.bien_id = b.id
    WHERE cf.annee=?
    ORDER BY cf.categorie, cf.date_charge DESC
  `).all(annee).map(r => {
    const parts = [r.b_adresse, r.b_complement, r.b_cp, r.b_ville].filter(Boolean);
    return { ...r, bien_adresse: parts.join(', ') || null };
  });
});

ipcMain.handle('impot:addCharge', (e, data) => {
  const info = db.prepare(`
    INSERT INTO charges_fiscales (annee, categorie, libelle, montant, bien_id, date_charge)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(data.annee, data.categorie, data.libelle, data.montant, data.bien_id || null, data.date_charge || null);
  return { id: info.lastInsertRowid };
});

ipcMain.handle('impot:updateCharge', (e, id, data) => {
  db.prepare(`
    UPDATE charges_fiscales SET categorie=?, libelle=?, montant=?, bien_id=?, date_charge=? WHERE id=?
  `).run(data.categorie, data.libelle, data.montant, data.bien_id || null, data.date_charge || null, id);
  return true;
});

ipcMain.handle('impot:deleteCharge', (e, id) => {
  db.prepare('DELETE FROM charges_fiscales WHERE id=?').run(id);
  return true;
});

// ====== IPC : PHOTOS PAR LOCATAIRE ======
function getPhotosLocataireFolder(locataireId) {
  const folder = path.join(app.getPath('userData'), 'photos_locataires', String(locataireId));
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  return folder;
}

ipcMain.handle('photos:getByLocataire', (e, locataireId) => {
  return db.prepare('SELECT * FROM photos_locataire WHERE locataire_id=? ORDER BY created_at DESC').all(locataireId);
});

ipcMain.handle('photos:pick', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Sélectionner des photos',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'bmp'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths.map(fp => ({ filePath: fp, originalName: path.basename(fp) }));
});

ipcMain.handle('photos:add', (e, locataireId, filePath, originalName) => {
  const ext = path.extname(filePath) || '.jpg';
  const nomFichier = `${Date.now()}${ext}`;
  const folder = getPhotosLocataireFolder(locataireId);
  const destPath = path.join(folder, nomFichier);
  fs.copyFileSync(filePath, destPath);
  const info = db.prepare(
    'INSERT INTO photos_locataire (locataire_id, nom_original, nom_fichier, chemin) VALUES (?, ?, ?, ?)'
  ).run(locataireId, originalName, nomFichier, destPath);
  return { id: info.lastInsertRowid, chemin: destPath, nom_original: originalName };
});

ipcMain.handle('photos:delete', (e, id) => {
  const photo = db.prepare('SELECT chemin FROM photos_locataire WHERE id=?').get(id);
  if (photo) {
    try { fs.unlinkSync(photo.chemin); } catch (_) {}
    db.prepare('DELETE FROM photos_locataire WHERE id=?').run(id);
  }
  return true;
});

ipcMain.handle('photos:open', (e, id) => {
  const photo = db.prepare('SELECT chemin FROM photos_locataire WHERE id=?').get(id);
  if (photo && fs.existsSync(photo.chemin)) {
    require('electron').shell.openPath(photo.chemin);
    return true;
  }
  return false;
});

ipcMain.handle('photos:getDataUrl', async (e, id) => {
  const photo = db.prepare('SELECT chemin, nom_original FROM photos_locataire WHERE id=?').get(id);
  if (!photo || !fs.existsSync(photo.chemin)) return null;
  const data = fs.readFileSync(photo.chemin);
  const ext = path.extname(photo.nom_original).replace('.', '').toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'png' ? 'image/png'
    : ext === 'webp' ? 'image/webp'
    : ext === 'gif' ? 'image/gif'
    : 'image/jpeg';
  return `data:${mime};base64,${data.toString('base64')}`;
});

// ====== IPC : TRAVAUX ======
ipcMain.handle('travaux:getAll', () => {
  return db.prepare(`
    SELECT t.*, b.adresse as bien_adresse, b.code_postal as b_cp, b.ville as b_ville
    FROM travaux t
    LEFT JOIN biens b ON t.bien_id = b.id
    ORDER BY t.created_at DESC
  `).all().map(r => ({
    ...r,
    bien_label: [r.bien_adresse, r.b_cp, r.b_ville].filter(Boolean).join(' ')
  }));
});

ipcMain.handle('travaux:add', (e, data) => {
  const info = db.prepare(`
    INSERT INTO travaux (bien_id, titre, description, prestataire, cout, date_debut, date_fin, statut)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(data.bien_id || null, data.titre, data.description || '', data.prestataire || '',
    parseFloat(data.cout) || 0, data.date_debut || null, data.date_fin || null, data.statut || 'prevu');
  return { id: info.lastInsertRowid };
});

ipcMain.handle('travaux:update', (e, id, data) => {
  db.prepare(`
    UPDATE travaux SET bien_id=?, titre=?, description=?, prestataire=?, cout=?,
    date_debut=?, date_fin=?, statut=? WHERE id=?
  `).run(data.bien_id || null, data.titre, data.description || '', data.prestataire || '',
    parseFloat(data.cout) || 0, data.date_debut || null, data.date_fin || null, data.statut || 'prevu', id);
  return true;
});

ipcMain.handle('travaux:delete', (e, id) => {
  db.prepare('DELETE FROM travaux WHERE id=?').run(id);
  return true;
});

// ====== IPC : CHARGES LOCATIVES ======
ipcMain.handle('charges:getAll', (e, filters = {}) => {
  let query = `
    SELECT cl.*, b.adresse as bien_adresse, b.code_postal as b_cp, b.ville as b_ville,
           l.nom as loc_nom, l.prenom as loc_prenom
    FROM charges_locatives cl
    LEFT JOIN biens b ON cl.bien_id = b.id
    LEFT JOIN locataires l ON cl.locataire_id = l.id
  `;
  const conditions = [];
  const params = [];
  if (filters.bien_id) { conditions.push('cl.bien_id=?'); params.push(filters.bien_id); }
  if (filters.annee) { conditions.push("strftime('%Y', cl.date_charge)=?"); params.push(String(filters.annee)); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY cl.date_charge DESC';
  return db.prepare(query).all(...params).map(r => ({
    ...r,
    bien_label: [r.bien_adresse, r.b_cp, r.b_ville].filter(Boolean).join(' '),
    locataire_label: [r.loc_prenom, r.loc_nom].filter(Boolean).join(' ')
  }));
});

ipcMain.handle('charges:add', (e, data) => {
  const info = db.prepare(`
    INSERT INTO charges_locatives (bien_id, locataire_id, categorie, libelle, montant, date_charge, facture)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(data.bien_id || null, data.locataire_id || null, data.categorie,
    data.libelle, parseFloat(data.montant) || 0, data.date_charge || null, data.facture ? 1 : 0);
  return { id: info.lastInsertRowid };
});

ipcMain.handle('charges:update', (e, id, data) => {
  db.prepare(`
    UPDATE charges_locatives SET bien_id=?, locataire_id=?, categorie=?, libelle=?, montant=?,
    date_charge=?, facture=? WHERE id=?
  `).run(data.bien_id || null, data.locataire_id || null, data.categorie,
    data.libelle, parseFloat(data.montant) || 0, data.date_charge || null, data.facture ? 1 : 0, id);
  return true;
});

ipcMain.handle('charges:delete', (e, id) => {
  db.prepare('DELETE FROM charges_locatives WHERE id=?').run(id);
  return true;
});

// ====== IPC : CALENDRIER ======
ipcMain.handle('calendrier:getEvents', (e, annee, mois) => {
  const events = [];

  // Loyers du mois
  const loyers = db.prepare(`
    SELECT ly.*, l.nom, l.prenom FROM loyers ly
    JOIN locataires l ON ly.locataire_id = l.id
    WHERE ly.annee=? AND ly.mois=?
  `).all(annee, mois);
  loyers.forEach(l => {
    const day = l.date_paiement ? new Date(l.date_paiement).getDate() : 1;
    events.push({
      type: 'loyer',
      date: `${annee}-${String(mois).padStart(2,'0')}-${String(day).padStart(2,'0')}`,
      label: `Loyer ${l.prenom} ${l.nom}`,
      montant: l.montant,
      statut: l.statut,
      color: l.statut === 'paye' ? '#16a34a' : l.statut === 'retard' ? '#dc2626' : '#d97706'
    });
  });

  // Fins de bail du mois
  const finsBail = db.prepare(`
    SELECT * FROM locataires
    WHERE date_fin_bail IS NOT NULL
      AND strftime('%Y', date_fin_bail)=?
      AND strftime('%m', date_fin_bail)=?
  `).all(String(annee), String(mois).padStart(2, '0'));
  finsBail.forEach(l => {
    events.push({
      type: 'fin_bail',
      date: l.date_fin_bail,
      label: `Fin de bail — ${l.prenom} ${l.nom}`,
      color: '#7c3aed'
    });
  });

  // Travaux du mois
  const travaux = db.prepare(`
    SELECT t.*, b.adresse as bien_adresse FROM travaux t
    LEFT JOIN biens b ON t.bien_id = b.id
    WHERE (date_debut IS NOT NULL AND strftime('%Y-%m', date_debut)=?)
       OR (date_fin IS NOT NULL AND strftime('%Y-%m', date_fin)=?)
  `).all(`${annee}-${String(mois).padStart(2,'0')}`, `${annee}-${String(mois).padStart(2,'0')}`);
  travaux.forEach(t => {
    if (t.date_debut && t.date_debut.startsWith(`${annee}-${String(mois).padStart(2,'0')}`)) {
      events.push({ type: 'travaux', date: t.date_debut, label: `Début travaux — ${t.titre}`, color: '#ea580c' });
    }
    if (t.date_fin && t.date_fin.startsWith(`${annee}-${String(mois).padStart(2,'0')}`)) {
      events.push({ type: 'travaux', date: t.date_fin, label: `Fin travaux — ${t.titre}`, color: '#2563eb' });
    }
  });

  // Documents expirant dans le mois
  const docs = db.prepare(`
    SELECT d.*, l.nom, l.prenom FROM documents_locataire d
    JOIN locataires l ON d.locataire_id = l.id
    WHERE date_expiration IS NOT NULL
      AND strftime('%Y', date_expiration)=?
      AND strftime('%m', date_expiration)=?
  `).all(String(annee), String(mois).padStart(2, '0'));
  docs.forEach(d => {
    events.push({
      type: 'document',
      date: d.date_expiration,
      label: `Expiration ${d.categorie} — ${d.prenom} ${d.nom}`,
      color: '#dc2626'
    });
  });

  return events;
});

// ====== IPC : EXPORT COMPTABLE CSV ======
ipcMain.handle('export:comptable', async (e, annee) => {
  try {
    const loyers = db.prepare(`
      SELECT ly.montant, ly.aide, ly.mois, ly.annee, ly.statut, ly.date_paiement,
             l.nom, l.prenom, b.adresse as bien_adresse, b.code_immeuble
      FROM loyers ly
      JOIN locataires l ON ly.locataire_id = l.id
      LEFT JOIN biens b ON l.bien_id = b.id
      WHERE ly.annee=?
      ORDER BY ly.mois
    `).all(annee);

    const charges = db.prepare(`
      SELECT * FROM charges_fiscales WHERE annee=? ORDER BY date_charge
    `).all(annee);

    const moisLabels = ['Janvier','Février','Mars','Avril','Mai','Juin',
      'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

    let csv = 'Type;Date;Code Immeuble;Locataire;Libellé;Montant;Statut\n';

    loyers.forEach(l => {
      const date = l.date_paiement
        ? new Date(l.date_paiement).toLocaleDateString('fr-FR')
        : `01/${String(l.mois).padStart(2,'0')}/${l.annee}`;
      const code = l.code_immeuble ? decrypt(l.code_immeuble) : '';
      const nom = `${l.prenom} ${l.nom}`;
      const libelle = `Loyer ${moisLabels[l.mois-1]} ${l.annee}`;
      csv += `Loyer;${date};${code};${nom};${libelle};${l.montant};${l.statut}\n`;
    });

    charges.forEach(c => {
      const date = c.date_charge ? new Date(c.date_charge).toLocaleDateString('fr-FR') : '';
      csv += `Charge;${date};;; ${c.libelle};${c.montant};${c.categorie}\n`;
    });

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Exporter le récapitulatif comptable',
      defaultPath: `export_comptable_${annee}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (result.canceled) return { success: false, canceled: true };

    fs.writeFileSync(result.filePath, '﻿' + csv, 'utf8'); // BOM pour Excel
    return { success: true, path: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ====== IPC : SOLDE PAR BIEN ======
ipcMain.handle('dashboard:soldeParBien', (e, annee) => {
  const biens = db.prepare('SELECT * FROM biens').all();
  return biens.map(b => {
    const loyersTotal = db.prepare(`
      SELECT COALESCE(SUM(ly.montant), 0) as total
      FROM loyers ly JOIN locataires l ON ly.locataire_id = l.id
      WHERE l.bien_id=? AND ly.annee=? AND ly.statut='paye'
    `).get(b.id, annee).total;

    // Nombre de mois effectivement payés → pour calculer les charges mensuelles réelles
    const nbMoisPayes = db.prepare(`
      SELECT COUNT(*) as c
      FROM loyers ly JOIN locataires l ON ly.locataire_id = l.id
      WHERE l.bien_id=? AND ly.annee=? AND ly.statut='paye'
    `).get(b.id, annee).c;

    const chargesFiscales = db.prepare(`
      SELECT COALESCE(SUM(montant), 0) as total
      FROM charges_fiscales WHERE bien_id=? AND annee=?
    `).get(b.id, annee).total;

    const travaux = db.prepare(`
      SELECT COALESCE(SUM(cout), 0) as total
      FROM travaux WHERE bien_id=? AND statut='termine'
      AND (date_fin IS NULL OR strftime('%Y', date_fin)=?)
    `).get(b.id, String(annee)).total;

    // Charges locatives mensuelles × mois payés
    const chargesLocatives = (b.charges_mensuelles || 0) * nbMoisPayes;

    const chargesTotal = chargesFiscales + travaux + chargesLocatives;
    const adresse = [b.adresse, b.code_postal, b.ville].filter(Boolean).join(' ');
    return {
      id: b.id,
      adresse: adresse || b.adresse,
      loyers: loyersTotal,
      charges: chargesTotal,
      solde: loyersTotal - chargesTotal
    };
  });
});

// ====== GÉNÉRATION PDF BAIL ======
async function generateBailPDF(locataire) {
  const proprietaire = getParam('user_name') || getParam('email_expediteur') || 'Le propriétaire';
  const bien = db.prepare('SELECT * FROM biens WHERE id=?').get(locataire.bien_id);
  if (!bien) throw new Error('Bien introuvable');
  const adresse = [bien.adresse, bien.complement_adresse, bien.code_postal, bien.ville].filter(Boolean).join(', ');
  const dateEntree = locataire.date_entree ? new Date(locataire.date_entree).toLocaleDateString('fr-FR') : '___________';
  const dateFinBail = locataire.date_fin_bail ? new Date(locataire.date_fin_bail).toLocaleDateString('fr-FR') : '___________';
  const dateEmission = new Date().toLocaleDateString('fr-FR');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:40px;font-size:13px;line-height:1.6}
  h1{text-align:center;color:#1e3a8a;font-size:20px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px}
  .subtitle{text-align:center;color:#555;margin-bottom:28px;font-size:13px}
  .section{margin-bottom:20px}
  .section-title{font-weight:700;color:#1e3a8a;border-bottom:2px solid #1e3a8a;padding-bottom:4px;margin-bottom:12px;font-size:13px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .field{margin-bottom:10px}
  .label{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em}
  .value{font-size:13px;font-weight:600;border-bottom:1px solid #ddd;padding-bottom:2px;min-height:20px}
  .clause{margin-bottom:12px;text-align:justify}
  .sig-block{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px}
  .sig-box{border:1px solid #ddd;border-radius:6px;padding:16px;min-height:80px}
  .sig-label{font-size:11px;color:#888;margin-bottom:6px}
  .footer{border-top:1px solid #e5e7eb;padding-top:12px;margin-top:28px;font-size:11px;color:#888;text-align:center}
</style></head><body>
  <h1>Contrat de bail d'habitation</h1>
  <div class="subtitle">Document généré le ${dateEmission}</div>

  <div class="section">
    <div class="section-title">Parties</div>
    <div class="grid">
      <div>
        <div class="field"><div class="label">Bailleur</div><div class="value">${proprietaire}</div></div>
      </div>
      <div>
        <div class="field"><div class="label">Locataire</div><div class="value">${locataire.prenom} ${locataire.nom}</div></div>
        ${locataire.email ? `<div class="field"><div class="label">Email</div><div class="value">${locataire.email}</div></div>` : ''}
        ${locataire.telephone ? `<div class="field"><div class="label">Téléphone</div><div class="value">${locataire.telephone}</div></div>` : ''}
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Bien loué</div>
    <div class="field"><div class="label">Adresse</div><div class="value">${adresse}</div></div>
    <div class="grid">
      <div class="field"><div class="label">Type</div><div class="value">${bien.type || '—'}</div></div>
      <div class="field"><div class="label">Surface</div><div class="value">${bien.surface || '—'} m²</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Conditions financières</div>
    <div class="grid">
      <div class="field"><div class="label">Loyer mensuel</div><div class="value">${parseFloat(bien.loyer_total).toLocaleString('fr-FR',{minimumFractionDigits:2})} €</div></div>
      <div class="field"><div class="label">Caution</div><div class="value">${parseFloat(bien.caution).toLocaleString('fr-FR',{minimumFractionDigits:2})} €</div></div>
      ${locataire.aide_apl > 0 ? `<div class="field"><div class="label">Aide APL / AL</div><div class="value">${parseFloat(locataire.aide_apl).toLocaleString('fr-FR',{minimumFractionDigits:2})} €</div></div>` : ''}
      <div class="field"><div class="label">Date de réception du loyer</div><div class="value">${locataire.date_reception_loyer || '1er du mois'}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Durée du bail</div>
    <div class="grid">
      <div class="field"><div class="label">Date d'entrée</div><div class="value">${dateEntree}</div></div>
      <div class="field"><div class="label">Fin de bail</div><div class="value">${dateFinBail}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Clauses générales</div>
    <div class="clause">1. Le locataire s'engage à payer le loyer et les charges à la date convenue, à user paisiblement du logement loué et à répondre des dégradations qui surviendraient de son fait.</div>
    <div class="clause">2. Le bailleur s'engage à délivrer au locataire un logement en bon état d'usage et de réparation, à assurer au locataire la jouissance paisible du logement et à entretenir les locaux en état de servir à l'usage prévu.</div>
    <div class="clause">3. Le dépôt de garantie (caution) sera restitué dans les deux mois suivant la remise des clés, déduction faite des sommes restant dues et des réparations locatives.</div>
    <div class="clause">4. Le présent bail est soumis aux dispositions de la loi n° 89-462 du 6 juillet 1989 tendant à améliorer les rapports locatifs.</div>
  </div>

  <div class="sig-block">
    <div class="sig-box"><div class="sig-label">Signature du bailleur (lu et approuvé)</div></div>
    <div class="sig-box"><div class="sig-label">Signature du locataire (lu et approuvé)</div></div>
  </div>
  <div class="footer">Document généré par Oïko — ${dateEmission}</div>
</body></html>`;

  const tmpPath = path.join(app.getPath('temp'), `bail_${locataire.id}_${Date.now()}.html`);
  fs.writeFileSync(tmpPath, html, 'utf8');
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  await win.loadFile(tmpPath);
  await new Promise(r => setTimeout(r, 400));
  const pdfBuffer = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
  win.destroy();
  try { fs.unlinkSync(tmpPath); } catch (_) {}
  return pdfBuffer;
}

ipcMain.handle('bail:generate', async (e, locataireId) => {
  const loc = db.prepare(`
    SELECT l.*, b.adresse, b.complement_adresse, b.code_postal, b.ville,
           b.loyer_total, b.caution, b.surface, b.type as bien_type
    FROM locataires l LEFT JOIN biens b ON l.bien_id = b.id
    WHERE l.id=?
  `).get(locataireId);
  if (!loc) return { success: false, error: 'Locataire introuvable' };
  try {
    const pdfBuffer = await generateBailPDF(loc);
    const nom = `${loc.nom}_${loc.prenom}`.replace(/\s+/g, '_');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Enregistrer le bail',
      defaultPath: `bail_${nom}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (result.canceled) return { success: false, canceled: true };
    fs.writeFileSync(result.filePath, pdfBuffer);
    return { success: true, path: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ====== GÉNÉRATION PDF AVIS D'ÉCHÉANCE ======
async function generateAvisEcheancePDF(loyer) {
  const proprietaire = getParam('user_name') || getParam('email_expediteur') || 'Le propriétaire';
  const adresse = [loyer.b_adresse, loyer.b_complement, loyer.b_cp, loyer.b_ville].filter(Boolean).join(', ');
  const moisLabel = getMoisLabel(loyer.mois);
  const dateEmission = new Date().toLocaleDateString('fr-FR');
  const net = parseFloat(loyer.montant) - parseFloat(loyer.aide || 0);
  const dateEcheance = loyer.date_reception_loyer
    ? `le ${loyer.date_reception_loyer} du mois`
    : 'le 1er du mois';

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:40px;font-size:14px}
  .header{display:flex;justify-content:space-between;margin-bottom:28px}
  .title{text-align:center;margin:20px 0}
  .title h1{font-size:20px;color:#1e3a8a;text-transform:uppercase;letter-spacing:.1em;margin:0}
  .title .period{font-size:14px;color:#555;margin-top:6px}
  .parties{background:#f8f9fa;border-radius:8px;padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
  .party h3{color:#1e3a8a;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin:0 0 8px}
  .amount-block{background:#1e3a8a;color:white;border-radius:8px;padding:18px 24px;margin:20px 0;display:flex;justify-content:space-between;align-items:center}
  .amount{font-size:26px;font-weight:bold}
  .detail-table{width:100%;border-collapse:collapse;margin:16px 0}
  .detail-table td{padding:9px 12px;border-bottom:1px solid #e5e7eb}
  .detail-table td:last-child{text-align:right;font-weight:600}
  .notice{background:#fef9c3;border:1px solid #fbbf24;border-radius:6px;padding:14px;margin-top:16px;font-size:13px}
  .footer{border-top:1px solid #e5e7eb;padding-top:14px;margin-top:28px;font-size:11px;color:#888;text-align:center}
</style></head><body>
  <div class="header">
    <div><strong>${proprietaire}</strong></div>
    <div style="color:#888;font-size:12px">Émis le ${dateEmission}</div>
  </div>
  <div class="title"><h1>Avis d'échéance</h1><div class="period">${moisLabel} ${loyer.annee}</div></div>
  <div class="parties">
    <div class="party"><h3>Bailleur</h3><div>${proprietaire}</div></div>
    <div class="party"><h3>Locataire</h3><div>${loyer.prenom} ${loyer.nom}</div><div style="color:#555;font-size:13px">${adresse}</div></div>
  </div>
  <div class="amount-block">
    <div><div style="opacity:.85;font-size:13px">Montant à payer</div><div class="amount">${net.toLocaleString('fr-FR',{minimumFractionDigits:2})} €</div></div>
    <div style="text-align:right"><div style="opacity:.85;font-size:13px">Échéance</div><div style="font-size:15px;font-weight:600">${moisLabel} ${loyer.annee}</div></div>
  </div>
  <table class="detail-table">
    <tr><td>Loyer brut</td><td>${parseFloat(loyer.montant).toLocaleString('fr-FR',{minimumFractionDigits:2})} €</td></tr>
    ${loyer.aide > 0 ? `<tr><td>Aide APL / AL (déduite)</td><td>− ${parseFloat(loyer.aide).toLocaleString('fr-FR',{minimumFractionDigits:2})} €</td></tr>` : ''}
    <tr><td><strong>Net à régler</strong></td><td><strong>${net.toLocaleString('fr-FR',{minimumFractionDigits:2})} €</strong></td></tr>
  </table>
  <div class="notice">📅 Cet avis d'échéance concerne votre loyer de <strong>${moisLabel} ${loyer.annee}</strong>. Merci d'effectuer le règlement <strong>${dateEcheance}</strong>.</div>
  <div class="footer">Document généré par Oïko — ${dateEmission}</div>
</body></html>`;

  const tmpPath = path.join(app.getPath('temp'), `avis_${loyer.id}_${Date.now()}.html`);
  fs.writeFileSync(tmpPath, html, 'utf8');
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  await win.loadFile(tmpPath);
  await new Promise(r => setTimeout(r, 400));
  const pdfBuffer = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
  win.destroy();
  try { fs.unlinkSync(tmpPath); } catch (_) {}
  return pdfBuffer;
}

ipcMain.handle('loyers:downloadAvis', async (e, loyerId) => {
  const loyer = db.prepare(`
    SELECT ly.*, l.nom, l.prenom, l.email, l.date_reception_loyer,
           b.adresse as b_adresse, b.complement_adresse as b_complement,
           b.code_postal as b_cp, b.ville as b_ville
    FROM loyers ly
    JOIN locataires l ON ly.locataire_id = l.id
    LEFT JOIN biens b ON l.bien_id = b.id
    WHERE ly.id=?
  `).get(loyerId);
  if (!loyer) return { success: false, error: 'Loyer introuvable' };
  try {
    const pdfBuffer = await generateAvisEcheancePDF(loyer);
    const moisLabel = getMoisLabel(loyer.mois);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Enregistrer l\'avis d\'échéance',
      defaultPath: `avis_echeance_${loyer.nom}_${loyer.mois}_${loyer.annee}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (result.canceled) return { success: false, canceled: true };
    fs.writeFileSync(result.filePath, pdfBuffer);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('loyers:sendAvis', async (e, loyerId) => {
  const loyer = db.prepare(`
    SELECT ly.*, l.nom, l.prenom, l.email, l.date_reception_loyer,
           b.adresse as b_adresse, b.complement_adresse as b_complement,
           b.code_postal as b_cp, b.ville as b_ville
    FROM loyers ly
    JOIN locataires l ON ly.locataire_id = l.id
    LEFT JOIN biens b ON l.bien_id = b.id
    WHERE ly.id=?
  `).get(loyerId);
  if (!loyer) return { success: false, error: 'Loyer introuvable' };
  if (!loyer.email) return { success: false, error: 'Pas d\'email pour ce locataire' };

  const smtpHost = getParam('smtp_host');
  const smtpUser = getParam('email_expediteur');
  const smtpPass = getParam('smtp_password');
  const smtpPort = parseInt(getParam('smtp_port')) || 587;
  const smtpSecure = getParam('smtp_secure') === 'true';
  if (!smtpHost || !smtpUser || !smtpPass) {
    return { success: false, error: 'Configuration SMTP incomplète' };
  }

  try {
    const pdfBuffer = await generateAvisEcheancePDF(loyer);
    const moisLabel = getMoisLabel(loyer.mois);
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: smtpSecure, auth: { user: smtpUser, pass: smtpPass } });
    await transporter.sendMail({
      from: smtpUser,
      to: loyer.email,
      subject: `Avis d'échéance — ${moisLabel} ${loyer.annee}`,
      text: `Bonjour ${loyer.prenom} ${loyer.nom},\n\nVeuillez trouver en pièce jointe votre avis d'échéance de loyer pour ${moisLabel} ${loyer.annee}.\n\nCordialement`,
      attachments: [{ filename: `avis_${loyer.mois}_${loyer.annee}.pdf`, content: pdfBuffer }]
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ====== GÉNÉRATION PDF QUITTANCE ======
async function generateQuittancePDF(loyer) {
  const proprietaire = getParam('email_expediteur') || 'Le propriétaire';
  const moisLabel = getMoisLabel(loyer.mois);
  const adresse = [loyer.b_adresse, loyer.b_complement, loyer.b_cp, loyer.b_ville].filter(Boolean).join(', ');
  const dateEmission = new Date().toLocaleDateString('fr-FR');
  const net = parseFloat(loyer.montant) - parseFloat(loyer.aide || 0);

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:40px;font-size:14px}
  .sci-header{text-align:center;font-size:34px;font-weight:900;color:#dc2626;text-transform:uppercase;letter-spacing:.15em;margin-bottom:8px;padding-bottom:18px;border-bottom:3px solid #dc2626}
  .top{display:flex;justify-content:space-between;margin-bottom:28px;margin-top:20px}
  .title{text-align:center;margin:24px 0}
  .title h1{font-size:22px;color:#1e3a8a;text-transform:uppercase;letter-spacing:.1em;margin:0}
  .title .period{font-size:15px;color:#555;margin-top:6px}
  .parties{background:#f8f9fa;border-radius:8px;padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
  .party h3{color:#1e3a8a;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin:0 0 8px}
  .amount-block{background:#1e3a8a;color:white;border-radius:8px;padding:18px 24px;margin:20px 0;display:flex;justify-content:space-between;align-items:center}
  .amount{font-size:26px;font-weight:bold}
  .detail-table{width:100%;border-collapse:collapse;margin:16px 0}
  .detail-table td{padding:9px 12px;border-bottom:1px solid #e5e7eb}
  .detail-table td:last-child{text-align:right;font-weight:600}
  .sig{margin-top:40px;text-align:right}
  .sig-line{margin-top:50px;border-top:1px solid #333;width:200px;margin-left:auto;padding-top:6px;font-size:12px;color:#555}
  .footer{border-top:1px solid #e5e7eb;padding-top:14px;margin-top:28px;font-size:11px;color:#888;text-align:center}
</style></head><body>
  <div class="sci-header">SCI VASCO</div>
  <div class="top">
    <div><strong>${proprietaire}</strong></div>
    <div style="text-align:right;color:#888;font-size:12px">
      Émise le ${dateEmission}${loyer.numero_quittance ? `<br><span style="font-family:monospace;font-size:11px;color:#1e3a8a;font-weight:700">N° ${loyer.numero_quittance}</span>` : ''}
    </div>
  </div>
  <div class="title"><h1>Quittance de loyer</h1><div class="period">${moisLabel} ${loyer.annee}</div></div>
  <div class="parties">
    <div class="party"><h3>Bailleur</h3><div>${proprietaire}</div></div>
    <div class="party"><h3>Locataire</h3><div>${loyer.prenom} ${loyer.nom}</div><div style="color:#555;font-size:13px">${adresse}</div></div>
  </div>
  <div class="amount-block">
    <div><div style="opacity:.85;font-size:13px">Total encaissé</div><div class="amount">${parseFloat(loyer.montant).toLocaleString('fr-FR',{minimumFractionDigits:2})} €</div></div>
    <div style="text-align:right"><div style="opacity:.85;font-size:13px">Période</div><div style="font-size:15px;font-weight:600">${moisLabel} ${loyer.annee}</div></div>
  </div>
  <table class="detail-table">
    <tr><td>Loyer brut</td><td>${parseFloat(loyer.montant).toLocaleString('fr-FR',{minimumFractionDigits:2})} €</td></tr>
    ${loyer.aide > 0 ? `<tr><td>Aide APL / AL</td><td>− ${parseFloat(loyer.aide).toLocaleString('fr-FR',{minimumFractionDigits:2})} €</td></tr>` : ''}
    <tr><td><strong>Net versé par le locataire</strong></td><td><strong>${net.toLocaleString('fr-FR',{minimumFractionDigits:2})} €</strong></td></tr>
  </table>
  <p>Je soussigné(e) <strong>${proprietaire}</strong> déclare avoir reçu de <strong>${loyer.prenom} ${loyer.nom}</strong>, locataire du bien situé <strong>${adresse}</strong>, la somme de <strong>${parseFloat(loyer.montant).toLocaleString('fr-FR',{minimumFractionDigits:2})} €</strong> au titre du loyer de <strong>${moisLabel} ${loyer.annee}</strong>.</p>
  <div class="sig">
    <div style="color:#555;margin-bottom:40px">Fait le ${dateEmission}</div>
    <div>Signature du bailleur :</div>
    <div class="sig-line">${proprietaire}</div>
  </div>
  <div class="footer">Document généré par Oïko • Quittance de loyer — ${moisLabel} ${loyer.annee}</div>
</body></html>`;

  const tmpPath = path.join(app.getPath('temp'), `quittance_${loyer.id}_${Date.now()}.html`);
  fs.writeFileSync(tmpPath, html, 'utf8');

  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  await win.loadFile(tmpPath);
  await new Promise(resolve => setTimeout(resolve, 400));
  const pdfBuffer = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
  win.destroy();
  try { fs.unlinkSync(tmpPath); } catch (_) {}
  return pdfBuffer;
}

function getLoyerWithDetails(loyerId) {
  return db.prepare(`
    SELECT ly.*, l.nom, l.prenom, l.email,
           b.adresse as b_adresse, b.complement_adresse as b_complement,
           b.code_postal as b_cp, b.ville as b_ville
    FROM loyers ly
    JOIN locataires l ON ly.locataire_id = l.id
    LEFT JOIN biens b ON l.bien_id = b.id
    WHERE ly.id = ?
  `).get(loyerId);
}

ipcMain.handle('loyers:sendReminder', async (e, loyerId) => {
  const loyer = getLoyerWithDetails(loyerId);
  if (!loyer) return { success: false, error: 'Loyer introuvable' };
  if (!loyer.email) return { success: false, error: 'Ce locataire n\'a pas d\'adresse email renseignée' };

  const smtpHost = getParam('smtp_host');
  const smtpUser = getParam('email_expediteur');
  const smtpPass = getParam('smtp_password');
  const smtpPort = parseInt(getParam('smtp_port')) || 587;
  const smtpSecure = getParam('smtp_secure') === 'true';
  if (!smtpHost || !smtpUser || !smtpPass) {
    return { success: false, error: 'Configuration SMTP incomplète. Allez dans Paramètres > Email.' };
  }

  const adresse = [loyer.b_adresse, loyer.b_complement, loyer.b_cp, loyer.b_ville].filter(Boolean).join(', ');
  const moisLabel = getMoisLabel(loyer.mois);

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: smtpSecure, auth: { user: smtpUser, pass: smtpPass } });
    await transporter.sendMail({
      from: smtpUser,
      to: loyer.email,
      subject: `Rappel — Loyer de ${moisLabel} ${loyer.annee}`,
      text: `Bonjour ${loyer.prenom} ${loyer.nom},\n\nNous vous rappelons que votre loyer de ${parseFloat(loyer.montant).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € pour le mois de ${moisLabel} ${loyer.annee} (${adresse}) n'a pas encore été enregistré.\n\nMerci de procéder au règlement dans les meilleurs délais.\n\nCordialement`
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('loyers:sendQuittance', async (e, loyerId) => {
  const loyer = getLoyerWithDetails(loyerId);
  if (!loyer) return { success: false, error: 'Loyer introuvable' };
  if (!loyer.email) return { success: false, error: 'Ce locataire n\'a pas d\'adresse email renseignée' };

  const smtpHost = getParam('smtp_host');
  const smtpUser = getParam('email_expediteur');
  const smtpPass = getParam('smtp_password');
  const smtpPort = parseInt(getParam('smtp_port')) || 587;
  const smtpSecure = getParam('smtp_secure') === 'true';
  if (!smtpHost || !smtpUser || !smtpPass) {
    return { success: false, error: 'Configuration SMTP incomplète. Allez dans Paramètres > Email.' };
  }

  try {
    const pdfBuffer = await generateQuittancePDF(loyer);
    const moisLabel = getMoisLabel(loyer.mois);
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: smtpSecure, auth: { user: smtpUser, pass: smtpPass } });
    await transporter.sendMail({
      from: smtpUser,
      to: loyer.email,
      subject: `Quittance de loyer — ${moisLabel} ${loyer.annee}`,
      text: `Bonjour ${loyer.prenom} ${loyer.nom},\n\nVeuillez trouver en pièce jointe votre quittance de loyer pour ${moisLabel} ${loyer.annee}.\n\nCordialement`,
      attachments: [{ filename: `quittance_${loyer.mois}_${loyer.annee}.pdf`, content: pdfBuffer }]
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('loyers:downloadQuittance', async (e, loyerId) => {
  let loyer = getLoyerWithDetails(loyerId);
  if (!loyer) return { success: false, error: 'Loyer introuvable' };
  try {
    // Attribue un numéro de quittance si absent
    if (!loyer.numero_quittance) {
      const numero = getNextQuittanceNumber(loyer.bien_id, loyer.annee);
      db.prepare('UPDATE loyers SET numero_quittance=? WHERE id=?').run(numero, loyerId);
      loyer = { ...loyer, numero_quittance: numero };
    }
    const pdfBuffer = await generateQuittancePDF(loyer);
    const defaultName = `quittance_${loyer.nom}_${loyer.mois}_${loyer.annee}.pdf`;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Enregistrer la quittance',
      defaultPath: defaultName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (result.canceled) return { success: false, canceled: true };
    fs.writeFileSync(result.filePath, pdfBuffer);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Téléchargement de toutes les quittances en masse dans un dossier
ipcMain.handle('loyers:downloadAllQuittances', async (e, loyerIds) => {
  if (!loyerIds || loyerIds.length === 0) return { success: false, error: 'Aucun loyer fourni' };

  // Choisir le dossier de destination
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choisir le dossier de destination',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };

  const destDir = result.filePaths[0];
  let generated = 0;
  const errors = [];

  for (const loyerId of loyerIds) {
    try {
      let loyer = getLoyerWithDetails(loyerId);
      if (!loyer) { errors.push(`Loyer ${loyerId} introuvable`); continue; }

      if (!loyer.numero_quittance) {
        const numero = getNextQuittanceNumber(loyer.bien_id, loyer.annee);
        db.prepare('UPDATE loyers SET numero_quittance=? WHERE id=?').run(numero, loyerId);
        loyer = { ...loyer, numero_quittance: numero };
      }

      const pdfBuffer = await generateQuittancePDF(loyer);
      const fileName = `quittance_${(loyer.nom || '').replace(/[^a-zA-Z0-9]/g, '_')}_${loyer.mois}_${loyer.annee}.pdf`;
      fs.writeFileSync(path.join(destDir, fileName), pdfBuffer);
      generated++;
    } catch (err) {
      errors.push(`${loyerId}: ${err.message}`);
    }
  }

  // Ouvrir le dossier dans l'explorateur
  if (generated > 0) {
    const { shell } = require('electron');
    shell.openPath(destDir);
  }

  return { success: true, generated, errors, destDir };
});

// ====== IPC : DASHBOARD STATS ======
ipcMain.handle('dashboard:getStats', () => {
  const now = new Date();
  const mois = now.getMonth() + 1;
  const annee = now.getFullYear();

  // Mois précédent (pour calcul des variations)
  const moisPrec = mois === 1 ? 12 : mois - 1;
  const anneePrec = mois === 1 ? annee - 1 : annee;

  // === Mois en cours ===
  const loyersMois = db.prepare(`
    SELECT COALESCE(SUM(montant), 0) as total
    FROM loyers WHERE mois=? AND annee=? AND statut='paye'
  `).get(mois, annee).total;

  const loyersAttenteMois = db.prepare(`
    SELECT COALESCE(SUM(montant), 0) as total
    FROM loyers WHERE mois=? AND annee=? AND statut IN ('en_attente', 'retard')
  `).get(mois, annee).total;

  const loyerAttenduMois = db.prepare(`
    SELECT COALESCE(SUM(montant), 0) as total
    FROM loyers WHERE mois=? AND annee=?
  `).get(mois, annee).total;

  const apl = db.prepare(`SELECT COALESCE(SUM(aide_apl), 0) as total FROM locataires`).get().total;

  // Dépenses : on les estime depuis les fichiers Excel mensuels
  let depensesMois = 0;
  try {
    const file = db.prepare('SELECT donnees FROM factures_excel WHERE mois=? AND annee=? AND type=?')
      .get(mois, annee, 'mensuel');
    if (file && file.donnees) {
      const rows = JSON.parse(file.donnees || '[]');
      depensesMois = rows.reduce((s, r) => s + (parseFloat(r.debit) || 0), 0);
    }
  } catch { }

  // === Mois précédent (pour comparaison) ===
  const loyersMoisPrec = db.prepare(`
    SELECT COALESCE(SUM(montant), 0) as total
    FROM loyers WHERE mois=? AND annee=? AND statut='paye'
  `).get(moisPrec, anneePrec).total;

  let depensesMoisPrec = 0;
  try {
    const filePrec = db.prepare('SELECT donnees FROM factures_excel WHERE mois=? AND annee=? AND type=?')
      .get(moisPrec, anneePrec, 'mensuel');
    if (filePrec && filePrec.donnees) {
      const rows = JSON.parse(filePrec.donnees || '[]');
      depensesMoisPrec = rows.reduce((s, r) => s + (parseFloat(r.debit) || 0), 0);
    }
  } catch { }

  // === Calcul des variations en % (null si pas de comparaison possible) ===
  const calcVariation = (current, previous) => {
    if (previous === 0) return null; // pas de référence
    return Math.round(((current - previous) / previous) * 1000) / 10;
  };

  const variationRevenus = calcVariation(loyersMois, loyersMoisPrec);
  const variationDepenses = calcVariation(depensesMois, depensesMoisPrec);

  // === Locataires en retard ===
  const retards = db.prepare(`SELECT COUNT(*) as c FROM loyers WHERE statut='retard'`).get().c;
  const loyersRetardDetail = db.prepare(`
    SELECT lo.locataire_id, lo.montant, lo.mois, lo.annee,
           l.prenom, l.nom
    FROM loyers lo
    JOIN locataires l ON lo.locataire_id = l.id
    WHERE lo.statut = 'retard'
    ORDER BY lo.annee DESC, lo.mois DESC
  `).all();

  // === Taux d'occupation ===
  const totalBiens = db.prepare('SELECT COUNT(*) as c FROM biens').get().c;
  const biensOccupes = db.prepare(`
    SELECT COUNT(DISTINCT bien_id) as c FROM locataires WHERE bien_id IS NOT NULL
  `).get().c;
  const tauxOccupation = totalBiens > 0 ? Math.round((biensOccupes / totalBiens) * 100) : 0;

  // === Solde bancaire = revenus - dépenses du mois ===
  const soldeBancaire = loyersMois - depensesMois;

  return {
    revenusMois: loyersMois,
    depensesMois: depensesMois,
    locatairesRetard: retards,
    tauxOccupation,
    soldeBancaire,
    loyersAttente: loyersAttenteMois,
    chargesAVenir: depensesMois, // approximation
    retardsPaiement: retards,
    loyerAttendu: loyerAttenduMois,
    totalEncaisse: loyersMois,
    aidesApl: apl,
    // Variations (peuvent être null si aucune référence)
    variationRevenus,
    variationDepenses,
    variationEncaisse: variationRevenus,
    variationApl: null,
    loyersRetardDetail
  };
});

ipcMain.handle('dashboard:evolution', () => {
  const annee = new Date().getFullYear();
  const data = [];
  for (let m = 1; m <= 12; m++) {
    const rev = db.prepare(`SELECT COALESCE(SUM(montant), 0) as total FROM loyers WHERE mois=? AND annee=? AND statut='paye'`).get(m, annee);
    const depRows = db.prepare(`SELECT donnees FROM factures_excel WHERE mois=? AND annee=?`).all(m, annee);
    let dep = 0;
    depRows.forEach(row => {
      try {
        const d = JSON.parse(row.donnees);
        d.forEach(x => dep += (parseFloat(x.debit) || 0));
      } catch { }
    });
    data.push({
      mois: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'][m - 1],
      revenus: rev.total,
      depenses: dep
    });
  }
  return data;
});

// Évolution annuelle : totaux par année sur les 5 dernières années
ipcMain.handle('dashboard:evolutionAnnuelle', () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = 4; i >= 0; i--) years.push(currentYear - i);

  return years.map(annee => {
    // Revenus = somme des loyers payés de l'année
    const revenus = db.prepare(`
      SELECT COALESCE(SUM(montant), 0) as total
      FROM loyers WHERE annee=? AND statut='paye'
    `).get(annee).total;

    // Dépenses = somme des débits des fichiers mensuels de l'année
    const files = db.prepare(`
      SELECT donnees FROM factures_excel
      WHERE annee=? AND type='mensuel'
    `).all(annee);

    let depenses = 0;
    files.forEach(f => {
      try {
        const rows = JSON.parse(f.donnees || '[]');
        rows.forEach(r => { depenses += parseFloat(r.debit) || 0; });
      } catch { }
    });

    return {
      mois: String(annee), // on garde "mois" comme clé pour réutiliser le graphique
      annee,
      revenus: Math.round(revenus * 100) / 100,
      depenses: Math.round(depenses * 100) / 100
    };
  });
});

// ====== ANALYTIQUE : PRÉVISIONNEL ======
ipcMain.handle('dashboard:previsionnel', (e, annee) => {
  const MOIS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const now = new Date();
  const moisEnCours = now.getFullYear() === annee ? now.getMonth() + 1 : 12;

  // Loyer mensuel attendu = somme des loyer_total de tous les locataires actifs
  const loyerMensuelAttendu = db.prepare(`
    SELECT COALESCE(SUM(b.loyer_total), 0) as total
    FROM locataires l JOIN biens b ON l.bien_id = b.id
  `).get().total;

  const data = [];
  let totalAttendu = 0;
  let totalPercu = 0;

  for (let m = 1; m <= 12; m++) {
    const percu = db.prepare(`SELECT COALESCE(SUM(montant), 0) as t FROM loyers WHERE mois=? AND annee=? AND statut='paye'`).get(m, annee).t;
    const attendu = loyerMensuelAttendu;
    const estFutur = m > moisEnCours;
    totalAttendu += attendu;
    if (!estFutur) totalPercu += percu;
    data.push({
      mois: MOIS[m - 1],
      attendu: Math.round(attendu * 100) / 100,
      percu: estFutur ? null : Math.round(percu * 100) / 100,
      projection: estFutur ? Math.round(attendu * 100) / 100 : null,
      taux: attendu > 0 && !estFutur ? Math.round((percu / attendu) * 100) : null,
      futur: estFutur
    });
  }

  const tauxGlobal = totalAttendu > 0 ? Math.round((totalPercu / (loyerMensuelAttendu * moisEnCours)) * 100) : 0;
  const projectionAnnee = totalPercu + loyerMensuelAttendu * (12 - moisEnCours);

  return { data, totalAttendu: Math.round(loyerMensuelAttendu * 12 * 100) / 100, totalPercu: Math.round(totalPercu * 100) / 100, tauxGlobal, projectionAnnee: Math.round(projectionAnnee * 100) / 100, moisEnCours };
});

// Évolution mensuelle pour une année donnée (utilisé pour la comparaison N vs N-1)
ipcMain.handle('dashboard:evolutionParAnnee', (e, annee) => {
  const MOIS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const data = [];
  for (let m = 1; m <= 12; m++) {
    const rev = db.prepare(`SELECT COALESCE(SUM(montant), 0) as total FROM loyers WHERE mois=? AND annee=? AND statut='paye'`).get(m, annee);
    const depRows = db.prepare(`SELECT donnees FROM factures_excel WHERE mois=? AND annee=?`).all(m, annee);
    let dep = 0;
    depRows.forEach(row => {
      try { const d = JSON.parse(row.donnees || '[]'); d.forEach(x => { dep += parseFloat(x.debit) || 0; }); } catch {}
    });
    data.push({
      mois: MOIS[m - 1],
      moisNum: m,
      revenus:  Math.round(rev.total * 100) / 100,
      depenses: Math.round(dep     * 100) / 100,
    });
  }
  return data;
});

// ====== ANALYTIQUE : PAR BIEN ======
ipcMain.handle('dashboard:parBien', (e, annee) => {
  const biens = db.prepare('SELECT * FROM biens').all();
  return biens.map(b => {
    const adresse = [b.adresse, b.code_postal, b.ville].filter(Boolean).join(', ');
    const court = b.adresse.length > 20 ? b.adresse.slice(0, 20) + '…' : b.adresse;
    const revenus = db.prepare(`SELECT COALESCE(SUM(ly.montant), 0) as t FROM loyers ly JOIN locataires l ON ly.locataire_id=l.id WHERE l.bien_id=? AND ly.annee=? AND ly.statut='paye'`).get(b.id, annee).t;
    const attendu = b.loyer_total * 12;
    const charges = db.prepare(`SELECT COALESCE(SUM(montant), 0) as t FROM charges_fiscales WHERE bien_id=? AND annee=?`).get(b.id, annee).t;
    const travaux = db.prepare(`SELECT COALESCE(SUM(cout), 0) as t FROM travaux WHERE bien_id=? AND statut='termine' AND strftime('%Y',date_fin)=?`).get(b.id, String(annee)).t;
    const solde = revenus - charges - travaux;
    return { id: b.id, adresse: court, adresseFull: adresse, revenus: Math.round(revenus*100)/100, attendu: Math.round(attendu*100)/100, charges: Math.round((charges+travaux)*100)/100, solde: Math.round(solde*100)/100, taux: attendu > 0 ? Math.round((revenus/attendu)*100) : 0 };
  }).sort((a, b) => b.revenus - a.revenus);
});

// ====== ANALYTIQUE : FISCAL 2044 ======
ipcMain.handle('impot:fiscal2044', (e, annee) => {
  const biens = db.prepare('SELECT * FROM biens').all();
  const proprietaire = getParam('user_name') || getParam('email_expediteur') || '';

  const loyersBruts = db.prepare(`SELECT COALESCE(SUM(montant), 0) as t FROM loyers WHERE annee=? AND statut='paye'`).get(annee).t;
  const charges = db.prepare(`SELECT categorie, COALESCE(SUM(montant), 0) as total FROM charges_fiscales WHERE annee=? GROUP BY categorie`).all(annee);
  const chargesTotal = charges.reduce((s, c) => s + c.total, 0);
  const travaux = db.prepare(`SELECT COALESCE(SUM(cout), 0) as t FROM travaux WHERE statut='termine' AND strftime('%Y',date_fin)=?`).get(String(annee)).t;

  const bienDetails = biens.map(b => {
    const adresse = [b.adresse, b.complement_adresse, b.code_postal, b.ville].filter(Boolean).join(', ');
    const rev = db.prepare(`SELECT COALESCE(SUM(ly.montant), 0) as t FROM loyers ly JOIN locataires l ON ly.locataire_id=l.id WHERE l.bien_id=? AND ly.annee=? AND ly.statut='paye'`).get(b.id, annee).t;
    const ch = db.prepare(`SELECT COALESCE(SUM(montant), 0) as t FROM charges_fiscales WHERE bien_id=? AND annee=?`).get(b.id, annee).t;
    const tr = db.prepare(`SELECT COALESCE(SUM(cout), 0) as t FROM travaux WHERE bien_id=? AND statut='termine' AND strftime('%Y',date_fin)=?`).get(b.id, String(annee)).t;
    return { adresse, loyersBruts: Math.round(rev*100)/100, charges: Math.round(ch*100)/100, travaux: Math.round(tr*100)/100, net: Math.round((rev-ch-tr)*100)/100 };
  });

  return {
    annee, proprietaire, loyersBruts: Math.round(loyersBruts*100)/100,
    chargesParCategorie: charges, chargesTotal: Math.round(chargesTotal*100)/100,
    travaux: Math.round(travaux*100)/100,
    revenuFoncierNet: Math.round((loyersBruts - chargesTotal - travaux)*100)/100,
    bienDetails
  };
});

ipcMain.handle('impot:exportFiscal2044PDF', async (e, annee) => {
  try {
    const d = await (async () => {
      const biens = db.prepare('SELECT * FROM biens').all();
      const proprietaire = getParam('user_name') || getParam('email_expediteur') || '';
      const loyersBruts = db.prepare(`SELECT COALESCE(SUM(montant), 0) as t FROM loyers WHERE annee=? AND statut='paye'`).get(annee).t;
      const charges = db.prepare(`SELECT categorie, COALESCE(SUM(montant), 0) as total FROM charges_fiscales WHERE annee=? GROUP BY categorie`).all(annee);
      const chargesTotal = charges.reduce((s, c) => s + c.total, 0);
      const travaux = db.prepare(`SELECT COALESCE(SUM(cout), 0) as t FROM travaux WHERE statut='termine' AND strftime('%Y',date_fin)=?`).get(String(annee)).t;
      const bienDetails = biens.map(b => {
        const adresse = [b.adresse, b.complement_adresse, b.code_postal, b.ville].filter(Boolean).join(', ');
        const rev = db.prepare(`SELECT COALESCE(SUM(ly.montant), 0) as t FROM loyers ly JOIN locataires l ON ly.locataire_id=l.id WHERE l.bien_id=? AND ly.annee=? AND ly.statut='paye'`).get(b.id, annee).t;
        const ch = db.prepare(`SELECT COALESCE(SUM(montant), 0) as t FROM charges_fiscales WHERE bien_id=? AND annee=?`).get(b.id, annee).t;
        const tr = db.prepare(`SELECT COALESCE(SUM(cout), 0) as t FROM travaux WHERE bien_id=? AND statut='termine' AND strftime('%Y',date_fin)=?`).get(b.id, String(annee)).t;
        return { adresse, loyersBruts: rev, charges: ch, travaux: tr, net: rev-ch-tr };
      });
      return { annee, proprietaire, loyersBruts, chargesParCategorie: charges, chargesTotal, travaux, revenuFoncierNet: loyersBruts - chargesTotal - travaux, bienDetails };
    })();

    const fmt = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 2 });
    const chargesRows = d.chargesParCategorie.map(c => `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${c.categorie}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${fmt(c.total)} €</td></tr>`).join('');
    const bienRows = d.bienDetails.map(b => `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px">${b.adresse}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(b.loyersBruts)} €</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(b.charges + b.travaux)} €</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:${b.net >= 0 ? '#10b981':'#ef4444'}">${fmt(b.net)} €</td></tr>`).join('');

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<style>
  *{box-sizing:border-box} body{font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:40px;font-size:13px}
  .header{background:#1e3a8a;color:white;padding:20px 24px;border-radius:8px;margin-bottom:28px}
  .header h1{margin:0;font-size:18px;letter-spacing:.05em}
  .header .sub{opacity:.8;font-size:13px;margin-top:4px}
  .section{margin-bottom:24px}
  .section-title{font-size:13px;font-weight:700;color:#1e3a8a;border-bottom:2px solid #1e3a8a;padding-bottom:6px;margin-bottom:14px;text-transform:uppercase;letter-spacing:.06em}
  .summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}
  .summary-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px}
  .summary-label{font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
  .summary-value{font-size:20px;font-weight:800}
  table{width:100%;border-collapse:collapse}
  th{background:#f1f5f9;padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em}
  .net-box{background:#f0fdf4;border:2px solid #10b981;border-radius:8px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;margin-top:20px}
  .net-label{font-size:13px;font-weight:700;color:#166534}
  .net-value{font-size:22px;font-weight:800;color:#10b981}
  .footer{border-top:1px solid #e5e7eb;padding-top:12px;margin-top:28px;font-size:10px;color:#aaa;text-align:center}
</style></head><body>
  <div class="header">
    <h1>Récapitulatif Fiscal ${d.annee} — Revenus Fonciers</h1>
    <div class="sub">Annexe 2044 • ${d.proprietaire}${d.proprietaire ? ' • ' : ''}Généré le ${new Date().toLocaleDateString('fr-FR')}</div>
  </div>
  <div class="summary-grid">
    <div class="summary-box"><div class="summary-label">Loyers bruts</div><div class="summary-value" style="color:#1e3a8a">${fmt(d.loyersBruts)} €</div></div>
    <div class="summary-box"><div class="summary-label">Charges déductibles</div><div class="summary-value" style="color:#f59e0b">${fmt(d.chargesTotal + d.travaux)} €</div></div>
    <div class="summary-box"><div class="summary-label">Revenu foncier net</div><div class="summary-value" style="color:#10b981">${fmt(d.revenuFoncierNet)} €</div></div>
  </div>
  <div class="section">
    <div class="section-title">Charges déductibles</div>
    <table><thead><tr><th>Catégorie</th><th style="text-align:right">Montant</th></tr></thead><tbody>
      ${chargesRows}
      ${d.travaux > 0 ? `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">Travaux (terminés ${d.annee})</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${fmt(d.travaux)} €</td></tr>` : ''}
      <tr><td style="padding:8px 12px;font-weight:700">TOTAL CHARGES</td><td style="padding:8px 12px;text-align:right;font-weight:800">${fmt(d.chargesTotal + d.travaux)} €</td></tr>
    </tbody></table>
  </div>
  <div class="section">
    <div class="section-title">Détail par bien</div>
    <table><thead><tr><th>Bien</th><th style="text-align:right">Loyers bruts</th><th style="text-align:right">Charges</th><th style="text-align:right">Net</th></tr></thead><tbody>${bienRows}</tbody></table>
  </div>
  <div class="net-box"><div class="net-label">Revenu foncier net imposable (ligne 440 — 2044)</div><div class="net-value">${fmt(d.revenuFoncierNet)} €</div></div>
  <div class="footer">Document préparé par Oïko • À reporter sur votre déclaration de revenus fonciers (formulaire 2044)</div>
</body></html>`;

    const pdf = await new Promise((resolve, reject) => {
      const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
      win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      win.webContents.once('did-finish-load', async () => {
        try { const p = await win.webContents.printToPDF({ marginsType: 1, printBackground: true, pageSize: 'A4' }); win.destroy(); resolve(p); }
        catch (e) { win.destroy(); reject(e); }
      });
    });

    const { filePath, canceled } = await dialog.showSaveDialog({ defaultPath: `fiscal_2044_${annee}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (canceled || !filePath) return { success: false, canceled: true };
    fs.writeFileSync(filePath, pdf);
    shell.openPath(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ====== IMPACT IMMÉDIAT ======

// Score de paiement : 12 derniers mois pour un locataire
ipcMain.handle('loyers:scorePaiement', (e, locataireId) => {
  const rows = db.prepare(`
    SELECT mois, annee, statut
    FROM loyers
    WHERE locataire_id = ?
    ORDER BY annee DESC, mois DESC
    LIMIT 12
  `).all(locataireId);
  return rows;
});

// Appliquer révision IRL à un bien
ipcMain.handle('loyers:applyIRL', (e, { bienId, ancienIRL, nouvelIRL }) => {
  const bien = db.prepare('SELECT loyer_hors_charge, charges_mensuelles FROM biens WHERE id = ?').get(bienId);
  if (!bien) return { success: false, error: 'Bien introuvable' };
  const ancienLoyerHC = bien.loyer_hors_charge || 0;
  const nouveauLoyerHC = Math.round((ancienLoyerHC * (nouvelIRL / ancienIRL)) * 100) / 100;
  const nouveauLoyerTotal = Math.round((nouveauLoyerHC + (bien.charges_mensuelles || 0)) * 100) / 100;
  db.prepare('UPDATE biens SET loyer_hors_charge = ?, loyer_total = ? WHERE id = ?')
    .run(nouveauLoyerHC, nouveauLoyerTotal, bienId);
  return { success: true, ancienLoyerHC, nouveauLoyerHC, nouveauLoyerTotal };
});

// Relance automatique : envoie des rappels pour les loyers impayés du mois courant
ipcMain.handle('loyers:relanceAuto', async (e, { delai } = {}) => {
  const smtpHost = getParam('smtp_host');
  const smtpPort = parseInt(getParam('smtp_port')) || 587;
  const smtpSecure = getParam('smtp_secure') === 'true';
  const smtpUser = getParam('email_expediteur');
  const smtpPass = getParam('smtp_password');
  if (!smtpHost || !smtpUser || !smtpPass) {
    return { success: false, error: 'SMTP non configuré — allez dans Paramètres → Configuration Email' };
  }
  const joursDelai = parseInt(delai || getParam('relance_auto_delai') || '3');
  const now = new Date();
  const moisCourant = now.getMonth() + 1;
  const anneeCourante = now.getFullYear();
  const dayOfMonth = now.getDate();
  const echeance = parseInt(getParam('date_echeance') || '5');
  const cutoff = echeance + joursDelai;
  if (dayOfMonth < cutoff) {
    return { success: true, sent: 0, total: 0, skipped: true, reason: `Jour ${dayOfMonth} < échéance ${echeance} + délai ${joursDelai}` };
  }
  const impayes = db.prepare(`
    SELECT ly.id, ly.montant, ly.aide, ly.mois, ly.annee,
           loc.prenom, loc.nom, loc.email,
           b.adresse, b.code_postal, b.ville
    FROM loyers ly
    JOIN locataires loc ON ly.locataire_id = loc.id
    JOIN biens b ON ly.bien_id = b.id
    WHERE ly.statut IN ('en_attente', 'retard')
    AND ly.mois = ? AND ly.annee = ?
  `).all(moisCourant, anneeCourante);
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: smtpSecure, auth: { user: smtpUser, pass: smtpPass } });
  const proprietaire = getParam('user_name') || smtpUser;
  const moisLabels = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  let sent = 0;
  const errors = [];
  for (const loyer of impayes) {
    if (!loyer.email) continue;
    try {
      const moisLabel = moisLabels[loyer.mois - 1];
      const adresse = [loyer.adresse, loyer.code_postal, loyer.ville].filter(Boolean).join(', ');
      await transporter.sendMail({
        from: smtpUser,
        to: loyer.email,
        subject: `Rappel : Loyer impayé — ${moisLabel} ${loyer.annee}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#ef4444">Rappel de paiement</h2><p>Bonjour ${loyer.prenom} ${loyer.nom},</p><p>Nous n'avons pas encore reçu votre loyer du mois de <strong>${moisLabel} ${loyer.annee}</strong> pour le logement :</p><p style="background:#f5f5f5;padding:12px;border-radius:8px"><strong>${adresse}</strong></p><p>Montant dû : <strong>${((loyer.montant||0)).toLocaleString('fr-FR',{minimumFractionDigits:2})} €</strong></p><p>Merci de régulariser votre situation dans les plus brefs délais.</p><p>Cordialement,<br/>${proprietaire}</p></div>`
      });
      sent++;
    } catch (err) {
      errors.push(`${loyer.prenom} ${loyer.nom} : ${err.message}`);
    }
  }
  return { success: true, sent, total: impayes.length, errors };
});

// ====== ALERTES CONFIGURABLES ======
ipcMain.handle('alertes:checkAll', async () => {
  let generated = 0;
  const now = new Date();

  // Alerte loyers impayés
  if (getParam('alerte_loyer_actif') === 'true') {
    const delai = parseInt(getParam('alerte_loyer_delai')) || 5;
    const moisCourant = now.getMonth() + 1;
    const anneeCourante = now.getFullYear();
    const impayes = db.prepare(`
      SELECT ly.*, l.prenom || ' ' || l.nom AS locataire_nom
      FROM loyers ly
      JOIN locataires l ON ly.locataire_id = l.id
      WHERE ly.annee = ? AND ly.mois = ? AND ly.statut IN ('en_attente','retard')
    `).all(anneeCourante, moisCourant);
    for (const l of impayes) {
      const echeance = l.date_echeance ? new Date(l.date_echeance) : new Date(anneeCourante, moisCourant - 1, parseInt(getParam('date_reception_loyer')) || 1);
      const joursRetard = Math.floor((now - echeance) / (1000 * 60 * 60 * 24));
      if (joursRetard >= delai) {
        db.prepare(`INSERT OR IGNORE INTO notifications (type, titre, message, date_creation) VALUES (?,?,?,?)`)
          .run('warning', 'Loyer impayé', `${l.locataire_nom} — loyer ${l.mois}/${l.annee} en retard de ${joursRetard} jour(s)`, now.toISOString());
        generated++;
      }
    }
  }

  // Alerte documents expirant
  if (getParam('alerte_doc_actif') === 'true') {
    const delai = parseInt(getParam('alerte_doc_delai')) || 30;
    const limite = new Date(now.getTime() + delai * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const docs = db.prepare(`
      SELECT d.*, l.prenom || ' ' || l.nom AS locataire_nom
      FROM documents d
      JOIN locataires l ON d.locataire_id = l.id
      WHERE d.date_expiration IS NOT NULL AND d.date_expiration <= ? AND d.date_expiration >= ?
    `).all(limite, now.toISOString().slice(0, 10));
    for (const d of docs) {
      const jours = Math.ceil((new Date(d.date_expiration) - now) / (1000 * 60 * 60 * 24));
      db.prepare(`INSERT OR IGNORE INTO notifications (type, titre, message, date_creation) VALUES (?,?,?,?)`)
        .run('warning', 'Document expirant', `${d.locataire_nom} — "${d.categorie}" expire dans ${jours} jour(s)`, now.toISOString());
      generated++;
    }
  }

  // Alerte fin de bail
  if (getParam('alerte_bail_actif') === 'true') {
    const delai = parseInt(getParam('alerte_bail_delai')) || 60;
    const limite = new Date(now.getTime() + delai * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const bails = db.prepare(`
      SELECT prenom || ' ' || nom AS nom, date_fin_bail
      FROM locataires
      WHERE date_fin_bail IS NOT NULL AND date_fin_bail <= ? AND date_fin_bail >= ?
    `).all(limite, now.toISOString().slice(0, 10));
    for (const b of bails) {
      const jours = Math.ceil((new Date(b.date_fin_bail) - now) / (1000 * 60 * 60 * 24));
      db.prepare(`INSERT OR IGNORE INTO notifications (type, titre, message, date_creation) VALUES (?,?,?,?)`)
        .run('info', 'Fin de bail proche', `${b.nom} — bail se termine dans ${jours} jour(s)`, now.toISOString());
      generated++;
    }
  }

  return { success: true, generated };
});

// ====== TRAY (icône dans la zone de notification Windows) ======

function createTray() {
  try {
    // Chemin de l'icône
    // En prod : process.resourcesPath/tray-icon.png (grâce à extraResources)
    // En dev : public/tray-icon.png
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'tray-icon.png')
      : path.join(__dirname, '..', 'public', 'tray-icon.png');

    let trayIcon;
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath);
      // Resize pour la tray Windows (16x16 idéalement)
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
    } else {
      // Icône vide en fallback
      trayIcon = nativeImage.createEmpty();
      console.warn('Icône tray non trouvée :', iconPath);
    }

    tray = new Tray(trayIcon);
    tray.setToolTip('Oïko - Comptabilité immobilière');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Ouvrir Oïko',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: 'Voir les notifications',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('navigate-to', 'notifications');
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quitter Oïko',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);

    // Double-clic sur l'icône = ouvrir
    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.error('Erreur création tray:', err);
  }
}

// ====== NOTIFICATIONS SYSTÈME ======

function showSystemNotification(title, body, options = {}) {
  if (!Notification.isSupported()) return;

  // Respecte le paramètre utilisateur
  if (getParam('notifications_systeme') === 'false') return;

  try {
    const notif = new Notification({
      title,
      body,
      silent: false,
      ...options
    });

    notif.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        if (options.targetPage) {
          mainWindow.webContents.send('navigate-to', options.targetPage);
        }
      }
    });

    notif.show();
  } catch (err) {
    console.error('Erreur notification système:', err);
  }
}

// ====== NUMÉROTATION QUITTANCES ======
function getNextQuittanceNumber(bienId, annee) {
  const count = db.prepare(`
    SELECT COUNT(*) as c FROM loyers ly
    JOIN locataires l ON ly.locataire_id = l.id
    WHERE l.bien_id=? AND ly.annee=? AND ly.numero_quittance IS NOT NULL
  `).get(bienId, annee).c;
  return `QT-${annee}-B${String(bienId).padStart(3,'0')}-${String(count + 1).padStart(4,'0')}`;
}

// ====== GÉNÉRATION PDF LETTRES TYPES ======
async function generateLettrePDF(template, vars) {
  const date = new Date().toLocaleDateString('fr-FR');
  const templates = {
    mise_en_demeure: {
      titre: 'Mise en demeure de payer',
      corps: `
        <p>Madame, Monsieur <strong>${vars.locataire}</strong>,</p>
        <p>Locataire du bien situé au <strong>${vars.adresse}</strong>,</p>
        <p>Par la présente, je vous mets en demeure de régler, dans un délai de <strong>8 jours</strong> à compter de la réception de ce courrier, la somme de <strong>${vars.montant} €</strong> correspondant à ${vars.detail || 'vos loyers impayés'}.</p>
        <p>À défaut de règlement dans ce délai, je me verrai dans l'obligation d'engager toutes procédures judiciaires nécessaires au recouvrement de cette créance, notamment la saisine du Tribunal compétent pour obtenir votre expulsion ainsi que la condamnation à verser les sommes dues augmentées des intérêts légaux et frais de procédure.</p>
        <p>Je vous rappelle que le non-paiement du loyer constitue un manquement grave à vos obligations contractuelles de locataire.</p>
        <p>Dans l'espoir que cette situation se règle à l'amiable, je reste à votre disposition pour tout accord de paiement échelonné.</p>
      `
    },
    conge_pour_vente: {
      titre: 'Congé pour vente',
      corps: `
        <p>Madame, Monsieur <strong>${vars.locataire}</strong>,</p>
        <p>Locataire du bien situé au <strong>${vars.adresse}</strong>,</p>
        <p>Par la présente lettre recommandée avec accusé de réception, je vous adresse, conformément aux articles 15 et 15-I de la loi du 6 juillet 1989, un <strong>congé pour vendre</strong> le logement que vous occupez.</p>
        <p>Ce congé prend effet à l'expiration de votre bail, soit au <strong>${vars.date_conge || '___________'}</strong>, date à laquelle vous devrez libérer les lieux.</p>
        ${vars.prix ? `<p>Ce logement vous est proposé en priorité au prix de <strong>${vars.prix} €</strong>. Vous disposez d'un délai de <strong>2 mois</strong> pour exercer votre droit de préemption.</p>` : ''}
        <p>En application de l'article 15 de la loi du 6 juillet 1989, ce congé vaut offre de vente à votre profit.</p>
      `
    },
    conge_pour_reprise: {
      titre: 'Congé pour reprise',
      corps: `
        <p>Madame, Monsieur <strong>${vars.locataire}</strong>,</p>
        <p>Locataire du bien situé au <strong>${vars.adresse}</strong>,</p>
        <p>Par la présente lettre recommandée avec accusé de réception, conformément à l'article 15-I de la loi du 6 juillet 1989, je vous adresse un <strong>congé pour reprise</strong>.</p>
        <p>Ce congé est motivé par la reprise du logement pour <strong>${vars.beneficiaire || 'usage personnel'}</strong>.</p>
        <p>Ce congé prend effet à l'expiration de votre bail, soit au <strong>${vars.date_conge || '___________'}</strong>, date à laquelle vous devrez libérer les lieux dans leur état initial.</p>
        <p>Je certifie sur l'honneur que la reprise est justifiée par un motif réel et sérieux, conformément aux dispositions légales en vigueur.</p>
      `
    },
    avenant_bail: {
      titre: 'Avenant au contrat de bail',
      corps: `
        <p>Entre les soussignés :</p>
        <p><strong>Le bailleur :</strong> ${vars.proprietaire}</p>
        <p><strong>Le locataire :</strong> ${vars.locataire}</p>
        <p>Concernant le logement situé au : <strong>${vars.adresse}</strong></p>
        <p>Il a été convenu ce qui suit :</p>
        <p>À compter du <strong>${vars.date_effet || '___________'}</strong>, le loyer mensuel hors charges est fixé à <strong>${vars.nouveau_loyer} €</strong>.</p>
        ${vars.motif ? `<p>Cette révision est effectuée conformément à l'Indice de Référence des Loyers (IRL). Indice de référence : ${vars.motif}.</p>` : ''}
        <p>Toutes les autres clauses du bail demeurent inchangées.</p>
        <p>Le présent avenant, établi en deux exemplaires, fait partie intégrante du contrat de bail initial.</p>
      `
    },
    courrier_libre: {
      titre: vars.titre_libre || 'Courrier',
      corps: `<p>${(vars.corps_libre || '').replace(/\n/g, '</p><p>')}</p>`
    }
  };

  const tpl = templates[template];
  if (!tpl) throw new Error('Modèle inconnu');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:48px;font-size:13px;line-height:1.7}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding-bottom:20px;border-bottom:2px solid #1e3a8a}
  .sender{font-size:12px;line-height:1.6}
  .sender strong{font-size:14px;display:block;margin-bottom:4px}
  .recipient-block{text-align:right;font-size:12px;line-height:1.6}
  .date-block{margin:24px 0;font-size:12px;color:#555}
  h1{font-size:16px;font-weight:700;color:#1e3a8a;text-align:center;text-transform:uppercase;letter-spacing:.08em;margin:28px 0;padding:10px;border:2px solid #1e3a8a;border-radius:4px}
  .body p{margin-bottom:14px;text-align:justify}
  .sig{margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:40px}
  .sig-box{border-top:1px solid #ccc;padding-top:10px;font-size:11px;color:#888}
  .sig-lines{height:60px}
  .footer{position:fixed;bottom:20px;left:48px;right:48px;border-top:1px solid #e5e7eb;padding-top:8px;font-size:10px;color:#aaa;text-align:center}
  .ref{font-size:11px;color:#666;margin-bottom:20px;font-style:italic}
</style></head><body>
  <div class="header">
    <div class="sender">
      <strong>${vars.proprietaire || 'Le Propriétaire'}</strong>
      ${vars.adresse_proprietaire ? vars.adresse_proprietaire.replace(/\n/g,'<br>') : ''}
    </div>
    <div class="recipient-block">
      <strong>${vars.locataire || ''}</strong><br>
      ${vars.adresse || ''}
    </div>
  </div>
  <div class="date-block">Fait le ${date}</div>
  <h1>${tpl.titre}</h1>
  <div class="ref">Objet : ${tpl.titre} — ${vars.adresse || ''}</div>
  <div class="body">${tpl.corps}</div>
  <div class="sig">
    <div class="sig-box"><div class="sig-lines"></div>Le locataire</div>
    <div class="sig-box"><div class="sig-lines"></div>Le propriétaire / bailleur</div>
  </div>
  <div class="footer">Document généré par Oïko le ${date}</div>
</body></html>`;

  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    win.webContents.once('did-finish-load', async () => {
      try {
        const pdf = await win.webContents.printToPDF({ marginsType: 1, printBackground: true, pageSize: 'A4' });
        win.destroy();
        resolve(pdf);
      } catch (e) { win.destroy(); reject(e); }
    });
  });
}

// ====== GÉNÉRATION PDF ÉTAT DES LIEUX ======
async function generateEDLPDF(edl) {
  const locataire = db.prepare('SELECT * FROM locataires WHERE id=?').get(edl.locataire_id);
  const bien = db.prepare('SELECT * FROM biens WHERE id=?').get(edl.bien_id);
  const pieces = JSON.parse(edl.pieces || '[]');
  const proprietaire = getParam('user_name') || getParam('email_expediteur') || 'Le propriétaire';
  const adresse = bien ? [bien.adresse, bien.complement_adresse, bien.code_postal, bien.ville].filter(Boolean).join(', ') : '';
  const typeLabel = edl.type === 'entree' ? "D'ENTRÉE" : "DE SORTIE";
  const date = edl.date_edl ? new Date(edl.date_edl).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');

  const etatColor = { bon: '#16a34a', passable: '#d97706', mauvais: '#dc2626' };
  const etatLabel = { bon: 'Bon état', passable: 'État passable', mauvais: 'Mauvais état' };

  const piecesHTML = pieces.map(p => `
    <tr>
      <td style="padding:8px 10px;border:1px solid #e5e7eb;font-weight:600">${p.nom}</td>
      <td style="padding:8px 10px;border:1px solid #e5e7eb;text-align:center">
        <span style="color:${etatColor[p.etat] || '#666'};font-weight:700">${etatLabel[p.etat] || p.etat}</span>
      </td>
      <td style="padding:8px 10px;border:1px solid #e5e7eb;color:#555">${p.observations || '—'}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:40px;font-size:12px;line-height:1.6}
  h1{text-align:center;color:#1e3a8a;font-size:18px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px}
  .subtitle{text-align:center;color:#555;margin-bottom:24px;font-size:13px;font-weight:600}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
  .block{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px}
  .block-title{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
  .block-value{font-size:13px;font-weight:600}
  table{width:100%;border-collapse:collapse;margin-top:16px}
  th{background:#1e3a8a;color:white;padding:10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
  .obs{margin-top:24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px}
  .sig{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px}
  .sig-box{border-top:2px solid #1e3a8a;padding-top:10px}
  .sig-lines{height:70px}
  .footer{border-top:1px solid #e5e7eb;padding-top:10px;margin-top:28px;font-size:10px;color:#aaa;text-align:center}
</style></head><body>
  <h1>État des lieux ${typeLabel}</h1>
  <div class="subtitle">${adresse}</div>
  <div class="grid2">
    <div class="block">
      <div class="block-title">Bailleur</div>
      <div class="block-value">${proprietaire}</div>
    </div>
    <div class="block">
      <div class="block-title">Locataire</div>
      <div class="block-value">${locataire ? locataire.prenom + ' ' + locataire.nom : '—'}</div>
    </div>
    <div class="block">
      <div class="block-title">Date</div>
      <div class="block-value">${date}</div>
    </div>
    <div class="block">
      <div class="block-title">Type</div>
      <div class="block-value">${edl.type === 'entree' ? "État des lieux d'entrée" : "État des lieux de sortie"}</div>
    </div>
  </div>
  <table>
    <thead><tr>
      <th style="width:30%">Pièce</th>
      <th style="width:20%">État</th>
      <th>Observations</th>
    </tr></thead>
    <tbody>${piecesHTML}</tbody>
  </table>
  ${edl.observations ? `<div class="obs"><strong>Observations générales :</strong><br>${edl.observations}</div>` : ''}
  <div class="sig">
    <div class="sig-box"><div class="sig-lines"></div><strong>Le locataire</strong><br><small>${locataire ? locataire.prenom + ' ' + locataire.nom : ''}</small></div>
    <div class="sig-box"><div class="sig-lines"></div><strong>Le propriétaire / bailleur</strong><br><small>${proprietaire}</small></div>
  </div>
  <div class="footer">Document généré par Oïko le ${new Date().toLocaleDateString('fr-FR')}</div>
</body></html>`;

  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    win.webContents.once('did-finish-load', async () => {
      try {
        const pdf = await win.webContents.printToPDF({ marginsType: 1, printBackground: true, pageSize: 'A4' });
        win.destroy();
        resolve(pdf);
      } catch (e) { win.destroy(); reject(e); }
    });
  });
}

// ====== IPC : LETTRES TYPES ======
ipcMain.handle('lettres:generate', async (e, { template, vars }) => {
  try {
    const pdf = await generateLettrePDF(template, vars);
    const { filePath, canceled } = await dialog.showSaveDialog({
      defaultPath: `${template}_${new Date().toISOString().slice(0,10)}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (canceled || !filePath) return { success: false, canceled: true };
    fs.writeFileSync(filePath, pdf);
    shell.openPath(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ====== IPC : ÉTAT DES LIEUX ======
ipcMain.handle('edl:getAll', () => {
  return db.prepare(`
    SELECT e.*, l.nom as loc_nom, l.prenom as loc_prenom,
           b.adresse as bien_adresse, b.code_postal, b.ville
    FROM etat_des_lieux e
    LEFT JOIN locataires l ON e.locataire_id = l.id
    LEFT JOIN biens b ON e.bien_id = b.id
    ORDER BY e.date_edl DESC
  `).all();
});

ipcMain.handle('edl:add', (e, data) => {
  const stmt = db.prepare(`INSERT INTO etat_des_lieux (locataire_id, bien_id, type, date_edl, pieces, observations) VALUES (?,?,?,?,?,?)`);
  const info = stmt.run(data.locataire_id || null, data.bien_id || null, data.type, data.date_edl, JSON.stringify(data.pieces || []), data.observations || '');
  return { id: info.lastInsertRowid };
});

ipcMain.handle('edl:update', (e, id, data) => {
  db.prepare(`UPDATE etat_des_lieux SET locataire_id=?, bien_id=?, type=?, date_edl=?, pieces=?, observations=? WHERE id=?`)
    .run(data.locataire_id || null, data.bien_id || null, data.type, data.date_edl, JSON.stringify(data.pieces || []), data.observations || '', id);
  return true;
});

ipcMain.handle('edl:delete', (e, id) => {
  db.prepare('DELETE FROM etat_des_lieux WHERE id=?').run(id);
  return true;
});

ipcMain.handle('edl:generatePDF', async (e, id) => {
  try {
    const edl = db.prepare('SELECT * FROM etat_des_lieux WHERE id=?').get(id);
    if (!edl) return { success: false, error: 'EDL introuvable' };
    const pdf = await generateEDLPDF(edl);
    const { filePath, canceled } = await dialog.showSaveDialog({
      defaultPath: `etat_des_lieux_${edl.type}_${edl.date_edl}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (canceled || !filePath) return { success: false, canceled: true };
    fs.writeFileSync(filePath, pdf);
    shell.openPath(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ====== IPC : MULTI-CLIENTS ======
ipcMain.handle('clients:list', () => loadClients().clients);

ipcMain.handle('clients:getCurrent', () => currentClient);

ipcMain.handle('clients:create', (e, { nom, couleur }) => {
  const id = 'client_' + Date.now();
  const dir = getClientDir(id);
  const dbPath = path.join(dir, 'oiko.db');
  const initiales = nom.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  const newClient = { id, nom, couleur: couleur || '#3b82f6', initiales, dbPath, createdAt: new Date().toISOString() };
  const data = loadClients();
  data.clients.push(newClient);
  saveClients(data);
  return newClient;
});

ipcMain.handle('clients:select', (e, clientId) => {
  try {
    const data = loadClients();
    const client = data.clients.find(c => c.id === clientId);
    if (!client) return { success: false, error: 'Client introuvable' };
    if (db) { try { db.close(); } catch {} db = null; }
    currentClient = client;
    data.lastClientId = clientId;
    saveClients(data);
    initDatabase(client.dbPath);
    if (notificationCheckInterval) { clearInterval(notificationCheckInterval); notificationCheckInterval = null; }
    startNotificationChecks();
    return { success: true, client };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('clients:rename', (e, clientId, nom) => {
  const data = loadClients();
  const client = data.clients.find(c => c.id === clientId);
  if (!client) return { success: false, error: 'Client introuvable' };
  client.nom = nom;
  client.initiales = nom.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  saveClients(data);
  if (currentClient?.id === clientId) { currentClient.nom = nom; currentClient.initiales = client.initiales; }
  return { success: true };
});

ipcMain.handle('clients:updateColor', (e, clientId, couleur) => {
  const data = loadClients();
  const client = data.clients.find(c => c.id === clientId);
  if (!client) return { success: false };
  client.couleur = couleur;
  saveClients(data);
  if (currentClient?.id === clientId) currentClient.couleur = couleur;
  return { success: true };
});

ipcMain.handle('clients:delete', (e, clientId) => {
  const data = loadClients();
  if (data.clients.length <= 1) return { success: false, error: 'Impossible de supprimer le seul portefeuille' };
  const idx = data.clients.findIndex(c => c.id === clientId);
  if (idx === -1) return { success: false, error: 'Client introuvable' };
  const [client] = data.clients.splice(idx, 1);
  client.deletedAt = new Date().toISOString();
  if (!data.trash) data.trash = [];
  data.trash.push(client);
  if (data.lastClientId === clientId) data.lastClientId = data.clients[0]?.id || null;
  saveClients(data);
  return { success: true };
});

ipcMain.handle('clients:listTrash', () => {
  const data = loadClients();
  return data.trash || [];
});

ipcMain.handle('clients:restore', (e, clientId) => {
  const data = loadClients();
  if (!data.trash) return { success: false, error: 'Corbeille vide' };
  const idx = data.trash.findIndex(c => c.id === clientId);
  if (idx === -1) return { success: false, error: 'Client introuvable dans la corbeille' };
  const [client] = data.trash.splice(idx, 1);
  delete client.deletedAt;
  data.clients.push(client);
  saveClients(data);
  return { success: true, client };
});

ipcMain.handle('clients:permanentDelete', (e, clientId) => {
  const data = loadClients();
  if (!data.trash) return { success: false, error: 'Corbeille vide' };
  const idx = data.trash.findIndex(c => c.id === clientId);
  if (idx === -1) return { success: false, error: 'Client introuvable' };
  const [client] = data.trash.splice(idx, 1);
  saveClients(data);
  // Supprimer le dossier physique
  const clientDir = path.join(app.getPath('userData'), 'clients', clientId);
  try { fs.rmSync(clientDir, { recursive: true, force: true }); } catch {}
  return { success: true };
});

// ====== VÉRIFICATIONS PÉRIODIQUES ======

function startNotificationChecks() {
  setTimeout(() => { checkLoyersEnRetard(); checkDocumentsExpiration(); checkFinDeBail(); }, 5000);
  notificationCheckInterval = setInterval(() => {
    checkLoyersEnRetard();
    checkDocumentsExpiration();
    checkFinDeBail();
  }, 60 * 60 * 1000);
}

function checkFinDeBail() {
  try {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const lastNotif = getParam('last_fin_bail_notif');
    if (lastNotif === todayStr) return;

    const in60 = new Date(today); in60.setDate(in60.getDate() + 60);
    const in60Str = in60.toISOString().slice(0, 10);

    const bientot = db.prepare(`
      SELECT * FROM locataires
      WHERE date_fin_bail IS NOT NULL AND date_fin_bail >= ? AND date_fin_bail <= ?
    `).all(todayStr, in60Str);

    const expires = db.prepare(`
      SELECT * FROM locataires
      WHERE date_fin_bail IS NOT NULL AND date_fin_bail < ?
    `).all(todayStr);

    if (bientot.length === 0 && expires.length === 0) return;
    setParam('last_fin_bail_notif', todayStr);

    bientot.forEach(l => {
      const jours = Math.ceil((new Date(l.date_fin_bail) - today) / (1000*60*60*24));
      showSystemNotification(
        '⚠️ Fin de bail approche',
        `${l.prenom} ${l.nom} — bail expire dans ${jours} jour(s) (${new Date(l.date_fin_bail).toLocaleDateString('fr-FR')})`,
        { targetPage: 'biens' }
      );
      db.prepare("INSERT INTO notifications (type, titre, message) VALUES (?, ?, ?)")
        .run('warning', `Fin de bail — ${l.prenom} ${l.nom}`,
          `Le bail expire dans ${jours} jour(s) le ${new Date(l.date_fin_bail).toLocaleDateString('fr-FR')}`);
    });

    expires.forEach(l => {
      showSystemNotification(
        '🔴 Bail expiré',
        `${l.prenom} ${l.nom} — bail expiré le ${new Date(l.date_fin_bail).toLocaleDateString('fr-FR')}`,
        { targetPage: 'biens' }
      );
    });
  } catch (err) {
    console.error('Erreur vérification fin de bail:', err);
  }
}

function checkDocumentsExpiration() {
  try {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const lastNotif = getParam('last_doc_expiration_notif');
    if (lastNotif === todayStr) return;

    const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
    const in30Str = in30.toISOString().slice(0, 10);

    const expiring = db.prepare(`
      SELECT d.*, l.nom, l.prenom FROM documents_locataire d
      JOIN locataires l ON d.locataire_id = l.id
      WHERE d.date_expiration IS NOT NULL AND d.date_expiration >= ? AND d.date_expiration <= ?
    `).all(todayStr, in30Str);

    const expired = db.prepare(`
      SELECT d.*, l.nom, l.prenom FROM documents_locataire d
      JOIN locataires l ON d.locataire_id = l.id
      WHERE d.date_expiration IS NOT NULL AND d.date_expiration < ?
    `).all(todayStr);

    if (expiring.length === 0 && expired.length === 0) return;
    setParam('last_doc_expiration_notif', todayStr);

    expired.forEach(d => showSystemNotification(
      '🔴 Document expiré',
      `${d.nom_original} (${d.prenom} ${d.nom}) — expiré le ${new Date(d.date_expiration).toLocaleDateString('fr-FR')}`,
      { targetPage: 'biens' }
    ));
    expiring.forEach(d => showSystemNotification(
      '⚠️ Document bientôt expiré',
      `${d.nom_original} (${d.prenom} ${d.nom}) — expire le ${new Date(d.date_expiration).toLocaleDateString('fr-FR')}`,
      { targetPage: 'biens' }
    ));
  } catch (err) {
    console.error('Erreur vérification expiration docs:', err);
  }
}

function checkLoyersEnRetard() {
  try {
    const now = new Date();
    const moisActuel = now.getMonth() + 1;
    const anneeActuelle = now.getFullYear();

    // Récupère les loyers en retard ou en attente du mois en cours
    const loyersRetard = db.prepare(`
      SELECT ly.*, l.nom, l.prenom
      FROM loyers ly
      LEFT JOIN locataires l ON ly.locataire_id = l.id
      WHERE ly.statut IN ('retard', 'en_attente')
        AND (ly.annee < ? OR (ly.annee = ? AND ly.mois < ?))
    `).all(anneeActuelle, anneeActuelle, moisActuel);

    if (loyersRetard.length === 0) return;

    // Évite de spammer : on ne notifie qu'une fois par jour
    const lastNotifDate = getParam('last_loyer_notif_date');
    const today = now.toISOString().slice(0, 10);
    if (lastNotifDate === today) return;

    setParam('last_loyer_notif_date', today);

    if (loyersRetard.length === 1) {
      const l = loyersRetard[0];
      showSystemNotification(
        '⚠️ Loyer en retard',
        `${l.prenom || ''} ${l.nom || 'Locataire'} - ${l.montant} € (${getMoisLabel(l.mois)} ${l.annee})`,
        { targetPage: 'loyer' }
      );
    } else {
      showSystemNotification(
        `⚠️ ${loyersRetard.length} loyers en retard`,
        'Plusieurs locataires ont des loyers impayés. Cliquez pour voir le détail.',
        { targetPage: 'loyer' }
      );
    }
  } catch (err) {
    console.error('Erreur vérification loyers:', err);
  }
}

function getMoisLabel(num) {
  const mois = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  return mois[num - 1] || '?';
}

// ====== IPC : LICENCE ======
ipcMain.handle('license:check',      async () => checkLicenseStatus());
ipcMain.handle('license:activate',   async (e, key) => activateLicense(key));
ipcMain.handle('license:deactivate', () => { deactivateLicense(); return { success: true }; });
ipcMain.handle('license:getInfo',    () => getLicenseInfo());