'use client';

// ============================================================
// Edit Project page — form + danger zone
// ============================================================

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Trash2, AlertTriangle, Eraser } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import {
  getProject,
  deleteProjectCascade,
  cleanupProjectHistory,
} from '@/lib/reddit-visibility/firestore';
import { writeActivityLog } from '@/lib/firebase/firestore';
import { LogAction, LogSeverity } from '@/lib/types';
import type { RedditProject } from '@/lib/reddit-visibility/types';
import ProjectForm from '@/components/reddit-visibility/ProjectForm';

export default function EditProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const { userProfile, userRole } = useAuth();
  const [project, setProject] = useState<RedditProject | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [cleanupConfirmText, setCleanupConfirmText] = useState('');
  const [cleaning, setCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    getProject(projectId).then(setProject);
  }, [projectId]);

  if (!project) return null;

  const canDelete = confirmText.trim() === project.name && !deleting;
  const canCleanup = cleanupConfirmText.trim().toLowerCase() === 'clean' && !cleaning;

  const handleCleanup = async () => {
    if (!canCleanup || !userProfile || !userRole) return;
    setCleaning(true);
    setCleanupError(null);
    setCleanupResult(null);
    try {
      const counts = await cleanupProjectHistory(project.projectId);
      await writeActivityLog(
        userProfile.uid,
        userProfile.email,
        userRole.slug,
        LogAction.REDDIT_HISTORY_CLEANED,
        'reddit_project',
        project.projectId,
        project.name,
        counts,
        LogSeverity.WARNING
      );
      setCleanupResult(
        `Removed ${counts.posts} post${counts.posts === 1 ? '' : 's'}, ${counts.analyses} analys${counts.analyses === 1 ? 'is' : 'es'}, ${counts.drafts} draft${counts.drafts === 1 ? '' : 's'}. Kept ${counts.postedDraftsKept} posted draft${counts.postedDraftsKept === 1 ? '' : 's'} for the answered ledger.`
      );
      setCleanupConfirmText('');
    } catch (err) {
      console.error(err);
      setCleanupError(err instanceof Error ? err.message : String(err));
    } finally {
      setCleaning(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete || !userProfile || !userRole) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const counts = await deleteProjectCascade(project.projectId);
      await writeActivityLog(
        userProfile.uid,
        userProfile.email,
        userRole.slug,
        LogAction.REDDIT_PROJECT_DELETED,
        'reddit_project',
        project.projectId,
        project.name,
        counts,
        LogSeverity.WARNING
      );
      router.push('/apps/reddit-visibility');
    } catch (err) {
      console.error(err);
      setDeleteError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: '24px' }}>Edit project</h2>
      <div className="card">
        <ProjectForm initial={project} />
      </div>

      <div
        className="card"
        style={{
          marginTop: '32px',
          borderColor: 'rgba(245, 158, 11, 0.3)',
          background: 'rgba(245, 158, 11, 0.04)',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '16px' }}>
          <Eraser size={20} className="text-warning" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h3 style={{ marginBottom: '4px', color: 'var(--warning)' }}>Clean fetch &amp; analysis history</h3>
            <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: 0 }}>
              Removes every fetched post, opportunity analysis, and unposted draft for this project. <strong>Drafts you marked as posted are kept</strong> as an &quot;answered&quot; ledger — if any of those posts are re-fetched in the future, they will be tagged ANSWERED automatically. The project itself, knowledge sources, and saved keywords stay put.
            </p>
          </div>
        </div>

        <div className="input-group">
          <label className="label">
            Type <strong>clean</strong> to confirm
          </label>
          <input
            type="text"
            value={cleanupConfirmText}
            onChange={(e) => setCleanupConfirmText(e.target.value)}
            placeholder="clean"
          />
        </div>

        {cleanupError && (
          <div className="text-error" style={{ marginBottom: '12px', fontSize: '0.875rem' }}>
            {cleanupError}
          </div>
        )}
        {cleanupResult && (
          <div className="text-muted" style={{ marginBottom: '12px', fontSize: '0.875rem' }}>
            {cleanupResult}
          </div>
        )}

        <button
          type="button"
          className="btn"
          style={{
            background: canCleanup ? 'var(--warning)' : 'var(--surface-2)',
            color: canCleanup ? 'white' : 'var(--text-dim)',
            cursor: canCleanup ? 'pointer' : 'not-allowed',
          }}
          disabled={!canCleanup}
          onClick={handleCleanup}
        >
          <Eraser size={16} /> {cleaning ? 'Cleaning…' : 'Clean history'}
        </button>
      </div>

      <div
        className="card"
        style={{
          marginTop: '24px',
          borderColor: 'rgba(239, 68, 68, 0.3)',
          background: 'rgba(239, 68, 68, 0.04)',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '16px' }}>
          <AlertTriangle size={20} className="text-error" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h3 style={{ marginBottom: '4px', color: 'var(--error)' }}>Danger zone</h3>
            <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: 0 }}>
              Deleting this project removes the project record and every dependent
              knowledge source, fetched Reddit post, and analysis. This cannot be undone.
            </p>
          </div>
        </div>

        <div className="input-group">
          <label className="label">
            Type the project name to confirm: <strong>{project.name}</strong>
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={project.name}
          />
        </div>

        {deleteError && (
          <div className="text-error" style={{ marginBottom: '12px', fontSize: '0.875rem' }}>
            {deleteError}
          </div>
        )}

        <button
          type="button"
          className="btn"
          style={{
            background: canDelete ? 'var(--error)' : 'var(--surface-2)',
            color: canDelete ? 'white' : 'var(--text-dim)',
            cursor: canDelete ? 'pointer' : 'not-allowed',
          }}
          disabled={!canDelete}
          onClick={handleDelete}
        >
          <Trash2 size={16} /> {deleting ? 'Deleting…' : 'Delete project permanently'}
        </button>
      </div>
    </div>
  );
}
