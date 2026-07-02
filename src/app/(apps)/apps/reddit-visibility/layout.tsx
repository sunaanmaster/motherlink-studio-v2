'use client';

// ============================================================
// Reddit Visibility — Shared layout
// Loads the feature record, gates on hasFeatureAccess, then
// renders a slim app header above whatever child page is active.
// ============================================================

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { getFeatureBySlug } from '@/lib/firebase/firestore';
import { hasFeatureAccess } from '@/lib/utils/permissions';
import { MessageSquare, ExternalLink, Users } from 'lucide-react';

const FEATURE_SLUG = 'reddit-visibility';

export default function RedditVisibilityLayout({ children }: { children: React.ReactNode }) {
  const { userProfile, userRole, loading } = useAuth();
  const router = useRouter();
  const [gateChecked, setGateChecked] = useState(false);

  useEffect(() => {
    async function check() {
      if (loading) return;
      if (!userProfile || !userRole) return;

      const feature = await getFeatureBySlug(FEATURE_SLUG);
      if (!feature || !hasFeatureAccess(userProfile, userRole, feature, null)) {
        router.push('/?error=access_denied');
        return;
      }
      setGateChecked(true);
    }
    check();
  }, [loading, userProfile, userRole, router]);

  if (!gateChecked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        padding: '14px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        background: 'var(--surface-1)',
      }}>
        <Link href="/apps/reddit-visibility" style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          textDecoration: 'none', color: 'inherit',
        }}>
          <MessageSquare size={20} className="text-primary-light" />
          <strong>Reddit Visibility Assistant</strong>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Link
            href="/apps/reddit-visibility/accounts"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '0.8125rem', color: 'var(--text-dim)', textDecoration: 'none',
            }}
          >
            <Users size={14} /> Accounts
          </Link>
          <a
            href="/"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '0.8125rem', color: 'var(--text-dim)', textDecoration: 'none',
            }}
          >
            <ExternalLink size={14} /> Motherlink Dashboard
          </a>
        </div>
      </header>

      <main style={{ flex: 1, padding: '32px', maxWidth: '1280px', width: '100%', margin: '0 auto' }}>
        {children}
      </main>
    </div>
  );
}
