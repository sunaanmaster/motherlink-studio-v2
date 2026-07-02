'use client';

// ============================================================
// ProjectTabs — top-of-project navigation
// Opportunities / Review tabs are disabled until Phase C/E
// ============================================================

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Info, BookOpen, Search, MessageCircle } from 'lucide-react';

interface Tab {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  disabled?: boolean;
}

export default function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/apps/reddit-visibility/${projectId}`;

  const tabs: Tab[] = [
    { href: base, label: 'Overview', icon: Info },
    { href: `${base}/knowledge`, label: 'Knowledge', icon: BookOpen },
    { href: `${base}/opportunities`, label: 'Opportunities', icon: Search },
    { href: `${base}/review`, label: 'Review', icon: MessageCircle, disabled: true },
  ];

  return (
    <nav style={{
      display: 'flex',
      gap: '4px',
      borderBottom: '1px solid var(--border)',
      marginBottom: '32px',
    }}>
      {tabs.map((t) => {
        const isActive = pathname === t.href;
        const Icon = t.icon;
        const baseStyle: React.CSSProperties = {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          fontSize: '0.875rem',
          fontWeight: 500,
          textDecoration: 'none',
          borderBottom: '2px solid transparent',
          marginBottom: '-1px',
        };

        if (t.disabled) {
          return (
            <span
              key={t.href}
              style={{ ...baseStyle, color: 'var(--text-dim)', cursor: 'not-allowed', opacity: 0.6 }}
              title="Coming in a later phase"
            >
              <Icon size={16} /> {t.label}
              <span style={{
                fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.05em',
                padding: '2px 6px', borderRadius: '4px',
                background: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning)',
              }}>SOON</span>
            </span>
          );
        }

        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              ...baseStyle,
              color: isActive ? 'var(--primary-light)' : 'var(--text-muted)',
              borderBottomColor: isActive ? 'var(--primary-light)' : 'transparent',
            }}
          >
            <Icon size={16} /> {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
