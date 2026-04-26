# 🏢 GestImmo

**Logiciel de comptabilité immobilière assistée par IA, 100% local et sécurisé.**

GestImmo est une application desktop Windows (Electron + React) destinée aux bailleurs particuliers et professionnels. Elle permet de gérer ses biens, ses locataires, ses loyers et ses factures, avec import automatique via IA et envoi direct au comptable par email.

---

## ✨ Fonctionnalités principales

### Gestion patrimoniale
- 🏢 **Biens immobiliers** : adresse, surface, loyer, caution, code d'identification chiffré AES-256
- 👥 **Locataires** : informations complètes, association à un bien, suivi caution et APL
- 💰 **Loyers mensuels** : génération automatique, suivi des statuts (payé / en attente / en retard / partiel)
- 🔍 **Recherche multi-champs** insensible aux accents

### Comptabilité automatisée
- 📄 **Import de factures** par PDF ou image, **analyse automatique par IA Gemini**
- 📊 **Création de fichiers Excel** mensuels avec édition inline
- 📈 **Récapitulatif annuel** agrégeant loyers payés et transactions des fichiers mensuels
- 📉 **Graphiques d'évolution** mensuelle ou annuelle (Recharts)

### Envoi au comptable
- 📧 **SMTP intégré** avec presets pour Gmail, Outlook, Orange, OVH, Infomaniak, etc.
- 📎 **Pièces jointes automatiques** (Excel + factures sources)
- ✅ **Test de connexion** SMTP avant envoi

### Assistant IA
- 🤖 **Chat conversationnel** alimenté par Google Gemini
- 📚 **Historique** style ChatGPT avec sidebar groupée par date
- 🎯 Réponses ciblées comptabilité, fiscalité, gestion locative

### Sécurité et sauvegarde
- 🔐 **Chiffrement AES-256** des codes d'identification
- 🛡️ **Zone d'administration 2FA** par email avec code de vérification
- 💾 **Sauvegardes automatiques** quotidiennes (ZIP horodaté)
- ↩️ **Restauration** depuis liste ou fichier ZIP

### Intégration Windows
- 🪟 **Tray icon** (zone de notification Windows)
- 🔔 **Notifications système** natives pour les alertes (loyers en retard, etc.)
- ⏰ **Vérifications automatiques** toutes les heures en arrière-plan
- 🎨 **Title bar custom** avec boutons Windows intégrés

### UX
- 👋 **Wizard de configuration** au premier lancement (7 étapes)
- 📖 **Guide d'utilisation PDF** intégré (lecteur PDF embarqué)
- 🌞 **Thèmes light / dark**
- 💬 **Confirm dialogs personnalisés**

---

## 🛠️ Technologies

| Composant | Choix |
|---|---|
| **Framework desktop** | Electron 33 |
| **Frontend** | React 18 |
| **Base de données** | SQLite (better-sqlite3 v12.8.0) |
| **Runtime Node** | Node.js 24 |
| **IA** | Google Gemini API (`gemini-flash-latest` + fallback `gemini-2.5-flash`) |
| **Excel** | ExcelJS |
| **PDF** | react-pdf, pdf.js (worker local) |
| **Email** | Nodemailer (SMTP) |
| **Compression** | archiver / extract-zip |
| **Sécurité** | AES-256-CBC, bcryptjs |
| **Icônes** | Lucide React |
| **Graphiques** | Recharts |

---

## 📦 Installation pour le développement

### Prérequis

- **Node.js** 18+ (recommandé : 20 ou 24)
- **npm** 9+
- **Windows 10/11** (l'app fonctionne aussi sur macOS/Linux mais le tray et les notifs sont optimisés Windows)

### Installation

```bash
# Cloner le repo
git clone <url-du-repo>
cd gestimmo

# Installer les dépendances
npm install

# Lancer en mode développement (React + Electron)
npm start
```

L'app se lance avec :
- **React** sur `http://localhost:3000` (hot reload)
- **Electron** en fenêtre desktop

### Hot reload

| Fichier modifié | Comportement |
|---|---|
| `src/**/*` (React) | ✅ Hot reload automatique |
| `electron/main.js` | ❌ Nécessite Ctrl+C + `npm start` |
| `electron/preload.js` | ❌ Nécessite Ctrl+C + `npm start` |

---

## 📁 Structure du projet

```
gestimmo/
├── electron/
│   ├── main.js          # Process principal Electron (DB, IPC, IA, SMTP, tray, notifs)
│   └── preload.js       # Bridge sécurisé entre React et Electron
├── public/
│   ├── index.html       # Template React avec CSP
│   ├── guide_utilisation.pdf   # Guide PDF intégré
│   ├── pdf.worker.min.mjs      # Worker PDF.js local
│   └── tray-icon.png    # Icône système Windows
├── src/
│   ├── App.js           # Routing + providers globaux
│   ├── context/
│   │   └── AppContext.js   # State global (theme, paramètres, notifications)
│   ├── components/
│   │   ├── Sidebar.js
│   │   ├── PageHeader.js
│   │   ├── Modal.js
│   │   ├── ConfirmDialog.js
│   │   ├── TitleBar.js
│   │   ├── WelcomeModal.js   # Wizard de configuration premier lancement
│   │   └── Gauge.js
│   ├── pages/
│   │   ├── Dashboard.js
│   │   ├── Facture.js
│   │   ├── Loyer.js
│   │   ├── Recapitulatif.js
│   │   ├── Biens.js
│   │   ├── AssistantIA.js
│   │   ├── Notifications.js
│   │   ├── Parametres.js
│   │   └── AdminZone.js
│   └── styles/
│       └── global.css
├── build-resources/     # Ressources de packaging (icon.ico, LICENSE.txt)
├── dist/                # Sortie d'electron-builder (.exe générés)
└── package.json
```

---

## 💾 Stockage des données

Toutes les données sont stockées **localement** sur la machine de l'utilisateur, dans :

```
%APPDATA%\gestimmo\
├── gestimmo (.db)         # Base SQLite principale
├── gestimmo.db-wal        # Journal SQLite
├── gestimmo.db-shm        # Mémoire partagée SQLite
└── excel_files/           # Fichiers Excel mensuels et annuels
```

### Tables SQLite

- `biens` — Biens immobiliers
- `locataires` — Locataires (avec foreign key vers biens)
- `loyers` — Suivi mensuel des paiements
- `factures_excel` — Fichiers Excel générés (avec contenu JSON)
- `notifications` — Notifications in-app
- `parametres` — Paramètres clé-valeur (theme, smtp, gemini, etc.)
- `messages_ia` — Messages de chaque conversation IA
- `ia_conversations` — Métadonnées des conversations (titre, date)
- `admin_otp` — Codes 2FA pour la zone admin

---

## 🚀 Packaging en `.exe`

### Build de production

```bash
# Build React + génération du .exe Windows
npm run build-win
```

Le fichier d'installation est généré dans `dist/GestImmo Setup 1.0.0.exe`.

### Configuration

La configuration de packaging se trouve dans `package.json` sous la clé `build` :
- **Cible** : NSIS (installateur Windows classique)
- **Architecture** : x64
- **asarUnpack** : `better-sqlite3` (module natif)
- **extraResources** : guide PDF, worker PDF, icône tray

### Variables à personnaliser

Dans `package.json` :

```json
{
  "version": "1.0.0",
  "author": "Votre nom",
  "build": {
    "appId": "com.gestimmo.app",
    "productName": "GestImmo",
    "copyright": "Copyright © 2026"
  }
}
```

---

## ⚙️ Configuration

### Premier lancement

Au tout premier démarrage, un **wizard de configuration en 7 étapes** s'affiche :

1. Bienvenue
2. Profil utilisateur (nom + email)
3. Configuration SMTP (presets Gmail/Outlook/Orange/etc.)
4. Clé API Gemini
5. Dossier de sauvegarde
6. Email de récupération admin (2FA)
7. Récapitulatif

Toutes les étapes sont skippables et modifiables plus tard dans **Paramètres**.

### Réinitialiser le wizard

Pour relancer le wizard (utile en debug) :

```javascript
// Dans la console DevTools de l'app (F12) :
await window.api.parametres.set('first_launch_done', 'false')
// puis Ctrl+R
```

### Réinitialiser toute la base

**Fermer l'app complètement** (clic-droit sur l'icône tray → Quitter), puis supprimer le dossier `%APPDATA%\gestimmo\` (ou seulement les fichiers `gestimmo*` si on veut garder les Excel).

---

## 🔐 Sécurité

- **Aucune donnée n'est envoyée sur internet**, sauf :
  - Les requêtes à l'API Google Gemini (uniquement si activée)
  - Les emails sortants via votre serveur SMTP
- **Chiffrement AES-256-CBC** des codes d'identification immeuble
- **2FA par email** pour la zone d'administration (codes 6 chiffres, 5 min, 1 usage, verrouillage après 3 échecs)
- **Sauvegardes automatiques** avant toute suppression destructive
- **Mot de passe SMTP masqué** par défaut dans l'interface

---

## 🧪 Scripts npm

| Commande | Action |
|---|---|
| `npm start` | Lance l'app en mode développement (React + Electron) |
| `npm run react-start` | Lance uniquement React (port 3000) |
| `npm run react-build` | Build React pour production |
| `npm run build` | Build React + electron-builder (toutes plateformes) |
| `npm run build-win` | Build React + electron-builder pour Windows uniquement |
| `npm run pack` | Build sans installateur (dossier portable) |

---

## 🐛 Debugging

### Console DevTools

Ouvrir avec `Ctrl+Shift+I` dans l'app.

### Logs

Les logs Electron s'affichent dans le terminal où `npm start` a été lancé.

### Reconstruire les modules natifs

Si `better-sqlite3` pose problème après une mise à jour de Node ou Electron :

```bash
npx electron-rebuild
```

---

## 📚 Documentation utilisateur

Le **guide d'utilisation complet** (PDF de 18+ pages) est embarqué dans l'application :
- Accessible depuis l'avatar utilisateur en haut à droite → **Guide d'utilisation**
- Lecteur PDF intégré avec scroll vertical, zoom et navigation clavier
- Téléchargeable localement

Le PDF source se trouve dans `public/guide_utilisation.pdf`.

---

## 🗺️ Roadmap

### v1.0 (actuelle)
- ✅ Toutes les fonctionnalités listées ci-dessus
- ✅ Packaging Windows `.exe`

### v1.1 (envisagé)
- 🔄 Mises à jour automatiques (electron-updater)
- 📅 Calendrier des échéances
- 🖨️ Génération de quittances de loyer (PDF)
- 📈 Export fiscal pré-rempli (formulaire 2044)

### v2.0 (envisagé)
- ⚙️ Démarrage automatique avec Windows
- 👥 Gestion des garants
- 🌍 Internationalisation (anglais)
- ☁️ Synchronisation cloud optionnelle

---

## 📄 Licence

Copyright © 2026 — Tous droits réservés.

---

## 👤 Auteur

Développé par **Marwane** avec l'assistance de **Claude (Anthropic)**.

---

## 🆘 Support

Pour tout problème ou suggestion :
- Consulter le **guide d'utilisation** intégré (avatar → Guide)
- Utiliser l'**Assistant IA** intégré pour les questions sur le logiciel
- Vérifier les **paramètres** de l'application

Bon usage de GestImmo ! 🏠