const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

async function getPortal(token) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/portals?token=eq.${encodeURIComponent(token)}&select=*&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const rows = await res.json();
  return rows?.[0] || null;
}

function moisLabel(mois, annee) {
  const d = new Date(annee, mois - 1, 1);
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function statutBadge(statut) {
  if (statut === 'paye')    return `<span class="badge badge-ok">Payé</span>`;
  if (statut === 'retard')  return `<span class="badge badge-late">En retard</span>`;
  return `<span class="badge badge-wait">En attente</span>`;
}

function renderPortal(portal) {
  const d = portal.data;
  const now = new Date();
  const paiements = (d.paiements || []).slice(0, 24);
  const totalPaye = paiements.filter(p => p.statut === 'paye').reduce((s, p) => s + p.montant, 0);
  const nbRetard  = paiements.filter(p => p.statut === 'retard').length;
  const expireDate = new Date(portal.expires_at).toLocaleDateString('fr-FR');

  const apl = Number(d.apl || 0);
  const rows = paiements.map(p => {
    const paye = p.statut === 'paye';
    const versLocataire = paye ? Math.max(0, Number(p.montant || 0) - apl) : 0;
    return `
    <tr>
      <td>${moisLabel(p.mois, p.annee)}</td>
      <td class="amount">${Number(p.montant).toLocaleString('fr-FR')} €</td>
      <td class="amount">${paye ? versLocataire.toLocaleString('fr-FR') + ' €' : '<span style="color:#ef4444;font-weight:700">0 €</span>'}</td>
      <td class="amount">${apl > 0 ? apl.toLocaleString('fr-FR') + ' €' : '—'}</td>
      <td>${statutBadge(p.statut)}</td>
      <td>
        <a class="btn-dl ${p.statut !== 'paye' ? 'btn-dl-due' : ''}"
           href="/api/quittance?token=${portal.token}&mois=${p.mois}&annee=${p.annee}" download>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          ${p.statut === 'paye' ? 'Quittance' : 'Avis'}
        </a>
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Mon espace locataire — Oïko</title>
  <meta name="description" content="Consultez vos paiements et téléchargez vos quittances">
  <meta name="theme-color" content="#6366f1">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Oïko Locataire">
  <link rel="manifest" href="/api/manifest">
  <link rel="apple-touch-icon" href="https://oikolicense.vercel.app/icon-192.png">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f1f5f9; color: #1e293b; min-height: 100vh;
    }
    header {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      padding: 20px 24px; color: white;
      display: flex; align-items: center; gap: 14px;
    }
    .logo {
      width: 44px; height: 44px; border-radius: 12px;
      background: rgba(255,255,255,0.2);
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 900;
    }
    header h1 { font-size: 18px; font-weight: 700; }
    header p  { font-size: 13px; opacity: 0.8; margin-top: 2px; }
    .container { max-width: 720px; margin: 0 auto; padding: 24px 16px; }
    .card {
      background: white; border-radius: 16px; padding: 22px 24px;
      margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .card h2 { font-size: 14px; font-weight: 700; color: #64748b;
      text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 14px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .info-item label { font-size: 11px; color: #94a3b8; font-weight: 600;
      text-transform: uppercase; display: block; margin-bottom: 3px; }
    .info-item span  { font-size: 14px; font-weight: 600; }
    .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .stat { background: #f8fafc; border-radius: 10px; padding: 14px;
      text-align: center; }
    .stat .val { font-size: 22px; font-weight: 800; }
    .stat .lbl { font-size: 11px; color: #64748b; margin-top: 3px; }
    .stat.green .val { color: #10b981; }
    .stat.red   .val { color: #ef4444; }
    .stat.blue  .val { color: #6366f1; }
    table { width: 100%; border-collapse: collapse; }
    th {
      padding: 10px 12px; text-align: left; font-size: 11px;
      color: #94a3b8; font-weight: 600; text-transform: uppercase;
      border-bottom: 1px solid #f1f5f9;
    }
    td { padding: 12px; font-size: 13px; border-bottom: 1px solid #f8fafc; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #fafafa; }
    .amount { font-weight: 700; }
    .badge {
      display: inline-flex; padding: 3px 10px; border-radius: 20px;
      font-size: 11px; font-weight: 700;
    }
    .badge-ok   { background: #dcfce7; color: #16a34a; }
    .badge-late { background: #fee2e2; color: #dc2626; }
    .badge-wait { background: #fef9c3; color: #ca8a04; }
    .btn-dl {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 4px 10px; border-radius: 6px;
      background: #eff6ff; color: #3b82f6;
      font-size: 11px; font-weight: 700;
      text-decoration: none; white-space: nowrap;
    }
    .btn-dl:hover { background: #dbeafe; }
    .btn-dl-due { background: #fff7ed; color: #ea580c; }
    .btn-dl-due:hover { background: #ffedd5; }
    .btn-contact {
      display: block; width: 100%; padding: 13px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white; border: none; border-radius: 10px;
      font-size: 15px; font-weight: 700; cursor: pointer;
      text-align: center; text-decoration: none; margin-top: 4px;
    }
    .btn-contact:hover { opacity: 0.9; }
    .expire-note {
      text-align: center; color: #94a3b8; font-size: 12px; margin-top: 20px;
    }
    @media (max-width: 500px) {
      .info-grid { grid-template-columns: 1fr; }
      .stats-row { grid-template-columns: 1fr; }
      table { font-size: 12px; }
      th, td { padding: 8px 6px; }
    }
    #pwa-banner {
      display: none; position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
      background: #6366f1; color: white; padding: 12px 20px; border-radius: 14px;
      box-shadow: 0 4px 20px rgba(99,102,241,0.4); font-size: 13px; font-weight: 600;
      align-items: center; gap: 10px; z-index: 999;
      cursor: pointer; max-width: calc(100vw - 32px); animation: slideUp 0.3s ease;
    }
    #pwa-banner.visible { display: flex; }
    @keyframes slideUp { from { transform: translateX(-50%) translateY(20px); opacity:0; } to { transform: translateX(-50%) translateY(0); opacity:1; } }
    #pwa-banner button { background: white; color: #6366f1; border: none; padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; }
    #pwa-banner .dismiss { background: transparent; color: rgba(255,255,255,0.7); font-size: 18px; padding: 0 4px; line-height: 1; }
  </style>
</head>
<body>
  <header>
    <div class="logo">Oï</div>
    <div>
      <h1>Mon espace locataire</h1>
      <p>Bienvenue, ${d.nom}</p>
    </div>
  </header>

  <div class="container">

    <!-- Infos logement -->
    <div class="card">
      <h2>Mon logement</h2>
      <div class="info-grid">
        <div class="info-item">
          <label>Adresse</label>
          <span>${d.adresse || '—'}</span>
        </div>
        <div class="info-item">
          <label>Loyer mensuel</label>
          <span>${Number(d.loyer_mensuel || 0).toLocaleString('fr-FR')} €</span>
        </div>
        ${d.telephone ? `<div class="info-item"><label>Téléphone</label><span>${d.telephone}</span></div>` : ''}
        ${d.email ? `<div class="info-item"><label>Email</label><span>${d.email}</span></div>` : ''}
      </div>
    </div>

    <!-- Statistiques -->
    <div class="card">
      <h2>Résumé</h2>
      <div class="stats-row">
        <div class="stat blue">
          <div class="val">${paiements.length}</div>
          <div class="lbl">Mois enregistrés</div>
        </div>
        <div class="stat green">
          <div class="val">${Number(totalPaye).toLocaleString('fr-FR')} €</div>
          <div class="lbl">Total payé</div>
        </div>
        <div class="stat ${nbRetard > 0 ? 'red' : 'green'}">
          <div class="val">${nbRetard}</div>
          <div class="lbl">Retard(s)</div>
        </div>
      </div>
    </div>

    <!-- Historique paiements -->
    <div class="card">
      <h2>Historique des loyers</h2>
      ${paiements.length === 0
        ? '<p style="color:#94a3b8;text-align:center;padding:20px">Aucun paiement enregistré</p>'
        : `<table>
            <thead><tr>
              <th>Période</th><th>Montant</th><th>Versement locataire</th><th>Versement APL</th><th>Statut</th><th>Document</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>`
      }
    </div>

    <!-- Contact -->
    ${d.landlord_email ? `
    <div class="card">
      <h2>Contacter mon propriétaire</h2>
      <a class="btn-contact" href="mailto:${d.landlord_email}?subject=Question%20concernant%20mon%20logement">
        ✉ ${d.landlord_name ? `Contacter ${d.landlord_name}` : 'Envoyer un email'}
      </a>
    </div>` : ''}

    <!-- Envoi de documents -->
    <div class="card" id="upload-section">
      <h2>Envoyer un document</h2>
      <p style="font-size:13px;color:#64748b;margin-bottom:16px">
        Attestation d'assurance, RIB, justificatif… Votre propriétaire sera notifié automatiquement.
      </p>

      <div style="margin-bottom:12px">
        <label style="font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;display:block;margin-bottom:6px">Catégorie</label>
        <select id="upload-categorie" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;background:#f8fafc;color:#1e293b">
          <option value="Attestation assurance">Attestation d'assurance</option>
          <option value="RIB">RIB</option>
          <option value="Justificatif revenus">Justificatif de revenus</option>
          <option value="Autre">Autre</option>
        </select>
      </div>

      <label id="upload-label" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:28px 16px;border:2px dashed #cbd5e1;border-radius:12px;cursor:pointer;background:#f8fafc;transition:all 0.2s">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span style="font-size:14px;color:#64748b;font-weight:600">Cliquer pour choisir un fichier</span>
        <span style="font-size:11px;color:#94a3b8">PDF, JPG, PNG — 10 Mo max</span>
        <input type="file" id="upload-input" accept=".pdf,.jpg,.jpeg,.png,.webp" style="display:none">
      </label>

      <div id="upload-filename" style="display:none;margin-top:10px;padding:8px 12px;background:#f1f5f9;border-radius:8px;font-size:13px;color:#334155"></div>

      <button id="upload-btn" onclick="handleUpload()" style="display:none;width:100%;margin-top:12px;padding:13px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer">
        Envoyer le document
      </button>

      <div id="upload-status" style="display:none;margin-top:12px;padding:12px 16px;border-radius:10px;font-size:13px;font-weight:600;text-align:center"></div>
    </div>

    <p class="expire-note">Lien valide jusqu'au ${expireDate} · Fourni par Oïko</p>
  </div>

  <!-- Bannière installation PWA -->
  <div id="pwa-banner">
    <span>📱</span>
    <span>Installer sur votre téléphone</span>
    <button id="pwa-install">Installer</button>
    <button class="dismiss" id="pwa-dismiss" title="Fermer">×</button>
  </div>

  <script>
    // ── Upload documents ──────────────────────────────────────
    const uploadInput = document.getElementById('upload-input');
    const uploadLabel = document.getElementById('upload-label');
    const uploadBtn   = document.getElementById('upload-btn');
    const uploadFilename = document.getElementById('upload-filename');
    const uploadStatus   = document.getElementById('upload-status');
    const TOKEN = new URLSearchParams(location.search).get('token');

    uploadInput && uploadInput.addEventListener('change', () => {
      const file = uploadInput.files[0];
      if (!file) return;
      uploadFilename.style.display = 'block';
      uploadFilename.textContent = '📎 ' + file.name + ' (' + (file.size / 1024).toFixed(0) + ' Ko)';
      uploadBtn.style.display = 'block';
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Envoyer le document';
      uploadLabel.style.borderColor = '#6366f1';
      uploadLabel.style.background = 'rgba(99,102,241,0.04)';
    });

    uploadLabel && uploadLabel.addEventListener('dragover', e => { e.preventDefault(); uploadLabel.style.borderColor = '#6366f1'; });
    uploadLabel && uploadLabel.addEventListener('dragleave', () => { uploadLabel.style.borderColor = '#cbd5e1'; });
    uploadLabel && uploadLabel.addEventListener('drop', e => {
      e.preventDefault();
      if (e.dataTransfer.files[0]) {
        uploadInput.files = e.dataTransfer.files;
        uploadInput.dispatchEvent(new Event('change'));
      }
    });

    async function handleUpload() {
      const file = uploadInput.files[0];
      if (!file || !TOKEN) return;

      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Envoi en cours…';
      uploadStatus.style.display = 'none';

      const categorie = document.getElementById('upload-categorie').value;
      const fd = new FormData();
      fd.append('file', file);
      fd.append('token', TOKEN);
      fd.append('categorie', categorie);

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const json = await res.json();

        if (json.success) {
          uploadStatus.style.display = 'block';
          uploadStatus.style.background = '#f0fdf4';
          uploadStatus.style.color = '#16a34a';
          uploadStatus.style.border = '1px solid #bbf7d0';
          uploadStatus.textContent = '✅ Document envoyé avec succès ! Votre propriétaire en a été notifié.';
          uploadInput.value = '';
          uploadFilename.style.display = 'none';
          uploadBtn.style.display = 'none';
          uploadBtn.disabled = false;
          uploadBtn.textContent = 'Envoyer le document';
          uploadLabel.style.borderColor = '#cbd5e1';
          uploadLabel.style.background = '#f8fafc';
        } else {
          throw new Error(json.error || 'Erreur inconnue');
        }
      } catch (err) {
        uploadStatus.style.display = 'block';
        uploadStatus.style.background = '#fef2f2';
        uploadStatus.style.color = '#dc2626';
        uploadStatus.style.border = '1px solid #fecaca';
        uploadStatus.textContent = '❌ ' + err.message;
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Envoyer le document';
      }
    }

    // ── PWA ──────────────────────────────────────────────────
    let deferredPrompt = null;
    const banner = document.getElementById('pwa-banner');
    const btnInstall = document.getElementById('pwa-install');
    const btnDismiss = document.getElementById('pwa-dismiss');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      banner.classList.add('visible');
    });

    btnInstall && btnInstall.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      banner.classList.remove('visible');
    });

    btnDismiss && btnDismiss.addEventListener('click', () => {
      banner.classList.remove('visible');
    });

    window.addEventListener('appinstalled', () => {
      banner.classList.remove('visible');
    });
  </script>
</body>
</html>`;
}

function renderError(msg) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
  <title>Oïko — Portail</title>
  <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
  min-height:100vh;background:#f1f5f9;flex-direction:column;gap:16px;color:#334155}
  .box{background:white;border-radius:16px;padding:40px;text-align:center;max-width:400px;
  box-shadow:0 1px 3px rgba(0,0,0,.06)}h2{font-size:20px;margin-bottom:8px}
  p{color:#94a3b8;font-size:14px}</style></head>
  <body><div class="box"><div style="font-size:48px">🔒</div>
  <h2>${msg}</h2><p>Contactez votre propriétaire pour obtenir un nouveau lien.</p></div></body></html>`;
}

export default async function handler(req, res) {
  const { token } = req.query;

  if (!token) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send(renderError('Lien invalide'));
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).send(renderError('Configuration serveur manquante'));
  }

  let portal;
  try {
    portal = await getPortal(token);
  } catch {
    return res.status(500).send(renderError('Erreur de connexion'));
  }

  if (!portal) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(404).send(renderError('Lien introuvable ou expiré'));
  }

  if (portal.expires_at && new Date(portal.expires_at) < new Date()) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(410).send(renderError('Ce lien a expiré'));
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderPortal(portal));
}
