/**
 * Oïko — API de validation des licences
 * À déployer sur Vercel (gratuit)
 *
 * Variables d'environnement Vercel à configurer :
 *   LICENSES_DB  →  JSON stringifié de ta base de licences
 *   ADMIN_SECRET →  Un mot de passe pour appeler les endpoints d'admin
 *
 * Format LICENSES_DB :
 * {
 *   "uuid-clé-1": {
 *     "email": "client@example.com",
 *     "plan": "standard",
 *     "expires": "2027-01-01",   // null = lifetime
 *     "revoked": false,
 *     "maxMachines": 1,
 *     "machines": ["machine-id-hash"]
 *   }
 * }
 */

export default function handler(req, res) {
  // CORS pour Electron
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { key, machineId, appVersion } = req.body || {};

  if (!key) {
    return res.status(400).json({ valid: false, error: 'Clé manquante' });
  }

  // Charger la base de licences depuis les variables d'environnement
  let db = {};
  try {
    db = JSON.parse(process.env.LICENSES_DB || '{}');
  } catch {
    console.error('LICENSES_DB invalide');
    return res.status(500).json({ valid: false, error: 'Erreur serveur' });
  }

  const license = db[key.trim()];

  if (!license) {
    return res.json({ valid: false, error: 'Clé de licence introuvable' });
  }

  if (license.revoked) {
    return res.json({ valid: false, error: 'Cette licence a été révoquée' });
  }

  if (license.expires && new Date(license.expires) < new Date()) {
    return res.json({ valid: false, error: 'Licence expirée', expired: true });
  }

  // Vérification machine (évite le partage de clé entre postes)
  const maxMachines = license.maxMachines || 1;
  const machines    = license.machines    || [];

  if (machineId && !machines.includes(machineId)) {
    if (machines.length >= maxMachines) {
      return res.json({
        valid: false,
        error: `Cette clé est déjà utilisée sur ${maxMachines} autre(s) appareil(s). Contactez support@oiko.app pour changer d'appareil.`
      });
    }
    // Enregistre le nouvel appareil (note: en prod, mettre à jour la DB ici)
    // Avec Vercel + env var c'est lecture seule → utiliser Supabase pour les writes
  }

  return res.json({
    valid:   true,
    plan:    license.plan    || 'standard',
    expires: license.expires || null,
    email:   license.email   || ''
  });
}
