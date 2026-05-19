/**
 * generate-guide.js
 * Lance une fenêtre Electron invisible, charge le HTML du guide,
 * et exporte le PDF vers public/guide_utilisation.pdf
 *
 * Usage :  electron scripts/generate-guide.js
 *      ou  npm run generate-guide
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs   = require('fs');

// Désactive le GPU pour un rendu headless stable
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const srcHtml = path.join(__dirname, 'guide-source.html');
  const outPdf  = path.join(__dirname, '..', 'public', 'guide_utilisation.pdf');

  if (!fs.existsSync(srcHtml)) {
    console.error('❌  Fichier source introuvable :', srcHtml);
    app.quit();
    return;
  }

  console.log('📖  Chargement du guide HTML...');

  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  await win.loadFile(srcHtml);

  // Attendre que les polices et styles soient appliqués
  await new Promise(resolve => setTimeout(resolve, 1200));

  console.log('🖨️   Génération du PDF A4...');

  const pdfBuffer = await win.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });

  fs.writeFileSync(outPdf, pdfBuffer);
  win.destroy();

  const sizeKb = Math.round(pdfBuffer.length / 1024);
  console.log(`✅  PDF généré → ${outPdf}`);
  console.log(`   Taille : ${sizeKb} KB`);

  app.quit();
});

app.on('window-all-closed', () => app.quit());
