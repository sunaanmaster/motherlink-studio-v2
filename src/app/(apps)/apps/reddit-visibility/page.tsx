'use client';

// ============================================================
// Reddit Visibility — Projects list (Phase B)
// ============================================================

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { listProjects } from '@/lib/reddit-visibility/firestore';
import type { RedditProject } from '@/lib/reddit-visibility/types';
import { Plus, FolderOpen, Globe } from 'lucide-react';

export default function ProjectsListPage() {
  const [projects, setProjects] = useState<RedditProject[] | null>(null);

  useEffect(() => {
    listProjects().then(setProjects);
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ marginBottom: '4px' }}>Projects</h1>
          <p className="text-muted">Each client gets its own project: knowledge sources, subreddits, and drafts.</p>
        </div>
        <Link href="/apps/reddit-visibility/new" className="btn btn-primary">
          <Plus size={18} /> New Project
        </Link>
      </div>

      {projects === null && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
          <div className="spinner" />
        </div>
      )}

      {projects && projects.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '64px' }}>
          <FolderOpen size={48} className="text-dim" style={{ marginBottom: '16px' }} />
          <h3>No projects yet</h3>
          <p className="text-muted" style={{ marginBottom: '24px' }}>
            Create a project for the first client you want to support on Reddit.
          </p>
          <Link href="/apps/reddit-visibility/new" className="btn btn-primary">
            <Plus size={18} /> Create your first project
          </Link>
        </div>
      )}

      {projects && projects.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '20px',
        }}>
          {projects.map((p) => (
            <Link
              key={p.projectId}
              href={`/apps/reddit-visibility/${p.projectId}`}
              className="card"
              style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <h3 style={{ marginBottom: 0 }}>{p.name}</h3>
                <span className={`badge ${p.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                  {p.status.toUpperCase()}
                </span>
              </div>
              {p.websiteUrl && (
                <div className="text-dim" style={{ fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                  <Globe size={14} /> {p.websiteUrl}
                </div>
              )}
              <p className="text-muted" style={{ fontSize: '0.875rem', minHeight: '40px' }}>
                {p.companyDescription || 'No description yet.'}
              </p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px' }}>
                {p.targetSubreddits.slice(0, 4).map((s) => (
                  <span key={s} className="badge" style={{ background: 'var(--surface-2)' }}>r/{s}</span>
                ))}
                {p.targetSubreddits.length > 4 && (
                  <span className="badge" style={{ background: 'var(--surface-2)' }}>+{p.targetSubreddits.length - 4}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
