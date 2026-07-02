'use client';

// ============================================================
// Signup Page — Process 1.0 (Registration via Invitation)
// ============================================================

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getInvitationByToken, createUser, updateInvitation } from '@/lib/firebase/firestore';
import { signupWithEmail } from '@/lib/firebase/auth';
import { InvitationStatus, UserStatus } from '@/lib/types';
import type { Invitation } from '@/lib/types';
import { User, Lock, Mail, AlertCircle } from 'lucide-react';

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

function SignupForm() {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [signingUp, setSigningUp] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setError('No invitation token provided.');
        setLoading(false);
        return;
      }

      const inv = await getInvitationByToken(token);

      if (!inv) {
        setError('Invalid invitation link.');
      } else if (inv.status !== InvitationStatus.PENDING) {
        setError(`This invitation has already been ${inv.status}.`);
      } else if (new Date() > inv.expiresAt) {
        setError('This invitation has expired.');
      } else {
        setInvitation(inv);
      }
      setLoading(false);
    }
    validateToken();
  }, [token]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;

    setSigningUp(true);
    setError(null);

    try {
      const user = await signupWithEmail(invitation.email, password, displayName);

      await createUser({
        uid: user.uid,
        email: invitation.email,
        displayName,
        avatarUrl: null,
        roleId: invitation.roleId,
        roleSlug: invitation.roleSlug,
        assignedFeatureIds: invitation.assignedFeatureIds,
        status: UserStatus.ACTIVE,
        invitedBy: invitation.invitedBy,
        invitationId: invitation.invitationId,
      });

      await updateInvitation(invitation.invitationId, {
        status: InvitationStatus.ACCEPTED,
        acceptedBy: user.uid,
        acceptedAt: new Date(),
      });

      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSigningUp(false);
    }
  };

  if (loading) return <div className="spinner" />;

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

      {error ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <AlertCircle
            size={28}
            strokeWidth={1.5}
            style={{ color: 'var(--error)', marginBottom: 12 }}
          />
          <h3 style={{ marginBottom: 6 }}>Invitation error</h3>
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 24 }}>
            {error}
          </p>
          <button className="btn btn-primary" onClick={() => router.push('/login')}>
            Back to sign in
          </button>
        </div>
      ) : (
        <>
          <h2 style={{ textAlign: 'center', marginBottom: 4, fontSize: 20 }}>
            Create your account
          </h2>
          <p
            className="text-muted"
            style={{ textAlign: 'center', marginBottom: 24, fontSize: 13 }}
          >
            Complete your registration to access the platform
          </p>

          <form onSubmit={handleSignup}>
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
                  value={invitation?.email}
                  disabled
                  style={{ paddingLeft: 32 }}
                />
              </div>
            </div>

            <div className="input-group">
              <label className="label">Full name</label>
              <div style={{ position: 'relative' }}>
                <User
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
                  type="text"
                  placeholder="John Doe"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
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
                  minLength={6}
                  style={{ paddingLeft: 32 }}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: 8,
                padding: 12,
                background: 'var(--surface-1)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span className="eyebrow">Assigned role</span>
              <span
                className="mono"
                style={{
                  fontSize: 12,
                  color: 'var(--text-main)',
                  letterSpacing: '0.04em',
                }}
              >
                {invitation?.roleSlug.toUpperCase()}
              </span>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              disabled={signingUp}
            >
              {signingUp ? 'Creating account…' : 'Complete registration'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

export default function SignupPage() {
  return (
    <div className="auth-container">
      <Suspense
        fallback={
          <div className="loading-container">
            <div className="spinner" />
          </div>
        }
      >
        <SignupForm />
      </Suspense>
    </div>
  );
}
