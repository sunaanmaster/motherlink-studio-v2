'use client';

// ============================================================
// Project overview — read-only summary, edit link
// ============================================================

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Edit3, MessageCircle } from 'lucide-react';
import { getProject } from '@/lib/reddit-visibility/firestore';
import type { RedditProject } from '@/lib/reddit-visibility/types';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div className="text-dim" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.9375rem' }}>{value || <span className="text-dim">—</span>}</div>
    </div>
  );
}

function Chips({ items, prefix }: { items: string[]; prefix?: string }) {
  if (items.length === 0) return <span className="text-dim">—</span>;
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {items.map((it) => (
        <span key={it} className="badge" style={{ background: 'var(--surface-2)' }}>
          {prefix}{it}
        </span>
      ))}
    </div>
  );
}

export default function ProjectOverviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<RedditProject | null>(null);

  useEffect(() => {
    if (!projectId) return;
    getProject(projectId).then(setProject);
  }, [projectId]);

  if (!project) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <Link href={`/apps/reddit-visibility/${project.projectId}/edit`} className="btn btn-outline">
          <Edit3 size={16} /> Edit project
        </Link>
      </div>

      <div className="card">
        <Field label="Company description" value={project.companyDescription} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <Field label="Target customer" value={project.targetCustomer} />
          <Field label="Main product / service" value={project.productService} />
        </div>
        <Field label="Target subreddits" value={<Chips items={project.targetSubreddits} prefix="r/" />} />
        <Field label="Keywords / problems monitored" value={<Chips items={project.keywords} />} />
        <Field label="Brand mention style" value={project.brandMentionStyle} />
        <Field label="Forbidden phrases" value={<Chips items={project.forbiddenPhrases} />} />
      </div>

      <div className="card" style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <MessageCircle size={24} className="text-primary-light" />
        <div style={{ flex: 1 }}>
          <strong>Next: add knowledge sources</strong>
          <div className="text-muted" style={{ fontSize: '0.875rem' }}>
            Knowledge sources give the AI material to ground replies in. Reddit fetch + analysis come in later phases.
          </div>
        </div>
        <Link href={`/apps/reddit-visibility/${project.projectId}/knowledge`} className="btn btn-primary">
          Manage knowledge
        </Link>
      </div>
    </div>
  );
}
