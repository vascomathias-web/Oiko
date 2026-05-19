#!/usr/bin/env node
/**
 * Oïko — Générateur de clés de licence
 *
 * Usage :
 *   node tools/generate-license.js --email=client@example.com --plan=standard --expires=2027-01-01
 *   node tools/generate-license.js --email=client@example.com --plan=pro        (lifetime)
 *   node tools/generate-license.js --list            (afficher toutes les licences)
 *   node tools/generate-license.js --revoke=UUID     (révoquer une clé)
 *
 * Plans disponibles : standard, pro, lifetime
 *
 * La base de licences est stockée dans tools/licenses-db.json
 * → Mettre à jour la variable LICENSES_DB sur Vercel après chaque modification
 */

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const DB_PATH = path.join(__dirname, 'licenses-db.json');

// ── Helpers ────────────────────────────────────────────────────────────────
function loadDb() {
  if (!fs.existsSync(DB_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return {}; }
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function generateKey() {
  // Format UUID v4 lisible : xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return crypto.randomUUID();
}

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, val] = arg.slice(2).split('=');
      args[key] = val || true;
    }
  });
  return args;
}

// ── Commandes ──────────────────────────────────────────────────────────────
const args = parseArgs();

if (args.list) {
  // Afficher toutes les licences
  const db = loadDb();
  const keys = Object.keys(db);
  if (keys.length === 0) {
    console.log('📭 Aucune licence générée pour l\'instant.');
  } else {
    console.log(`\n📋 ${keys.length} licence(s) :\n`);
    keys.forEach(k => {
      const l = db[k];
      const status = l.revoked ? '🔴 RÉVOQUÉE' : (!l.expires || new Date(l.expires) > new Date()) ? '🟢 ACTIVE' : '🟡 EXPIRÉE';
      console.log(`  ${status}  ${k}`);
      console.log(`         Email   : ${l.email}`);
      console.log(`         Plan    : ${l.plan}`);
      console.log(`         Expire  : ${l.expires || 'Lifetime'}`);
      console.log(`         Créée   : ${new Date(l.createdAt).toLocaleDateString('fr-FR')}`);
      console.log();
    });
  }

} else if (args.revoke) {
  // Révoquer une clé
  const db  = loadDb();
  const key = args.revoke;
  if (!db[key]) {
    console.error(`❌ Clé introuvable : ${key}`);
    process.exit(1);
  }
  db[key].revoked   = true;
  db[key].revokedAt = new Date().toISOString();
  saveDb(db);
  console.log(`✅ Clé révoquée : ${key}`);
  console.log('\n⚠️  N\'oublie pas de mettre à jour LICENSES_DB sur Vercel !');

} else if (args.email) {
  // Générer une nouvelle clé
  const email   = args.email;
  const plan    = args.plan    || 'standard';
  const expires = args.expires || null; // null = lifetime

  if (!email.includes('@')) {
    console.error('❌ Email invalide');
    process.exit(1);
  }

  const validPlans = ['standard', 'pro', 'lifetime'];
  if (!validPlans.includes(plan)) {
    console.error(`❌ Plan invalide. Valeurs acceptées : ${validPlans.join(', ')}`);
    process.exit(1);
  }

  const key = generateKey();
  const db  = loadDb();

  db[key] = {
    email,
    plan,
    expires:     expires || null,
    revoked:     false,
    maxMachines: 1,
    machines:    [],
    createdAt:   new Date().toISOString()
  };

  saveDb(db);

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ✅  NOUVELLE LICENCE OÏKO GÉNÉRÉE');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Clé     : ${key}`);
  console.log(`  Email   : ${email}`);
  console.log(`  Plan    : ${plan}`);
  console.log(`  Expire  : ${expires || '∞ Lifetime'}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('\n📧 Texte à envoyer au client :');
  console.log('───────────────────────────────');
  console.log(`Merci pour votre achat d'Oïko !`);
  console.log(`\nVotre clé de licence :\n\n  ${key}\n`);
  console.log(`Copiez cette clé dans l'écran d'activation d'Oïko.`);
  console.log(`Plan : ${plan === 'standard' ? 'Standard' : plan === 'pro' ? 'Pro' : 'Lifetime'}`);
  if (expires) console.log(`Valable jusqu'au : ${new Date(expires).toLocaleDateString('fr-FR')}`);
  console.log('───────────────────────────────');
  console.log('\n⚠️  N\'oublie pas de mettre à jour LICENSES_DB sur Vercel !');
  console.log('   Commande : node tools/sync-vercel.js\n');

} else {
  console.log(`
Oïko — Générateur de licences

Usage :
  node tools/generate-license.js --email=client@ex.com --plan=standard --expires=2027-01-01
  node tools/generate-license.js --email=client@ex.com --plan=pro
  node tools/generate-license.js --list
  node tools/generate-license.js --revoke=uuid-de-la-clé

Plans : standard | pro | lifetime
  `);
}
