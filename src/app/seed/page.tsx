'use client';

// ============================================================
// Seed Page — Initialize / Repair Firebase Database
// ============================================================

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { runSeed, getSeedState, type SeedState } from '@/lib/firebase/seed';
import { signupWithEmail } from '@/lib/firebase/auth';
import { useAuth } from '@/lib/context/AuthContext';
import { AlertCircle, CheckCircle2, Database, ShieldAlert, Wrench } from 'lucide-react';

export default function SeedPage() {
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const [stateLoading, setStateLoading] = useState(true);
  const [seedState, setSeedState] = useState<SeedState | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    async function loadState() {
      try {
        const s = await getSeedState(firebaseUser?.uid);
        setSeedState(s);
      } catch (e) {
        console.error('Failed to read seed state', e);
      } finally {
        setStateLoading(false);
      }
    }
    loadState();
  }, [firebaseUser?.uid]);

  const isFresh = seedState && !seedState.rolesSeeded && !seedState.featuresSeeded && !seedState.settingsSeeded;
  const needsRepair = seedState && (!seedState.featuresSeeded || !seedState.settingsSeeded || !seedState.rolesSeeded);
  const fullyComplete = seedState && seedState.rolesSeeded && seedState.featuresSeeded && seedState.settingsSeeded;

  useEffect(() => {
    if (!stateLoading && fullyComplete && !result) {
      router.replace('/');
    }
  }, [stateLoading, fullyComplete, result, router]);

  const handleFreshSeed = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const user = await signupWithEmail(email, password, 'Super Admin');
      const { seeded, skipped } = await runSeed(user.uid, email);
      setResult({
        success: true,
        message: `Initialized successfully. Seeded: ${seeded.join(', ') || 'none'}${skipped.length ? `. Skipped: ${skipped.join(', ')}` : ''}.`,
      });
    } catch (err: any) {
      console.error('Seed error:', err);
      setResult({ success: false, message: err.message || 'Initialization failed.' });
    } finally {
      setLoading(false);
    }
  };

  const handleRepair = async () => {
    setLoading(true);
    setResult(null);
    try {
      const uid = firebaseUser?.uid || 'system-repair';
      const e = firebaseUser?.email || 'admin@motherlink.io';
      const { seeded, skipped } = await runSeed(uid, e);
      const refreshed = await getSeedState(firebaseUser?.uid);
      setSeedState(refreshed);
      setResult({
        success: true,
        message: `Repair complete. Seeded: ${seeded.join(', ') || 'nothing missing'}${skipped.length ? `. Skipped: ${skipped.join(', ')}` : ''}.`,
      });
    } catch (err: any) {
      console.error('Repair error:', err);
      setResult({ success: false, message: err.message || 'Repair failed.' });
    } finally {
      setLoading(false);
    }
  };

  if (stateLoading) {
    return (
      <div className="auth-container">
        <div className="card auth-card" style={{ textAlign: 'center' }}>
          <div className="spinner" />
          <p className="text-muted" style={{ marginTop: '16px' }}>Inspecting database…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="card auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--warning)', marginBottom: '16px' }}>
          <ShieldAlert size={28} />
          <h2 style={{ marginBottom: 0 }}>Database Setup</h2>
        </div>

        {seedState && (
          <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '8px' }}>Current state</div>
            <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-muted)' }}>
              <li>Roles: {seedState.rolesSeeded ? '✓ seeded' : '✗ missing'}</li>
              <li>Features: {seedState.featuresSeeded ? '✓ seeded' : '✗ missing'}</li>
              <li>System settings: {seedState.settingsSeeded ? '✓ seeded' : '✗ missing'}</li>
              {firebaseUser && <li>Super admin profile: {seedState.superAdminExists ? '✓ exists' : '✗ missing'}</li>}
            </ul>
          </div>
        )}

        {result && (
          <div style={{
            padding: '12px 16px',
            marginBottom: '20px',
            borderRadius: 'var(--radius-md)',
            background: result.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: result.success ? 'var(--success)' : 'var(--error)',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
            fontSize: '0.875rem',
          }}>
            {result.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{result.message}</span>
          </div>
        )}

        {fullyComplete && !result && (
          <>
            <p className="text-muted" style={{ marginBottom: '24px' }}>
              All required collections are seeded. You can go to the dashboard.
            </p>
            <a href="/" className="btn btn-primary" style={{ width: '100%', textDecoration: 'none' }}>Go to Dashboard</a>
          </>
        )}

        {isFresh && !result?.success && (
          <>
            <p className="text-muted" style={{ marginBottom: '20px' }}>
              First-time setup. Create the Super Admin account and seed the database.
            </p>
            <form onSubmit={handleFreshSeed}>
              <div className="input-group">
                <label className="label">Super Admin Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@motherlink.io" required />
              </div>
              <div className="input-group">
                <label className="label">Super Admin Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 6 characters" required minLength={6} />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '48px', background: 'var(--warning)', color: 'black' }} disabled={loading}>
                <Database size={18} /> {loading ? 'Initializing…' : 'Initialize Platform'}
              </button>
            </form>
          </>
        )}

        {!isFresh && needsRepair && !result?.success && (
          <>
            <p className="text-muted" style={{ marginBottom: '20px' }}>
              Some collections are missing. Click below to seed only what's missing — your existing data will not be touched.
            </p>
            <button onClick={handleRepair} className="btn btn-primary" style={{ width: '100%', height: '48px' }} disabled={loading}>
              <Wrench size={18} /> {loading ? 'Repairing…' : 'Repair Database'}
            </button>
          </>
        )}

        {result?.success && (
          <a href="/" className="btn btn-primary" style={{ width: '100%', textDecoration: 'none', marginTop: '16px' }}>
            Go to Dashboard
          </a>
        )}
      </div>
    </div>
  );
}
