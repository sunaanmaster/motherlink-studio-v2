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
  Eye,
  EyeOff,
  FileCode,
  Globe,
  KeyRound,
  Link2,
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
  SLUG_HINT,
  SLUG_PATTERN,
  type HostedPage,
} from '@/lib/html-hosting/types';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function pageUrl(page: HostedPage): string {
  return `${publicBaseUrl()}${hostedPagePath(page.urlKey)}`;
}

interface UploadProgress {
  percent: number;
  label: string;
}

const UPLOAD_CONCURRENCY = 3;
const PART_ATTEMPTS = 3;

// fetch() cannot report upload progress, so parts go through XMLHttpRequest.
function putPart(url: string, body: Blob, token: string, onSent: (bytes: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => onSent(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Upload failed (${xhr.status})`;
      try {
        message = JSON.parse(xhr.responseText).error || message;
      } catch {}
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('Network error during upload. Check your connection and try again.'));
    xhr.send(body);
  });
}

function ProgressBar({ progress }: { progress: UploadProgress }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: 6 }}>
        <span>{progress.label}</span>
        <span className="mono">{Math.round(progress.percent)}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress.percent)}
        style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress.percent}%`,
            background: 'var(--primary)',
            transition: 'width 300ms linear',
          }}
        />
      </div>
    </div>
  );
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
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [deployedId, setDeployedId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Row actions
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [passwordEditId, setPasswordEditId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  // The current password of the page being edited, once the user asks to see it.
  const [shownPassword, setShownPassword] = useState<{ id: string; password: string | null } | null>(null);
  const [slugEditId, setSlugEditId] = useState<string | null>(null);
  const [slugDraft, setSlugDraft] = useState('');
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

    // The bar follows real bytes: what the browser has sent, plus a final share
    // of each part that is only credited once the server confirms it stored it.
    let shown = 0;
    const report = (percent: number, label: string) => {
      shown = Math.max(shown, Math.min(percent, 100)); // never move backwards (e.g. on a retry)
      setProgress({ percent: shown, label });
    };

    report(0, 'Preparing…');
    try {
      const compressed = await new Response(
        picked.stream().pipeThrough(new CompressionStream('gzip'))
      ).blob();
      report(2, 'Uploading…');

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

      const sent = new Array<number>(partCount).fill(0);
      const stored = new Array<boolean>(partCount).fill(false);
      const partBlob = (part: number) =>
        compressed.slice(part * UPLOAD_PART_BYTES, (part + 1) * UPLOAD_PART_BYTES);
      const reportUpload = () => {
        let credited = 0;
        for (let part = 0; part < partCount; part++) {
          const size = partBlob(part).size;
          credited += stored[part] ? size : Math.min(sent[part], size) * 0.85;
        }
        report(2 + (credited / compressed.size) * 94, 'Uploading…');
      };

      let nextPart = 0;
      const worker = async () => {
        while (nextPart < partCount) {
          const part = nextPart++;
          for (let attempt = 1; ; attempt++) {
            try {
              if (!firebaseUser) throw new Error('Not signed in.');
              await putPart(
                `/api/html-hosting/uploads/${uploadId}?part=${part}`,
                partBlob(part),
                await firebaseUser.getIdToken(),
                (bytes) => {
                  sent[part] = bytes;
                  reportUpload();
                }
              );
              break;
            } catch (err) {
              sent[part] = 0;
              if (attempt >= PART_ATTEMPTS) throw err;
            }
          }
          stored[part] = true;
          reportUpload();
        }
      };
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, partCount) }, worker));

      report(97, 'Finishing…');
      const { page } = await api(`/api/html-hosting/uploads/${uploadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: options.title, password: options.password || undefined }),
      });
      report(100, 'Done');
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

  const copyLink = async (page: HostedPage) => {
    await navigator.clipboard.writeText(pageUrl(page));
    setCopiedId(page.id);
    setTimeout(() => setCopiedId((current) => (current === page.id ? null : current)), 1500);
  };

  const handleSaveSlug = async (e: React.FormEvent, id: string, slug: string) => {
    e.preventDefault();
    const body = new FormData();
    body.set('slug', slug.trim().toLowerCase());
    if (await patchPage(id, body)) setSlugEditId(null);
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
    setShownPassword(null);
  };

  const toggleShownPassword = async (id: string) => {
    if (shownPassword?.id === id) {
      setShownPassword(null);
      return;
    }
    setError(null);
    try {
      const { password } = await api(`/api/html-hosting/${id}/password`);
      setShownPassword({ id, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
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

  const deployedPage = pages.find((p) => p.id === deployedId);

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
          <ProgressBar progress={{ ...progress, label: `Replacing file: ${progress.label}` }} />
        </div>
      )}

      {deployedPage && (
        <div className="alert alert-success" style={{ alignItems: 'center' }}>
          <Check size={16} style={{ flexShrink: 0 }} />
          <span className="mono" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pageUrl(deployedPage)}
          </span>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => copyLink(deployedPage)}>
            {copiedId === deployedPage.id ? <Check size={14} /> : <Copy size={14} />}
            <span style={{ marginLeft: 6 }}>{copiedId === deployedPage.id ? 'Copied' : 'Copy link'}</span>
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '20px' }}>
              {uploading && progress && <ProgressBar progress={progress} />}
              <button type="submit" className="btn btn-primary" disabled={uploading}>
                <Upload size={16} />
                <span style={{ marginLeft: 8 }}>{uploading ? 'Deploying…' : 'Deploy'}</span>
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
                          href={hostedPagePath(page.urlKey)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-dim mono"
                          style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          {hostedPagePath(page.urlKey)} <ExternalLink size={11} />
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
                            onClick={() => copyLink(page)}
                          >
                            {copiedId === page.id ? <Check size={15} /> : <Copy size={15} />}
                          </button>
                          {page.canManage && (
                            <>
                              <button
                                type="button"
                                className="btn btn-icon btn-outline"
                                title="Change the link"
                                disabled={busyId === page.id}
                                onClick={() => {
                                  setSlugDraft(page.slug ?? '');
                                  closePasswordEdit();
                                  setSlugEditId(slugEditId === page.id ? null : page.id);
                                }}
                              >
                                <Link2 size={15} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-icon btn-outline"
                                title={page.hasPassword ? 'Change or remove password' : 'Add a password'}
                                disabled={busyId === page.id}
                                onClick={() => {
                                  setNewPassword('');
                                  setShownPassword(null);
                                  setSlugEditId(null);
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
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}
                          >
                            {page.hasPassword && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: 'auto' }}>
                                <span className="text-dim" style={{ fontSize: '0.8125rem' }}>Current password:</span>
                                {shownPassword?.id !== page.id ? (
                                  <span className="mono">••••••••</span>
                                ) : shownPassword.password === null ? (
                                  <span className="text-dim" style={{ fontSize: '0.8125rem' }}>
                                    can&apos;t be shown. Set a new one to see it later.
                                  </span>
                                ) : (
                                  <span className="mono" style={{ userSelect: 'all' }}>{shownPassword.password}</span>
                                )}
                                <button
                                  type="button"
                                  className="btn btn-icon btn-outline"
                                  title={shownPassword?.id === page.id ? 'Hide password' : 'Show password'}
                                  onClick={() => toggleShownPassword(page.id)}
                                >
                                  {shownPassword?.id === page.id ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                              </div>
                            )}
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
                    {slugEditId === page.id && (
                      <tr>
                        <td colSpan={6}>
                          <form
                            onSubmit={(e) => handleSaveSlug(e, page.id, slugDraft)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}
                          >
                            <span className="text-dim" style={{ fontSize: '0.8125rem', marginRight: 'auto' }}>
                              Changing the link makes the current one stop working. Use {SLUG_HINT}.
                            </span>
                            <span className="mono text-dim" style={{ fontSize: '0.8125rem' }}>{hostedPagePath('')}</span>
                            <input
                              type="text"
                              value={slugDraft}
                              required
                              autoFocus
                              autoComplete="off"
                              spellCheck={false}
                              placeholder="my-page-name"
                              onChange={(e) => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                              style={{ maxWidth: '260px' }}
                            />
                            <button
                              type="submit"
                              className="btn btn-primary"
                              disabled={busyId === page.id || !SLUG_PATTERN.test(slugDraft) || slugDraft === page.slug}
                            >
                              Save link
                            </button>
                            {page.slug && (
                              <button
                                type="button"
                                className="btn btn-outline"
                                disabled={busyId === page.id}
                                onClick={(e) => handleSaveSlug(e, page.id, '')}
                              >
                                Use default link
                              </button>
                            )}
                            <button type="button" className="btn btn-ghost" onClick={() => setSlugEditId(null)}>
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
