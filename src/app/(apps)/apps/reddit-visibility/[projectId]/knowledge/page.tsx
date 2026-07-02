'use client';

// ============================================================
// Knowledge sources management for a project
// ============================================================

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, BookOpen, Link as LinkIcon, FileText, Trash2, ClipboardPaste, ChevronDown, ChevronUp, Copy, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import {
  listSources,
  deleteSource,
  createSource,
  getProject,
} from '@/lib/reddit-visibility/firestore';
import { writeActivityLog } from '@/lib/firebase/firestore';
import { LogAction, LogSeverity } from '@/lib/types';
import { buildSourcesImportPrompt } from '@/lib/reddit-visibility/import-prompts';
import type { RedditSource, RedditSourceType, RedditProject } from '@/lib/reddit-visibility/types';
import KnowledgeSourceForm from '@/components/reddit-visibility/KnowledgeSourceForm';

export default function KnowledgePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { userProfile, userRole } = useAuth();
  const [sources, setSources] = useState<RedditSource[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [project, setProject] = useState<RedditProject | null>(null);

  const handleCopyPrompt = async () => {
    if (!project) return;
    try {
      await navigator.clipboard.writeText(buildSourcesImportPrompt(project));
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch (err) {
      console.error('Clipboard write failed:', err);
    }
  };

  const asString = (v: unknown) => (typeof v === 'string' ? v : '');
  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];

  const handleBulkImport = async () => {
    if (!userProfile || !userRole) return;
    setImportError(null);
    setImportResult(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setImportError('Invalid JSON. Check for missing quotes or commas.');
      return;
    }
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    if (rows.length === 0) {
      setImportError('No sources found in JSON.');
      return;
    }

    setImporting(true);
    const created: RedditSource[] = [];
    let failed = 0;

    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') {
        failed++;
        continue;
      }
      const r = raw as Record<string, unknown>;
      const title = asString(r.title).trim();
      if (!title) {
        failed++;
        continue;
      }
      const type: RedditSourceType = r.type === 'pasted_text' ? 'pasted_text' : 'url';
      const urlVal = asString(r.url).trim();
      const payload = {
        projectId,
        type,
        title,
        url: type === 'url' && urlVal ? urlVal : null,
        rawContent: asString(r.rawContent).trim(),
        summary: asString(r.summary).trim(),
        keyPoints: asStringArray(r.keyPoints),
        answerAngles: asStringArray(r.answerAngles),
        relatedProblems: asStringArray(r.relatedProblems),
        createdBy: userProfile.uid,
      };
      try {
        const id = await createSource(payload);
        created.push({
          ...payload,
          sourceId: id,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (err) {
        console.error('createSource failed:', err);
        failed++;
      }
    }

    if (created.length > 0) {
      await writeActivityLog(
        userProfile.uid,
        userProfile.email,
        userRole.slug,
        LogAction.REDDIT_SOURCE_ADDED,
        'reddit_project',
        projectId,
        null,
        { bulkImport: true, created: created.length, failed },
        failed > 0 ? LogSeverity.WARNING : LogSeverity.INFO
      );
    }

    setSources((prev) => [...created, ...(prev ?? [])]);
    setImporting(false);
    setImportText('');
    setImportResult(
      `Imported ${created.length} source${created.length === 1 ? '' : 's'}` +
      (failed > 0 ? `, skipped ${failed} invalid entr${failed === 1 ? 'y' : 'ies'}.` : '.')
    );
    if (failed === 0) setImportOpen(false);
  };

  useEffect(() => {
    if (!projectId) return;
    listSources(projectId).then(setSources);
    getProject(projectId).then(setProject);
  }, [projectId]);

  const handleCreated = (source: RedditSource) => {
    setSources((prev) => [source, ...(prev ?? [])]);
    setShowForm(false);
  };

  const handleDelete = async (sourceId: string) => {
    if (!confirm('Delete this knowledge source?')) return;
    await deleteSource(sourceId);
    setSources((prev) => (prev ?? []).filter((s) => s.sourceId !== sourceId));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ marginBottom: '4px' }}>Knowledge sources</h2>
          <p className="text-muted">Material the AI can draw on when analyzing Reddit posts and drafting replies.</p>
        </div>
        {!showForm && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-outline" onClick={() => setImportOpen((v) => !v)}>
              <ClipboardPaste size={16} /> Bulk import
              {importOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={18} /> Add source
            </button>
          </div>
        )}
      </div>

      {importOpen && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <strong style={{ display: 'block', marginBottom: '6px' }}>Bulk import sources</strong>
          <p className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '10px' }}>
            Paste a JSON array of source objects. Each object needs at least a <code>title</code>. Supported fields: <code>type</code> (<code>url</code> | <code>pasted_text</code>), <code>title</code>, <code>url</code>, <code>rawContent</code>, <code>summary</code>, <code>keyPoints</code>, <code>answerAngles</code>, <code>relatedProblems</code>. Don&apos;t have the JSON yet? Copy the AI prompt below and run it through ChatGPT / Claude.
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={8}
            placeholder='[{"type":"url","title":"...","url":"...","summary":"...","keyPoints":[]}, ...]'
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8125rem' }}
          />
          {importError && (
            <div className="text-error" style={{ fontSize: '0.8125rem', marginTop: '6px' }}>
              {importError}
            </div>
          )}
          {importResult && (
            <div className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '6px' }}>
              {importResult}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleCopyPrompt}
              disabled={!project}
              title={
                project
                  ? `Copies a prompt with this project's setup baked in (${project.name}), so the AI grounds the sources in the right brand`
                  : 'Loading project context…'
              }
            >
              {promptCopied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              {promptCopied
                ? 'Copied'
                : project
                ? `Copy AI prompt to generate sources for ${project.name}`
                : 'Copy AI prompt to generate sources'}
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => { setImportText(''); setImportError(null); setImportResult(null); }}
                disabled={importing}
              >
                Clear
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleBulkImport}
                disabled={importing || !importText.trim()}
              >
                {importing ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <KnowledgeSourceForm
          projectId={projectId}
          onCreated={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {sources === null && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
          <div className="spinner" />
        </div>
      )}

      {sources && sources.length === 0 && !showForm && (
        <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
          <BookOpen size={48} className="text-dim" style={{ marginBottom: '16px' }} />
          <h3>No knowledge sources yet</h3>
          <p className="text-muted" style={{ marginBottom: '24px' }}>
            Add at least one source so future drafts have something to ground in.
          </p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={18} /> Add your first source
          </button>
        </div>
      )}

      {sources && sources.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {sources.map((s) => {
            const Icon = s.type === 'url' ? LinkIcon : FileText;
            return (
              <div key={s.sourceId} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <Icon size={16} className="text-primary-light" />
                      <strong>{s.title}</strong>
                      <span className="badge" style={{ background: 'var(--surface-2)', fontSize: '0.6875rem' }}>
                        {s.type === 'url' ? 'URL' : 'TEXT'}
                      </span>
                    </div>
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noopener noreferrer"
                        className="text-muted" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: '8px' }}>
                        {s.url}
                      </a>
                    )}
                    {s.summary && (
                      <p style={{ fontSize: '0.875rem', marginBottom: '12px' }}>{s.summary}</p>
                    )}
                    {s.keyPoints.length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        <div className="text-dim" style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                          Key points
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.8125rem' }}>
                          {s.keyPoints.map((kp, i) => <li key={i}>{kp}</li>)}
                        </ul>
                      </div>
                    )}
                    {s.answerAngles.length > 0 && (
                      <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {s.answerAngles.map((a) => (
                          <span key={a} className="badge" style={{ background: 'rgba(124,58,237,0.12)', color: 'var(--primary-light)' }}>
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    className="btn-outline"
                    style={{ padding: '6px', color: 'var(--error)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                    onClick={() => handleDelete(s.sourceId)}
                    title="Delete source"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
