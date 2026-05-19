import React, { useState } from 'react';
import {
  Home, Users, FileText, ClipboardList, Receipt, BarChart2,
  Bell, Settings, BookOpen, ChevronRight, CheckCircle,
  AlertTriangle, Info, Zap, Moon, Sun, LayoutDashboard,
  Star, TrendingUp, Shield, Download, Upload, RefreshCw
} from 'lucide-react';

const SECTIONS = [
  { id: 'intro',       label: 'Introduction',           icon: BookOpen },
  { id: 'interface',   label: 'Interface',               icon: Home },
  { id: 'biens',       label: 'Biens & Locataires',      icon: Users },
  { id: 'dashboard',   label: 'Tableau de bord locataire', icon: LayoutDashboard },
  { id: 'loyers',      label: 'Loyers',                  icon: Receipt },
  { id: 'documents',   label: 'Documents',               icon: FileText },
  { id: 'edl',         label: 'États des lieux',         icon: ClipboardList },
  { id: 'quittances',  label: 'Quittances & Factures',   icon: FileText },
  { id: 'analyses',    label: 'Analyses & Rapports',     icon: BarChart2 },
  { id: 'alertes',     label: 'Alertes',                 icon: Bell },
  { id: 'parametres',  label: 'Paramètres',              icon: Settings },
  { id: 'raccourcis',  label: 'Raccourcis clavier',      icon: Zap },
];

function Badge({ color, children }) {
  const colors = {
    blue:   { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    green:  { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' },
    orange: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
    purple: { bg: '#faf5ff', text: '#7e22ce', border: '#e9d5ff' },
  };
  const c = colors[color] || colors.blue;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99,
      background: c.bg, color: c.text,
      border: `1px solid ${c.border}`,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.3
    }}>
      {children}
    </span>
  );
}

function Tip({ type = 'info', children }) {
  const styles = {
    info:    { bg: '#eff6ff', border: '#3b82f6', icon: <Info size={14} color="#3b82f6" />, label: 'Astuce' },
    warning: { bg: '#fffbeb', border: '#f59e0b', icon: <AlertTriangle size={14} color="#f59e0b" />, label: 'Attention' },
    success: { bg: '#f0fdf4', border: '#22c55e', icon: <CheckCircle size={14} color="#22c55e" />, label: 'Bon à savoir' },
    new:     { bg: '#faf5ff', border: '#8b5cf6', icon: <Star size={14} color="#8b5cf6" />, label: 'Nouveauté' },
  };
  const s = styles[type];
  return (
    <div style={{
      display: 'flex', gap: 10, padding: '10px 14px',
      borderRadius: 8, background: s.bg,
      borderLeft: `3px solid ${s.border}`,
      marginBottom: 12, fontSize: 13
    }}>
      <span style={{ flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
      <div>
        <span style={{ fontWeight: 700, marginRight: 6 }}>{s.label} —</span>
        {children}
      </div>
    </div>
  );
}

function Step({ n, title, children }) {
  return (
    <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 800
      }}>{n}</div>
      <div style={{ flex: 1, paddingTop: 4 }}>
        {title && <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 14 }}>{title}</div>}
        <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{children}</div>
      </div>
    </div>
  );
}

function Kbd({ children }) {
  return (
    <kbd style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 4,
      background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
      fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
      boxShadow: '0 1px 0 var(--border-color)'
    }}>{children}</kbd>
  );
}

function H2({ children }) {
  return (
    <h2 style={{
      fontSize: 20, fontWeight: 800, marginBottom: 6, marginTop: 0,
      color: 'var(--text-primary)'
    }}>{children}</h2>
  );
}
function H3({ children }) {
  return (
    <h3 style={{
      fontSize: 15, fontWeight: 700, marginBottom: 10, marginTop: 20,
      color: 'var(--text-primary)'
    }}>{children}</h3>
  );
}
function P({ children }) {
  return <p style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 12, color: 'var(--text-secondary)' }}>{children}</p>;
}

/* ─── SECTIONS ──────────────────────────────────────────────── */

function SectionIntro() {
  return (
    <div>
      <H2>Bienvenue dans Oïko</H2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        <em>Votre actif, en clair.</em>
      </p>
      <P>
        Oïko est un logiciel de gestion immobilière complet conçu pour simplifier votre quotidien de propriétaire ou de gestionnaire.
        Gérez vos biens, vos locataires, vos loyers, vos documents et vos états des lieux depuis une seule application,
        sans abonnement, sans cloud, avec vos données stockées en local sur votre ordinateur.
      </P>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        {[
          { icon: <Users size={18} color="#3b82f6" />, title: 'Biens & Locataires', desc: 'Gérez votre parc immobilier et le suivi de chaque locataire' },
          { icon: <Receipt size={18} color="#22c55e" />, title: 'Loyers & Paiements', desc: 'Enregistrez les paiements, gérez les impayés et envoyez des relances' },
          { icon: <ClipboardList size={18} color="#f59e0b" />, title: 'États des lieux', desc: 'Rédigez, comparez et archivez vos EDL d\'entrée et de sortie' },
          { icon: <Bell size={18} color="#8b5cf6" />, title: 'Alertes intelligentes', desc: 'Soyez notifié des loyers impayés, docs expirés et baux finissants' },
        ].map((item, i) => (
          <div key={i} style={{
            padding: 14, borderRadius: 10,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            display: 'flex', gap: 12, alignItems: 'flex-start'
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              background: 'var(--bg-tertiary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>{item.icon}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <Tip type="success">
        Vos données sont stockées dans une base SQLite locale. Vous pouvez faire une sauvegarde à tout moment depuis les <strong>Paramètres → Sauvegarde</strong>.
      </Tip>
    </div>
  );
}

function SectionInterface() {
  return (
    <div>
      <H2>Interface de l'application</H2>
      <P>L'interface d'Oïko est divisée en deux zones principales : la barre latérale de navigation et la zone de contenu.</P>

      <H3>Barre latérale</H3>
      <P>La barre latérale à gauche contient :</P>
      <ul style={{ fontSize: 13, lineHeight: 2, paddingLeft: 20, color: 'var(--text-secondary)' }}>
        <li>Le <strong>logo Oïko</strong> avec le slogan <em>Votre actif, en clair.</em></li>
        <li>La <strong>navigation</strong> entre les pages (Tableau de bord, Biens, Loyers, etc.)</li>
        <li>En bas : un bouton <strong>mode sombre/clair</strong> et un bouton <strong>raccourcis clavier</strong></li>
      </ul>

      <H3>Mode sombre / clair</H3>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{
          flex: 1, padding: 14, borderRadius: 10,
          background: '#1e293b', color: 'white',
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 13
        }}>
          <Moon size={16} color="#94a3b8" />
          <span><strong style={{ color: 'white' }}>Mode sombre</strong> — idéal le soir ou dans un environnement peu éclairé</span>
        </div>
        <div style={{
          flex: 1, padding: 14, borderRadius: 10,
          background: '#f8fafc', color: '#1e293b', border: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 13
        }}>
          <Sun size={16} color="#f59e0b" />
          <span><strong>Mode clair</strong> — parfait pour une utilisation en journée</span>
        </div>
      </div>
      <Tip type="info">
        Le bouton de basculement se trouve en bas de la barre latérale. Le thème est mémorisé entre les sessions.
      </Tip>

      <H3>Barre de titre</H3>
      <P>
        La barre de titre en haut à droite affiche le titre de la page, un bouton de rafraîchissement des données,
        les notifications (cloche), et le menu utilisateur (accès aux Paramètres, à ce Guide et à À propos).
      </P>

      <H3>Corbeille & confirmations</H3>
      <P>
        Avant toute suppression, une fenêtre de confirmation vous est présentée.
        Les éléments supprimés sont déplacés dans une corbeille accessible depuis la liste des portefeuilles
        (bouton <strong>Corbeille</strong> en haut à droite). Vous pouvez restaurer ou supprimer définitivement depuis la corbeille.
      </P>
    </div>
  );
}

function SectionBiens() {
  return (
    <div>
      <H2>Biens & Locataires</H2>
      <P>La page <strong>Biens</strong> est le cœur d'Oïko. Elle vous permet de gérer vos biens immobiliers et les locataires qui y résident.</P>

      <H3>Créer un bien</H3>
      <Step n="1" title="Cliquer sur « Nouveau bien »">
        Depuis la page Biens, cliquez sur le bouton <strong>+ Nouveau bien</strong> en haut à droite.
      </Step>
      <Step n="2" title="Remplir les informations">
        Renseignez l'adresse, la surface, le type (appartement, maison…), le loyer de base et les charges.
      </Step>
      <Step n="3" title="Enregistrer">
        Cliquez sur <strong>Créer</strong>. Le bien apparaît dans votre liste.
      </Step>

      <H3>Ajouter un locataire</H3>
      <P>Cliquez sur un bien pour l'ouvrir, puis sur l'onglet <strong>Locataires</strong>. Cliquez sur <strong>+ Nouveau locataire</strong> pour ajouter un locataire au bien.</P>
      <P>Renseignez : nom, prénom, email, téléphone, date d'entrée, date de fin de bail, loyer mensuel et dépôt de garantie.</P>

      <H3>Score de paiement</H3>
      <P>
        Chaque locataire dispose d'un <strong>score de paiement</strong> (de 1 à 5 étoiles) calculé automatiquement
        à partir de l'historique des paiements. Il tient compte de la ponctualité et du nombre d'impayés.
      </P>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          { stars: 5, color: '#22c55e', label: 'Excellent' },
          { stars: 4, color: '#84cc16', label: 'Bon' },
          { stars: 3, color: '#f59e0b', label: 'Moyen' },
          { stars: 2, color: '#f97316', label: 'Mauvais' },
          { stars: 1, color: '#ef4444', label: 'Très mauvais' },
        ].map(s => (
          <div key={s.stars} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 99,
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            fontSize: 12
          }}>
            <span style={{ color: s.color, fontWeight: 700 }}>{'★'.repeat(s.stars)}{'☆'.repeat(5 - s.stars)}</span>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      <H3>Révision IRL</H3>
      <P>
        Pour réviser un loyer selon l'indice IRL, ouvrez la fiche du locataire et cliquez sur <strong>Réviser le loyer (IRL)</strong>.
        Oïko récupère automatiquement le dernier indice disponible et calcule le nouveau loyer.
      </P>
    </div>
  );
}

function SectionDashboard() {
  return (
    <div>
      <H2>Tableau de bord locataire</H2>
      <Badge color="purple">Nouveauté</Badge>
      <br /><br />
      <P>
        Le tableau de bord locataire est un panneau latéral détaillé accessible depuis la liste des locataires d'un bien.
        Cliquez sur l'icône <strong>tableau de bord</strong> à côté d'un locataire pour l'ouvrir.
      </P>

      <H3>Onglet Résumé</H3>
      <P>Vue d'ensemble du bail et des paiements :</P>
      <ul style={{ fontSize: 13, lineHeight: 2, paddingLeft: 20, color: 'var(--text-secondary)' }}>
        <li><strong>Alerte bail</strong> : avertissement si la fin de bail approche (moins de 3 mois)</li>
        <li><strong>Total payé / Impayé / Taux de paiement</strong> : les 3 KPIs clés</li>
        <li><strong>Score de paiement</strong> avec représentation visuelle (points colorés)</li>
        <li><strong>Détails du bail</strong> : dates, loyer, dépôt de garantie</li>
      </ul>

      <H3>Onglet Loyers</H3>
      <P>Tableau complet de l'historique des paiements avec statut (payé, partiel, impayé) et montant.</P>

      <H3>Onglet Documents</H3>
      <P>Documents liés au locataire, regroupés par catégorie (bail, identité, assurance…). Téléchargement en un clic.</P>

      <H3>Onglet États des lieux</H3>
      <P>Aperçu de l'EDL d'entrée et de sortie en deux colonnes, avec l'état de chaque pièce côte à côte.</P>

      <Tip type="info">
        Le panneau s'ouvre en superposition sur la droite de l'écran. Cliquez en dehors ou sur la croix pour le fermer.
      </Tip>
    </div>
  );
}

function SectionLoyers() {
  return (
    <div>
      <H2>Loyers</H2>
      <P>La page <strong>Loyers</strong> centralise tous les paiements de vos locataires. Vous pouvez enregistrer les paiements, suivre les impayés et gérer les relances.</P>

      <H3>Enregistrer un paiement</H3>
      <Step n="1">Cliquez sur <strong>+ Nouveau paiement</strong>.</Step>
      <Step n="2">Sélectionnez le locataire, la période concernée (mois/année) et le montant.</Step>
      <Step n="3">Choisissez le statut : <strong>Payé</strong>, <strong>Partiel</strong> ou <strong>Impayé</strong>.</Step>
      <Step n="4">Ajoutez un commentaire si nécessaire, puis enregistrez.</Step>

      <H3>Statuts de paiement</H3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Payé', color: '#22c55e', bg: '#f0fdf4', desc: 'Paiement complet reçu' },
          { label: 'Partiel', color: '#f59e0b', bg: '#fffbeb', desc: 'Paiement incomplet' },
          { label: 'Impayé', color: '#ef4444', bg: '#fef2f2', desc: 'Aucun paiement reçu' },
        ].map(s => (
          <div key={s.label} style={{
            padding: 12, borderRadius: 8,
            background: s.bg, border: `1px solid ${s.color}30`,
            fontSize: 12, textAlign: 'center'
          }}>
            <div style={{ fontWeight: 800, color: s.color, fontSize: 13, marginBottom: 4 }}>{s.label}</div>
            <div style={{ color: '#64748b' }}>{s.desc}</div>
          </div>
        ))}
      </div>

      <H3>Relance automatique</H3>
      <P>
        Activez la relance automatique dans <strong>Paramètres → Relance automatique</strong>.
        Configurez le délai (ex. 5 jours après la date d'échéance), l'objet et le corps du mail.
        Les relances sont envoyées automatiquement aux locataires ayant un loyer impayé.
      </P>
      <Tip type="warning">
        Pour que les relances fonctionnent, vous devez configurer votre compte email dans les Paramètres (serveur SMTP ou Gmail).
      </Tip>
    </div>
  );
}

function SectionDocuments() {
  return (
    <div>
      <H2>Documents</H2>
      <P>La page <strong>Documents</strong> vous permet de stocker et d'organiser tous vos fichiers liés à la gestion immobilière.</P>

      <H3>Ajouter un document</H3>
      <Step n="1">Cliquez sur <strong>+ Ajouter un document</strong>.</Step>
      <Step n="2">Sélectionnez le fichier depuis votre ordinateur (PDF, image…).</Step>
      <Step n="3">Choisissez la catégorie, associez-le à un bien et/ou un locataire.</Step>
      <Step n="4">Ajoutez une date d'expiration si le document est limité dans le temps (assurance, diagnostic…).</Step>

      <H3>Catégories de documents</H3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {['Bail', 'Avenant', 'État des lieux', 'Quittance', 'Assurance', 'Diagnostic', 'Identité', 'Autre'].map(cat => (
          <div key={cat} style={{
            padding: '8px 12px', borderRadius: 6,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            fontSize: 12, display: 'flex', alignItems: 'center', gap: 8
          }}>
            <FileText size={12} color="#64748b" /> {cat}
          </div>
        ))}
      </div>

      <Tip type="info">
        Les documents avec une date d'expiration proche déclenchent une alerte dans le centre de notifications
        si l'alerte documents est activée dans les Paramètres.
      </Tip>
    </div>
  );
}

function SectionEDL() {
  return (
    <div>
      <H2>États des lieux</H2>
      <P>
        La page <strong>États des lieux</strong> vous permet de créer, gérer et comparer vos EDL d'entrée et de sortie.
        Accessible également depuis l'onglet EDL dans une Quittance/Facture.
      </P>

      <H3>Créer un état des lieux</H3>
      <Step n="1" title="Choisir le type">
        Cliquez sur <strong>+ Entrée</strong> ou <strong>+ Sortie</strong> selon le cas.
        Vous pouvez aussi cliquer sur le bouton <strong>+ Nouvel EDL</strong> et choisir le type dans le formulaire.
      </Step>
      <Step n="2" title="Remplir les informations générales">
        Sélectionnez le locataire, le bien, et la date. Ajoutez un commentaire général si besoin.
      </Step>
      <Step n="3" title="Ajouter des pièces">
        Pour chaque pièce (salon, chambre, cuisine…), indiquez son état : <strong>Neuf</strong>, <strong>Bon</strong>, <strong>Moyen</strong> ou <strong>Mauvais</strong>.
        Ajoutez des photos et des commentaires détaillés.
      </Step>
      <Step n="4" title="Enregistrer">
        Cliquez sur <strong>Enregistrer</strong>. L'EDL est sauvegardé et apparaît dans la liste.
      </Step>

      <H3>Comparer EDL entrée / sortie</H3>
      <Badge color="purple">Nouveauté</Badge>
      <br /><br />
      <P>
        Quand un locataire a à la fois un EDL d'entrée et de sortie, un bouton <strong>≠ Comparer</strong> apparaît sur la carte.
        Il ouvre une vue côte à côte des deux EDL avec mise en évidence des dégradations (fond rouge) pour chaque pièce dont l'état a empiré.
      </P>
      <Tip type="success">
        La comparaison vous permet d'identifier rapidement les dégradations constatées entre l'entrée et la sortie du locataire, utile pour la restitution du dépôt de garantie.
      </Tip>
    </div>
  );
}

function SectionQuittances() {
  return (
    <div>
      <H2>Quittances & Factures</H2>
      <P>
        Depuis la page <strong>Quittances / Factures</strong>, vous pouvez générer des quittances de loyer et des factures pour vos locataires,
        ainsi qu'accéder aux états des lieux associés.
      </P>

      <H3>Générer une quittance</H3>
      <Step n="1">Sélectionnez le locataire et la période (mois/année).</Step>
      <Step n="2">Vérifiez les informations pré-remplies (loyer, charges, coordonnées).</Step>
      <Step n="3">Cliquez sur <strong>Générer la quittance</strong> pour créer le PDF.</Step>
      <Step n="4">Téléchargez ou envoyez par email directement depuis l'interface.</Step>

      <H3>Onglets disponibles</H3>
      <ul style={{ fontSize: 13, lineHeight: 2, paddingLeft: 20, color: 'var(--text-secondary)' }}>
        <li><strong>Quittances</strong> : historique et génération des quittances de loyer</li>
        <li><strong>Factures</strong> : factures pour travaux ou prestations</li>
        <li><strong>États des lieux</strong> : accès rapide aux EDL du locataire sélectionné</li>
      </ul>
    </div>
  );
}

function SectionAnalyses() {
  return (
    <div>
      <H2>Analyses & Rapports</H2>
      <P>
        La page <strong>Analyses</strong> vous offre une vue synthétique de vos performances locatives
        et vous permet d'exporter des bilans complets.
      </P>

      <H3>Tableau de bord général</H3>
      <P>En haut de la page Analyses, retrouvez :</P>
      <ul style={{ fontSize: 13, lineHeight: 2, paddingLeft: 20, color: 'var(--text-secondary)' }}>
        <li>Le <strong>taux d'occupation</strong> de votre parc</li>
        <li>Les <strong>revenus mensuels</strong> (payés vs attendus)</li>
        <li>Le montant total des <strong>impayés</strong></li>
        <li>La <strong>répartition par bien</strong> des loyers</li>
      </ul>

      <H3>Bilan annuel PDF</H3>
      <P>
        Cliquez sur <strong>Exporter le bilan annuel</strong> pour générer un PDF récapitulatif de l'année :
        revenus perçus, charges, récapitulatif par bien et par locataire, évolution mensuelle.
      </P>
      <Tip type="success">
        Ce bilan est particulièrement utile pour votre déclaration fiscale (revenus fonciers).
      </Tip>

      <H3>Graphiques</H3>
      <P>
        Des graphiques dynamiques affichent l'évolution des revenus mois par mois,
        la répartition par statut de paiement et les comparaisons annuelles.
      </P>
    </div>
  );
}

function SectionAlertes() {
  return (
    <div>
      <H2>Alertes & Notifications</H2>
      <Badge color="purple">Nouveauté</Badge>
      <br /><br />
      <P>
        Oïko surveille automatiquement trois situations critiques et vous envoie des notifications
        dans le centre de notifications (icône cloche en haut à droite).
      </P>

      <H3>Types d'alertes</H3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {[
          {
            color: '#ef4444', bg: '#fef2f2',
            icon: <Receipt size={16} color="#ef4444" />,
            title: 'Loyers impayés',
            desc: 'Notification si un loyer reste impayé après N jours. Configurable dans Paramètres → Alertes.',
          },
          {
            color: '#f59e0b', bg: '#fffbeb',
            icon: <FileText size={16} color="#f59e0b" />,
            title: 'Documents expirant',
            desc: 'Alerte si un document (assurance, diagnostic…) expire dans les N prochains jours.',
          },
          {
            color: '#8b5cf6', bg: '#faf5ff',
            icon: <ClipboardList size={16} color="#8b5cf6" />,
            title: 'Fin de bail approchante',
            desc: 'Avertissement si un bail se termine dans les N prochains jours.',
          },
        ].map((a, i) => (
          <div key={i} style={{
            display: 'flex', gap: 12, padding: 14,
            background: a.bg, borderRadius: 10,
            border: `1px solid ${a.color}30`
          }}>
            <div style={{ flexShrink: 0, marginTop: 2 }}>{a.icon}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{a.title}</div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>{a.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <H3>Configurer les alertes</H3>
      <Step n="1">Allez dans <strong>Paramètres → Alertes</strong>.</Step>
      <Step n="2">Activez ou désactivez chaque type d'alerte avec le bouton bascule.</Step>
      <Step n="3">Définissez le délai en jours (ex. : alerte loyer 5 jours, alerte bail 60 jours).</Step>
      <Step n="4">Cliquez sur <strong>Vérifier maintenant</strong> pour lancer une vérification immédiate.</Step>

      <Tip type="info">
        Les alertes sont vérifiées automatiquement à chaque démarrage de l'application.
        Les doublons sont évités : une alerte déjà émise ne sera pas répétée le même jour.
      </Tip>
    </div>
  );
}

function SectionParametres() {
  return (
    <div>
      <H2>Paramètres</H2>
      <P>Accédez aux Paramètres via le menu utilisateur (en haut à droite) ou depuis la barre latérale.</P>

      <H3>Profil</H3>
      <P>Renseignez votre nom, email et informations qui apparaîtront sur les quittances et factures générées.</P>

      <H3>Sauvegarde</H3>
      <P>
        Configurez une sauvegarde automatique de votre base de données. Définissez la fréquence (quotidienne, hebdomadaire)
        et le dossier de destination. Vous pouvez aussi déclencher une sauvegarde manuelle à tout moment.
      </P>
      <Tip type="warning">
        Pensez à sauvegarder régulièrement, surtout avant une mise à jour ou une réinstallation.
      </Tip>

      <H3>Relance automatique</H3>
      <P>
        Configurez l'envoi automatique de mails de relance pour les loyers impayés.
        Renseignez votre serveur SMTP (ou activez l'intégration Gmail) et personnalisez le modèle du mail.
      </P>

      <H3>Alertes</H3>
      <P>Voir la section <strong>Alertes & Notifications</strong> ci-dessus pour la configuration détaillée.</P>

      <H3>Intelligence Artificielle</H3>
      <P>
        Oïko intègre une assistance IA (Google Gemini) pour analyser des documents PDF (contrats, diagnostics…).
        Entrez votre clé API Google Gemini pour activer cette fonctionnalité.
      </P>

      <H3>Import / Export</H3>
      <P>Exportez vos données en JSON pour les archiver ou les transférer vers un autre ordinateur.
      Importez une sauvegarde JSON pour restaurer vos données.</P>

      <H3>Mise à jour</H3>
      <P>
        Oïko vérifie automatiquement les mises à jour au démarrage.
        Si une nouvelle version est disponible, vous en serez informé avec la possibilité de télécharger et installer la mise à jour.
      </P>
    </div>
  );
}

function SectionRaccourcis() {
  const shortcuts = [
    { keys: ['Ctrl', 'N'], action: 'Nouveau (bien, locataire, paiement selon la page)' },
    { keys: ['Ctrl', 'S'], action: 'Sauvegarder (dans les formulaires)' },
    { keys: ['Échap'], action: 'Fermer la fenêtre / le modal' },
    { keys: ['←', '→'], action: 'Naviguer entre les pages du guide' },
    { keys: ['?'], action: 'Afficher la liste des raccourcis' },
    { keys: ['Ctrl', 'Z'], action: 'Annuler (dans les champs de texte)' },
  ];

  return (
    <div>
      <H2>Raccourcis clavier</H2>
      <P>Oïko propose plusieurs raccourcis clavier pour accélérer votre utilisation quotidienne.</P>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {shortcuts.map((s, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderRadius: 8,
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)'
          }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {s.keys.map((k, j) => (
                <React.Fragment key={j}>
                  {j > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+</span>}
                  <Kbd>{k}</Kbd>
                </React.Fragment>
              ))}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.action}</div>
          </div>
        ))}
      </div>

      <br />
      <Tip type="info">
        Appuyez sur <Kbd>?</Kbd> n'importe où dans l'application pour afficher la liste complète des raccourcis disponibles sur la page en cours.
      </Tip>
    </div>
  );
}

const SECTION_CONTENT = {
  intro:      <SectionIntro />,
  interface:  <SectionInterface />,
  biens:      <SectionBiens />,
  dashboard:  <SectionDashboard />,
  loyers:     <SectionLoyers />,
  documents:  <SectionDocuments />,
  edl:        <SectionEDL />,
  quittances: <SectionQuittances />,
  analyses:   <SectionAnalyses />,
  alertes:    <SectionAlertes />,
  parametres: <SectionParametres />,
  raccourcis: <SectionRaccourcis />,
};

export default function GuideContent() {
  const [activeSection, setActiveSection] = useState('intro');

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, overflow: 'hidden', flex: 1 }}>
      {/* Sidebar nav */}
      <div style={{
        width: 200,
        flexShrink: 0,
        borderRight: '1px solid var(--border-color)',
        overflowY: 'auto',
        padding: '12px 8px',
        background: 'var(--bg-secondary)'
      }}>
        {SECTIONS.map(sec => {
          const Icon = sec.icon;
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 7,
                border: 'none', cursor: 'pointer', textAlign: 'left',
                fontSize: 12, fontWeight: isActive ? 700 : 500,
                background: isActive ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'transparent',
                color: isActive ? 'white' : 'var(--text-secondary)',
                marginBottom: 2, transition: 'all 0.15s'
              }}
            >
              <Icon size={13} style={{ flexShrink: 0 }} />
              <span style={{ lineHeight: 1.3 }}>{sec.label}</span>
              {isActive && <ChevronRight size={11} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '28px 32px',
        background: 'var(--bg-primary)'
      }}>
        {SECTION_CONTENT[activeSection]}
      </div>
    </div>
  );
}
