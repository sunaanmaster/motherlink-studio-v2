'use client';

// ============================================================
// ArrayInput — chip-style input for string[] fields
// e.g. target subreddits, keywords, forbidden phrases
// ============================================================

import React, { useState } from 'react';
import { X } from 'lucide-react';

interface ArrayInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  transform?: (raw: string) => string;
}

export default function ArrayInput({ value, onChange, placeholder, transform }: ArrayInputProps) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const cleaned = (transform ? transform(draft) : draft).trim();
    if (!cleaned) return;
    if (value.includes(cleaned)) {
      setDraft('');
      return;
    }
    onChange([...value, cleaned]);
    setDraft('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const remove = (item: string) => onChange(value.filter((v) => v !== item));

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        padding: '8px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-2)',
        minHeight: '44px',
        alignItems: 'center',
      }}
    >
      {value.map((item) => (
        <span
          key={item}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            background: 'rgba(124, 58, 237, 0.15)',
            color: 'var(--primary-light)',
            borderRadius: '6px',
            fontSize: '0.8125rem',
          }}
        >
          {item}
          <button
            type="button"
            onClick={() => remove(item)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex' }}
            aria-label={`Remove ${item}`}
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : ''}
        style={{
          flex: 1,
          minWidth: '120px',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          padding: '4px',
          color: 'var(--text-main)',
          fontSize: '0.9375rem',
        }}
      />
    </div>
  );
}
