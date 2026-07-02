'use client';

// ============================================================
// KnowledgeSourceForm — inline form for adding a new source
// ============================================================

import React, { useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { createSource } from '@/lib/reddit-visibility/firestore';
import { writeActivityLog } from '@/lib/firebase/firestore';
import { LogAction, LogSeverity } from '@/lib/types';
import type { RedditSource, RedditSourceType } from '@/lib/reddit-visibility/types';
import ArrayInput from './ArrayInput';

interface Props {
  projectId: string;
  onCreated: (source: RedditSource) => void;
  onCancel: () => void;
}

export default function KnowledgeSourceForm({ projectId, onCreated, onCancel }: Props) {
  const { userProfile, userRole } = useAuth();
  const [type, setType] = useState<RedditSourceType>('url');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [summary, setSummary] = useState('');
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [answerAngles, setAnswerAngles] = useState<string[]>([]);
  const [relatedProblems, setRelatedProblems] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !userRole) return;
    setSubmitting(true);

    const payload = {
      projectId,
      type,
      title: title.trim(),
      url: type === 'url' && url.trim() ? url.trim() : null,
      rawContent: rawContent.trim(),
      summary: summary.trim(),
      keyPoints,
      answerAngles,
      relatedProblems,
      createdBy: userProfile.uid,
    };

    try {
      const id = await createSource(payload);
      await writeActivityLog(
        userProfile.uid,
        userProfile.email,
        userRole.slug,
        LogAction.REDDIT_SOURCE_ADDED,
        'reddit_source',
        id,
        payload.title,
        { projectId },
        LogSeverity.INFO
      );
      onCreated({
        ...payload,
        sourceId: id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="card" style={{ marginBottom: '24px' }}>
      <h3 style={{ marginBottom: '16px' }}>Add knowledge source</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '20px' }}>
        <div className="input-group">
          <label className="label">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as RedditSourceType)}>
            <option value="url">URL</option>
            <option value="pasted_text">Pasted text</option>
          </select>
        </div>
        <div className="input-group">
          <label className="label">Title <span className="text-error">*</span></label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Pricing page" />
        </div>
      </div>

      {type === 'url' && (
        <div className="input-group">
          <label className="label">URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://acme.com/pricing"
          />
        </div>
      )}

      <div className="input-group">
        <label className="label">{type === 'url' ? 'Raw content (optional, for reference)' : 'Pasted content'}</label>
        <textarea
          value={rawContent}
          onChange={(e) => setRawContent(e.target.value)}
          rows={4}
          placeholder={type === 'url' ? 'Paste the page text here if you want to reference it later' : 'Paste the content the AI should know about'}
        />
      </div>

      <div className="input-group">
        <label className="label">Summary</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          placeholder="A one-paragraph summary of what this source says."
        />
      </div>

      <div className="input-group">
        <label className="label">Key points</label>
        <ArrayInput
          value={keyPoints}
          onChange={setKeyPoints}
          placeholder="Type a key point, press Enter"
        />
      </div>

      <div className="input-group">
        <label className="label">Useful answer angles</label>
        <ArrayInput
          value={answerAngles}
          onChange={setAnswerAngles}
          placeholder="An angle this source supports on Reddit"
        />
      </div>

      <div className="input-group">
        <label className="label">Related customer problems</label>
        <ArrayInput
          value={relatedProblems}
          onChange={setRelatedProblems}
          placeholder="A problem customers describe that this addresses"
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button type="button" className="btn btn-outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting || !title.trim()}>
          {submitting ? 'Saving…' : 'Add source'}
        </button>
      </div>
    </form>
  );
}
