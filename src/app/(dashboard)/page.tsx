'use client';

// ============================================================
// Dashboard Home — Role-aware overview
// ============================================================

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { getFeatures, getUserCount, getActiveUserCount, getPendingInvitationCount } from '@/lib/firebase/firestore';
import { canViewFeature, isAdmin } from '@/lib/utils/permissions';
import { FeatureStatus } from '@/lib/types';
import type { Feature } from '@/lib/types';
import StatsCards from '@/components/dashboard/StatsCards';
import ToolCard from '@/components/dashboard/ToolCard';
import { Sparkles, ArrowRight, Zap } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { userProfile, userRole, loading } = useAuth();
  const [features, setFeatures] = useState<Feature[]>([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    pendingInvites: 0,
    totalFeatures: 0
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

      // Hide INACTIVE; show ACTIVE + COMING_SOON
      const visibleFeatures = allFeatures.filter(f => f.status !== FeatureStatus.INACTIVE);
      setFeatures(visibleFeatures);
      setStats({
        totalUsers: uCount,
        activeUsers: aCount,
        pendingInvites: iCount,
        totalFeatures: visibleFeatures.length
      });
    }
    loadData();
  }, [userProfile, userRole]);

  if (loading || !userProfile || !userRole) return null;

  const accessibleFeatures = features.filter(f =>
    canViewFeature(userProfile, userRole, f, null)
  );

  return (
    <div>
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          Welcome back, {userProfile.displayName.split(' ')[0]} <Sparkles className="text-primary" size={32} />
        </h1>
        <p className="text-muted">
          Access your AI tools and manage your workflows from one central dashboard.
        </p>
      </div>

      {isAdmin(userRole) && (
        <div style={{ marginBottom: '48px' }}>
          <h2 style={{ marginBottom: '24px' }}>Platform Overview</h2>
          <StatsCards 
            users={stats.totalUsers} 
            active={stats.activeUsers} 
            invites={stats.pendingInvites} 
            features={stats.totalFeatures} 
          />
        </div>
      )}

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2>Your AI Toolkit</h2>
          {isAdmin(userRole) && (
            <Link href="/admin/features" className="text-dim" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', textDecoration: 'none' }}>
              Manage Feature Registry <ArrowRight size={16} />
            </Link>
          )}
        </div>

        {accessibleFeatures.length > 0 ? (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
            gap: '24px' 
          }}>
            {accessibleFeatures.map((feature) => (
              <ToolCard key={feature.featureId} feature={feature} />
            ))}
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '64px', background: 'rgba(255, 255, 255, 0.02)' }}>
            <Zap size={48} className="text-dim" style={{ marginBottom: '20px' }} />
            <h3>No Tools Assigned</h3>
            <p className="text-muted" style={{ maxWidth: '400px', margin: '0 auto' }}>
              You don't have access to any AI tools yet. Please contact an administrator to request access to specific features.
            </p>
          </div>
        )}
      </div>

      <div style={{ marginTop: '64px' }}>
        <h2 style={{ marginBottom: '24px' }}>Recent Updates</h2>
        <div className="card">
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            <div style={{ background: 'rgba(124, 58, 237, 0.1)', padding: '12px', borderRadius: 'var(--radius-md)', color: 'var(--primary)' }}>
              <Zap size={24} />
            </div>
            <div>
              <h3 style={{ marginBottom: '4px' }}>Phase 1 Launch</h3>
              <p className="text-muted" style={{ fontSize: '0.9375rem' }}>
                The core platform architecture is now live. We've implemented the role-based access control system, 
                feature registry, and invitation workflows. Placeholder tools are ready for Phase 2 integration.
              </p>
              <div style={{ marginTop: '12px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)' }}>
                RELEASED MAY 2026
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
