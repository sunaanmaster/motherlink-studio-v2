'use client';

// ============================================================
// Tool Card — Individual feature entry point
// ============================================================

import React from 'react';
import Link from 'next/link';
import type { Feature } from '@/lib/types';
import { FeatureStatus } from '@/lib/types';
import * as Icons from 'lucide-react';
import { ArrowRight, Lock } from 'lucide-react';

interface ToolCardProps {
  feature: Feature;
}

export default function ToolCard({ feature }: ToolCardProps) {
  // @ts-ignore
  const IconComponent = Icons[feature.icon] || Icons.Zap;
  
  const isComingSoon = feature.status === FeatureStatus.COMING_SOON;

  return (
    <div className={`card ${isComingSoon ? 'coming-soon' : ''}`} style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div style={{ 
          background: 'var(--surface-2)',
          padding: '12px', 
          borderRadius: 'var(--radius-md)',
          color: isComingSoon ? 'var(--text-dim)' : 'var(--primary-light)'
        }}>
          <IconComponent size={28} />
        </div>
        
        {isComingSoon ? (
          <div className="badge badge-warning">COMING SOON</div>
        ) : (
          <div className="badge badge-success">ACTIVE</div>
        )}
      </div>

      <h3 style={{ marginBottom: '8px' }}>{feature.name}</h3>
      <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '24px', flex: 1 }}>
        {feature.description}
      </p>

      {isComingSoon ? (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          color: 'var(--text-dim)', 
          fontSize: '0.875rem',
          fontWeight: 600
        }}>
          <Lock size={16} /> Restricted
        </div>
      ) : (
        <Link 
          href={feature.route} 
          className="btn btn-outline" 
          style={{ width: '100%', justifyContent: 'space-between' }}
        >
          Open Tool <ArrowRight size={18} />
        </Link>
      )}

      <style jsx>{`
        .coming-soon {
          opacity: 0.7;
          filter: grayscale(0.5);
        }
      `}</style>
    </div>
  );
}
