/**
 * Oïko — Module de gestion des licences
 *
 * Fonctionnement :
 * 1. Première activation : connexion internet obligatoire → appel API → cache local signé
 * 2. Lancements suivants : vérification du cache local (HMAC)
 * 3. Revalidation en ligne : toutes les 7 jours
 * 4. Hors ligne : mode grâce de 7 jours supplémentaires
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const https  = require('https');
const { app } = require('electron');

// ── Config ───────────────────────────────────────────────────────────────────
// URL de ton API Vercel de validation (à déployer — voir api/validate-license.js)
const LICENSE_API_URL = 'https://api-oiko.vercel.app/validate';

// Secret local pour signer le cache (protège contre la modification manuelle du fichier)
// À NE PAS changer entre les versions — sinon tous les clients doivent se réactiver
const LOCAL_HMAC_SECRET = 'oiko-local-v1-8f3a2c9b7e4d1f6a5b0c3e8d2f7a9b4c';

const GRACE_DAYS         = 7;   // jours de grâce sans internet après la dernière vérif
const RECHECK_DAYS       = 7;   // revalidation en ligne toutes les X jours
const LICENSE_FILE_NAME  = 'oiko-license.json';

// ── Helpers ──────────────────────────────────────────────────────────────────
function getLicensePath() {
  return path.join(app.getPath('userData'), LICENSE_FILE_NAME);
}

function loadLocal() {
  try {
    const p = getLicensePath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return null; }
}

function saveLocal(data) {
  try {
    fs.writeFileSync(getLicensePath(), JSON.stringify(data, null, 2), 'utf8');
  } catch (e) { console.error('[License] saveLocal:', e.message); }
}

function clearLocal() {
  try {
    const p = getLicensePath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

/** Génère la signature HMAC du cache local */
function computeHmac(key, plan, expires, email) {
  const payload = `${key}|${plan}|${expires || 'lifetime'}|${email || ''}`;
  return crypto.createHmac('sha256', LOCAL_HMAC_SECRET).update(payload).digest('hex');
}

/** Vérifie que le cache local n'a pas été altéré */
function isLocalTokenValid(license) {
  if (!license?.key || !license?.localHmac) return false;
  const expected = computeHmac(license.key, license.plan, license.expires, license.email);
  return license.localHmac === expected;
}

/** Vérifie si la licence a expiré */
function isExpired(license) {
  if (!license?.expires) return false; // lifetime
  return new Date(license.expires) < new Date();
}

/** Nombre de jours depuis la dernière vérification en ligne */
function daysSinceLastCheck(license) {
  if (!license?.validatedAt) return Infinity;
  return (Date.now() - new Date(license.validatedAt).getTime()) / 86_400_000;
}

// ── Appel API ─────────────────────────────────────────────────────────────────
function callLicenseAPI(key, machineId) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ key: key.trim(), machineId, appVersion: app.getVersion() });
    const url  = new URL(LICENSE_API_URL);

    const options = {
      hostname: url.hostname,
      port:     443,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent':     `Oiko/${app.getVersion()}`
      },
      timeout: 12000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ valid: false, error: 'Réponse serveur invalide' }); }
      });
    });

    req.on('timeout', () => { req.destroy(); resolve({ valid: false, offline: true }); });
    req.on('error',   () => resolve({ valid: false, offline: true }));
    req.write(body);
    req.end();
  });
}

/** Identifiant machine unique (CPU + hostname) */
function getMachineId() {
  const os = require('os');
  const raw = `${os.hostname()}-${os.cpus()[0]?.model || 'cpu'}-${os.platform()}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

// ── API publique ──────────────────────────────────────────────────────────────

/**
 * Vérifie le statut de la licence au démarrage.
 * Returns: { status, plan, expires, email, daysLeft? }
 *   status: 'valid' | 'grace' | 'expired' | 'not_activated' | 'revoked'
 */
async function checkLicenseStatus() {
  // Mode développement → toujours valide
  if (!app.isPackaged) {
    return { status: 'valid', plan: 'dev', expires: null, email: 'dev@oiko.app' };
  }

  const license = loadLocal();

  // Aucune licence enregistrée
  if (!license?.key) return { status: 'not_activated' };

  // Cache altéré (modification manuelle)
  if (!isLocalTokenValid(license)) {
    clearLocal();
    return { status: 'not_activated' };
  }

  // Licence expirée (date dépassée)
  if (isExpired(license)) {
    return { status: 'expired', plan: license.plan, expires: license.expires, email: license.email };
  }

  const sinceDays = daysSinceLastCheck(license);

  // Revalidation en ligne requise
  if (sinceDays >= RECHECK_DAYS) {
    const result = await callLicenseAPI(license.key, getMachineId());

    if (result.offline) {
      // Internet indisponible → mode grâce
      const daysLeft = Math.max(0, Math.floor(GRACE_DAYS - (sinceDays - RECHECK_DAYS)));
      if (daysLeft <= 0) return { status: 'expired', plan: license.plan, email: license.email };
      return { status: 'grace', plan: license.plan, email: license.email, daysLeft };
    }

    if (!result.valid) {
      clearLocal();
      return { status: 'revoked', error: result.error };
    }

    // Renouvelle le cache
    _updateCache(license.key, result);
    return { status: 'valid', plan: result.plan, expires: result.expires, email: result.email };
  }

  // Cache local OK, pas besoin de vérif en ligne
  return { status: 'valid', plan: license.plan, expires: license.expires, email: license.email };
}

/**
 * Active une nouvelle clé de licence.
 * Returns: { success, plan?, expires?, email?, error? }
 */
async function activateLicense(key) {
  if (!key?.trim() || key.trim().length < 8) {
    return { success: false, error: 'Clé de licence invalide' };
  }

  const result = await callLicenseAPI(key.trim(), getMachineId());

  if (result.offline) {
    return { success: false, error: 'Connexion internet requise pour l\'activation initiale.' };
  }

  if (!result.valid) {
    return { success: false, error: result.error || 'Clé incorrecte ou déjà utilisée sur un autre appareil.' };
  }

  _updateCache(key.trim(), result);
  return { success: true, plan: result.plan, expires: result.expires, email: result.email };
}

/** Révoque la licence locale (désactivation / changement de poste) */
function deactivateLicense() {
  clearLocal();
}

/** Renvoie les infos de la licence locale sans vérifier en ligne */
function getLicenseInfo() {
  const license = loadLocal();
  if (!license) return null;
  return {
    key:         license.key.slice(0, 8) + '****',
    plan:        license.plan,
    expires:     license.expires,
    email:       license.email,
    activatedAt: license.activatedAt,
    validatedAt: license.validatedAt
  };
}

// ── Interne ───────────────────────────────────────────────────────────────────
function _updateCache(key, apiResult) {
  const plan    = apiResult.plan    || 'standard';
  const expires = apiResult.expires || null;
  const email   = apiResult.email   || '';

  const updated = {
    key,
    plan,
    expires,
    email,
    activatedAt: loadLocal()?.activatedAt || new Date().toISOString(),
    validatedAt: new Date().toISOString(),
    localHmac:   computeHmac(key, plan, expires, email)
  };
  saveLocal(updated);
}

module.exports = { checkLicenseStatus, activateLicense, deactivateLicense, getLicenseInfo };
