'use client';

// ============================================================
// Tool Card — Individual feature entry point
// ============================================================

import Link from 'next/link';
import type { Feature } from '@/lib/types';
import { FeatureStatus } from '@/lib/types';
import * as Icons from 'lucide-react';
import { ArrowUpRight, Lock } from 'lucide-react';

interface ToolCardProps {
  feature: Feature;
}

export default function ToolCard({ feature }: ToolCardProps) {
  // @ts-ignore
  const IconComponent = Icons[feature.icon] || Icons.Zap;

  const isComingSoon = feature.status === FeatureStatus.COMING_SOON;

  const cardInner = (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isComingSoon ? 'var(--surface-2)' : 'var(--primary-soft)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: isComingSoon ? 'var(--text-dim)' : 'var(--primary)',
            flexShrink: 0,
          }}
        >
          <IconComponent size={18} strokeWidth={1.75} />
        </div>

        <span className={`badge ${isComingSoon ? 'badge-warning' : 'badge-success'}`}>
          {isComingSoon ? 'Soon' : 'Active'}
        </span>
      </div>

      <h3
        style={{
          fontSize: 15,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          color: 'var(--text-main)',
          marginBottom: 6,
        }}
      >
        {feature.name}
      </h3>
      <p
        style={{
          fontSize: 13,
          color: 'var(--text-muted)',
          marginBottom: 20,
          flex: 1,
          lineHeight: 1.5,
        }}
      >
        {feature.description}
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 16,
          borderTop: '1px solid var(--border)',
        }}
      >
        {isComingSoon ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--text-dim)',
              fontSize: 12,
            }}
          >
            <Lock size={12} strokeWidth={1.75} />
            <span>Not available</span>
          </div>
        ) : (
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--primary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            Open <ArrowUpRight size={14} strokeWidth={2} />
          </span>
        )}
        {feature.openInNewTab && !isComingSoon && (
          <span className="eyebrow-muted" style={{ fontSize: 10 }}>
            External
          </span>
        )}
      </div>
    </>
  );

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 196,
    padding: 20,
    opacity: isComingSoon ? 0.6 : 1,
  };

  if (isComingSoon) {
    return (
      <div className="card" style={cardStyle}>
        {cardInner}
      </div>
    );
  }

  return (
    <Link
      href={feature.route}
      className="card card-interactive"
      style={{ ...cardStyle, textDecoration: 'none', color: 'inherit' }}
      {...(feature.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {cardInner}
    </Link>
  );
}
