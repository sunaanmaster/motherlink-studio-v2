'use client';

// ============================================================
// Image Generator Placeholder — prompt + Generate button (no real generation yet)
// ============================================================

import React, { useState } from 'react';
import { Sparkles, Image as ImageIcon, Wand2 } from 'lucide-react';

export default function ImageGeneratorPlaceholder() {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [showPlaceholder, setShowPlaceholder] = useState(false);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setGenerating(true);
    setShowPlaceholder(false);
    // Simulate work, then show a placeholder card. Real generation will be wired up later.
    setTimeout(() => {
      setGenerating(false);
      setShowPlaceholder(true);
    }, 900);
  };

  return (
    <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '32px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {!showPlaceholder && !generating && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', flex: 1, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ background: 'rgba(124, 58, 237, 0.1)', padding: '20px', borderRadius: 'var(--radius-lg)', color: 'var(--primary-light)' }}>
              <Sparkles size={32} />
            </div>
            <div>
              <h3 style={{ marginBottom: '4px', color: 'var(--text-main)' }}>Describe an image</h3>
              <p style={{ fontSize: '0.875rem', maxWidth: '420px' }}>
                Type a prompt below and hit Generate. The actual generation engine will be connected in a future release.
              </p>
            </div>
          </div>
        )}

        {generating && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', flex: 1, color: 'var(--text-muted)' }}>
            <div className="spinner" />
            <span style={{ fontSize: '0.875rem' }}>Working on it…</span>
          </div>
        )}

        {showPlaceholder && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', flex: 1, textAlign: 'center' }}>
            <div style={{
              width: '320px',
              maxWidth: '100%',
              aspectRatio: '1 / 1',
              background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(59, 130, 246, 0.15))',
              border: '1px dashed var(--border-hover)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-dim)',
            }}>
              <ImageIcon size={48} />
            </div>
            <div style={{ maxWidth: '420px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Image generation isn't wired up yet. Your prompt was received — the model integration will land soon.
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
              "{prompt}"
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleGenerate} style={{ padding: '20px 24px', borderTop: '1px solid var(--border)', background: 'rgba(0, 0, 0, 0.2)', display: 'flex', gap: '12px' }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A futuristic city at golden hour, ultra detailed, cinematic lighting…"
          rows={2}
          style={{
            flex: 1,
            resize: 'none',
            padding: '12px 14px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-main)',
            fontFamily: 'inherit',
            fontSize: '0.9375rem',
            lineHeight: 1.4,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          className="btn btn-primary"
          style={{ alignSelf: 'stretch', padding: '0 20px', minWidth: '140px' }}
          disabled={!prompt.trim() || generating}
        >
          <Wand2 size={18} />
          {generating ? 'Generating…' : 'Generate'}
        </button>
      </form>
    </div>
  );
}
