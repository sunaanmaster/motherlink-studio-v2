'use client';

// ============================================================
// Dynamic Tool Page — Loads tool from registry
// ============================================================

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { getFeatureBySlug } from '@/lib/firebase/firestore';
import { hasFeatureAccess } from '@/lib/utils/permissions';
import type { Feature } from '@/lib/types';
import PlaceholderChat from '@/components/tools/PlaceholderChat';
import { AlertCircle, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function ToolPage() {
  const { slug } = useParams();
  const { userProfile, userRole, loading } = useAuth();
  const [feature, setFeature] = useState<Feature | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function loadTool() {
      if (!userProfile || !userRole) return;
      
      const tool = await getFeatureBySlug(slug as string);
      if (!tool) {
        setAuthLoading(false);
        return;
      }

      const hasAccess = hasFeatureAccess(userProfile, userRole, tool, null);
      if (!hasAccess) {
        router.push('/?error=access_denied');
        return;
      }

      setFeature(tool);
      setAuthLoading(false);
    }
    loadTool();
  }, [slug, userProfile, userRole, router]);

  if (loading || authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!feature) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '64px' }}>
        <AlertCircle size={48} className="text-error" style={{ marginBottom: '20px' }} />
        <h2>Tool Not Found</h2>
        <p className="text-muted" style={{ marginBottom: '32px' }}>
          The tool you are looking for does not exist or has been removed.
        </p>
        <Link href="/" className="btn btn-primary">Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-height) - 64px)' }}>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Link href="/" className="btn-outline" style={{ padding: '8px', borderRadius: 'var(--radius-md)' }}>
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '2px' }}>{feature.name}</h1>
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>{feature.description}</p>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {feature.isPlaceholder ? (
          <PlaceholderChat toolName={feature.name} />
        ) : (
          <div className="card" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p className="text-muted">Phase 2: Custom Tool UI will be rendered here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
