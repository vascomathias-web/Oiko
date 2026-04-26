process.on('uncaughtException', (err) => {
  try {
    require('fs').appendFileSync(
      require('path').join(require('os').homedir(), 'gestimmo-crash.log'),
      `[${new Date().toISOString()}] ${err.stack}\n`
    );
  } catch (_) { }
  console.error('CRASH:', err);
});

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, Notification, nativeImage } = require('electron');

// Définit l'identifiant Windows de l'app pour les notifications et la barre des tâches
// Sans ça, Windows affiche "electron.app.Electron" en mode dev
if (process.platform === 'win32') {
  app.setAppUserModelId('GestImmo');
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

// ====== STOCKAGE LOCAL FICHIERS EXCEL ======
function getExcelFolder() {
  const folder = path.join(app.getPath('userData'), 'excel_files');
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  return folder;
}

function getExcelFilePath(id) {
  return path.join(getExcelFolder(), `facture_${id}.xlsx`);
}

// Écrit un .xlsx à partir de données JSON (avec colonnes EXACTES du cahier des charges)
async function writeXlsxFromData(filePath, nom, donnees) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GestImmo';
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
const ENCRYPTION_KEY = crypto.scryptSync('gestimmo-secret-key-2026', 'salt', 32);
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
function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'gestimmo.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

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
  `);

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
    title: 'GestImmo',
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
        'GestImmo continue en arrière-plan',
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
      initDatabase();
    } catch (err) {
      console.error('initDatabase failed:', err);
      dialog.showErrorBox('Erreur base de données', err.message);
      app.quit();
      return;
    }

    // Initialise le tray et les vérifications périodiques
    createWindow()
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
  return biens.map(b => ({ ...b, code_immeuble_decrypted: decrypt(b.code_immeuble) }));
});

ipcMain.handle('biens:add', (e, data) => {
  // Force les valeurs numériques ≥ 0
  const loyer = Math.max(0, parseFloat(data.loyer_total) || 0);
  const surface = Math.max(0, parseFloat(data.surface) || 0);
  const caution = Math.max(0, parseFloat(data.caution) || 0);

  const stmt = db.prepare(`INSERT INTO biens (type, adresse, loyer_total, surface, caution, code_immeuble) VALUES (?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(data.type, data.adresse, loyer, surface, caution, encrypt(data.code_immeuble));
  return { id: info.lastInsertRowid, ...data };
});

ipcMain.handle('biens:update', (e, id, data) => {
  const loyer = Math.max(0, parseFloat(data.loyer_total) || 0);
  const surface = Math.max(0, parseFloat(data.surface) || 0);
  const caution = Math.max(0, parseFloat(data.caution) || 0);

  const stmt = db.prepare(`UPDATE biens SET type=?, adresse=?, loyer_total=?, surface=?, caution=?, code_immeuble=? WHERE id=?`);
  stmt.run(data.type, data.adresse, loyer, surface, caution, encrypt(data.code_immeuble), id);
  return true;
});

ipcMain.handle('biens:delete', (e, id) => {
  db.prepare('DELETE FROM biens WHERE id=?').run(id);
  return true;
});

// ====== IPC : LOCATAIRES ======
ipcMain.handle('locataires:getAll', () => {
  return db.prepare(`
    SELECT l.*, b.adresse as bien_adresse, b.type as bien_type, b.loyer_total as bien_loyer
    FROM locataires l
    LEFT JOIN biens b ON l.bien_id = b.id
    ORDER BY l.created_at DESC
  `).all();
});

ipcMain.handle('locataires:add', (e, data) => {
  // Vérifie que le bien n'est pas déjà attribué
  if (data.bien_id) {
    const existing = db.prepare('SELECT id, nom, prenom FROM locataires WHERE bien_id=?').get(data.bien_id);
    if (existing) {
      return {
        error: `Ce bien est déjà attribué à ${existing.prenom} ${existing.nom}. Désassignez-le d'abord.`
      };
    }
  }

  // Force aide_apl ≥ 0
  const aideApl = Math.max(0, parseFloat(data.aide_apl) || 0);

  const stmt = db.prepare(`INSERT INTO locataires (nom, prenom, parking, date_entree, bien_id, caution_payee, date_reception_loyer, telephone, email, aide_apl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(data.nom, data.prenom, data.parking ? 1 : 0, data.date_entree, data.bien_id, data.caution_payee ? 1 : 0, data.date_reception_loyer, data.telephone, data.email, aideApl);
  return { id: info.lastInsertRowid };
});

ipcMain.handle('locataires:update', (e, id, data) => {
  if (data.bien_id) {
    const existing = db.prepare('SELECT id, nom, prenom FROM locataires WHERE bien_id=? AND id!=?').get(data.bien_id, id);
    if (existing) {
      return {
        error: `Ce bien est déjà attribué à ${existing.prenom} ${existing.nom}. Désassignez-le d'abord.`
      };
    }
  }

  const aideApl = Math.max(0, parseFloat(data.aide_apl) || 0);

  db.prepare(`UPDATE locataires SET nom=?, prenom=?, parking=?, date_entree=?, bien_id=?, caution_payee=?, date_reception_loyer=?, telephone=?, email=?, aide_apl=? WHERE id=?`).run(
    data.nom, data.prenom, data.parking ? 1 : 0, data.date_entree, data.bien_id, data.caution_payee ? 1 : 0, data.date_reception_loyer, data.telephone, data.email, aideApl, id
  );
  return true;
});

ipcMain.handle('locataires:delete', (e, id) => {
  db.prepare('DELETE FROM locataires WHERE id=?').run(id);
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

    const systemInstruction = `Tu es l'assistant IA de GestImmo, un logiciel de comptabilité et gestion immobilière.
Tu réponds UNIQUEMENT aux questions concernant :
- La comptabilité (factures, relevés, bilans, TVA, fiscalité immobilière)
- Le fonctionnement du logiciel GestImmo (utilisation des pages, fonctionnalités)
- La gestion locative (loyers, baux, charges, APL)

Si la question est hors sujet, refuse poliment et redirige vers les sujets autorisés.
Réponds en français, de manière claire et professionnelle.`;

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
  return path.join(getUserDataPath(), 'gestimmo.db');
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
  const zipName = `gestimmo_backup_${timestamp}.zip`;
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
      archive.file(dbPath, { name: 'gestimmo.db' });
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
      app: 'GestImmo',
      contents: ['gestimmo.db', 'excel_files/']
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
    .filter(f => f.startsWith('gestimmo_backup_') && f.endsWith('.zip'))
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
  const dbInBackup = path.join(tempExtract, 'gestimmo.db');
  if (!fs.existsSync(dbInBackup)) {
    // Réouvre la DB actuelle
    db = new Database(getDbPath());
    db.pragma('journal_mode = WAL');
    throw new Error('Backup invalide : gestimmo.db introuvable');
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
    filters: [{ name: 'Sauvegarde GestImmo', extensions: ['zip'] }],
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
    admin_access: 'GestImmo - Code d\'accès à la zone admin',
    change_email: 'GestImmo - Confirmer le changement d\'email de récupération'
  };
  const bodies = {
    admin_access: `Bonjour,\n\nVoici votre code d'accès temporaire à la zone d'administration de GestImmo :\n\n   ${code}\n\nCe code est valable 5 minutes et utilisable une seule fois.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message et changez votre mot de passe SMTP par sécurité.\n\nGestImmo`,
    change_email: `Bonjour,\n\nUne demande de modification de votre email de récupération a été effectuée. Pour confirmer cette opération, utilisez le code suivant :\n\n   ${code}\n\nCe code est valable 5 minutes et utilisable une seule fois.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\nGestImmo`
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
    subject: subjects[purpose] || 'Code GestImmo',
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
          .filter(f => f.startsWith('gestimmo_backup_') && f.endsWith('.zip'))
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
    name: 'GestImmo',
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
      defaultPath: 'GestImmo_Guide_Utilisation.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });

    if (result.canceled) return { success: false, canceled: true };

    fs.copyFileSync(guidePath, result.filePath);
    return { success: true, path: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
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
    variationEncaisse: variationRevenus, // même calcul
    variationApl: null // pas de comparaison historique
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
    tray.setToolTip('GestImmo - Comptabilité immobilière');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Ouvrir GestImmo',
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
        label: 'Quitter GestImmo',
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

// ====== VÉRIFICATIONS PÉRIODIQUES ======

function startNotificationChecks() {
  // Vérification immédiate au démarrage (après 5 secondes pour laisser l'app charger)
  setTimeout(() => checkLoyersEnRetard(), 5000);

  // Puis toutes les heures
  notificationCheckInterval = setInterval(() => {
    checkLoyersEnRetard();
  }, 60 * 60 * 1000); // 1 heure
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