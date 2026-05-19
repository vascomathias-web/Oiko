const { autoUpdater } = require('electron-updater');
const { dialog, ipcMain } = require('electron');

// Désactive la vérif de signature en dev (pas de certificat de signature)
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;

let _mainWindow = null;

function setupUpdater(mainWindow) {
  _mainWindow = mainWindow;

  // ── Événements ──────────────────────────────────────────────────────────

  autoUpdater.on('update-available', (info) => {
    // Notifie le renderer qu'une mise à jour est disponible
    if (_mainWindow) {
      _mainWindow.webContents.send('update-status', {
        type: 'available',
        version: info.version,
        releaseNotes: info.releaseNotes || ''
      });
    }

    dialog.showMessageBox(_mainWindow, {
      type: 'info',
      title: 'Mise à jour disponible',
      message: `Oïko ${info.version} est disponible`,
      detail: 'Une nouvelle version est prête. Voulez-vous la télécharger maintenant ?\n(L\'installation se fera au prochain redémarrage)',
      buttons: ['Télécharger', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    if (_mainWindow) {
      _mainWindow.webContents.send('update-status', {
        type: 'progress',
        percent: Math.floor(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (_mainWindow) {
      _mainWindow.webContents.send('update-status', {
        type: 'downloaded',
        version: info.version
      });
    }

    dialog.showMessageBox(_mainWindow, {
      type: 'info',
      title: 'Mise à jour prête',
      message: `Oïko ${info.version} est téléchargé`,
      detail: 'La mise à jour sera installée au prochain redémarrage.',
      buttons: ['Redémarrer maintenant', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    if (_mainWindow) {
      _mainWindow.webContents.send('update-status', { type: 'up-to-date' });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater]', err?.message || err);
    if (_mainWindow) {
      _mainWindow.webContents.send('update-status', { type: 'error', message: err?.message });
    }
  });

  // ── Vérification automatique ─────────────────────────────────────────────
  // 8 secondes après le démarrage (laisse le temps de charger)
  setTimeout(() => checkForUpdates(), 8000);

  // Re-vérification toutes les 4 heures
  setInterval(() => checkForUpdates(), 4 * 60 * 60 * 1000);

  // ── IPC : vérif manuelle depuis les paramètres ───────────────────────────
  ipcMain.handle('updater:checkNow', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: result?.updateInfo };
    } catch (err) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true);
  });
}

function checkForUpdates() {
  const isDev = !require('electron').app.isPackaged;
  if (isDev) return; // Jamais en dev
  autoUpdater.checkForUpdates().catch(() => {});
}

module.exports = { setupUpdater };
