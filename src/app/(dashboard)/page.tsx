'use client';

// ============================================================
// Dashboard Home — Role-aware overview
// ============================================================

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { getFeatures, getUserCount, getActiveUserCount, getPendingInvitationCount } from '@/lib/firebase/firestore';
import { canViewFeature, isAdmin } from '@/lib/utils/permissions';
import { FeatureStatus } from '@/lib/types';
import type { Feature } from '@/lib/types';
import StatsCards from '@/components/dashboard/StatsCards';
import ToolCard from '@/components/dashboard/ToolCard';
import { ArrowUpRight, Zap } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { userProfile, userRole, loading } = useAuth();
  const [features, setFeatures] = useState<Feature[]>([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    pendingInvites: 0,
    totalFeatures: 0,
  });

  useEffect(() => {
    async function loadData() {
      if (!userProfile || !userRole) return;

      const [allFeatures, uCount, aCount, iCount] = await Promise.all([
        getFeatures(),
        isAdmin(userRole) ? getUserCount() : Promise.resolve(0),
        isAdmin(userRole) ? getActiveUserCount() : Promise.resolve(0),
        isAdmin(userRole) ? getPendingInvitationCount() : Promise.resolve(0),
      ]);

      const visibleFeatures = allFeatures.filter(f => f.status !== FeatureStatus.INACTIVE);
      setFeatures(visibleFeatures);
      setStats({
        totalUsers: uCount,
        activeUsers: aCount,
        pendingInvites: iCount,
        totalFeatures: visibleFeatures.length,
      });
    }
    loadData();
  }, [userProfile, userRole]);

  if (loading || !userProfile || !userRole) return null;

  const accessibleFeatures = features.filter(f =>
    canViewFeature(userProfile, userRole, f, null)
  );

  const firstName = userProfile.displayName.split(' ')[0];

  return (
    <div>
      <section className="hero-halo" style={{ marginBottom: 48, paddingTop: 8 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          Overview
        </div>
        <h1 style={{ marginBottom: 8 }}>Welcome back, {firstName}.</h1>
        <p className="text-muted" style={{ fontSize: 15, maxWidth: 560 }}>
          Access your AI tools and manage your workflows from one central hub.
        </p>
      </section>

      {isAdmin(userRole) && (
        <section style={{ marginBottom: 48 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <div className="eyebrow-muted">Platform</div>
          </div>
          <StatsCards
            users={stats.totalUsers}
            active={stats.activeUsers}
            invites={stats.pendingInvites}
            features={stats.totalFeatures}
          />
        </section>
      )}

      <section>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 16,
          }}
        >
          <div>
            <div className="eyebrow-muted" style={{ marginBottom: 4 }}>
              Toolkit
            </div>
            <h2 style={{ marginBottom: 0 }}>Your AI tools</h2>
          </div>
          {isAdmin(userRole) && (
            <Link
              href="/admin/features"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 13,
                color: 'var(--primary)',
                textDecoration: 'none',
              }}
            >
              Manage registry <ArrowUpRight size={13} strokeWidth={1.75} />
            </Link>
          )}
        </div>

        {accessibleFeatures.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {accessibleFeatures.map((feature) => (
              <ToolCard key={feature.featureId} feature={feature} />
            ))}
          </div>
        ) : (
          <div
            className="card"
            style={{
              textAlign: 'center',
              padding: 56,
              borderStyle: 'dashed',
            }}
          >
            <Zap
              size={20}
              strokeWidth={1.5}
              style={{ color: 'var(--text-dim)', marginBottom: 14 }}
            />
            <h3 style={{ marginBottom: 4 }}>No tools assigned</h3>
            <p
              className="text-muted"
              style={{ fontSize: 13, maxWidth: 360, margin: '0 auto' }}
            >
              Contact an administrator to request access to specific features.
            </p>
          </div>
        )}
      </section>

      <section style={{ marginTop: 56 }}>
        <div className="eyebrow-muted" style={{ marginBottom: 14 }}>
          Changelog
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--primary-soft)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--primary)',
                flexShrink: 0,
              }}
            >
              <Zap size={15} strokeWidth={1.75} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  marginBottom: 4,
                  flexWrap: 'wrap',
                }}
              >
                <h3 style={{ marginBottom: 0 }}>Phase 1 launch</h3>
                <span className="eyebrow-muted" style={{ fontSize: 10 }}>
                  May 2026
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                Core platform live — role-based access control, feature registry,
                and invitation workflows. Placeholder tools ready for Phase 2 integration.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
