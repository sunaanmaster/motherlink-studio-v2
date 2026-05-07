'use client';

// ============================================================
// Dashboard Layout — Sidebar + Topbar Shell
// ============================================================

import React from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import RouteGuard from '@/components/layout/RouteGuard';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteGuard>
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <Topbar />
          <div className="content-body">
            {children}
          </div>
        </main>
      </div>
    </RouteGuard>
  );
}
