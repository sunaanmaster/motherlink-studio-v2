'use client';

// ============================================================
// Password Reset — emails a reset link (Firebase)
// ============================================================

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle, Mail } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';

export default function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (err) {
      const code = (err as { code?: string }).code;
      // Don't reveal whether an address has an account.
      if (code === 'auth/user-not-found') setSent(true);
      else if (code === 'auth/invalid-email') setError('Enter a valid email address.');
      else if (code === 'auth/too-many-requests') setError('Too many attempts. Wait a few minutes and try again.');
      else setError('Could not send the reset email. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="card auth-card" style={{ padding: 32 }}>
        <h2 style={{ textAlign: 'center', marginBottom: 4, fontSize: 20 }}>Reset password</h2>
        <p className="text-muted" style={{ textAlign: 'center', marginBottom: 24, fontSize: 13 }}>
          We&apos;ll email you a link to choose a new password
        </p>

        {sent ? (
          <div className="alert alert-success" style={{ marginBottom: 20 }}>
            <CheckCircle size={14} strokeWidth={1.75} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>If an account exists for {email.trim()}, a reset link is on its way. Check your inbox and spam folder.</span>
          </div>
        ) : (
          <>
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
                    style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }}
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
              <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={sending}>
                {sending ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        )}

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 12.5 }}>
          <Link href="/login" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
