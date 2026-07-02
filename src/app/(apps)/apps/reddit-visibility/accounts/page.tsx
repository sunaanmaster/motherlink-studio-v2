'use client';

// ============================================================
// Reddit Visibility — Accounts
//
// The Reddit identities the tool can post FROM. No credentials are stored: the
// login lives in the account's AdsPower browser profile, which the local agent
// opens (by AdsPower profile ID) to post. `username` is only used to verify the
// right account is open. This page manages that mapping + the behavioral rails.
// ============================================================

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import {
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  accountPostGate,
  subscribeAgentStatus,
} from '@/lib/reddit-visibility/firestore';
import type {
  RedditAccount,
  RedditAccountStatus,
  RedditAgentStatus,
} from '@/lib/reddit-visibility/types';
import { Plus, Users, Trash2, Pencil, X, KeyRound } from 'lucide-react';

const STATUSES: RedditAccountStatus[] = ['active', 'warming', 'flagged', 'banned'];

const STATUS_BADGE: Record<RedditAccountStatus, string> = {
  active: 'badge-success',
  warming: 'badge-warning',
  flagged: 'badge-warning',
  banned: 'badge',
};

interface FormState {
  label: string;
  username: string;
  adsPowerProfileId: string;
  status: RedditAccountStatus;
  dailyCap: number;
  minIntervalMinutes: number;
  karma: number;
  notes: string;
}

const EMPTY_FORM: FormState = {
  label: '',
  username: '',
  adsPowerProfileId: '',
  status: 'warming',
  dailyCap: 5,
  minIntervalMinutes: 45,
  karma: 0,
  notes: '',
};

export default function AccountsPage() {
  const { userProfile, userRole } = useAuth();
  const [accounts, setAccounts] = useState<RedditAccount[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<RedditAgentStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const reload = () => listAccounts().then(setAccounts).catch(console.error);
  useEffect(() => {
    reload();
    const unsub = subscribeAgentStatus(setAgent);
    // Tick so "online" flips to "offline" if the heartbeat goes stale.
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []);

  // Online = heartbeat seen within the last 20s (agent polls every ~5s).
  const agentSeenMs = agent?.lastSeenAt?.getTime?.() ?? 0;
  const agentOnline = agentSeenMs > 0 && now - agentSeenMs < 20000;

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  };

  const openEdit = (a: RedditAccount) => {
    setEditingId(a.accountId);
    setForm({
      label: a.label,
      username: a.username,
      adsPowerProfileId: a.adsPowerProfileId ?? '',
      status: a.status,
      dailyCap: a.dailyCap,
      minIntervalMinutes: a.minIntervalMinutes,
      karma: a.karma,
      notes: a.notes,
    });
    setError(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!userProfile || !userRole) return;
    if (!form.label.trim() || !form.adsPowerProfileId.trim()) {
      setError('Label and AdsPower profile ID are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updateAccount(editingId, {
          label: form.label.trim(),
          username: form.username.trim().replace(/^u\//i, ''),
          adsPowerProfileId: form.adsPowerProfileId.trim(),
          status: form.status,
          dailyCap: Number(form.dailyCap) || 1,
          minIntervalMinutes: Number(form.minIntervalMinutes) || 0,
          karma: Number(form.karma) || 0,
          notes: form.notes.trim(),
        });
      } else {
        await createAccount({
          label: form.label.trim(),
          username: form.username.trim().replace(/^u\//i, ''),
          adsPowerProfileId: form.adsPowerProfileId.trim(),
          status: form.status,
          dailyCap: Number(form.dailyCap) || 1,
          minIntervalMinutes: Number(form.minIntervalMinutes) || 0,
          postCountToday: 0,
          postCountResetAt: new Date(),
          lastPostAt: null,
          karma: Number(form.karma) || 0,
          notes: form.notes.trim(),
          createdBy: userProfile.uid,
          createdByName: userProfile.email,
        });
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (a: RedditAccount) => {
    if (!confirm(`Delete account "${a.label}"? This does not delete any posted replies.`)) return;
    await deleteAccount(a.accountId);
    await reload();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div>
          <h1 style={{ marginBottom: '4px' }}>Accounts</h1>
          <p className="text-muted">
            Reddit identities the tool can post from. Each account posts through its own
            AdsPower browser profile on its own sticky IP — no passwords are stored here.
          </p>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '8px',
              padding: '5px 12px',
              borderRadius: '999px',
              fontSize: '0.75rem',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
            }}
            title={
              agentOnline
                ? 'The local posting agent is running and polling.'
                : 'The posting agent is not running. Start it (pm2 / menu bar) and keep AdsPower open.'
            }
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: agentOnline ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)',
                boxShadow: agentOnline ? '0 0 6px var(--success, #22c55e)' : 'none',
              }}
            />
            {agentOnline ? (
              <>
                <strong>Posting agent online</strong>
                <span className="text-dim">
                  · {agent?.queued ?? 0} queued · {agent?.postedSession ?? 0} posted this session
                  {agent?.dryRun ? ' · DRY-RUN' : ''}
                </span>
              </>
            ) : (
              <>
                <strong style={{ color: 'var(--error, #ef4444)' }}>Posting agent offline</strong>
                <span className="text-dim">· start it + keep AdsPower open, or replies just queue</span>
              </>
            )}
          </div>
        </div>
        <button onClick={openCreate} className="btn btn-primary">
          <Plus size={18} /> Add account
        </button>
      </div>

      {error && !showForm && (
        <div className="alert alert-warning" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ marginBottom: 0 }}>{editingId ? 'Edit account' : 'New account'}</h3>
            <button onClick={() => setShowForm(false)} className="btn btn-outline" style={{ padding: '4px 10px' }}>
              <X size={14} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8125rem' }}>
              Label
              <input
                className="input"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Growth – budgetlee"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8125rem' }}>
              Reddit username
              <input
                className="input"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="budgetlee_app"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8125rem' }}>
              AdsPower profile ID
              <input
                className="input"
                value={form.adsPowerProfileId}
                onChange={(e) => setForm({ ...form, adsPowerProfileId: e.target.value })}
                placeholder="e.g. k1abcd23"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8125rem' }}>
              Status
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as RedditAccountStatus })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8125rem' }}>
              Daily cap (posts / 24h)
              <input
                type="number"
                min={1}
                className="input"
                value={form.dailyCap}
                onChange={(e) => setForm({ ...form, dailyCap: Number(e.target.value) })}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8125rem' }}>
              Min interval (minutes)
              <input
                type="number"
                min={0}
                className="input"
                value={form.minIntervalMinutes}
                onChange={(e) => setForm({ ...form, minIntervalMinutes: Number(e.target.value) })}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8125rem' }}>
              Karma (manual)
              <input
                type="number"
                className="input"
                value={form.karma}
                onChange={(e) => setForm({ ...form, karma: Number(e.target.value) })}
              />
            </label>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8125rem', marginTop: '14px' }}>
            Notes
            <textarea
              className="input"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Followed subs, persona, anything to remember."
            />
          </label>

          <div
            className="text-dim"
            style={{
              marginTop: '14px',
              padding: '10px 12px',
              background: 'var(--surface-2)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              lineHeight: 1.6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <KeyRound size={12} /> How posting works for this account:
            </div>
            Posting is done by the <strong>local agent</strong> (runs on your Mac next to
            AdsPower). It opens the <strong>AdsPower profile ID</strong> (required) and types +
            submits the reply. No passwords are stored here — the login lives in the profile.
            <strong>Reddit username</strong> is optional but recommended: the agent checks the
            open profile is logged in as that handle and <strong>aborts if not</strong> (your
            wrong-account safeguard). Use the exact handle, no email. See{' '}
            <code>REDDIT_POSTING_SETUP.md</code>.
          </div>

          {error && (
            <div className="alert alert-warning" style={{ marginTop: '14px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary">
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create account'}
            </button>
            <button onClick={() => setShowForm(false)} className="btn btn-outline">
              Cancel
            </button>
          </div>
        </div>
      )}

      {accounts === null && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
          <div className="spinner" />
        </div>
      )}

      {accounts && accounts.length === 0 && !showForm && (
        <div className="card" style={{ textAlign: 'center', padding: '64px' }}>
          <Users size={48} className="text-dim" style={{ marginBottom: '16px' }} />
          <h3>No accounts yet</h3>
          <p className="text-muted" style={{ marginBottom: '24px' }}>
            Add the Reddit accounts you&apos;ll post value/brand replies from.
          </p>
          <button onClick={openCreate} className="btn btn-primary">
            <Plus size={18} /> Add your first account
          </button>
        </div>
      )}

      {accounts && accounts.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '20px',
          }}
        >
          {accounts.map((a) => {
            const gate = accountPostGate(a, Date.now());
            return (
              <div key={a.accountId} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <h3 style={{ marginBottom: '2px' }}>{a.label}</h3>
                    <div className="text-dim" style={{ fontSize: '0.8125rem' }}>u/{a.username}</div>
                  </div>
                  <span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status.toUpperCase()}</span>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '0.75rem', marginBottom: '12px' }}>
                  <span className="badge" style={{ background: 'var(--surface-2)' }}>
                    {gate.remainingToday}/{a.dailyCap} left today
                  </span>
                  <span className="badge" style={{ background: 'var(--surface-2)' }}>
                    {a.minIntervalMinutes}m gap
                  </span>
                  <span className="badge" style={{ background: 'var(--surface-2)' }}>{a.karma} karma</span>
                  <span className="badge" style={{ background: 'var(--surface-2)' }}>
                    {a.adsPowerProfileId ? `profile: ${a.adsPowerProfileId}` : 'no profile id'}
                  </span>
                </div>

                {!gate.ok && (
                  <div className="text-warning" style={{ fontSize: '0.75rem', marginBottom: '12px' }}>
                    {gate.reason}
                  </div>
                )}
                {a.lastPostAt && (
                  <div className="text-dim" style={{ fontSize: '0.6875rem', marginBottom: '12px' }}>
                    Last post: {a.lastPostAt.toLocaleString()}
                  </div>
                )}
                {a.notes && (
                  <p className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '12px' }}>
                    {a.notes}
                  </p>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => openEdit(a)} className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                    <Pencil size={12} /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(a)}
                    className="btn btn-outline"
                    style={{ padding: '4px 10px', fontSize: '0.75rem', color: 'var(--error)' }}
                  >
                    <Trash2 size={12} /> Delete
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
