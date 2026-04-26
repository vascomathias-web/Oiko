# 🚀 Démarrage rapide - GestImmo

## En 3 étapes pour lancer l'application

### 1️⃣ Installer Node.js

Télécharger **Node.js** : https://nodejs.org/

Node.js 20, 22 ou 24 LTS fonctionnent parfaitement.

Vérifier l'installation :
```
node --version
npm --version
```

### 2️⃣ Installer les dépendances

Ouvrir un terminal dans le dossier `gestimmo/` et lancer :

```
npm install
```

⏱️ Cela prend 1 à 3 minutes selon votre connexion.

### 3️⃣ Lancer le logiciel

```
npm start
```

L'application s'ouvre dans une fenêtre desktop. ✨

---

## 🔑 Configuration initiale

### Obtenir une clé API Gemini (gratuit)

1. Aller sur https://aistudio.google.com/apikey
2. Se connecter avec un compte Google
3. Cliquer sur **"Create API Key"**
4. Copier la clé (format : `AIzaSy...`)

### Configurer GestImmo

1. Ouvrir l'app → aller sur **Paramètres**
2. Coller la clé Gemini dans le champ "Clé API Google Gemini"
3. Renseigner l'email du comptable
4. Cliquer sur **Enregistrer**

---

## 💡 Utilisation

### Créer un bien immobilier
**Biens & Locataires** → **+ Ajouter Bien**
- Adresse, loyer, surface, caution
- Numéro d'identification unique (sera chiffré)

### Créer un locataire
**Biens & Locataires** → **+ Ajouter Locataire**
- Assigner un bien, cocher parking/caution si applicable
- Renseigner aide APL si nécessaire

### Importer une facture
**Facture** → cliquer sur la zone d'import
- Sélectionner PDF ou images (PNG/JPG)
- Cliquer sur **"Analyser avec IA Gemini"**
- Le fichier Excel est généré automatiquement

### Éditer un fichier Excel
**Facture** → bouton **"Modifier"** sur un fichier
- Édition inline des cellules
- Le solde se recalcule automatiquement
- Cliquer sur **Enregistrer**

### Envoyer au comptable
**Facture** → cocher les fichiers → **"Envoyer au comptable"**
- Ouvre votre client mail avec les fichiers listés
- L'email du comptable est pré-rempli

### Générer les loyers du mois
**Loyer** → **"Générer loyers du mois"**
- Crée automatiquement les loyers pour tous les locataires actifs
- Modifier le statut (payé, en attente, retard...) dans le tableau

---

## 📦 Créer un installeur .exe pour Windows

```
npm run build-win
```

Le fichier `GestImmo Setup 1.0.0.exe` est créé dans le dossier `dist/`.
Double-cliquer dessus pour installer GestImmo comme un vrai logiciel Windows.

---

## ❓ Résolution de problèmes

### "npm n'est pas reconnu"
→ Réinstaller Node.js et redémarrer le terminal

### ❌ "Could not find any Visual Studio installation to use" / "better-sqlite3" échoue

**Cause** : `better-sqlite3` v11 ne supporte pas Node.js 24. Sans binaire précompilé disponible, il tente une compilation depuis les sources C++, ce qui nécessite Visual Studio Build Tools.

**Solution** : La v12 de `better-sqlite3` (utilisée dans ce projet) supporte nativement Node 24.

Si vous rencontrez l'erreur :

1. Supprimez le dossier `node_modules` et le fichier `package-lock.json`
2. Vérifiez que votre `package.json` indique `"better-sqlite3": "^12.8.0"` ou plus récent
3. Relancez `npm install`

Cette version a des binaires précompilés pour Node 20/22/23/24/25.

### "Erreur clé API Gemini"
→ Vérifier que la clé est bien collée dans Paramètres
→ Vérifier que la clé est active sur aistudio.google.com

### L'application s'ouvre sans contenu
→ Attendre 5-10s (React compile au premier lancement)
→ Si le problème persiste, relancer `npm start`

---

## 📂 Où sont mes données ?

La base de données est stockée dans :
- **Windows** : `C:\Users\VotreNom\AppData\Roaming\gestimmo\gestimmo.db`
- **macOS** : `~/Library/Application Support/gestimmo/gestimmo.db`
- **Linux** : `~/.config/gestimmo/gestimmo.db`

⚠️ Les numéros d'identification des biens sont chiffrés AES-256.
Pensez à sauvegarder régulièrement ce fichier.