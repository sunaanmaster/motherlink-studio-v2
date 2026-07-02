'use client';

// ============================================================
// Login Page — DFD Process 1.0: Authenticate User
// ============================================================

import React, { useState, Suspense } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import Link from 'next/link';

function BrandWordmark({ width = 160 }: { width?: number }) {
  return (
    <span className="brand-wordmark" style={{ width }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo-dark" src="/logo/dark.svg" alt="ML Studio" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo-light" src="/logo/light.svg" alt="ML Studio" />
    </span>
  );
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectError = searchParams.get('error');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(email, password);
      router.push('/');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card auth-card" style={{ padding: 32 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: 28,
        }}
      >
        <BrandWordmark width={140} />
      </div>

      <h2 style={{ textAlign: 'center', marginBottom: 4, fontSize: 20 }}>Sign in</h2>
      <p
        className="text-muted"
        style={{ textAlign: 'center', marginBottom: 24, fontSize: 13 }}
      >
        Enter your credentials to continue
      </p>

      {redirectError === 'account_suspended' && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <AlertCircle size={14} strokeWidth={1.75} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>Your account has been suspended. Please contact an admin.</span>
        </div>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <AlertCircle size={14} strokeWidth={1.75} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label className="label">Email</label>
          <div style={{ position: 'relative' }}>
            <Mail
              size={14}
              strokeWidth={1.75}
              style={{
                position: 'absolute',
                left: 11,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-dim)',
              }}
            />
            <input
              type="email"
              placeholder="name@motherlink.io"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ paddingLeft: 32 }}
            />
          </div>
        </div>

        <div className="input-group">
          <label className="label">Password</label>
          <div style={{ position: 'relative' }}>
            <Lock
              size={14}
              strokeWidth={1.75}
              style={{
                position: 'absolute',
                left: 11,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-dim)',
              }}
            />
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ paddingLeft: 32 }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <Link
            href="/login/reset"
            style={{
              fontSize: 12.5,
              color: 'var(--text-muted)',
              textDecoration: 'none',
            }}
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-lg"
          style={{ width: '100%' }}
          disabled={loading}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div
        style={{
          marginTop: 28,
          paddingTop: 20,
          borderTop: '1px solid var(--border)',
          textAlign: 'center',
          fontSize: 12.5,
          color: 'var(--text-muted)',
        }}
      >
        Don&apos;t have an account?{' '}
        <span style={{ color: 'var(--text-dim)' }}>Contact an admin for an invitation.</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="auth-container">
      <Suspense fallback={<div className="spinner" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
