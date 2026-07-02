'use client';

// ============================================================
// ProjectForm — shared by /new and /[projectId]/edit
// ============================================================

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardPaste, ChevronDown, ChevronUp, Copy, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { writeActivityLog } from '@/lib/firebase/firestore';
import { LogAction, LogSeverity } from '@/lib/types';
import { createProject, updateProject } from '@/lib/reddit-visibility/firestore';
import { buildProjectImportPrompt } from '@/lib/reddit-visibility/import-prompts';
import type { RedditProject } from '@/lib/reddit-visibility/types';
import ArrayInput from './ArrayInput';

interface Props {
  initial?: RedditProject;
}

export default function ProjectForm({ initial }: Props) {
  const { userProfile, userRole } = useAuth();
  const router = useRouter();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? '');
  const [websiteUrl, setWebsiteUrl] = useState(initial?.websiteUrl ?? '');
  const [companyDescription, setCompanyDescription] = useState(initial?.companyDescription ?? '');
  const [targetCustomer, setTargetCustomer] = useState(initial?.targetCustomer ?? '');
  const [productService, setProductService] = useState(initial?.productService ?? '');
  const [targetSubreddits, setTargetSubreddits] = useState<string[]>(initial?.targetSubreddits ?? []);
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? []);
  const [brandMentionStyle, setBrandMentionStyle] = useState(initial?.brandMentionStyle ?? '');
  const [forbiddenPhrases, setForbiddenPhrases] = useState<string[]>(initial?.forbiddenPhrases ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bulk import (paste JSON, fill all fields)
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  // Identifier baked into the copied prompt so the AI doesn't mix this
  // request up with other businesses the user has discussed in the chat.
  const [promptCompanyId, setPromptCompanyId] = useState('');

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildProjectImportPrompt(promptCompanyId));
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch (err) {
      console.error('Clipboard write failed:', err);
    }
  };

  const normalizeSubreddit = (raw: string) =>
    raw.replace(/^\/?r\//i, '').replace(/[^a-z0-9_]/gi, '').toLowerCase();

  const asString = (v: unknown) => (typeof v === 'string' ? v : '');
  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];

  const handleImport = () => {
    setImportError(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setImportError('Invalid JSON. Check for missing quotes or commas.');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setImportError('JSON must be an object with project fields.');
      return;
    }

    // Apply each field if present. Unknown fields ignored silently.
    if ('name' in parsed) setName(asString(parsed.name));
    if ('websiteUrl' in parsed) setWebsiteUrl(asString(parsed.websiteUrl));
    if ('companyDescription' in parsed) setCompanyDescription(asString(parsed.companyDescription));
    if ('targetCustomer' in parsed) setTargetCustomer(asString(parsed.targetCustomer));
    if ('productService' in parsed) setProductService(asString(parsed.productService));
    if ('brandMentionStyle' in parsed) setBrandMentionStyle(asString(parsed.brandMentionStyle));
    if ('targetSubreddits' in parsed) {
      setTargetSubreddits(asStringArray(parsed.targetSubreddits).map(normalizeSubreddit).filter(Boolean));
    }
    if ('keywords' in parsed) setKeywords(asStringArray(parsed.keywords));
    if ('forbiddenPhrases' in parsed) setForbiddenPhrases(asStringArray(parsed.forbiddenPhrases));

    setImportOpen(false);
    setImportText('');
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !userRole) return;
    setSubmitting(true);
    setError(null);

    const payload = {
      name: name.trim(),
      websiteUrl: websiteUrl.trim(),
      companyDescription: companyDescription.trim(),
      targetCustomer: targetCustomer.trim(),
      productService: productService.trim(),
      targetSubreddits,
      keywords,
      brandMentionStyle: brandMentionStyle.trim(),
      forbiddenPhrases,
      status: initial?.status ?? ('active' as const),
      createdBy: initial?.createdBy ?? userProfile.uid,
      createdByName: initial?.createdByName ?? userProfile.displayName,
    };

    try {
      if (isEdit && initial) {
        await updateProject(initial.projectId, payload);
        await writeActivityLog(
          userProfile.uid,
          userProfile.email,
          userRole.slug,
          LogAction.REDDIT_PROJECT_UPDATED,
          'reddit_project',
          initial.projectId,
          payload.name,
          {},
          LogSeverity.INFO
        );
        router.push(`/apps/reddit-visibility/${initial.projectId}`);
      } else {
        const newId = await createProject(payload);
        await writeActivityLog(
          userProfile.uid,
          userProfile.email,
          userRole.slug,
          LogAction.REDDIT_PROJECT_CREATED,
          'reddit_project',
          newId,
          payload.name,
          {},
          LogSeverity.INFO
        );
        router.push(`/apps/reddit-visibility/${newId}`);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to save project. Check the console for details.');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <div style={{
        marginBottom: '20px',
        padding: '12px 16px',
        background: 'var(--surface-2)',
        borderRadius: 'var(--radius-md)',
        border: '1px dashed var(--border)',
      }}>
        <button
          type="button"
          onClick={() => setImportOpen((v) => !v)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-main)', fontSize: '0.875rem', fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: '8px', padding: 0,
          }}
        >
          <ClipboardPaste size={16} />
          Bulk import from JSON
          {importOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {importOpen && (
          <div style={{ marginTop: '12px' }}>
            <p className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '8px' }}>
              Paste an object with any of: <code>name</code>, <code>websiteUrl</code>, <code>companyDescription</code>, <code>targetCustomer</code>, <code>productService</code>, <code>targetSubreddits</code>, <code>keywords</code>, <code>brandMentionStyle</code>, <code>forbiddenPhrases</code>. Existing values are overwritten only for fields you include. Don&apos;t have the JSON yet? Copy the AI prompt below and run it through ChatGPT / Claude.
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={6}
              placeholder='{"name": "Plausible Analytics", "websiteUrl": "https://plausible.io", ...}'
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8125rem' }}
            />
            {importError && (
              <div className="text-error" style={{ fontSize: '0.8125rem', marginTop: '6px' }}>
                {importError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={promptCompanyId}
                  onChange={(e) => setPromptCompanyId(e.target.value)}
                  placeholder="Which company is this for? (name or URL)"
                  style={{ minWidth: '260px', fontSize: '0.8125rem' }}
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleCopyPrompt}
                  title="Copies a prompt with this company baked in, so the AI doesn't mix it up with other businesses you've discussed in the chat"
                >
                  {promptCopied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                  {promptCopied ? 'Copied' : 'Copy AI prompt to generate project'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => { setImportText(''); setImportError(null); }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleImport}
                  disabled={!importText.trim()}
                >
                  Fill form
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="input-group">
          <label className="label">Client name <span className="text-error">*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Acme Inc." />
        </div>
        <div className="input-group">
          <label className="label">Client website</label>
          <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://acme.com" />
        </div>
      </div>

      <div className="input-group">
        <label className="label">Short company description</label>
        <textarea
          value={companyDescription}
          onChange={(e) => setCompanyDescription(e.target.value)}
          rows={2}
          placeholder="One or two lines on what the company does."
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="input-group">
          <label className="label">Target customer</label>
          <input
            value={targetCustomer}
            onChange={(e) => setTargetCustomer(e.target.value)}
            placeholder="Solo founders building SaaS"
          />
        </div>
        <div className="input-group">
          <label className="label">Main product or service</label>
          <input
            value={productService}
            onChange={(e) => setProductService(e.target.value)}
            placeholder="AI-powered SEO writing tool"
          />
        </div>
      </div>

      <div className="input-group">
        <label className="label">Target subreddits</label>
        <ArrayInput
          value={targetSubreddits}
          onChange={setTargetSubreddits}
          placeholder="Type a subreddit, press Enter (r/ prefix optional)"
          transform={normalizeSubreddit}
        />
      </div>

      <div className="input-group">
        <label className="label">Keywords / problems to monitor</label>
        <ArrayInput
          value={keywords}
          onChange={setKeywords}
          placeholder="Type a keyword, press Enter"
        />
      </div>

      <div className="input-group">
        <label className="label">Brand mention style</label>
        <textarea
          value={brandMentionStyle}
          onChange={(e) => setBrandMentionStyle(e.target.value)}
          rows={2}
          placeholder="When and how the client should be mentioned. E.g. 'Only mention when directly relevant; never link in first reply.'"
        />
      </div>

      <div className="input-group">
        <label className="label">Forbidden claims / phrases</label>
        <ArrayInput
          value={forbiddenPhrases}
          onChange={setForbiddenPhrases}
          placeholder="Type a phrase to avoid, press Enter"
        />
      </div>

      {error && (
        <div className="text-error" style={{ marginBottom: '16px' }}>{error}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => router.back()}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting || !name.trim()}
        >
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create project'}
        </button>
      </div>
    </form>
  );
}
