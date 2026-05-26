import Busboy from 'busboy';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const BUCKET      = 'locataire-docs';

// Désactiver le body parser Vercel (on gère nous-mêmes)
export const config = { api: { bodyParser: false } };

async function getPortal(token) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/portals?token=eq.${encodeURIComponent(token)}&select=*&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const rows = await res.json();
  return rows?.[0] || null;
}

async function uploadToStorage(path, buffer, mimeType) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': mimeType,
        'Cache-Control': '3600'
      },
      body: buffer
    }
  );
  return res.ok;
}

async function saveUploadMeta(token, locataireId, storagePath, originalName, categorie) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/locataire_uploads`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        token,
        locataire_id: locataireId,
        storage_path: storagePath,
        original_name: originalName,
        categorie,
        lu: false,
        created_at: new Date().toISOString()
      })
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    console.error('[saveUploadMeta] INSERT failed:', res.status, errText);
    return { ok: false, error: errText };
  }
  return { ok: true };
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: req.headers,
      limits: { fileSize: 10 * 1024 * 1024 } // 10 MB max
    });

    const fields = {};
    let fileBuffer = null;
    let fileName = '';
    let fileMime = 'application/octet-stream';

    bb.on('field', (name, val) => { fields[name] = val; });

    bb.on('file', (name, stream, info) => {
      const chunks = [];
      fileName = info.filename;
      fileMime = info.mimeType;
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => { fileBuffer = Buffer.concat(chunks); });
    });

    bb.on('close', () => resolve({ fields, fileBuffer, fileName, fileMime }));
    bb.on('error', reject);

    req.pipe(bb);
  });
}

export default async function handler(req, res) {
  // CORS pour les requêtes depuis le portail
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Configuration serveur manquante' });
  }

  let parsed;
  try {
    parsed = await parseMultipart(req);
  } catch (err) {
    return res.status(400).json({ error: 'Erreur lecture du fichier' });
  }

  const { fields, fileBuffer, fileName, fileMime } = parsed;
  const { token, categorie } = fields;

  if (!token) return res.status(400).json({ error: 'Token manquant' });
  if (!fileBuffer || fileBuffer.length === 0) return res.status(400).json({ error: 'Fichier vide ou manquant' });

  // Vérifier le token
  const portal = await getPortal(token);
  if (!portal) return res.status(404).json({ error: 'Portail introuvable' });
  if (portal.expires_at && new Date(portal.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Lien expiré' });
  }

  // Extensions autorisées
  const ext = fileName.split('.').pop().toLowerCase();
  const allowedExts = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
  if (!allowedExts.includes(ext)) {
    return res.status(400).json({ error: 'Format non autorisé (PDF, JPG, PNG uniquement)' });
  }

  // Chemin de stockage : locataire_id/timestamp_nom
  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${portal.data.locataire_id}/${timestamp}_${safeName}`;

  // Upload dans Supabase Storage
  const uploaded = await uploadToStorage(storagePath, fileBuffer, fileMime);
  if (!uploaded) {
    return res.status(500).json({ error: 'Erreur stockage du fichier. Vérifiez que le bucket "locataire-docs" existe dans Supabase.' });
  }

  // Sauvegarde des métadonnées
  const metaResult = await saveUploadMeta(token, portal.data.locataire_id, storagePath, fileName, categorie || 'Autre');
  if (!metaResult.ok) {
    return res.status(500).json({ error: 'Fichier uploadé mais métadonnées non sauvegardées', detail: metaResult.error });
  }

  return res.status(200).json({ success: true, message: 'Document envoyé avec succès' });
}
