import React from 'react';
import PageHeader from '../components/PageHeader';
import GuideContent from '../components/GuideContent';

export default function Guide({ onNavigate }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="Guide d'utilisation"
        subtitle="Oïko — Votre actif, en clair."
        onNavigate={onNavigate}
      />
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <GuideContent />
      </div>
    </div>
  );
}
