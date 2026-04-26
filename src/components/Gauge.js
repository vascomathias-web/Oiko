import React from 'react';

export default function Gauge({ value, max = 100, color = 'blue', displayValue, suffix = '' }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const angle = (pct / 100) * 180;

  const colorMap = {
    blue: '#3b82f6',
    green: '#10b981',
    orange: '#f59e0b',
    red: '#ef4444',
    teal: '#14b8a6',
    purple: '#8b5cf6'
  };

  const gaugeColor = colorMap[color] || colorMap.blue;

  // Calcul coordonnées point final arc
  const radius = 70;
  const cx = 80;
  const cy = 80;
  const rad = ((angle - 180) * Math.PI) / 180;
  const x = cx + radius * Math.cos(rad);
  const y = cy + radius * Math.sin(rad);
  const largeArc = angle > 180 ? 1 : 0;

  const pathBg = `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;
  const pathFg = `M ${cx - radius} ${cy} A ${radius} ${radius} 0 ${largeArc} 1 ${x} ${y}`;

  return (
    <svg width="160" height="90" viewBox="0 0 160 90" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`gauge-${color}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={gaugeColor} stopOpacity="0.6" />
          <stop offset="100%" stopColor={gaugeColor} stopOpacity="1" />
        </linearGradient>
      </defs>
      <path d={pathBg} stroke="var(--border-color)" strokeWidth="12" fill="none" strokeLinecap="round" />
      <path
        d={pathFg}
        stroke={`url(#gauge-${color})`}
        strokeWidth="12"
        fill="none"
        strokeLinecap="round"
        style={{ transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }}
      />
      <text
        x="80"
        y="72"
        textAnchor="middle"
        fill="var(--text-primary)"
        fontSize="22"
        fontWeight="800"
        style={{ letterSpacing: '-0.02em' }}
      >
        {displayValue !== undefined ? displayValue : `${Math.round(pct)}${suffix}`}
      </text>
    </svg>
  );
}
