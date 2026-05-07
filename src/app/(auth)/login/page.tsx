'use client';

// ============================================================
// Login Page — DFD Process 1.0: Authenticate User
// ============================================================

import React, { useState, Suspense } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import Link from 'next/link';

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
    <div className="card auth-card">
      <div className="logo-section" style={{ marginBottom: '24px', justifyContent: 'center' }}>
        <span>Motherlink.io</span>
      </div>
      
      <h2 style={{ textAlign: 'center', marginBottom: '8px' }}>Sign In</h2>
      <p className="text-muted" style={{ textAlign: 'center', marginBottom: '32px' }}>
        Enter your credentials to access the AI platform
      </p>

      {redirectError === 'account_suspended' && (
        <div className="badge badge-error" style={{ width: '100%', padding: '12px', marginBottom: '20px', borderRadius: 'var(--radius-md)' }}>
          <AlertCircle size={16} />
          <span>Your account has been suspended. Please contact an admin.</span>
        </div>
      )}

      {error && (
        <div className="badge badge-error" style={{ width: '100%', padding: '12px', marginBottom: '20px', borderRadius: 'var(--radius-md)' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label className="label">Email Address</label>
          <div style={{ position: 'relative' }}>
            <Mail size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input
              type="email"
              placeholder="name@motherlink.io"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ paddingLeft: '44px' }}
            />
          </div>
        </div>

        <div className="input-group">
          <label className="label">Password</label>
          <div style={{ position: 'relative' }}>
            <Lock size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ paddingLeft: '44px' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
          <Link href="/login/reset" className="text-dim" style={{ fontSize: '0.875rem', textDecoration: 'none' }}>
            Forgot password?
          </Link>
        </div>

        <button 
          type="submit" 
          className="btn btn-primary" 
          style={{ width: '100%', height: '48px' }}
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div style={{ marginTop: '32px', textAlign: 'center', fontSize: '0.875rem' }} className="text-muted">
        Don't have an account? <span className="text-dim">Contact an admin for an invitation.</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="auth-container">
      <Suspense fallback={<div className="spinner"></div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
