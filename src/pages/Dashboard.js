import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import Gauge from '../components/Gauge';
import {
  TrendingUp, TrendingDown, AlertTriangle, Users, Wallet,
  Receipt, Home, PieChart, CircleDollarSign, Clock, AlertCircle
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function Dashboard() {
  const { notifications } = useApp();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    const data = await window.api.dashboard.stats();
    setStats(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const alertNotifs = notifications.filter(n => (n.type === 'warning' || n.type === 'danger') && !n.lu).slice(0, 5);
  const alertMessages = alertNotifs.map(n => n.titre);
  const hasAlerts = alertMessages.length > 0;

  if (loading || !stats) {
    return (
      <>
        <PageHeader title="Tableau de Bord" onRefresh={loadStats} />
        <div className="page-container">
          <div className="empty-state"><div className="spinner spinner-lg" /></div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Tableau de Bord" subtitle="Vue d'ensemble de votre activité" onRefresh={loadStats} />
      <div className="page-container">
        {/* Message de bienvenue */}
        <div style={{ marginBottom: hasAlerts ? 16 : 24 }}>
          <div style={{
            fontSize: 15,
            color: 'var(--text-secondary)',
            fontWeight: 500
          }}>
            Bienvenue sur GestImmo — voici un aperçu de votre activité en temps réel
          </div>
        </div>

        {/* Barre d'alerte avec slide auto (uniquement s'il y a des alertes) */}
        {hasAlerts && <AlertBanner messages={alertMessages} />}

        {/* Grille de 4 cards principales */}
        <div className="grid grid-4 mb-6">
          <StatCard
            icon={TrendingUp}
            label="Revenus du mois"
            value={`${(stats?.revenusMois || 0).toFixed(2)} €`}
            variation={stats?.variationRevenus}
            color="#3b82f6"
          />
          <StatCard
            icon={TrendingDown}
            label="Dépenses du mois"
            value={`${(stats?.depensesMois || 0).toFixed(2)} €`}
            variation={stats?.variationDepenses}
            color="#f59e0b"
          />
          <StatCard
            icon={Users}
            label="Locataires en retard"
            value={stats?.locatairesRetard || 0}
            color="#ef4444"
          />
          <StatCard
            icon={Home}
            label="Taux d'occupation"
            value={`${stats?.tauxOccupation || 0} %`}
            color="#10b981"
          />
        </div>

        {/* Ligne de cards colorées */}
        <div className="grid grid-4 mb-6">
          <GradientCard
            color="blue"
            label="Solde Bancaire"
            value={`${formatMoney(stats.soldeBancaire)} €`}
            icon={<Wallet size={40} />}
          />
          <GradientCard
            color="teal"
            label="Loyers en Attente"
            value={`${formatMoney(stats.loyersAttente)} €`}
            icon={<Clock size={40} />}
          />
          <GradientCard
            color="orange"
            label="Charges à Venir"
            value={`${formatMoney(stats.chargesAVenir)} €`}
            icon={<Receipt size={40} />}
          />
          <GradientCard
            color="red"
            label="Retards de Paiement"
            value={stats.retardsPaiement}
            icon={<AlertCircle size={40} />}
          />
        </div>

        {/* Cards jauges */}
        <div className="grid grid-3 mb-6">
          <div className="gauge-card">
            <div className="gauge-label">Loyer Attendu</div>
            <Gauge
              value={stats.loyerAttendu}
              max={Math.max(stats.loyerAttendu * 1.2, 1000)}
              color="blue"
              displayValue={`${formatMoney(stats.loyerAttendu)} €`}
            />
            <GaugeTrend variation={stats.variationRevenus} />
          </div>
          <div className="gauge-card">
            <div className="gauge-label">Total Encaissé</div>
            <Gauge
              value={stats.totalEncaisse}
              max={Math.max(stats.loyerAttendu, 1000)}
              color="green"
              displayValue={`${formatMoney(stats.totalEncaisse)} €`}
            />
            <GaugeTrend variation={stats.variationEncaisse} />
          </div>
          <div className="gauge-card">
            <div className="gauge-label">Aides APL / AL</div>
            <Gauge
              value={stats.aidesApl}
              max={Math.max(stats.aidesApl * 2, 1000)}
              color="orange"
              displayValue={`${formatMoney(stats.aidesApl)} €`}
            />
            <GaugeTrend variation={stats.variationApl} />
          </div>
        </div>

        {/* Infos supplémentaires */}
        <div className="grid grid-2">
          <QuickInfoCard
            title="Prochaines échéances"
            icon={<Clock size={18} />}
            items={[
              { label: 'Loyers à encaisser ce mois', value: `${formatMoney(stats.loyersAttente)} €` },
              { label: 'Charges prévues', value: `${formatMoney(stats.chargesAVenir)} €` },
              { label: 'Taux d\'occupation', value: `${stats.tauxOccupation} %` }
            ]}
          />
          <QuickInfoCard
            title="Résumé Financier"
            icon={<PieChart size={18} />}
            items={[
              { label: 'Revenus encaissés', value: `${formatMoney(stats.totalEncaisse)} €`, color: '#10b981' },
              { label: 'Dépenses du mois', value: `${formatMoney(stats.depensesMois)} €`, color: '#f59e0b' },
              { label: 'Solde net', value: `${formatMoney(stats.soldeBancaire)} €`, color: '#3b82f6' }
            ]}
          />
        </div>
      </div>
    </>
  );
}

function AlertBanner({ messages }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (messages.length <= 1) return;
    const interval = setInterval(() => {
      setIdx(i => (i + 1) % messages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [messages]);

  return (
    <div className="alert-banner">
      <AlertTriangle className="alert-banner-icon" size={18} />
      <div className="alert-banner-content" key={idx} style={{ animation: 'slideIn 0.5s ease' }}>
        {messages[idx]}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, variation, color }) {
  // variation peut être : null (pas de référence), 0, positif ou négatif
  const hasVariation = variation !== null && variation !== undefined;
  const isPositive = variation > 0;
  const isNegative = variation < 0;
  const isZero = variation === 0;

  return (
    <div className="card stat-card" style={{ borderTop: `3px solid ${color}` }}>
      <div className="stat-card-header">
        <div className="stat-card-label">{label}</div>
        <div className="stat-card-icon" style={{ background: `${color}20`, color }}>
          <Icon size={18} />
        </div>
      </div>
      <div className="stat-card-value">{value}</div>
      {hasVariation && (
        <div className={`stat-card-change ${isPositive ? 'positive' : isNegative ? 'negative' : 'neutral'}`}>
          {isPositive && <><TrendingUp size={12} /> +{variation}%</>}
          {isNegative && <><TrendingDown size={12} /> {variation}%</>}
          {isZero && <>— stable</>}
        </div>
      )}
    </div>
  );
}

function GradientCard({ color, label, value, icon }) {
  return (
    <div className={`gradient-card ${color}`}>
      <div className="gradient-card-icon">{icon}</div>
      <div className="gradient-card-label">{label}</div>
      <div className="gradient-card-value">{value}</div>
    </div>
  );
}

function TauxOccupationCard({ value }) {
  const color = value >= 80 ? 'green' : value >= 50 ? 'orange' : 'red';
  return (
    <div className="stat-card green">
      <div className="stat-card-header">
        <div className="stat-card-label">Taux d'Occupation</div>
        <div className="stat-card-icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
          <Home size={18} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Gauge value={value} color={color} suffix=" %" />
      </div>
    </div>
  );
}

function QuickInfoCard({ title, icon, items }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          <div className="card-title-icon">{icon}</div>
          {title}
        </div>
      </div>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '12px 0',
          borderBottom: i < items.length - 1 ? '1px solid var(--border-color)' : 'none'
        }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{item.label}</span>
          <span style={{ fontWeight: 700, color: item.color || 'var(--text-primary)' }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function formatMoney(n) {
  const num = parseFloat(n) || 0;
  return num.toLocaleString('fr-FR', { minimumFractionDigits: num >= 100 ? 0 : 2, maximumFractionDigits: 2 });
}

function GaugeTrend({ variation }) {
  // Si pas de variation calculable (pas de référence), on n'affiche rien
  if (variation === null || variation === undefined) {
    return (
      <div className="gauge-trend neutral" style={{ color: 'var(--text-muted)' }}>
        — Pas de référence
      </div>
    );
  }

  if (variation === 0) {
    return (
      <div className="gauge-trend neutral" style={{ color: 'var(--text-muted)' }}>
        — Stable
      </div>
    );
  }

  const isPositive = variation > 0;

  return (
    <div className={`gauge-trend ${isPositive ? 'up' : 'down'}`}>
      {isPositive
        ? <><TrendingUp size={12} /> +{variation}%</>
        : <><TrendingDown size={12} /> {variation}%</>
      }
    </div>
  );
}