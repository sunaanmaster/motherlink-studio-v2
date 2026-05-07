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
import { User, Lock, Mail, AlertCircle, ShieldCheck } from 'lucide-react';

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
      // 1. Create Auth Account
      const user = await signupWithEmail(invitation.email, password, displayName);

      // 2. Create Firestore Profile
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

      // 3. Mark invitation as accepted
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

  if (loading) return <div className="spinner"></div>;

  return (
    <div className="card auth-card">
      <div className="logo-section" style={{ marginBottom: '24px', justifyContent: 'center' }}>
        <ShieldCheck size={28} />
        <span>Motherlink.io</span>
      </div>

      {error ? (
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={48} className="text-error" style={{ marginBottom: '16px' }} />
          <h3>Invitation Error</h3>
          <p className="text-muted" style={{ marginBottom: '24px' }}>{error}</p>
          <button className="btn btn-primary" onClick={() => router.push('/login')}>Back to Login</button>
        </div>
      ) : (
        <>
          <h2 style={{ textAlign: 'center', marginBottom: '8px' }}>Join the Platform</h2>
          <p className="text-muted" style={{ textAlign: 'center', marginBottom: '32px' }}>
            Create your account to access the Motherlink AI platform.
          </p>

          <form onSubmit={handleSignup}>
            <div className="input-group">
              <label className="label">Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input type="email" value={invitation?.email} disabled style={{ paddingLeft: '44px', opacity: 0.6 }} />
              </div>
            </div>

            <div className="input-group">
              <label className="label">Full Name</label>
              <div style={{ position: 'relative' }}>
                <User size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input 
                  type="text" 
                  placeholder="John Doe" 
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  style={{ paddingLeft: '44px' }}
                />
              </div>
            </div>

            <div className="input-group">
              <label className="label">Create Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  style={{ paddingLeft: '44px' }}
                />
              </div>
            </div>

            <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(124, 58, 237, 0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(124, 58, 237, 0.1)', marginBottom: '24px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>Assigned Role</div>
              <div style={{ fontWeight: 600, color: 'var(--primary-light)' }}>{invitation?.roleSlug.toUpperCase()}</div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%', height: '48px' }}
              disabled={signingUp}
            >
              {signingUp ? 'Creating Account...' : 'Complete Registration'}
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
      <Suspense fallback={<div className="loading-container"><div className="spinner"></div></div>}>
        <SignupForm />
      </Suspense>
    </div>
  );
}
