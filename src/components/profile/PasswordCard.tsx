'use client';

// ============================================================
// Password card — set a password (Google-only accounts) or change
// the existing one. Lets a Google user also sign in with email
// and password afterwards.
// ============================================================

import React, { useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { hasPasswordLogin, setAccountPassword } from '@/lib/firebase/auth';

const MIN_LENGTH = 6;

function errorMessage(err: unknown): string {
  switch ((err as { code?: string }).code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/missing-password':
      return 'Your current password is incorrect.';
    case 'auth/weak-password':
      return `Password must be at least ${MIN_LENGTH} characters.`;
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Google confirmation was cancelled. Try again.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google confirmation window. Allow pop-ups and try again.';
    case 'auth/user-mismatch':
      return 'Confirm with the same Google account you are signed in with.';
    default:
      return 'Could not save the password. Please try again.';
  }
}

export default function PasswordCard() {
  const { firebaseUser } = useAuth();
  // providerData changes in place after a password is set, so track it locally too.
  const [hasPassword, setHasPassword] = useState(() => !!firebaseUser && hasPasswordLogin(firebaseUser));
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!firebaseUser) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (newPassword.length < MIN_LENGTH) {
      setMessage({ type: 'error', text: `Password must be at least ${MIN_LENGTH} characters.` });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'The two passwords do not match.' });
      return;
    }

    setSaving(true);
    try {
      await setAccountPassword(newPassword, currentPassword);
      setMessage({
        type: 'success',
        text: hasPassword
          ? 'Password changed.'
          : `Password set. You can now sign in with ${firebaseUser.email} and this password.`,
      });
      setHasPassword(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    autoComplete: string
  ) => (
    <div className="input-group">
      <label className="label">{label}</label>
      <div style={{ position: 'relative' }}>
        <Lock size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
          style={{ paddingLeft: '44px' }}
        />
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="card">
      <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <KeyRound size={18} className="text-primary" /> {hasPassword ? 'Change Password' : 'Set a Password'}
      </h3>
      <p className="text-dim" style={{ fontSize: '0.875rem', marginBottom: '20px' }}>
        {hasPassword
          ? 'Enter your current password, then choose a new one.'
          : 'You signed in with Google. Set a password to also sign in with your email and password.'}
      </p>

      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '20px' }}>
          <span>{message.text}</span>
        </div>
      )}

      {hasPassword && field('Current Password', currentPassword, setCurrentPassword, 'current-password')}
      {field('New Password', newPassword, setNewPassword, 'new-password')}
      {field('Confirm New Password', confirmPassword, setConfirmPassword, 'new-password')}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : hasPassword ? 'Change Password' : 'Set Password'}
        </button>
      </div>
    </form>
  );
}
