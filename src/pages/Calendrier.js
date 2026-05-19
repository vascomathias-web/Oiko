import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Home, Wrench, FileText, AlertTriangle, Calendar } from 'lucide-react';
import PageHeader from '../components/PageHeader';

const MOIS_LABELS = ['Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const TYPE_CONFIG = {
  loyer:    { label: 'Loyer',          icon: Home,          color: '#2563eb' },
  fin_bail: { label: 'Fin de bail',    icon: AlertTriangle, color: '#7c3aed' },
  travaux:  { label: 'Travaux',        icon: Wrench,        color: '#ea580c' },
  document: { label: 'Doc expirant',  icon: FileText,      color: '#dc2626' }
};

function EventDot({ color }) {
  return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color, marginRight: 3 }} />;
}

export default function Calendrier() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // date string YYYY-MM-DD

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.api.calendrier.getEvents(year, month);
      setEvents(data || []);
    } catch (e) {
      setEvents([]);
    }
    setLoading(false);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setSelected(null);
  };

  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setSelected(null);
  };

  // Build calendar days
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const startOffset = (firstDay + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month, 0).getDate();

  const eventsByDay = {};
  events.forEach(ev => {
    const d = ev.date ? ev.date.slice(0, 10) : null;
    if (!d) return;
    if (!eventsByDay[d]) eventsByDay[d] = [];
    eventsByDay[d].push(ev);
  });

  const todayStr = now.toISOString().slice(0, 10);
  const selectedEvents = selected ? (eventsByDay[selected] || []) : [];

  // Legend counts
  const legendCounts = {};
  events.forEach(ev => {
    legendCounts[ev.type] = (legendCounts[ev.type] || 0) + 1;
  });

  return (
    <>
      <PageHeader
        title="Calendrier"
        subtitle="Vue d'ensemble des événements"
        onRefresh={load}
      />
    <div className="page-container">

      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px' }}>
        <button className="btn btn-icon" onClick={prevMonth}><ChevronLeft size={18} /></button>
        <span style={{ fontWeight: 700, fontSize: 18, flex: 1, textAlign: 'center' }}>{MOIS_LABELS[month - 1]} {year}</span>
        <button className="btn btn-icon" onClick={nextMonth}><ChevronRight size={18} /></button>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        {Object.entries(TYPE_CONFIG).map(([type, cfg]) => {
          const count = legendCounts[type] || 0;
          const Icon = cfg.icon;
          return (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <EventDot color={cfg.color} />
              <Icon size={12} />
              {cfg.label} {count > 0 && <span style={{ fontWeight: 700, color: cfg.color }}>({count})</span>}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        {/* Calendar grid */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
            {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d => (
              <div key={d} style={{ textAlign: 'center', padding: '10px 4px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{d}</div>
            ))}
          </div>

          {/* Cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} style={{ minHeight: 70, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', opacity: 0.3 }} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const dayEvents = eventsByDay[dateStr] || [];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selected;

              return (
                <div
                  key={day}
                  onClick={() => setSelected(isSelected ? null : dateStr)}
                  style={{
                    minHeight: 70,
                    borderRight: '1px solid var(--border)',
                    borderBottom: '1px solid var(--border)',
                    padding: '6px 8px',
                    cursor: dayEvents.length ? 'pointer' : 'default',
                    background: isSelected ? 'rgba(37,99,235,0.1)' : 'transparent',
                    transition: 'background .15s'
                  }}
                >
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 26, borderRadius: '50%', fontSize: 13, fontWeight: 600,
                    background: isToday ? '#2563eb' : 'transparent',
                    color: isToday ? 'white' : 'var(--text-primary)',
                    marginBottom: 4
                  }}>{day}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    {dayEvents.slice(0, 3).map((ev, idx) => (
                      <EventDot key={idx} color={ev.color || '#888'} />
                    ))}
                    {dayEvents.length > 3 && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>+{dayEvents.length - 3}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Side panel */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          {selected ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>
                {new Date(selected + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              {selectedEvents.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Aucun événement ce jour.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedEvents.map((ev, i) => {
                    const cfg = TYPE_CONFIG[ev.type] || { label: ev.type, icon: Calendar, color: '#888' };
                    const Icon = cfg.icon;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-secondary)', borderLeft: `3px solid ${ev.color || cfg.color}` }}>
                        <Icon size={14} style={{ color: ev.color || cfg.color, marginTop: 1, flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{ev.label}</div>
                          {ev.montant && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{parseFloat(ev.montant).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</div>}
                          {ev.statut && <div style={{ fontSize: 11, color: ev.color, fontWeight: 600, marginTop: 2 }}>{ev.statut}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Événements du mois</div>
              {loading ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Chargement…</div>
              ) : events.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Aucun événement ce mois.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {events
                    .slice()
                    .sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1)
                    .map((ev, i) => {
                      const cfg = TYPE_CONFIG[ev.type] || { label: ev.type, icon: Calendar, color: '#888' };
                      const Icon = cfg.icon;
                      const day = ev.date ? new Date(ev.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                          <EventDot color={ev.color || cfg.color} />
                          <span style={{ color: 'var(--text-secondary)', minWidth: 48 }}>{day}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.label}</span>
                        </div>
                      );
                    })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
