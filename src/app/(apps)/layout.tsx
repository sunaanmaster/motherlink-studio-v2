'use client';

// ============================================================
// Apps Route Group — Full-screen tools, no dashboard shell
// Auth is enforced via RouteGuard; per-tool feature permission
// checks are done inside each app's own page.
// ============================================================

import React from 'react';
import RouteGuard from '@/components/layout/RouteGuard';

export default function AppsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RouteGuard>
      <div style={{ minHeight: '100vh', background: 'var(--bg-main)' }}>
        {children}
      </div>
    </RouteGuard>
  );
}
