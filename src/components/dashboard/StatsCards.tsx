'use client';

// ============================================================
// Stats Cards — Dashboard overview metrics
// ============================================================

import React from 'react';
import { Users, UserCheck, Mail, Cpu } from 'lucide-react';

interface StatsCardsProps {
  users: number;
  active: number;
  invites: number;
  features: number;
}

export default function StatsCards({ users, active, invites, features }: StatsCardsProps) {
  const cards = [
    { title: 'Total Users', value: users, icon: Users, color: 'var(--info)' },
    { title: 'Active Users', value: active, icon: UserCheck, color: 'var(--success)' },
    { title: 'Pending Invites', value: invites, icon: Mail, color: 'var(--warning)' },
    { title: 'Total Features', value: features, icon: Cpu, color: 'var(--primary)' },
  ];

  return (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
      gap: '24px' 
    }}>
      {cards.map((card) => (
        <div key={card.title} className="card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ 
            background: card.color.replace(')', ', 0.1)'), 
            color: card.color,
            padding: '12px',
            borderRadius: 'var(--radius-md)'
          }}>
            <card.icon size={24} />
          </div>
          <div>
            <div className="text-dim" style={{ fontSize: '0.875rem', fontWeight: 500 }}>{card.title}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{card.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
