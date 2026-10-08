'use client';

// ============================================================
// HTML Hosting — upload an .html file, get a shareable link,
// optionally behind a password. Talks to /api/html-hosting;
// pages are served publicly from /s/{id}.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  FileCode,
  Globe,
  KeyRound,
  Lock,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { publicBaseUrl } from '@/lib/utils/publicUrl';
import {
  hostedPagePath,
  MAX_HTML_BYTES,
  UPLOAD_PART_BYTES,
  MIN_PASSWORD_LENGTH,
  type HostedPage,
} from '@/lib/html-hosting/types';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function pageUrl(id: string): string {
  return `${publicBaseUrl()}${hostedPagePath(id)}`;
}

export default function HtmlHosting() {
  const { firebaseUser } = useAuth();
  const [pages, setPages] = useState<HostedPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload form
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [password, setPassword] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [deployedId, setDeployedId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Row actions
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [passwordEditId, setPasswordEditId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTargetId = useRef<string | null>(null);

  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      if (!firebaseUser) throw new Error('Not signed in.');
      const token = await firebaseUser.getIdToken();
      const res = await fetch(path, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      return data;
    },
    [firebaseUser]
  );

  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    api('/api/html-hosting')
      .then((data) => {
        if (!cancelled) setPages(data.pages);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, api]);

  // Gzips the file in the browser and sends it in parts, because a single
  // request to the server is capped at a few MB. Returns the saved page.
  const uploadFile = async (
    picked: File,
    options: { pageId?: string; title?: string; password?: string }
  ): Promise<HostedPage> => {
    if (!/\.html?$/i.test(picked.name)) throw new Error('Only .html files can be hosted.');
    if (picked.size > MAX_HTML_BYTES) {
      throw new Error(`File is too large (max ${MAX_HTML_BYTES / 1024 / 1024} MB).`);
    }
    if (typeof CompressionStream === 'undefined') {
      throw new Error('This browser is too old to upload files. Please update it and try again.');
    }

    setProgress(0);
    try {
      const compressed = await new Response(
        picked.stream().pipeThrough(new CompressionStream('gzip'))
      ).blob();

      const { uploadId, partCount } = await api('/api/html-hosting/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: picked.name,
          sizeBytes: picked.size,
          compressedBytes: compressed.size,
          pageId: options.pageId,
        }),
      });

      for (let part = 0; part < partCount; part++) {
        await api(`/api/html-hosting/uploads/${uploadId}?part=${part}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: compressed.slice(part * UPLOAD_PART_BYTES, (part + 1) * UPLOAD_PART_BYTES),
        });
        setProgress(Math.round(((part + 1) / partCount) * 100));
      }

      const { page } = await api(`/api/html-hosting/uploads/${uploadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: options.title, password: options.password || undefined }),
      });
      return page;
    } finally {
      setProgress(null);
    }
  };

  const pickFile = (picked: File | undefined) => {
    if (!picked) return;
    setError(null);
    setDeployedId(null);
    if (!/\.html?$/i.test(picked.name)) {
      setError('Only .html files can be hosted.');
      return;
    }
    if (picked.size > MAX_HTML_BYTES) {
      setError(`File is too large (max ${MAX_HTML_BYTES / 1024 / 1024} MB).`);
      return;
    }
    setFile(picked);
    setTitle(picked.name.replace(/\.html?$/i, ''));
  };

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const page = await uploadFile(file, { title, password });
      setPages((prev) => [page, ...prev]);
      setDeployedId(page.id);
      setFile(null);
      setTitle('');
      setPassword('');
      if (fileInput.current) fileInput.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const copyLink = async (id: string) => {
    await navigator.clipboard.writeText(pageUrl(id));
    setCopiedId(id);
    setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
  };

  const patchPage = async (id: string, body: FormData) => {
    setBusyId(id);
    setError(null);
    try {
      const { page } = await api(`/api/html-hosting/${id}`, { method: 'PATCH', body });
      setPages((prev) => prev.map((p) => (p.id === id ? page : p)));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const closePasswordEdit = () => {
    setPasswordEditId(null);
    setNewPassword('');
  };

  const handleSetPassword = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    const body = new FormData();
    body.set('password', newPassword);
    if (await patchPage(id, body)) closePasswordEdit();
  };

  const handleRemovePassword = async (id: string) => {
    const body = new FormData();
    body.set('removePassword', '1');
    if (await patchPage(id, body)) closePasswordEdit();
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    const id = replaceTargetId.current;
    e.target.value = '';
    if (!picked || !id) return;
    setBusyId(id);
    setError(null);
    try {
      const page = await uploadFile(picked, { pageId: id });
      setPages((prev) => prev.map((p) => (p.id === id ? page : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (page: HostedPage) => {
    if (!confirm(`Take down "${page.title}"? Its link will stop working.`)) return;
    setBusyId(page.id);
    setError(null);
    try {
      await api(`/api/html-hosting/${page.id}`, { method: 'DELETE' });
      setPages((prev) => prev.filter((p) => p.id !== page.id));
      if (deployedId === page.id) setDeployedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {error && (
        <div className="alert alert-error">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      {busyId && progress !== null && (
        <div className="alert alert-info">
          <span>Uploading replacement… {progress}%</span>
        </div>
      )}

      {deployedId && (
        <div className="alert alert-success" style={{ alignItems: 'center' }}>
          <Check size={16} style={{ flexShrink: 0 }} />
          <span className="mono" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pageUrl(deployedId)}
          </span>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => copyLink(deployedId)}>
            {copiedId === deployedId ? <Check size={14} /> : <Copy size={14} />}
            <span style={{ marginLeft: 6 }}>{copiedId === deployedId ? 'Copied' : 'Copy link'}</span>
          </button>
        </div>
      )}

      <form className="card" onSubmit={handleDeploy}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInput.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pickFile(e.dataTransfer.files[0]);
          }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            padding: '28px 16px',
            textAlign: 'center',
            cursor: 'pointer',
            border: `1px dashed ${dragging ? 'var(--primary)' : 'var(--border-hover)'}`,
            borderRadius: 'var(--radius-md)',
            background: dragging ? 'var(--primary-softer)' : 'transparent',
          }}
        >
          {file ? <FileCode size={24} className="text-primary" /> : <Upload size={24} className="text-dim" />}
          {file ? (
            <div>
              <div style={{ fontWeight: 500 }}>{file.name}</div>
              <div className="text-dim" style={{ fontSize: '0.8125rem' }}>{formatSize(file.size)} · click to choose another</div>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 500 }}>Drop an HTML file here, or click to browse</div>
              <div className="text-dim" style={{ fontSize: '0.8125rem' }}>
                Single .html file, up to {MAX_HTML_BYTES / 1024 / 1024} MB
              </div>
            </div>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".html,.htm,text/html"
            style={{ display: 'none' }}
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </div>

        {file && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="input-group">
                <label className="label" htmlFor="html-hosting-title">Title</label>
                <input
                  id="html-hosting-title"
                  type="text"
                  value={title}
                  maxLength={120}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label className="label" htmlFor="html-hosting-password">Password (optional)</label>
                <input
                  id="html-hosting-password"
                  type="text"
                  value={password}
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="off"
                  placeholder="Leave blank for a public link"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={uploading}>
                <Upload size={16} />
                <span style={{ marginLeft: 8 }}>
                  {uploading ? (progress === null ? 'Deploying…' : `Uploading ${progress}%`) : 'Deploy'}
                </span>
              </button>
            </div>
          </div>
        )}
      </form>

      <div className="card" style={{ padding: 0, overflow: 'hidden', flexShrink: 0 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
            <div className="spinner" />
          </div>
        ) : pages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <Globe size={40} className="text-dim" style={{ marginBottom: '12px' }} />
            <p className="text-muted">No pages hosted yet.</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Access</th>
                  <th>Size</th>
                  <th>Uploaded by</th>
                  <th>Updated</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <React.Fragment key={page.id}>
                    <tr>
                      <td>
                        <div style={{ fontWeight: 500 }}>{page.title}</div>
                        <a
                          href={hostedPagePath(page.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-dim mono"
                          style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          {hostedPagePath(page.id)} <ExternalLink size={11} />
                        </a>
                      </td>
                      <td>
                        {page.hasPassword ? (
                          <span className="badge badge-warning"><Lock size={11} /> Password</span>
                        ) : (
                          <span className="badge badge-success">Public</span>
                        )}
                      </td>
                      <td className="text-dim">{formatSize(page.sizeBytes)}</td>
                      <td className="text-dim">{page.ownerName}</td>
                      <td className="text-dim">{new Date(page.updatedAt).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            type="button"
                            className="btn btn-icon btn-outline"
                            title="Copy link"
                            onClick={() => copyLink(page.id)}
                          >
                            {copiedId === page.id ? <Check size={15} /> : <Copy size={15} />}
                          </button>
                          {page.canManage && (
                            <>
                              <button
                                type="button"
                                className="btn btn-icon btn-outline"
                                title={page.hasPassword ? 'Change or remove password' : 'Add a password'}
                                disabled={busyId === page.id}
                                onClick={() => {
                                  setNewPassword('');
                                  setPasswordEditId(passwordEditId === page.id ? null : page.id);
                                }}
                              >
                                <KeyRound size={15} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-icon btn-outline"
                                title="Replace the HTML file (link stays the same)"
                                disabled={busyId === page.id}
                                onClick={() => {
                                  replaceTargetId.current = page.id;
                                  replaceInput.current?.click();
                                }}
                              >
                                <RefreshCw size={15} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-icon btn-danger"
                                title="Take down"
                                disabled={busyId === page.id}
                                onClick={() => handleDelete(page)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {passwordEditId === page.id && (
                      <tr>
                        <td colSpan={6}>
                          <form
                            onSubmit={(e) => handleSetPassword(e, page.id)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}
                          >
                            <input
                              type="text"
                              value={newPassword}
                              minLength={MIN_PASSWORD_LENGTH}
                              required
                              autoFocus
                              autoComplete="off"
                              placeholder={page.hasPassword ? 'New password' : 'Password'}
                              onChange={(e) => setNewPassword(e.target.value)}
                              style={{ maxWidth: '260px' }}
                            />
                            <button type="submit" className="btn btn-primary" disabled={busyId === page.id}>
                              {page.hasPassword ? 'Change password' : 'Set password'}
                            </button>
                            {page.hasPassword && (
                              <button
                                type="button"
                                className="btn btn-danger"
                                disabled={busyId === page.id}
                                onClick={() => handleRemovePassword(page.id)}
                              >
                                Remove password
                              </button>
                            )}
                            <button type="button" className="btn btn-ghost" onClick={closePasswordEdit}>
                              Cancel
                            </button>
                          </form>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <input
          ref={replaceInput}
          type="file"
          accept=".html,.htm,text/html"
          style={{ display: 'none' }}
          onChange={handleReplaceFile}
        />
      </div>
    </div>
  );
}
