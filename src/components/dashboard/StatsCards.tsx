'use client';

// ============================================================
// Stats Cards — Dashboard overview metrics
// ============================================================

interface StatsCardsProps {
  users: number;
  active: number;
  invites: number;
  features: number;
}

const cards = [
  { key: 'users', label: 'Users' },
  { key: 'active', label: 'Active' },
  { key: 'invites', label: 'Pending invites' },
  { key: 'features', label: 'Features' },
];

export default function StatsCards({ users, active, invites, features }: StatsCardsProps) {
  const values: Record<string, number> = { users, active, invites, features };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 0,
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-card)',
        overflow: 'hidden',
      }}
    >
      {cards.map((card, i) => (
        <div
          key={card.key}
          style={{
            padding: '20px 24px',
            borderLeft: i === 0 ? 'none' : '1px solid var(--border)',
          }}
        >
          <div className="eyebrow-muted" style={{ marginBottom: 10 }}>
            {card.label}
          </div>
          <div
            className="mono"
            style={{
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: '-0.04em',
              color: 'var(--text-main)',
              lineHeight: 1,
            }}
          >
            {values[card.key].toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
