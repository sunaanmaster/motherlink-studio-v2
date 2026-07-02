'use client';

// ============================================================
// New Project page
// ============================================================

import React from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import ProjectForm from '@/components/reddit-visibility/ProjectForm';

export default function NewProjectPage() {
  return (
    <div>
      <Link
        href="/apps/reddit-visibility"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.875rem',
          marginBottom: '16px',
        }}
      >
        <ChevronLeft size={16} /> Back to projects
      </Link>
      <h1 style={{ marginBottom: '4px' }}>New project</h1>
      <p className="text-muted" style={{ marginBottom: '32px' }}>
        Configure the client context that grounds every AI analysis and draft.
      </p>
      <div className="card">
        <ProjectForm />
      </div>
    </div>
  );
}
