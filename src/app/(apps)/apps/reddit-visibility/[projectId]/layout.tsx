'use client';

// ============================================================
// Project-scoped layout — loads the project, renders tabs
// ============================================================

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, AlertCircle } from 'lucide-react';
import { getProject } from '@/lib/reddit-visibility/firestore';
import type { RedditProject } from '@/lib/reddit-visibility/types';
import ProjectTabs from '@/components/reddit-visibility/ProjectTabs';

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<RedditProject | null | undefined>(undefined);

  useEffect(() => {
    if (!projectId) return;
    getProject(projectId).then((p) => setProject(p));
  }, [projectId]);

  if (project === undefined) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (project === null) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
        <AlertCircle size={48} className="text-error" style={{ marginBottom: '16px' }} />
        <h2>Project not found</h2>
        <p className="text-muted" style={{ marginBottom: '24px' }}>
          The project you are looking for does not exist or has been removed.
        </p>
        <button className="btn btn-primary" onClick={() => router.push('/apps/reddit-visibility')}>
          Back to projects
        </button>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/apps/reddit-visibility"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.875rem',
          marginBottom: '12px',
        }}
      >
        <ChevronLeft size={16} /> All projects
      </Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ marginBottom: '4px' }}>{project.name}</h1>
          {project.websiteUrl && (
            <a href={project.websiteUrl} target="_blank" rel="noopener noreferrer"
              className="text-muted" style={{ fontSize: '0.875rem' }}>
              {project.websiteUrl}
            </a>
          )}
        </div>
        <span className={`badge ${project.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
          {project.status.toUpperCase()}
        </span>
      </div>

      <ProjectTabs projectId={project.projectId} />

      {children}
    </div>
  );
}
